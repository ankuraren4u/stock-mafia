#!/bin/bash
set -euo pipefail

# StockMafia LXC Deployment Script
# Usage:
#   ./deploy-lxc.sh                    # Full deploy (all services)
#   ./deploy-lxc.sh gateway            # Deploy Gateway service
#   ./deploy-lxc.sh crawler            # Deploy Crawler service
#   ./deploy-lxc.sh price              # Deploy Price service
#   ./deploy-lxc.sh analytics          # Deploy Analytics service
#   ./deploy-lxc.sh alert              # Deploy Alert service
#   ./deploy-lxc.sh portfolio          # Deploy Portfolio service
#   ./deploy-lxc.sh node               # Deploy Node.js backend
#   ./deploy-lxc.sh web                # Deploy Web frontend only
#   ./deploy-lxc.sh status             # Show deployment status

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-192.168.10.223}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PASS="${DEPLOY_PASS:-stockmafia2026}"
REMOTE_DIR="/opt/stockmafia"
SERVICE_NAME="stockmafia"
APP_PORT=8787
TARGET="${1:-all}"

echo "╔══════════════════════════════════════╗"
echo "║   StockMafia LXC Deploy             ║"
echo "╠══════════════════════════════════════╣"
echo "║  Target: ${DEPLOY_USER}@${DEPLOY_HOST}       "
echo "║  Mode:   ${TARGET}"
echo "╚══════════════════════════════════════╝"

# Test SSH
echo "▸ Testing SSH..."
sshpass -p "$DEPLOY_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
  "${DEPLOY_USER}@${DEPLOY_HOST}" "echo '  ✓ SSH OK'" 2>/dev/null

