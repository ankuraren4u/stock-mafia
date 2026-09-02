#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# StockMafia Local Development Setup
# Checks prerequisites, generates code, builds images, seeds data
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ENV_FILE=".env"
COMPOSE_FILE="deploy/docker-compose.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

log()    { echo -e "${GREEN}[SETUP]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()    { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info()   { echo -e "${BLUE}[INFO]${NC} $*"; }
header() { echo -e "\n${BOLD}═══ $* ═══${NC}"; }

START_TIME=$(date +%s)

elapsed() {
    local s=$1
    printf '%02d:%02d:%02d' $((s/3600)) $((s%3600/60)) $((s%60))
}

cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        err "Setup failed with exit code $exit_code"
        err "Check the output above for details"
    fi
}
trap cleanup EXIT

# ── Check prerequisites ──
check_prereqs() {
    header "Checking prerequisites"
    local missing=()
    local versions=()

    # Go
    if command -v go &>/dev/null; then
        local go_ver=$(go version | awk '{print $3}')
        info "  Go:      ${go_ver}"
        versions+=("go:${go_ver}")
    else
        missing+=("go")
        err "  Go is not installed. Install from: https://go.dev/dl/"
    fi

    # Docker
    if command -v docker &>/dev/null; then
        local docker_ver=$(docker --version | awk '{print $3}' | tr -d ',')
        info "  Docker:  ${docker_ver}"
        versions+=("docker:${docker_ver}")
    else
        missing+=("docker")
        err "  Docker is not installed. Install from: https://docs.docker.com/get-docker/"
    fi

    # Docker Compose
    if command -v docker-compose &>/dev/null; then
        local dc_ver=$(docker-compose --version | awk '{print $4}' | tr -d ',')
        info "  Compose: ${dc_ver}"
    elif docker compose version &>/dev/null 2>&1; then
        local dc_ver=$(docker compose version --short 2>/dev/null || echo "unknown")
        info "  Compose (plugin): ${dc_ver}"
    else
        missing+=("docker-compose")
        err "  Docker Compose is not installed"
    fi

    # kubectl (optional)
    if command -v kubectl &>/dev/null; then
        local kubectl_ver=$(kubectl version --client -o json 2>/dev/null | grep -o '"gitVersion":"[^"]*"' | head -1 | cut -d'"' -f4)
        info "  kubectl: ${kubectl_ver:-installed}"
    else
        warn "  kubectl not found (optional for local dev)"
    fi

    # helm (optional)
    if command -v helm &>/dev/null; then
        info "  helm:    $(helm version --short 2>/dev/null)"
    else
        warn "  helm not found (optional for local dev)"
    fi

    # protoc (optional)
    if command -v protoc &>/dev/null; then
        info "  protoc:  $(protoc --version 2>/dev/null | awk '{print $2}')"
    else
        warn "  protoc not found (run ./scripts/generate-protos.sh to install)"
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        err "Missing required tools: ${missing[*]}"
        exit 1
    fi

    log "All prerequisites satisfied"
}

# ── Create .env file ──
setup_env() {
    header "Setting up environment"
    if [ -f "$ENV_FILE" ]; then
        info "  ${ENV_FILE} already exists"
    else
        info "  Creating ${ENV_FILE} from .env.example"
        if [ -f ".env.example" ]; then
            cp .env.example "$ENV_FILE"
        else
            cat > "$ENV_FILE" << 'ENVEOF'
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=stockmafia
DB_PASSWORD=stockmafia
DB_NAME=stockmafia

# Redis
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_SECRET=your-jwt-secret-here

# Server Ports
GATEWAY_PORT=8080
CRAWLER_GRPC_PORT=9001
PRICE_GRPC_PORT=9002
ANALYTICS_GRPC_PORT=9003
ALERT_GRPC_PORT=9004
PORTFOLIO_GRPC_PORT=9005
PRICE_HTTP_PORT=8082

# External APIs
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=

# Notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=

# Zerodha Kite
KITE_API_KEY=
KITE_API_SECRET=
KITE_REDIRECT_URL=http://localhost:8080/callback

# Crawler
CRAWLER_WORKER_COUNT=10
CRAWLER_INTERVAL=5m

# Environment
ENVIRONMENT=development
ENVEOF
        fi
        warn "  Please update .env with your actual configuration values"
    fi
}

