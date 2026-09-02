#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# StockMafia Test Runner
# Runs unit tests, integration tests, and connectivity tests
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

log()    { echo -e "${GREEN}[TEST]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()    { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info()   { echo -e "${BLUE}[INFO]${NC} $*"; }
header() { echo -e "\n${BOLD}═══ $* ═══${NC}"; }

SERVICES=("gateway" "crawler" "price" "analytics" "alert" "portfolio")
PKG_MODULES=("pkg/database" "pkg/redis" "pkg/kafka" "pkg/proxy" "pkg/health" "pkg/logging")

START_TIME=$(date +%s)
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

RESULTS=()

elapsed() {
    local s=$1
    printf '%02d:%02d:%02d' $((s/3600)) $((s%3600/60)) $((s%60))
}

# ── Run Go tests for a module ──
run_go_tests() {
    local name=$1
    local path=$2
    local flags="${3:-}"

    if [ ! -d "$path" ] && [ ! -f "$path" ]; then
        warn "  ${name}: path not found, skipping"
        RESULTS+=("${name}|SKIPPED|path not found")
        TOTAL_SKIPPED=$((TOTAL_SKIPPED + 1))
        return 0
    fi

    local output
    local exit_code=0
    output=$(cd "$PROJECT_DIR" && go test -v -count=1 -timeout 120s $flags "$path" 2>&1) || exit_code=$?

    local tests=0
    local passed=0
    local failed=0

    # Parse go test output
    tests=$(echo "$output" | grep -c "^--- " || true)
    passed=$(echo "$output" | grep -c "^--- PASS:" || true)
    failed=$(echo "$output" | grep -c "^--- FAIL:" || true)

    TOTAL_TESTS=$((TOTAL_TESTS + tests))
    TOTAL_PASSED=$((TOTAL_PASSED + passed))
    TOTAL_FAILED=$((TOTAL_FAILED + failed))

    if [ $exit_code -eq 0 ]; then
        log "  ✓ ${name}: ${passed}/${tests} passed"
        RESULTS+=("${name}|PASSED|${passed}/${tests}")
    else
        err "  ✗ ${name}: ${failed} failed, ${passed} passed"
        RESULTS+=("${name}|FAILED|${passed}/${tests}, ${failed} failed")
        # Print failed test details
        echo "$output" | grep -A 20 "^--- FAIL:" | head -40
    fi
}

# ── Unit tests ──
run_unit_tests() {
    header "Running unit tests"
    local start=$(date +%s)

    # Test each package module
    for pkg in "${PKG_MODULES[@]}"; do
        if [ -d "$pkg" ]; then
            run_go_tests "$pkg" "./${pkg}/..."
        fi
    done

    # Test each service
    for svc in "${SERVICES[@]}"; do
        if [ -d "services/${svc}" ]; then
            run_go_tests "$svc" "./services/${svc}/..."
        fi
    done

    local end=$(date +%s)
    log "Unit tests completed in $(elapsed $((end - start)))"
}

# ── Integration tests ──
run_integration_tests() {
    header "Running integration tests"
    local start=$(date +%s)

    # Check if integration test files exist
    local has_integration=false
    for svc in "${SERVICES[@]}"; do
        if find "services/${svc}" -name "*_integration_test.go" -o -name "*_e2e_test.go" 2>/dev/null | grep -q .; then
            has_integration=true
            break
        fi
    done

    if [ "$has_integration" = true ]; then
        for svc in "${SERVICES[@]}"; do
            local test_files
            test_files=$(find "services/${svc}" -name "*_integration_test.go" -o -name "*_e2e_test.go" 2>/dev/null || true)
            if [ -n "$test_files" ]; then
                run_go_tests "${svc} (integration)" "./services/${svc}/..." "-tags=integration"
            fi
        done
    else
        info "  No integration test files found"
        info "  Create *_integration_test.go files in services to enable integration tests"
    fi

    local end=$(date +%s)
    log "Integration tests completed in $(elapsed $((end - start)))"
}

# ── Health endpoint tests ──
test_health_endpoints() {
    header "Testing health endpoints"
    local start=$(date +%s)
    local all_ok=true

    local endpoints=(
        "gateway:http://localhost:8080/health"
        "gateway_api:http://localhost:8080/api/health"
        "gateway_status:http://localhost:8080/api/status"
        "price:http://localhost:8082/health"
    )

    for entry in "${endpoints[@]}"; do
        local name="${entry%%:*}"
        local url="${entry#*:}"
        local response
        local http_code

        response=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null) || true
        http_code="${response:-000}"

        if [ "$http_code" = "200" ]; then
            log "  ✓ ${name}: HTTP ${http_code}"
            TOTAL_PASSED=$((TOTAL_PASSED + 1))
        else
            warn "  ✗ ${name}: HTTP ${http_code}"
            TOTAL_FAILED=$((TOTAL_FAILED + 1))
            all_ok=false
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done

    local end=$(date +%s)
    log "Health checks completed in $(elapsed $((end - start)))"
    [ "$all_ok" = true ] && return 0 || return 1
}

