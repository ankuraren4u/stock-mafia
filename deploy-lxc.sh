#!/bin/bash
set -euo pipefail

# StockMafia LXC Deployment Script
# Deploys the Node.js backend to Proxmox LXC container

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-192.168.10.223}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PASS="${DEPLOY_PASS:-stockmafia2026}"
REMOTE_DIR="/opt/stockmafia"
SERVICE_NAME="stockmafia"
APP_PORT=8787

echo "╔══════════════════════════════════════╗"
echo "║   StockMafia LXC Deploy             ║"
echo "╠══════════════════════════════════════╣"
echo "║  Target: ${DEPLOY_USER}@${DEPLOY_HOST}       "
echo "╚══════════════════════════════════════╝"

# Test SSH
echo "▸ Testing SSH..."
sshpass -p "$DEPLOY_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
  "${DEPLOY_USER}@${DEPLOY_HOST}" "echo '  ✓ SSH OK'" 2>/dev/null

# Create tarball
echo "▸ Creating tarball..."
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

# Upload
echo "▸ Uploading..."
sshpass -p "$DEPLOY_PASS" scp -o StrictHostKeyChecking=no "$TARFILE" \
  "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/stockmafia-deploy.tar.gz" 2>/dev/null
echo "  ✓ Uploaded"

# Remote setup
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
