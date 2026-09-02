#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# StockMafia Protobuf Code Generation
# Generates Go and TypeScript code from .proto files
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

PROTO_DIR="proto"
GO_OUT_DIR="."
TS_OUT_DIR="web/src/types/proto"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

log()    { echo -e "${GREEN}[PROTO]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()    { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info()   { echo -e "${BLUE}[INFO]${NC} $*"; }
header() { echo -e "\n${BOLD}═══ $* ═══${NC}"; }

PROTO_FILES=(
    "stockmafia/common/v1/types.proto"
    "stockmafia/crawler/v1/crawler.proto"
    "stockmafia/price/v1/price.proto"
    "stockmafia/analytics/v1/analytics.proto"
    "stockmafia/alert/v1/alert.proto"
    "stockmafia/portfolio/v1/portfolio.proto"
)

START_TIME=$(date +%s)

elapsed() {
    local s=$1
    printf '%02d:%02d:%02d' $((s/3600)) $((s%3600/60)) $((s%60))
}

# ── Install protoc ──
install_protoc() {
    header "Installing protoc"
    if command -v protoc &>/dev/null; then
        info "  protoc already installed: $(protoc --version)"
        return 0
    fi

    info "  Installing protoc..."
    local version="25.1"
    local os arch

    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="macosx" ;;
        *)          err "Unsupported OS: $(uname -s)"; return 1 ;;
    esac

    case "$(uname -m)" in
        x86_64)     arch="x86_64" ;;
        arm64|aarch64) arch="aarch_64" ;;
        *)          err "Unsupported architecture: $(uname -m)"; return 1 ;;
    esac

    local url="https://github.com/protocolbuffers/protobuf/releases/download/v${version}/protoc-${version}-${os}-${arch}.zip"

    info "  Downloading protoc ${version}..."
    local tmp_dir=$(mktemp -d)
    curl -sfL "$url" -o "${tmp_dir}/protoc.zip"
    unzip -qo "${tmp_dir}/protoc.zip" -d "${tmp_dir}"

    # Install to /usr/local/bin (requires sudo) or ~/bin
    if [ -w "/usr/local/bin" ]; then
        cp "${tmp_dir}/bin/protoc" "/usr/local/bin/protoc"
    else
        mkdir -p "$HOME/bin"
        cp "${tmp_dir}/bin/protoc" "$HOME/bin/protoc"
        export PATH="$HOME/bin:$PATH"
        warn "  protoc installed to ~/bin. Add to PATH if needed."
    fi

    # Install includes
    local include_dir="/usr/local/include"
    if [ ! -w "/usr/local/include" ]; then
        include_dir="${tmp_dir}/include"
    fi
    sudo mkdir -p "$include_dir" 2>/dev/null || mkdir -p "$include_dir"
    sudo cp -r "${tmp_dir}/include/"* "$include_dir" 2>/dev/null || cp -r "${tmp_dir}/include/"* "$include_dir"

    rm -rf "$tmp_dir"
    log "  protoc installed successfully"
}

# ── Install Go protobuf plugins ──
install_go_plugins() {
    header "Installing Go protobuf plugins"

    info "  Installing protoc-gen-go..."
    go install google.golang.org/protobuf/cmd/protoc-gen-go@latest 2>/dev/null || true

    info "  Installing protoc-gen-go-grpc..."
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest 2>/dev/null || true

    # Verify installation
    local go_bin="${GOPATH:-$HOME/go}/bin"
    if [ ! -f "${go_bin}/protoc-gen-go" ]; then
        err "  Failed to install protoc-gen-go"
        return 1
    fi
    if [ ! -f "${go_bin}/protoc-gen-go-grpc" ]; then
        err "  Failed to install protoc-gen-go-grpc"
        return 1
    fi

    log "  Go plugins installed"
}

# ── Install TypeScript protobuf plugin ──
install_ts_plugin() {
    header "Installing TypeScript protobuf plugin"

    if ! command -v npm &>/dev/null; then
        warn "  npm not found, skipping TypeScript generation"
        return 0
    fi

    info "  Installing protoc-gen-ts_proto..."
    npm install --save-dev @protobuf-ts/plugin 2>/dev/null || warn "  Failed to install ts_proto plugin"
    log "  TypeScript plugin ready"
}

# ── Generate Go code ──
generate_go() {
    header "Generating Go code"
    local start=$(date +%s)
    local go_bin="${GOPATH:-$HOME/go}/bin"
    export PATH="${go_bin}:${PATH}"

    for proto_file in "${PROTO_FILES[@]}"; do
        if [ ! -f "${PROTO_DIR}/${proto_file}" ]; then
            warn "  Proto file not found: ${proto_file}"
            continue
        fi

        info "  Generating ${proto_file}..."

        # Generate Go code
        protoc \
            --proto_path="${PROTO_DIR}" \
            --go_out="${GO_OUT_DIR}" \
            --go_opt=module=github.com/stockmafia/trading-app \
            --go-grpc_out="${GO_OUT_DIR}" \
            --go-grpc_opt=module=github.com/stockmafia/trading-app \
            "${proto_file}" || {
                err "  Failed to generate ${proto_file}"
                continue
            }

        log "  ✓ Generated Go code for ${proto_file}"
    done

    local end=$(date +%s)
    log "Go code generation completed in $(elapsed $((end - start)))"
}