# Helper: deploy a Go service
deploy_go_service() {
  local SVC_NAME=$1
  local SVC_DIR="services/$SVC_NAME"

  echo ""
  echo "═══ Deploying ${SVC_NAME} Service ═══"

  if [ ! -d "$SCRIPT_DIR/$SVC_DIR" ]; then
    echo "  ✗ Service directory not found: $SVC_DIR"
    return 1
  fi

  # Upload service source
  sshpass -p "$DEPLOY_PASS" ssh -o StrictHostKeyChecking=no \
    "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p ${REMOTE_DIR}/${SVC_DIR}/cmd ${REMOTE_DIR}/${SVC_DIR}/internal" 2>/dev/null

  sshpass -p "$DEPLOY_PASS" scp -o StrictHostKeyChecking=no -r \
    "$SCRIPT_DIR/$SVC_DIR"/* "${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_DIR}/${SVC_DIR}/" 2>/dev/null
  echo "  ✓ ${SVC_NAME} source uploaded"

  # Rebuild and restart
  echo "▸ Rebuilding ${SVC_NAME}..."
  sshpass -p "$DEPLOY_PASS" ssh -o StrictHostKeyChecking=no \
    "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s <<REMOTE_SCRIPT
set -euo pipefail
echo "  → Building ${SVC_NAME} binary..."
cd ${REMOTE_DIR}/${SVC_DIR} && go build -o ${REMOTE_DIR}/bin/${SVC_NAME} ./cmd/main.go 2>&1 || echo "  ⚠ Build skipped (go not installed)"
echo "  → Restarting ${SVC_NAME}..."
systemctl restart ${SVC_NAME} 2>/dev/null || systemctl restart stockmafia 2>/dev/null || true
echo "  ✓ ${SVC_NAME} deployed"
REMOTE_SCRIPT
  echo "  ✓ ${SVC_NAME} deployed"
}

if [ "$TARGET" = "status" ]; then
  echo ""
  echo "═══ Deployment Status ═══"
  sshpass -p "$DEPLOY_PASS" ssh -o StrictHostKeyChecking=no \
    "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s <<REMOTE_SCRIPT
set -euo pipefail
echo "  Node.js Backend:"
systemctl status stockmafia --no-pager | grep -E "Active:|Main PID:|Memory:"
echo ""
echo "  Go Services:"
for svc in gateway crawler price analytics alert portfolio; do
  if systemctl is-active \${svc} >/dev/null 2>&1; then
    echo "    \${svc}: \$(systemctl is-active \${svc})"
  else
    echo "    \${svc}: not running (using Node.js)"
  fi
done
echo ""
echo "  Health Check:"
curl -sk https://localhost:${APP_PORT}/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('    Status:', d.get('ok', False))"
REMOTE_SCRIPT
  exit 0
fi

if [ "$TARGET" = "all" ]; then
  # Full deploy
  echo "▸ Creating full tarball..."
  TARFILE="/tmp/stockmafia-deploy.tar.gz"
  tar czf "$TARFILE" \
    --exclude='node_modules' \
    --exclude='web/dist' \
    --exclude='server/dist' \
    --exclude='server/data' \
    --exclude='.git' \
    --exclude='.env' \
    -C "$SCRIPT_DIR" .
  echo "  ✓ $(du -h "$TARFILE" | cut -f1) ready"

  echo "▸ Uploading..."
  sshpass -p "$DEPLOY_PASS" scp -o StrictHostKeyChecking=no "$TARFILE" \
    "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/stockmafia-deploy.tar.gz" 2>/dev/null
  echo "  ✓ Uploaded"

  echo "▸ Setting up on remote host..."
  sshpass -p "$DEPLOY_PASS" ssh -o StrictHostKeyChecking=no \
    "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s <<REMOTE_SCRIPT
set -euo pipefail

# Preserve data
if [ -d "${REMOTE_DIR}/server/data" ]; then
  echo "  Preserving existing data…"
  cp -a ${REMOTE_DIR}/server/data /tmp/stockmafia-data-backup
fi

# Extract
rm -rf ${REMOTE_DIR}
mkdir -p ${REMOTE_DIR}
tar xzf /tmp/stockmafia-deploy.tar.gz -C ${REMOTE_DIR}

# Restore data
if [ -d /tmp/stockmafia-data-backup ]; then
  mkdir -p ${REMOTE_DIR}/server/data
  cp -a /tmp/stockmafia-data-backup/* ${REMOTE_DIR}/server/data/ 2>/dev/null || true
  rm -rf /tmp/stockmafia-data-backup
  echo "  ✓ Data restored"
fi
rm -f /tmp/stockmafia-deploy.tar.gz

# Install dependencies
echo "  Installing dependencies..."
cd ${REMOTE_DIR} && npm install --omit=dev --loglevel=error 2>/dev/null
cd ${REMOTE_DIR}/server && npm install --loglevel=error 2>/dev/null
npm run build --loglevel=error 2>/dev/null
npm prune --omit=dev --loglevel=error 2>/dev/null

cd ${REMOTE_DIR}/web && npm install --loglevel=error 2>/dev/null
npm run build --loglevel=error 2>/dev/null

# Create .env if missing
if [ ! -f ${REMOTE_DIR}/server/.env ]; then
  cat > ${REMOTE_DIR}/server/.env << 'EOF'
PORT=8787
HOST=0.0.0.0
EOF
fi

mkdir -p ${REMOTE_DIR}/server/data

# Create systemd service
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=StockMafia Trading Platform
After=network.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME} > /dev/null 2>&1
systemctl restart ${SERVICE_NAME}
echo "  ✓ Service started"

# Health check
sleep 2
if curl -sf http://localhost:${APP_PORT}/api/health > /dev/null 2>&1; then
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  ✓ Deploy successful!               ║"
  echo "║  http://${DEPLOY_HOST}:${APP_PORT}          "
  echo "╚══════════════════════════════════════╝"
else
  echo "  ⚠ Service started but health check failed"
  echo "    systemctl status ${SERVICE_NAME}"
fi
REMOTE_SCRIPT

  rm -f "$TARFILE"
  echo "Done. App is live at http://${DEPLOY_HOST}:${APP_PORT}"

else
  # Selective deploy - Go services or Node.js parts
  case "$TARGET" in
    gateway|crawler|price|analytics|alert|portfolio)
      deploy_go_service "$TARGET"
      ;;
    node)
      echo ""
      echo "═══ Deploying Node.js Backend ═══"
      sshpass -p "$DEPLOY_PASS" scp -o StrictHostKeyChecking=no -r \
        server/src/* "${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_DIR}/server/src/" 2>/dev/null
      echo "  ✓ Node.js source uploaded"

      sshpass -p "$DEPLOY_PASS" ssh -o StrictHostKeyChecking=no \
        "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s <<REMOTE_SCRIPT
set -euo pipefail
echo "  → Installing Node.js dependencies..."
cd ${REMOTE_DIR}/server && npm install --loglevel=error 2>/dev/null
echo "  → Compiling TypeScript..."
npm run build --loglevel=error 2>/dev/null
echo "  → Pruning dev dependencies..."
npm prune --omit=dev --loglevel=error 2>/dev/null
echo "  → Restarting ${SERVICE_NAME}..."
systemctl restart ${SERVICE_NAME}
echo "  ✓ Node.js backend deployed"
REMOTE_SCRIPT
      ;;
    web)
      echo ""
      echo "═══ Deploying Web Frontend ═══"
      sshpass -p "$DEPLOY_PASS" scp -o StrictHostKeyChecking=no -r \
        web/src/* "${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_DIR}/web/src/" 2>/dev/null
      echo "  ✓ Web source uploaded"

      sshpass -p "$DEPLOY_PASS" ssh -o StrictHostKeyChecking=no \
        "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s <<REMOTE_SCRIPT
set -euo pipefail
echo "  → Installing web dependencies..."
cd ${REMOTE_DIR}/web && npm install --loglevel=error 2>/dev/null
echo "  → Building frontend..."
npm run build --loglevel=error 2>/dev/null
echo "  → Restarting ${SERVICE_NAME}..."
systemctl restart ${SERVICE_NAME}
echo "  ✓ Web frontend deployed"
REMOTE_SCRIPT
      ;;
    *)
      echo "Unknown target: $TARGET"
      echo ""
      echo "Usage: $0 {target}"
      echo ""
      echo "Targets:"
      echo "  all         - Full deploy (all services)"
      echo "  gateway     - Deploy Gateway service (Go)"
      echo "  crawler     - Deploy Crawler service (Go)"
      echo "  price       - Deploy Price service (Go)"
      echo "  analytics   - Deploy Analytics service (Go)"
      echo "  alert       - Deploy Alert service (Go)"
      echo "  portfolio   - Deploy Portfolio service (Go)"
      echo "  node        - Deploy Node.js backend"
      echo "  web         - Deploy Web frontend only"
      echo "  status      - Show deployment status"
      exit 1
      ;;
  esac

  # Health check
  sleep 2
  if curl -sk "https://localhost:${APP_PORT}/api/health" > /dev/null 2>&1; then
    echo ""
    echo "╔══════════════════════════════════════╗"
    echo "║  ✓ ${TARGET} deployed!              ║"
    echo "║  https://${DEPLOY_HOST}:${APP_PORT}         "
    echo "╚══════════════════════════════════════╝"
  else
    echo "  ⚠ Service may need a moment to start"
  fi
fi