# ── gRPC connectivity tests ──
test_grpc_connectivity() {
    header "Testing gRPC connectivity"
    local start=$(date +%s)

    local grpc_services=(
        "crawler:localhost:9001"
        "price:localhost:9002"
        "analytics:localhost:9003"
        "alert:localhost:9004"
        "portfolio:localhost:9005"
    )

    for entry in "${grpc_services[@]}"; do
        local name="${entry%%:*}"
        local addr="${entry#*:}"
        local host="${addr%%:*}"
        local port="${addr##*:}"

        # Check if port is open
        if (echo > /dev/tcp/"$host"/"$port") 2>/dev/null; then
            log "  ✓ ${name} gRPC port ${port} is open"
            TOTAL_PASSED=$((TOTAL_PASSED + 1))
        else
            warn "  ✗ ${name} gRPC port ${port} is not reachable"
            TOTAL_FAILED=$((TOTAL_FAILED + 1))
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done

    local end=$(date +%s)
    log "gRPC connectivity tests completed in $(elapsed $((end - start)))"
}

# ── WebSocket connection tests ──
test_websocket_connections() {
    header "Testing WebSocket connections"
    local start=$(date +%s)

    # Check if wscat is available
    if ! command -v wscat &>/dev/null && ! command -v websocat &>/dev/null; then
        info "  WebSocket testing tools not found (wscat/websocat)"
        info "  Install: npm install -g wscat"
        info "  Or: brew install websocat"
        TOTAL_SKIPPED=$((TOTAL_SKIPPED + 1))
        return 0
    fi

    local ws_endpoints=(
        "price_ws:ws://localhost:8082/ws"
    )

    for entry in "${ws_endpoints[@]}"; do
        local name="${entry%%:*}"
        local url="${entry#*:}"

        if command -v wscat &>/dev/null; then
            if timeout 5 wscat -c "$url" --execute 'ping' 2>/dev/null; then
                log "  ✓ ${name} WebSocket connected"
                TOTAL_PASSED=$((TOTAL_PASSED + 1))
            else
                warn "  ✗ ${name} WebSocket connection failed"
                TOTAL_FAILED=$((TOTAL_FAILED + 1))
            fi
        elif command -v websocat &>/dev/null; then
            if echo "ping" | timeout 5 websocat "$url" 2>/dev/null; then
                log "  ✓ ${name} WebSocket connected"
                TOTAL_PASSED=$((TOTAL_PASSED + 1))
            else
                warn "  ✗ ${name} WebSocket connection failed"
                TOTAL_FAILED=$((TOTAL_FAILED + 1))
            fi
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done

    local end=$(date +%s)
    log "WebSocket tests completed in $(elapsed $((end - start)))"
}

# ── SSE connection tests ──
test_sse_connections() {
    header "Testing SSE connections"
    local start=$(date +%s)

    local sse_endpoints=(
        "prices:http://localhost:8080/api/sse/prices"
        "alerts:http://localhost:8080/api/sse/alerts"
    )

    for entry in "${sse_endpoints[@]}"; do
        local name="${entry%%:*}"
        local url="${entry#*:}"

        # SSE uses GET with Accept: text/event-stream
        local response
        response=$(timeout 5 curl -sf -H "Accept: text/event-stream" -o /dev/null -w "%{http_code}" "$url" 2>/dev/null) || true

        if [ "$response" = "200" ]; then
            log "  ✓ ${name} SSE endpoint responding"
            TOTAL_PASSED=$((TOTAL_PASSED + 1))
        else
            warn "  ✗ ${name} SSE endpoint returned: ${response:-timeout}"
            TOTAL_FAILED=$((TOTAL_FAILED + 1))
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done

    local end=$(date +%s)
    log "SSE tests completed in $(elapsed $((end - start)))"
}

