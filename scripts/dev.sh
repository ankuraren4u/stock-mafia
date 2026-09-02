#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# StockMafia Local Development (No Docker for services)
# Starts MySQL, Redis, Kafka via Docker, then runs Go services
# natively for faster iteration
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ENV_FILE=".env"
COMPOSE_FILE="deploy/docker-compose.yml"
LOG_DIR="/tmp/stockmafia-logs"
PID_DIR="/tmp/stockmafia-pids"
SERVICE_LOG_DIR="${LOG_DIR}/services"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

log()    { echo -e "${GREEN}[DEV]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()    { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info()   { echo -e "${BLUE}[INFO]${NC} $*"; }
header() { echo -e "\n${BOLD}═══ $* ═══${NC}"; }

# Service definitions: name:grpc_port:http_port:depends_on_infra
declare -A SERVICE_PORTS=(
    ["gateway"]="8080:8080:false"
    ["crawler"]="9001::true"
    ["price"]="9002:8082:true"
    ["analytics"]="9003::true"
    ["alert"]="9004::true"
    ["portfolio"]="9005::true"
)

SERVICES=("gateway" "crawler" "price" "analytics" "alert" "portfolio")

# ── Cleanup on exit ──
cleanup() {
    log "Shutting down..."
    # Kill all background processes
    for pid_file in "$PID_DIR"/*.pid; do
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                info "  Stopping PID $pid ($(basename "$pid_file" .pid))"
                kill "$pid" 2>/dev/null || true
            fi
            rm -f "$pid_file"
        fi
    done

    # Stop infrastructure if we started it
    if [ -f "${PID_DIR}/infra.pid" ]; then
        local infra_pid=$(cat "${PID_DIR}/infra.pid")
        if kill -0 "$infra_pid" 2>/dev/null; then
            info "  Stopping infrastructure containers"
            stop_infrastructure
        fi
        rm -f "${PID_DIR}/infra.pid"
    fi

    rm -rf "$PID_DIR"
    log "All services stopped"
}
trap cleanup EXIT INT TERM

# ── Load env vars ──
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    else
        warn ".env file not found. Using defaults."
    fi
}

# ── Check prerequisites ──
check_prereqs() {
    header "Checking prerequisites"
    for cmd in docker go curl; do
        if ! command -v "$cmd" &>/dev/null; then
            err "$cmd is required but not installed"
            exit 1
        fi
    done
    log "Prerequisites satisfied"
}

# ── Start infrastructure containers ──
start_infrastructure() {
    header "Starting infrastructure containers"
    mkdir -p "$PID_DIR"

    local compose_cmd="docker-compose"
    if docker compose version &>/dev/null 2>&1; then
        compose_cmd="docker compose"
    fi

    info "  Starting MySQL, Redis, Kafka, Zookeeper..."
    $compose_cmd -f "$COMPOSE_FILE" up -d mysql redis kafka zookeeper

    # Record compose PID for cleanup
    echo "$$" > "${PID_DIR}/infra.pid"

    info "  Waiting for MySQL..."
    local attempt=1
    while [ $attempt -le 30 ]; do
        if docker exec stockmafia-mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
            log "  ✓ MySQL ready"
            break
        fi
        sleep 2
        attempt=$((attempt + 1))
    done

    info "  Waiting for Redis..."
    attempt=1
    while [ $attempt -le 15 ]; do
        if docker exec stockmafia-redis redis-cli ping 2>/dev/null | grep -q PONG; then
            log "  ✓ Redis ready"
            break
        fi
        sleep 1
        attempt=$((attempt + 1))
    done

    info "  Waiting for Kafka..."
    attempt=1
    while [ $attempt -le 20 ]; do
        if docker exec stockmafia-kafka kafka-broker-api-versions --bootstrap-server localhost:9092 >/dev/null 2>&1; then
            log "  ✓ Kafka ready"
            break
        fi
        sleep 2
        attempt=$((attempt + 1))
    done

    log "Infrastructure started"
}

stop_infrastructure() {
    local compose_cmd="docker-compose"
    if docker compose version &>/dev/null 2>&1; then
        compose_cmd="docker compose"
    fi
    $compose_cmd -f "$COMPOSE_FILE" down 2>/dev/null || true
}

# ── Start a single Go service ──
start_service() {
    local svc=$1
    mkdir -p "$SERVICE_LOG_DIR"

    local grpc_port=""
    local http_port=""
    local needs_infra=""

    IFS=':' read -r grpc_port http_port needs_infra <<< "${SERVICE_PORTS[$svc]}"

    info "  Starting ${svc} (gRPC:${grpc_port} HTTP:${http_port:-N/A})..."

    cd "$PROJECT_DIR/services/${svc}"
    local log_file="${SERVICE_LOG_DIR}/${svc}.log"

    nohup go run ./cmd/main.go > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "${PID_DIR}/${svc}.pid"
    cd "$PROJECT_DIR"

    # Brief pause to check if it crashed immediately
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        log "  ✓ ${svc} started (PID: ${pid}, log: ${log_file})"
    else
        err "  ✗ ${svc} failed to start. Check log: ${log_file}"
        return 1
    fi
}

# ── Wait for service to be ready ──
wait_for_service() {
    local name=$1
    local url=$2
    local timeout=${3:-30}

    local attempt=1
    while [ $attempt -le $timeout ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    return 1
}

# ── Start all Go services ──
start_services() {
    header "Starting Go services"
    local start=$(date +%s)
    local failed=0

    # Start services in dependency order
    local start_order=("crawler" "price" "analytics" "alert" "portfolio" "gateway")
    for svc in "${start_order[@]}"; do
        start_service "$svc" || failed=$((failed + 1))
    done

    if [ $failed -gt 0 ]; then
        err "${failed} service(s) failed to start"
    fi

    local end=$(date +%s)
    log "Services started in $((end - start))s"
}

# ── Health check ──
health_check() {
    header "Running health checks"
    local all_ok=true

    info "  Checking gateway..."
    if wait_for_service "gateway" "http://localhost:8080/health" 30; then
        log "  ✓ gateway healthy"
    else
        warn "  ✗ gateway not responding"
        all_ok=false
    fi

    info "  Checking price..."
    if wait_for_service "price" "http://localhost:8082/health" 15; then
        log "  ✓ price healthy"
    else
        warn "  ✗ price not responding"
        all_ok=false
    fi

    if [ "$all_ok" = true ]; then
        log "All services healthy"
    else
        warn "Some services may still be starting up"
    fi
}

# ── Port forwarding ──
setup_port_forwarding() {
    header "Setting up port forwarding"
    info "  Port forwarding is not needed for local development"
    info "  Services are directly accessible on localhost"
}

# ── Tail logs ──
tail_logs() {
    header "Tailing service logs (Ctrl+C to stop)"
    if [ -d "$SERVICE_LOG_DIR" ]; then
        tail -f "$SERVICE_LOG_DIR"/*.log
    else
        warn "No logs found. Services may not be running."
    fi
}

# ── Watch services ──
watch_services() {
    header "Watching services"
    while true; do
        echo -ne "\r\033[K"
        echo -ne "${BLUE}$(date +%H:%M:%S)${NC} │ "
        for svc in "${SERVICES[@]}"; do
            local pid_file="${PID_DIR}/${svc}.pid"
            if [ -f "$pid_file" ]; then
                local pid=$(cat "$pid_file")
                if kill -0 "$pid" 2>/dev/null; then
                    echo -ne "${GREEN}●${NC} ${svc} "
                else
                    echo -ne "${RED}●${NC} ${svc} "
                fi
            else
                echo -ne "${YELLOW}○${NC} ${svc} "
            fi
        done
        echo ""
        sleep 5
    done
}

# ── Print summary ──
print_summary() {
    echo ""
    echo -e "${BOLD}Development Environment Running${NC}"
    echo ""
    echo -e "${BOLD}Services:${NC}"
    for svc in "${SERVICES[@]}"; do
        local pid_file="${PID_DIR}/${svc}.pid"
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "  ${GREEN}●${NC} ${svc} (PID: ${pid})"
            else
                echo -e "  ${RED}●${NC} ${svc} (stopped)"
            fi
        else
            echo -e "  ${YELLOW}○${NC} ${svc} (not started)"
        fi
    done
    echo ""
    echo -e "${BOLD}Endpoints:${NC}"
    echo -e "  API Gateway:   ${GREEN}http://localhost:8080${NC}"
    echo -e "  Price HTTP:    ${GREEN}http://localhost:8082${NC}"
    echo -e "  MySQL:         ${GREEN}localhost:3306${NC}"
    echo -e "  Redis:         ${GREEN}localhost:6379${NC}"
    echo -e "  Kafka:         ${GREEN}localhost:9092${NC}"
    echo ""
    echo -e "${BOLD}Logs:${NC}"
    echo -e "  ${BLUE}tail -f /tmp/stockmafia-logs/services/*.log${NC}"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo -e "  ${BLUE}./scripts/dev.sh logs${NC}       - Tail all logs"
    echo -e "  ${BLUE}./scripts/dev.sh status${NC}     - Watch service status"
    echo -e "  ${BLUE}./scripts/dev.sh stop${NC}       - Stop everything"
    echo ""
}

usage() {
    cat <<EOF
StockMafia Local Development

Usage: $0 [command]

Commands:
    (no args)   Start infrastructure + all services
    start       Start all services
    stop        Stop all services and infrastructure
    logs        Tail service logs
    status      Watch service status
    health      Run health checks
    infra       Start infrastructure only
    service     Start a single service (e.g., $0 service gateway)
    port-forward Setup port forwarding (kubectl)
    watch       Watch all services

Service Options:
    gateway, crawler, price, analytics, alert, portfolio

Environment Variables:
    Set in .env file (will be auto-created by setup.sh)

Examples:
    $0                  # Start everything
    $0 service gateway  # Start only gateway
    $0 logs             # Tail all logs
    $0 stop             # Stop everything
EOF
}

main() {
    load_env

    local cmd="${1:-full}"
    case "$cmd" in
        start|full|"")
            check_prereqs
            start_infrastructure
            sleep 2
            start_services
            health_check
            print_summary
            ;;
        stop)
            cleanup
            ;;
        logs)
            tail_logs
            ;;
        status|watch)
            watch_services
            ;;
        health)
            health_check
            ;;
        infra)
            start_infrastructure
            ;;
        service)
            local svc="${2:-}"
            if [ -z "$svc" ]; then
                err "Usage: $0 service <name>"
                exit 1
            fi
            if [[ ! " ${SERVICES[*]} " =~ " ${svc} " ]]; then
                err "Unknown service: $svc (available: ${SERVICES[*]})"
                exit 1
            fi
            start_service "$svc"
            ;;
        port-forward)
            setup_port_forwarding
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
