#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Create a Proxmox LXC container for StockMafia
# Run this once to provision the container, then use deploy.sh
# ──────────────────────────────────────────────────────────────

PROX_HOST="${PROX_HOST:-192.168.10.200}"
PROX_USER="${PROX_USER:-root@pam}"
PROX_PASS="${PROX_PASS:-Dualcore@8197587946}"
CTID="${CTID:-122}"
CT_HOSTNAME="${CT_HOSTNAME:-stockmafia}"
CT_IP="${CT_IP:-192.168.10.223}"
CT_GW="${CT_GW:-192.168.10.1}"
CT_CORES="${CT_CORES:-4}"
CT_RAM="${CT_RAM:-4096}"
CT_DISK="${CT_DISK:-40}"
CT_PASS="${CT_PASS:-stockmafia2026}"
TEMPLATE="local:vztmpl/debian-12-standard_12.12-1_amd64.tar.zst"

echo "Creating LXC ${CTID} (${CT_HOSTNAME}) on ${PROX_HOST}..."

# Authenticate
TICKET=$(curl -sk -X POST "https://${PROX_HOST}:8006/api2/json/access/ticket" \
  -d "username=${PROX_USER}&password=${PROX_PASS}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['ticket'])")
CSRF=$(curl -sk -X POST "https://${PROX_HOST}:8006/api2/json/access/ticket" \
  -d "username=${PROX_USER}&password=${PROX_PASS}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['CSRFPreventionToken'])")

AUTH="-H Cookie: PVEAuthCookie=${TICKET} -H CSRFPreventionToken: ${CSRF}"

# Check if CTID already exists
EXISTS=$(curl -sk -H "Cookie: PVEAuthCookie=${TICKET}" \
  "https://${PROX_HOST}:8006/api2/json/nodes/proxmox/lxc/${CTID}" 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('data') else 'no')" 2>/dev/null || echo "no")

if [ "$EXISTS" = "yes" ]; then
  echo "Container ${CTID} already exists."
  read -p "Delete and recreate? (y/N) " CONFIRM
  if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
    echo "Stopping and destroying CT ${CTID}..."
    curl -sk -X POST "https://${PROX_HOST}:8006/api2/json/nodes/proxmox/lxc/${CTID}/status/stop" \
      -H "Cookie: PVEAuthCookie=${TICKET}" -H "CSRFPreventionToken: ${CSRF}" 2>/dev/null
    sleep 2
    curl -sk -X DELETE "https://${PROX_HOST}:8006/api2/json/nodes/proxmox/lxc/${CTID}" \
      -H "Cookie: PVEAuthCookie=${TICKET}" -H "CSRFPreventionToken: ${CSRF}" 2>/dev/null
    sleep 1
  else
    echo "Aborted."
    exit 0
  fi
fi

# Create container
echo "Creating CT ${CTID}..."
curl -sk -X POST "https://${PROX_HOST}:8006/api2/json/nodes/proxmox/lxc" \
  -H "Cookie: PVEAuthCookie=${TICKET}" \
  -H "CSRFPreventionToken: ${CSRF}" \
  --data-urlencode "vmid=${CTID}" \
  --data-urlencode "hostname=${CT_HOSTNAME}" \
  --data-urlencode "ostemplate=${TEMPLATE}" \
  --data-urlencode "cores=${CT_CORES}" \
  --data-urlencode "memory=${CT_RAM}" \
  --data-urlencode "swap=1024" \
  --data-urlencode "rootfs=local-lvm:${CT_DISK}" \
  --data-urlencode "net0=name=eth0,bridge=vmbr0,gw=${CT_GW},ip=${CT_IP}/24,type=veth" \
  --data-urlencode "password=${CT_PASS}" \
  --data-urlencode "unprivileged=1" \
  --data-urlencode "onboot=1" \
  2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  ✓ Created: {d.get(\"data\",\"failed\")}')"

# Start container
echo "Starting CT ${CTID}..."
curl -sk -X POST "https://${PROX_HOST}:8006/api2/json/nodes/proxmox/lxc/${CTID}/status/start" \
  -H "Cookie: PVEAuthCookie=${TICKET}" \
  -H "CSRFPreventionToken: ${CSRF}" > /dev/null 2>&1

sleep 3

STATUS=$(curl -sk -H "Cookie: PVEAuthCookie=${TICKET}" \
  "https://${PROX_HOST}:8006/api2/json/nodes/proxmox/lxc/${CTID}/status/current" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")

if [ "$STATUS" = "running" ]; then
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  ✓ Container ready                   ║"
  echo "║  IP:  ${CT_IP}                       "
  echo "║  SSH: root@${CT_IP}                  "
  echo "║  Pass: ${CT_PASS}                    "
  echo "║                                      ║"
  echo "║  Next: ./deploy.sh                   ║"
  echo "╚══════════════════════════════════════╝"
else
  echo "  ⚠ Container status: ${STATUS}"
fi
