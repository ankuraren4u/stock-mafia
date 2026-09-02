#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# StockMafia Production Deploy Script
# Builds Go services, creates Docker images, deploys to
# Kubernetes or Proxmox LXC, verifies health
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REGISTRY="${REGISTRY:-ghcr.io/stockmafia}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
NAMESPACE="${NAMESPACE:-stockmafia}"
AUTH_DIR="${AUTH_DIR:-$HOME/Documents/work/auth/stockmafia}"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
DEPLOY_TARGET="${DEPLOY_TARGET:-kubernetes}"
DEPLOY_TIMEOUT="${DEPLOY_TIMEOUT:-300}"
LXC_HOST="${LXC_HOST:-}"
LXC_USER="${LXC_USER:-root}"

SERVICES=("gateway" "crawler" "price" "analytics" "alert" "portfolio")

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

log()    { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
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
        err "Deployment failed with exit code $exit_code"
    fi
}
trap cleanup EXIT

# ── Prerequisites ──
check_prereqs() {
    header "Checking prerequisites"
    local missing=()
    for cmd in docker go git; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        else
            info "  $cmd: $(command -v "$cmd")"
        fi
    done

    if [ "$DEPLOY_TARGET" = "kubernetes" ]; then
        for cmd in kubectl; do
            if ! command -v "$cmd" &>/dev/null; then
                missing+=("$cmd")
            else
                info "  $cmd: $(command -v "$cmd")"
            fi
        done
        if [ ! -f "$KUBECONFIG" ]; then
            warn "kubeconfig not found at $KUBECONFIG"
        fi
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        err "Missing required tools: ${missing[*]}"
        exit 1
    fi
    log "All prerequisites satisfied"
}

# ── Build Go binaries locally ──
build_binaries() {
    header "Building Go binaries"
    local start=$(date +%s)
    for svc in "${SERVICES[@]}"; do
        info "  Building ${svc}..."
        cd "$SCRIPT_DIR/services/$svc"
        CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
            go build -trimpath -ldflags="-s -w -X main.version=${TAG}" \
            -o "/tmp/stockmafia-${svc}" ./cmd/main.go
        cd "$SCRIPT_DIR"
    done
    local end=$(date +%s)
    log "All binaries built in $(elapsed $((end - start)))"
}

# ── Build Docker images ──
build_images() {
    header "Building Docker images"
    local start=$(date +%s)
    for svc in "${SERVICES[@]}"; do
        info "  Building ${REGISTRY}/${svc}:${TAG}..."
        docker build \
            --build-arg VERSION="${TAG}" \
            --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            -t "${REGISTRY}/${svc}:${TAG}" \
            -t "${REGISTRY}/${svc}:latest" \
            -f "services/${svc}/Dockerfile" \
            "services/${svc}"
    done
    local end=$(date +%s)
    log "All images built in $(elapsed $((end - start)))"
}

# ── Push to registry ──
push_images() {
    header "Pushing images to ${REGISTRY}"
    local start=$(date +%s)
    for svc in "${SERVICES[@]}"; do
        info "  Pushing ${REGISTRY}/${svc}:${TAG}..."
        docker push "${REGISTRY}/${svc}:${TAG}" 2>/dev/null || warn "  Failed to push ${svc}:${TAG}"
        docker push "${REGISTRY}/${svc}:latest" 2>/dev/null || warn "  Failed to push ${svc}:latest"
    done
    local end=$(date +%s)
    log "Image push complete in $(elapsed $((end - start)))"
}

# ── Update image tags in K8s manifests ──
update_manifests() {
    header "Updating image tags in K8s manifests"
    for svc in "${SERVICES[@]}"; do
        local manifest="deploy/k8s/base/${svc}.yaml"
        if [ -f "$manifest" ]; then
            sed -i.bak "s|image: stockmafia/${svc}:latest|image: ${REGISTRY}/${svc}:${TAG}|g" "$manifest"
            sed -i.bak "s|image: ghcr.io/stockmafia/${svc}:latest|image: ${REGISTRY}/${svc}:${TAG}|g" "$manifest"
            rm -f "${manifest}.bak"
            info "  Updated ${manifest}"
        else
            warn "  Manifest not found: ${manifest}"
        fi
    done
}