# ── Setup Go workspace ──
setup_go_workspace() {
    header "Setting up Go workspace"
    if [ -f "go.work" ]; then
        info "  go.work already exists"
    else
        info "  Creating go.work"
        cat > go.work << 'GOWORK'
go 1.21

use (
    ./services/gateway
    ./services/crawler
    ./services/price
    ./services/analytics
    ./services/alert
    ./services/portfolio
)
GOWORK
    fi

    info "  Running go mod tidy for all services..."
    for svc in gateway crawler price analytics alert portfolio; do
        if [ -f "services/${svc}/go.mod" ]; then
            info "    Tidying ${svc}..."
            cd "services/${svc}"
            go mod tidy 2>/dev/null || warn "    Failed to tidy ${svc}"
            cd "$PROJECT_DIR"
        fi
    done

    # Also tidy pkg modules
    for pkg in pkg/database pkg/redis pkg/kafka pkg/proxy; do
        if [ -f "${pkg}/go.mod" ]; then
            info "    Tidying ${pkg}..."
            cd "$pkg"
            go mod tidy 2>/dev/null || warn "    Failed to tidy ${pkg}"
            cd "$PROJECT_DIR"
        fi
    done

    log "Go workspace configured"
}

# ── Generate protobuf code ──
generate_protos() {
    header "Generating protobuf code"
    if [ -f "proto/stockmafia/common/v1/types.go" ] || [ -f "proto/stockmafia/crawler/v1/crawler.go" ]; then
        info "  Proto generated files already exist"
        read -p "  Regenerate? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return 0
        fi
    fi
    if [ -f "scripts/generate-protos.sh" ]; then
        bash scripts/generate-protos.sh
    else
        warn "  scripts/generate-protos.sh not found, skipping proto generation"
    fi
}

# ── Build Docker images ──
build_images() {
    header "Building Docker images"
    local start=$(date +%s)
    for svc in gateway crawler price analytics alert portfolio; do
        info "  Building ${svc}..."
        docker build \
            -t "stockmafia/${svc}:latest" \
            -f "services/${svc}/Dockerfile" \
            "services/${svc}" 2>/dev/null || warn "  Failed to build ${svc}"
    done
    local end=$(date +%s)
    log "Images built in $(elapsed $((end - start)))"
}

# ── Start infrastructure ──
start_infrastructure() {
    header "Starting infrastructure services"
    local start=$(date +%s)

    # Check if docker compose v2 is available
    local compose_cmd="docker-compose"
    if docker compose version &>/dev/null 2>&1; then
        compose_cmd="docker compose"
    fi

    info "  Starting MySQL, Redis, Kafka, Zookeeper..."
    $compose_cmd -f "$COMPOSE_FILE" up -d mysql redis kafka zookeeper

    info "  Waiting for MySQL to be ready..."
    local attempt=1
    local max_attempts=30
    while [ $attempt -le $max_attempts ]; do
        if docker exec stockmafia-mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
            log "  MySQL is ready"
            break
        fi
        if [ $attempt -eq $max_attempts ]; then
            err "  MySQL failed to start after ${max_attempts} attempts"
            return 1
        fi
        info "    Waiting... (${attempt}/${max_attempts})"
        sleep 2
        attempt=$((attempt + 1))
    done

    info "  Waiting for Redis..."
    attempt=1
    while [ $attempt -le 15 ]; do
        if docker exec stockmafia-redis redis-cli ping 2>/dev/null | grep -q PONG; then
            log "  Redis is ready"
            break
        fi
        sleep 1
        attempt=$((attempt + 1))
    done

    info "  Waiting for Kafka..."
    attempt=1
    while [ $attempt -le 20 ]; do
        if docker exec stockmafia-kafka kafka-broker-api-versions --bootstrap-server localhost:9092 >/dev/null 2>&1; then
            log "  Kafka is ready"
            break
        fi
        sleep 2
        attempt=$((attempt + 1))
    done

    local end=$(date +%s)
    log "Infrastructure started in $(elapsed $((end - start)))"
}

# ── Run database migrations ──
run_migrations() {
    header "Running database migrations"
    # Migrations run automatically when services start (via the crawler's MigrateUp call)
    info "  Migrations will run automatically when services start"
    info "  Service crawler executes MigrateUp on startup"
    log "Migrations configured"
}

# ── Seed initial data ──
seed_data() {
    header "Seeding initial data"
    # Check if there's a seed script
    if [ -f "scripts/seed.sh" ]; then
        bash scripts/seed.sh
    else
        info "  No seed script found (scripts/seed.sh)"
        info "  To seed data, create a stock list or use the crawler's trigger endpoint"
        log "Data seeding skipped"
    fi
}