# ── Docker build test ──
test_docker_builds() {
    header "Testing Docker builds"
    local start=$(date +%s)

    for svc in "${SERVICES[@]}"; do
        info "  Building ${svc}..."
        if docker build -t "stockmafia/${svc}:test" -f "services/${svc}/Dockerfile" "services/${svc}" >/dev/null 2>&1; then
            log "  ✓ ${svc} Docker build succeeded"
            TOTAL_PASSED=$((TOTAL_PASSED + 1))
            # Clean up test image
            docker rmi "stockmafia/${svc}:test" 2>/dev/null || true
        else
            warn "  ✗ ${svc} Docker build failed"
            TOTAL_FAILED=$((TOTAL_FAILED + 1))
        fi
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    done

    local end=$(date +%s)
    log "Docker build tests completed in $(elapsed $((end - start)))"
}

# ── Lint check ──
run_lint() {
    header "Running linter"
    local start=$(date +%s)

    if command -v golangci-lint &>/dev/null; then
        for svc in "${SERVICES[@]}"; do
            info "  Linting ${svc}..."
            if (cd "services/${svc}" && golangci-lint run --timeout 60s ./...) 2>/dev/null; then
                log "  ✓ ${svc} passed lint"
            else
                warn "  ✗ ${svc} has lint issues"
            fi
        done
    else
        info "  golangci-lint not found, running go vet instead"
        for svc in "${SERVICES[@]}"; do
            info "  go vet ${svc}..."
            if (cd "services/${svc}" && go vet ./...) 2>/dev/null; then
                log "  ✓ ${svc} passed vet"
            else
                warn "  ✗ ${svc} has vet issues"
            fi
        done
    fi

    local end=$(date +%s)
    log "Lint completed in $(elapsed $((end - start)))"
}

# ── Print test summary ──
print_summary() {
    header "Test Summary"
    local end_time=$(date +%s)
    local total=$((end_time - START_TIME))

    echo ""
    echo -e "${BOLD}Results:${NC}"
    for result in "${RESULTS[@]}"; do
        IFS='|' read -r name status detail <<< "$result"
        case "$status" in
            PASSED)  echo -e "  ${GREEN}✓${NC} ${name}: ${detail}" ;;
            FAILED)  echo -e "  ${RED}✗${NC} ${name}: ${detail}" ;;
            SKIPPED) echo -e "  ${YELLOW}○${NC} ${name}: ${detail}" ;;
        esac
    done

    echo ""
    echo -e "${BOLD}Totals:${NC}"
    echo -e "  Tests run:    ${TOTAL_TESTS}"
    echo -e "  ${GREEN}Passed:       ${TOTAL_PASSED}${NC}"
    echo -e "  ${RED}Failed:       ${TOTAL_FAILED}${NC}"
    echo -e "  ${YELLOW}Skipped:      ${TOTAL_SKIPPED}${NC}"
    echo -e "  Duration:     $(elapsed $total)"
    echo ""

    if [ $TOTAL_FAILED -gt 0 ]; then
        echo -e "${RED}${BOLD}TESTS FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}${BOLD}ALL TESTS PASSED${NC}"
        exit 0
    fi
}

usage() {
    cat <<EOF
StockMafia Test Runner

Usage: $0 [command]

Commands:
    (no args)       Run all tests
    unit            Run unit tests only
    integration     Run integration tests only
    health          Test health endpoints
    grpc            Test gRPC connectivity
    websocket       Test WebSocket connections
    sse             Test SSE connections
    docker          Test Docker builds
    lint            Run linter
    summary         Print test summary

Examples:
    $0              # Run all tests
    $0 unit         # Unit tests only
    $0 health       # Health checks only
EOF
}

main() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║       StockMafia Test Suite                 ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"

    local cmd="${1:-all}"
    case "$cmd" in
        all|"")
            run_unit_tests
            run_integration_tests
            test_health_endpoints
            test_grpc_connectivity
            test_websocket_connections
            test_sse_connections
            test_docker_builds
            run_lint
            print_summary
            ;;
        unit)
            run_unit_tests
            print_summary
            ;;
        integration)
            run_integration_tests
            print_summary
            ;;
        health)
            test_health_endpoints
            ;;
        grpc)
            test_grpc_connectivity
            ;;
        websocket)
            test_websocket_connections
            ;;
        sse)
            test_sse_connections
            ;;
        docker)
            test_docker_builds
            ;;
        lint)
            run_lint
            ;;
        summary)
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