# ── Generate TypeScript code ──
generate_typescript() {
    header "Generating TypeScript definitions"
    local start=$(date +%s)

    if ! command -v npx &>/dev/null; then
        warn "  npx not found, skipping TypeScript generation"
        return 0
    fi

    mkdir -p "${TS_OUT_DIR}"

    for proto_file in "${PROTO_FILES[@]}"; do
        if [ ! -f "${PROTO_DIR}/${proto_file}" ]; then
            continue
        fi

        local base_name
        base_name=$(basename "${proto_file}" .proto)

        info "  Generating TypeScript for ${base_name}..."

        npx protoc \
            --proto_path="${PROTO_DIR}" \
            --ts_out="${TS_OUT_DIR}" \
            --ts_opt long_number=string \
            "${proto_file}" 2>/dev/null || {
                warn "  Failed to generate TypeScript for ${base_name}"
                continue
            }

        log "  ✓ Generated TypeScript for ${base_name}"
    done

    local end=$(date +%s)
    log "TypeScript generation completed in $(elapsed $((end - start)))"
}

# ── Run go mod tidy ──
run_tidy() {
    header "Running go mod tidy"
    for svc in "${SERVICES[@]}"; do
        if [ -f "services/${svc}/go.mod" ]; then
            info "  Tidying ${svc}..."
            cd "services/${svc}"
            go mod tidy 2>/dev/null || warn "  Failed to tidy ${svc}"
            cd "$PROJECT_DIR"
        fi
    done

    # Also tidy pkg modules
    for pkg in pkg/database pkg/redis pkg/kafka pkg/proxy; do
        if [ -f "${pkg}/go.mod" ]; then
            info "  Tidying ${pkg}..."
            cd "$pkg"
            go mod tidy 2>/dev/null || warn "  Failed to tidy ${pkg}"
            cd "$PROJECT_DIR"
        fi
    done

    log "go mod tidy completed"
}

# ── Verify generated code ──
verify_generated() {
    header "Verifying generated code"

    local all_ok=true

    # Check Go generated files exist
    for proto_file in "${PROTO_FILES[@]}"; do
        local base_name
        base_name=$(basename "${proto_file}" .proto)
        local proto_dir
        proto_dir=$(dirname "${proto_file}")

        # Check for generated .go files
        local go_file="${proto_dir}/${base_name}.go"
        local grpc_file="${proto_dir}/${base_name}_grpc.go"

        if [ -f "${PROTO_DIR}/${go_file}" ] || [ -f "${go_file}" ]; then
            log "  ✓ ${go_file}"
        else
            warn "  ✗ ${go_file} not found"
            all_ok=false
        fi
    done

    if [ "$all_ok" = true ]; then
        log "All generated files verified"
    else
        warn "Some generated files are missing"
    fi
}

SERVICES=("gateway" "crawler" "price" "analytics" "alert" "portfolio")

usage() {
    cat <<EOF
StockMafia Protobuf Code Generation

Usage: $0 [command]

Commands:
    (no args)       Generate all code (Go + TypeScript)
    go              Generate Go code only
    ts              Generate TypeScript code only
    install         Install all required tools
    verify          Verify generated files exist
    tidy            Run go mod tidy after generation

Prerequisites:
    - protoc (Protocol Buffers compiler)
    - protoc-gen-go (Go plugin)
    - protoc-gen-go-grpc (Go gRPC plugin)
    - @protobuf-ts/plugin (TypeScript plugin, optional)

Environment Variables:
    PROTO_DIR       Proto source directory (default: proto)
    GO_OUT_DIR      Go output directory (default: .)
    TS_OUT_DIR      TypeScript output directory (default: web/src/types/proto)

Examples:
    $0              # Generate everything
    $0 install      # Install tools first
    $0 go           # Go only
    $0 ts           # TypeScript only
EOF
}

main() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║       StockMafia Proto Code Generation      ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"

    local cmd="${1:-all}"
    case "$cmd" in
        all|"")
            install_protoc
            install_go_plugins
            install_ts_plugin
            generate_go
            generate_typescript
            verify_generated
            run_tidy
            ;;
        go)
            install_protoc
            install_go_plugins
            generate_go
            verify_generated
            run_tidy
            ;;
        ts)
            install_ts_plugin
            generate_typescript
            ;;
        install)
            install_protoc
            install_go_plugins
            install_ts_plugin
            ;;
        verify)
            verify_generated
            ;;
        tidy)
            run_tidy
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

    local end_time=$(date +%s)
    local total=$((end_time - START_TIME))
    log "Total time: $(elapsed $total)"
}

main "$@"