# ── Verify services ──
verify_services() {
    header "Verifying service health"
    local start=$(date +%s)
    local services=(
        "gateway:http://localhost:8080/health"
        "price:http://localhost:8082/health"
    )
    local all_healthy=true

    for entry in "${services[@]}"; do
        local name="${entry%%:*}"
        local url="${entry#*:}"
        local attempt=1
        local max_attempts=20

        info "  Checking ${name} at ${url}..."
        while [ $attempt -le $max_attempts ]; do
            if curl -sf "$url" >/dev/null 2>&1; then
                log "  ✓ ${name} is healthy"
                break
            fi
            if [ $attempt -eq $max_attempts ]; then
                warn "  ✗ ${name} is not responding at ${url}"
                all_healthy=false
            fi
            sleep 3
            attempt=$((attempt + 1))
        done
    done

    local end=$(date +%s)
    log "Health checks completed in $(elapsed $((end - start)))"

    if [ "$all_healthy" = false ]; then
        warn "Some services may not be ready yet. Check logs with:"
        warn "  docker compose -f ${COMPOSE_FILE} logs -f"
    fi
}

# ── Print summary ──
print_summary() {
    header "Setup Complete!"
    local end_time=$(date +%s)
    local total=$((end_time - START_TIME))
    echo ""
    log "Total setup time: $(elapsed $total)"
    echo ""
    echo -e "${BOLD}Services available at:${NC}"
    echo -e "  API Gateway:   ${GREEN}http://localhost:8080${NC}"
    echo -e "  WebSocket:     ${GREEN}ws://localhost:8082/ws${NC}"
    echo -e "  Price HTTP:    ${GREEN}http://localhost:8082${NC}"
    echo -e "  Jaeger:        ${GREEN}http://localhost:16686${NC}"
    echo -e "  Kibana:        ${GREEN}http://localhost:5601${NC}"
    echo -e "  MySQL:         ${GREEN}localhost:3306${NC}"
    echo -e "  Redis:         ${GREEN}localhost:6379${NC}"
    echo -e "  Kafka:         ${GREEN}localhost:9092${NC}"
    echo ""
    echo -e "${BOLD}Useful commands:${NC}"
    echo -e "  ${BLUE}./scripts/dev.sh${NC}           - Start all services locally"
    echo -e "  ${BLUE}./scripts/test.sh${NC}          - Run all tests"
    echo -e "  ${BLUE}./scripts/deploy.sh deploy${NC} - Deploy to production"
    echo -e "  ${BLUE}docker compose -f ${COMPOSE_FILE} logs -f${NC}  - View logs"
    echo -e "  ${BLUE}docker compose -f ${COMPOSE_FILE} down${NC}      - Stop services"
    echo ""
}

usage() {
    cat <<EOF
StockMafia Local Development Setup

Usage: $0 [command]

Commands:
    (no args)   Full setup (prereqs + env + build + infra + verify)
    prereqs     Check prerequisites only
    env         Setup .env file only
    go          Setup Go workspace and dependencies
    protos      Generate protobuf code
    images      Build Docker images
    infra       Start infrastructure services
    migrate     Run database migrations
    seed        Seed initial data
    verify      Verify service health
    teardown    Stop all containers and remove volumes

Examples:
    $0              # Full setup
    $0 prereqs      # Just check prereqs
    $0 teardown     # Clean slate
EOF
}

teardown() {
    header "Tearing down development environment"
    local compose_cmd="docker-compose"
    if docker compose version &>/dev/null 2>&1; then
        compose_cmd="docker compose"
    fi

    info "  Stopping all containers..."
    $compose_cmd -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
    log "  All containers stopped and volumes removed"
}

main() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║     StockMafia Local Dev Setup              ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"

    local cmd="${1:-full}"
    case "$cmd" in
        prereqs)
            check_prereqs
            ;;
        env)
            setup_env
            ;;
        go)
            setup_go_workspace
            ;;
        protos)
            generate_protos
            ;;
        images)
            build_images
            ;;
        infra)
            start_infrastructure
            ;;
        migrate)
            run_migrations
            ;;
        seed)
            seed_data
            ;;
        verify)
            verify_services
            ;;
        teardown)
            teardown
            ;;
        full|"")
            check_prereqs
            setup_env
            setup_go_workspace
            generate_protos
            build_images
            start_infrastructure
            run_migrations
            seed_data
            verify_services
            print_summary
            ;;
        -h|--help|help)
            usage
            ;;
        *)
            err "Unknown command: $cmd"
            usage
            exit 1
            ;;
    esac
}

main "$@"