# ── Apply K8s manifests ──
apply_manifests() {
    header "Applying Kubernetes manifests"
    local apply_order=(
        "namespace.yaml"
        "configmap.yaml"
        "secret.yaml"
        "mysql.yaml"
        "redis.yaml"
        "kafka.yaml"
        "services.yaml"
        "crawler.yaml"
        "price.yaml"
        "analytics.yaml"
        "alert.yaml"
        "portfolio.yaml"
        "gateway.yaml"
        "ingress.yaml"
        "hpa.yaml"
        "pdb.yaml"
    )
    for manifest in "${apply_order[@]}"; do
        local path="deploy/k8s/base/${manifest}"
        if [ -f "$path" ]; then
            info "  Applying ${manifest}..."
            kubectl apply -f "$path" -n "$NAMESPACE" 2>/dev/null || kubectl apply -f "$path"
        else
            warn "  Skipping ${manifest} (not found)"
        fi
    done
    log "All manifests applied"
}

# ── Verify rollout ──
verify_rollout() {
    header "Verifying rollout"
    local all_ready=true
    local start=$(date +%s)
    for svc in "${SERVICES[@]}"; do
        info "  Waiting for ${svc} (timeout: ${DEPLOY_TIMEOUT}s)..."
        if kubectl rollout status deployment/"${svc}" -n "$NAMESPACE" --timeout="${DEPLOY_TIMEOUT}s" 2>/dev/null; then
            log "  ✓ ${svc} ready"
        else
            err "  ✗ ${svc} failed to roll out"
            all_ready=false
        fi
    done
    local end=$(date +%s)
    log "Rollout verification completed in $(elapsed $((end - start)))"
    if [ "$all_ready" = false ]; then
        err "Some services failed to deploy"
        kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null || true
        return 1
    fi
}

# ── Deploy to Proxmox LXC ──
deploy_lxc() {
    header "Deploying to Proxmox LXC"
    if [ -z "$LXC_HOST" ]; then
        err "LXC_HOST not set. Usage: LXC_HOST=192.168.1.100 $0 deploy"
        exit 1
    fi

    info "  Target: ${LXC_USER}@${LXC_HOST}"

    # Build Docker images locally
    build_images

    # Save images as tar files
    info "  Saving Docker images..."
    for svc in "${SERVICES[@]}"; do
        docker save "${REGISTRY}/${svc}:${TAG}" | gzip > "/tmp/stockmafia-${svc}-${TAG}.tar.gz"
        info "  Saved ${svc}"
    done

    # Copy to LXC
    info "  Copying images to LXC..."
    for svc in "${SERVICES[@]}"; do
        scp "/tmp/stockmafia-${svc}-${TAG}.tar.gz" "${LXC_USER}@${LXC_HOST}:/tmp/" 2>/dev/null || {
            err "  Failed to copy ${svc} to LXC"
            continue
        }
    done

    # Load images and restart containers on LXC
    info "  Loading images on LXC..."
    for svc in "${SERVICES[@]}"; do
        ssh "${LXC_USER}@${LXC_HOST}" "docker load < /tmp/stockmafia-${svc}-${TAG}.tar.gz" 2>/dev/null || {
            warn "  Failed to load ${svc} on LXC"
        }
    done

    # Copy docker-compose file
    info "  Copying docker-compose..."
    scp "deploy/docker-compose.yml" "${LXC_USER}@${LXC_HOST}:/opt/stockmafia/docker-compose.yml" 2>/dev/null || true

    # Restart services on LXC
    info "  Restarting services on LXC..."
    ssh "${LXC_USER}@${LXC_HOST}" "cd /opt/stockmafia && docker compose down && docker compose up -d" 2>/dev/null || {
        err "  Failed to restart services on LXC"
        exit 1
    }

    # Cleanup local tar files
    rm -f /tmp/stockmafia-*.tar.gz

    log "LXC deployment complete"
}

# ── Health checks ──
run_health_checks() {
    header "Running health checks"
    local gateway_svc
    gateway_svc=$(kubectl get svc -n "$NAMESPACE" -o jsonpath='{.items[?(@.metadata.name=="gateway")].spec.clusterIP}' 2>/dev/null || echo "")
    if [ -z "$gateway_svc" ]; then
        warn "Could not determine gateway service IP, skipping HTTP health checks"
        return 0
    fi

    local svc_port
    svc_port=$(kubectl get svc gateway -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "8080")

    info "  Health endpoint: http://${gateway_svc}:${svc_port}/health"

    local attempt=1
    local max_attempts=20
    while [ $attempt -le $max_attempts ]; do
        if kubectl run health-check-${RANDOM} --rm -i --restart=Never --image=curlimages/curl -- \
            curl -sf "http://${gateway_svc}:${svc_port}/health" >/dev/null 2>&1; then
            log "  ✓ Gateway is healthy"
            return 0
        fi
        info "  Attempt ${attempt}/${max_attempts}..."
        sleep 5
        attempt=$((attempt + 1))
    done
    warn "  Health checks timed out"
    return 0
}

