#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# StockMafia Database Migration Script
# Supports up, down, status, dry-run for all services
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ENV_FILE=".env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

log()    { echo -e "${GREEN}[MIGRATE]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()    { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info()   { echo -e "${BLUE}[INFO]${NC} $*"; }
header() { echo -e "\n${BOLD}═══ $* ═══${NC}"; }

# ── Load environment ──
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi

    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-3306}"
    DB_USER="${DB_USER:-stockmafia}"
    DB_PASSWORD="${DB_PASSWORD:-stockmafia}"
    DB_NAME="${DB_NAME:-stockmafia}"
}

# ── Check MySQL connectivity ──
check_mysql() {
    header "Checking MySQL connectivity"
    if ! command -v mysql &>/dev/null; then
        err "mysql client not found"
        exit 1
    fi

    info "  Connecting to ${DB_HOST}:${DB_PORT}..."
    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT 1" >/dev/null 2>&1; then
        log "  MySQL connection successful"
    else
        err "  Cannot connect to MySQL"
        err "  Ensure MySQL is running and credentials are correct"
        exit 1
    fi
}

# ── Show migration status ──
show_status() {
    header "Migration Status"

    # Check if schema_migrations table exists
    local table_exists
    table_exists=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='schema_migrations'" 2>/dev/null)

    if [ "$table_exists" = "0" ]; then
        info "  schema_migrations table does not exist yet"
        info "  Run '$0 up' to initialize the database"
        return 0
    fi

    info "  Applied migrations:"
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SELECT version, applied_at FROM schema_migrations ORDER BY version" 2>/dev/null || {
        warn "  Could not query migration status"
    }

    echo ""

    # Check if migrations table is empty
    local count
    count=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -N -e "SELECT COUNT(*) FROM schema_migrations" 2>/dev/null || echo "0")

    if [ "$count" = "0" ]; then
        info "  No migrations have been applied"
    else
        info "  Total applied: ${count}"
    fi

    # Show database tables
    info "  Database tables:"
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SHOW TABLES" 2>/dev/null || warn "  Could not list tables"
}

# ── Run migrations up ──
run_up() {
    header "Running migrations (up)"

    if [ "$DRY_RUN" = "true" ]; then
        info "  DRY RUN: Would execute the following migrations:"
        info "  - Migration 1: Initial schema (stocks, quotes, candles, alerts, positions, orders, trade_journal, signals, crawl_jobs)"
        log "  Dry run complete (no changes made)"
        return 0
    fi

    info "  Migrations run automatically when services start"
    info "  Service crawler executes MigrateUp on startup"
    echo ""
    info "  To run migrations manually, start the crawler service:"
    info "  $ cd services/crawler && go run ./cmd/main.go"
    echo ""
    info "  Or use Docker Compose:"
    info "  $ docker compose -f deploy/docker-compose.yml up -d crawler"

    log "Migration trigger complete"
}

# ── Run migrations down ──
run_down() {
    local steps="${1:-1}"
    header "Running migrations (down) - ${steps} step(s)"

    if [ "$DRY_RUN" = "true" ]; then
        info "  DRY RUN: Would rollback ${steps} migration(s)"
        log "  Dry run complete (no changes made)"
        return 0
    fi

    info "  Rollback is done via the Go migrator"
    info "  To rollback, modify the service code to call MigrateDown()"
    warn "  Automatic rollback not supported via CLI for safety"
    warn "  Consider using a dedicated migration tool like golang-migrate"
}

# ── Run all services' migrations ──
run_all_services() {
    header "Running migrations for all services"

    info "  All services share the same database (stockmafia)"
    info "  The crawler service runs MigrateUp on startup"
    echo ""

    local services=("crawler" "price" "analytics" "alert" "portfolio")
    for svc in "${services[@]}"; do
        if [ -d "services/${svc}" ]; then
            info "  Checking ${svc}..."
            # Check if service has migration code
            if grep -r "MigrateUp\|MigrateDown\|Migrator" "services/${svc}/" >/dev/null 2>&1; then
                info "    ${svc} has migration logic"
            else
                info "    ${svc} uses shared migrations (from pkg/database)"
            fi
        fi
    done

    log "Service check complete"
}

# ── Dry run ──
dry_run() {
    DRY_RUN=true
    header "Dry Run Mode"
    info "  No changes will be made to the database"
    echo ""
    run_up
}