# ── Print deployment summary ──
print_deployment_summary() {
    header "Deployment Summary"
    local end_time=$(date +%s)
    local total=$((end_time - START_TIME))

    echo ""
    log "Target:     ${REGISTRY}"
    log "Tag:        ${TAG}"
    log "Namespace:  ${NAMESPACE}"
    log "Duration:   $(elapsed $total)"
    echo ""
    info "Pods:"
    kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null || true
    echo ""
    info "Services:"
    kubectl get svc -n "$NAMESPACE" 2>/dev/null || true
    echo ""
    info "Ingress:"
    kubectl get ingress -n "$NAMESPACE" 2>/dev/null || true
    echo ""
    log "Deployment complete!"
}

# ── Rollback ──
rollback() {
    header "Rolling back deployment"
    for svc in "${SERVICES[@]}"; do
        info "  Rolling back ${svc}..."
        kubectl rollout undo deployment/"${svc}" -n "$NAMESPACE" 2>/dev/null || warn "  Could not rollback ${svc}"
    done
    verify_rollout
    log "Rollback complete"
}

usage() {
    cat <<EOF
StockMafia Production Deploy Script

Usage: $0 <command>

Commands:
    build       Build Go binaries and Docker images
    push        Push Docker images to container registry
    manifests   Apply Kubernetes manifests
    verify      Verify rollout status and run health checks
    deploy      Full deploy (build + push + manifests + verify)
    lxc         Deploy to Proxmox LXC container
    rollback    Rollback to previous version
    status      Print current deployment status
    destroy     Delete all K8s resources (dangerous)

Environment Variables:
    REGISTRY        Container registry (default: ghcr.io/stockmafia)
    TAG             Image tag (default: git short SHA)
    NAMESPACE       K8s namespace (default: stockmafia)
    KUBECONFIG      Path to kubeconfig (default: ~/.kube/config)
    DEPLOY_TARGET   kubernetes or lxc (default: kubernetes)
    DEPLOY_TIMEOUT  Rollout timeout in seconds (default: 300)
    LXC_HOST        Proxmox LXC host IP (for lxc command)
    LXC_USER        LXC SSH user (default: root)

Examples:
    $0 deploy                          # Full K8s deployment
    TAG=v1.2.3 $0 build                # Build with specific tag
    DEPLOY_TARGET=lxc LXC_HOST=10.0.0.5 $0 lxc  # Deploy to LXC
    $0 rollback                        # Rollback all services
    $0 status                          # Show current status
EOF
}

print_status() {
    header "Current Deployment Status"
    info "Registry: ${REGISTRY}"
    info "Namespace: ${NAMESPACE}"
    echo ""
    kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null || echo "No pods found or cluster not accessible"
    echo ""
    kubectl get svc -n "$NAMESPACE" 2>/dev/null || echo "No services found"
}

main() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║       StockMafia Production Deploy          ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║  Registry:  ${REGISTRY}"
    echo "║  Tag:       ${TAG}"
    echo "║  Namespace: ${NAMESPACE}"
    echo "║  Target:    ${DEPLOY_TARGET}"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"

    local cmd="${1:-}"
    case "$cmd" in
        build)
            check_prereqs
            build_binaries
            build_images
            ;;
        push)
            check_prereqs
            push_images
            ;;
        manifests)
            check_prereqs
            update_manifests
            apply_manifests
            ;;
        verify)
            check_prereqs
            verify_rollout
            run_health_checks
            print_deployment_summary
            ;;
        deploy)
            check_prereqs
            build_binaries
            build_images
            push_images
            update_manifests
            apply_manifests
            verify_rollout
            run_health_checks
            print_deployment_summary
            ;;
        lxc)
            check_prereqs
            deploy_lxc
            ;;
        rollback)
            check_prereqs
            rollback
            ;;
        status)
            check_prereqs
            print_status
            ;;
        destroy)
            warn "This will delete ALL StockMafia resources in namespace ${NAMESPACE}!"
            read -p "Type 'yes' to confirm: " confirm
            if [ "$confirm" = "yes" ]; then
                kubectl delete namespace "$NAMESPACE" --ignore-not-found
                log "Namespace ${NAMESPACE} deleted"
            else
                log "Aborted"
            fi
            ;;
        -h|--help|help|"")
            usage
            ;;
        *)
            err "Unknown command: $cmd"
            usage
            exit 1
            ;;
    esac

    local end_time=$(date +%s)
    local total=$((end_time - START_TIME))
    log "Total time: $(elapsed $total)"
}

main "$@"