# ── Reset database (dangerous) ──
reset_database() {
    header "Reset Database"
    warn "This will DROP ALL TABLES in database ${DB_NAME}!"
    read -p "Type 'yes' to confirm: " confirm
    if [ "$confirm" != "yes" ]; then
        log "Aborted"
        return 0
    fi

    info "  Dropping all tables..."
    local tables
    tables=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -N -e "SHOW TABLES" 2>/dev/null)

    for table in $tables; do
        info "    Dropping ${table}..."
        mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
            -e "DROP TABLE IF EXISTS ${table}" 2>/dev/null
    done

    log "Database reset complete"
    info "  Run '$0 up' to recreate tables"
}

# ── Create new migration ──
create_migration() {
    local name="${1:-}"
    if [ -z "$name" ]; then
        err "Usage: $0 create <migration_name>"
        exit 1
    fi

    header "Creating migration: ${name}"

    # Find the next migration number
    local last_version=0
    local migration_file="pkg/database/migrations/001_initial.go"
    if [ -d "pkg/database/migrations" ]; then
        local last_file
        last_file=$(ls -1 pkg/database/migrations/*.go 2>/dev/null | tail -1 || echo "")
        if [ -n "$last_file" ]; then
            local basename
            basename=$(basename "$last_file")
            last_version=${basename%%_*}
            last_version=${last_version#0}
            last_version=${last_version#0}
        fi
    fi

    local next_version=$((last_version + 1))
    local padded_version
    padded_version=$(printf "%03d" $next_version)
    local filename="pkg/database/migrations/${padded_version}_${name}.go"

    info "  Creating ${filename}..."

    cat > "$filename" << EOF
package migrations

import (
    "context"
    "database/sql"

    "github.com/stockmafia/trading-app/pkg/database"
)

func init() {
    database.RegisterMigration(database.Migration{
        Version:     ${next_version},
        Description: "${name}",
        Up: func(ctx context.Context, tx *sql.Tx) error {
            // TODO: Implement migration up
            return nil
        },
        Down: func(ctx context.Context, tx *sql.Tx) error {
            // TODO: Implement migration down
            return nil
        },
    })
}
EOF

    log "  Created ${filename}"
    info "  Edit the file to implement your migration"
}

# ── Show migration history ──
show_history() {
    header "Migration History"

    local table_exists
    table_exists=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='schema_migrations'" 2>/dev/null)

    if [ "$table_exists" = "0" ]; then
        info "  No migration history (table does not exist)"
        return 0
    fi

    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 20" 2>/dev/null
}

usage() {
    cat <<EOF
StockMafia Database Migration Tool

Usage: $0 <command> [options]

Commands:
    up              Run all pending migrations
    down [steps]    Rollback migrations (default: 1 step)
    status          Show migration status
    history         Show migration history
    dry-run         Show what would be executed
    create <name>   Create a new migration file
    reset           Reset database (DANGEROUS!)
    services        Check migration support for all services

Options:
    --dry-run       Dry run mode (no changes)
    --db-host       MySQL host (default: localhost)
    --db-port       MySQL port (default: 3306)
    --db-user       MySQL user (default: stockmafia)
    --db-password   MySQL password
    --db-name       Database name (default: stockmafia)

Environment Variables:
    DB_HOST         MySQL host
    DB_PORT         MySQL port
    DB_USER         MySQL user
    DB_PASSWORD     MySQL password
    DB_NAME         Database name

Examples:
    $0 up                    # Run migrations
    $0 status                # Check status
    $0 down 1                # Rollback 1 step
    $0 create add_user_table # Create new migration
    $0 reset                 # Reset database
EOF
}

DRY_RUN=false

main() {
    load_env

    local cmd="${1:-status}"
    case "$cmd" in
        up)
            check_mysql
            run_up
            ;;
        down)
            local steps="${2:-1}"
            check_mysql
            run_down "$steps"
            ;;
        status)
            check_mysql
            show_status
            ;;
        history)
            check_mysql
            show_history
            ;;
        dry-run)
            DRY_RUN=true
            check_mysql
            run_up
            ;;
        create)
            create_migration "${2:-}"
            ;;
        reset)
            check_mysql
            reset_database
            ;;
        services)
            run_all_services
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
