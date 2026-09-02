# StockMafia Deployment Guide

Complete deployment instructions for local development, Docker, and Kubernetes.

---

## Prerequisites

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.21+ | Building services |
| Docker | 24.0+ | Container builds |
| Docker Compose | 2.20+ | Local infrastructure |
| kubectl | 1.28+ | Kubernetes management |
| git | 2.40+ | Source control |

### Optional Tools

| Tool | Version | Purpose |
|------|---------|---------|
| helm | 3.12+ | K8s package management |
| protoc | 25.0+ | Proto code generation |
| golangci-lint | 1.55+ | Code linting |
| jq | 1.6+ | JSON processing |

---

## Local Development Setup

### First Time Setup

```bash
# Clone the repository
git clone https://github.com/stockmafia/trading-app.git
cd trading-app

# Run full setup
./scripts/setup.sh
```

This will:
1. Check prerequisites
2. Create `.env` file from `.env.example`
3. Set up Go workspace
4. Generate protobuf code
5. Build Docker images
6. Start MySQL, Redis, Kafka, Jaeger, ELK stack
7. Run database migrations
8. Verify all services

### Start Development Environment

```bash
# Start all services (infrastructure + Go services)
./scripts/dev.sh

# Or start just infrastructure
./scripts/dev.sh infra

# Start a single service
./scripts/dev.sh service gateway
```

### Available Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| API Gateway | http://localhost:8080 | REST API |
| Price HTTP | http://localhost:8082 | Price API |
| WebSocket | ws://localhost:8082/ws | Real-time prices |
| MySQL | localhost:3306 | Database |
| Redis | localhost:6379 | Cache |
| Kafka | localhost:9092 | Message queue |
| Jaeger | http://localhost:16686 | Tracing UI |
| Kibana | http://localhost:5601 | Logs UI |

---

## Docker Compose Deployment

### Infrastructure Only

```bash
# Start infrastructure services
docker compose -f deploy/docker-compose.yml up -d mysql redis kafka zookeeper jaeger elasticsearch logstash kibana

# Check status
docker compose -f deploy/docker-compose.yml ps

# View logs
docker compose -f deploy/docker-compose.yml logs -f

# Stop
docker compose -f deploy/docker-compose.yml down
```

### Full Stack with Application Services

```bash
# Build and start all services
docker compose -f deploy/docker-compose.yml up -d --build

# Or build specific services
docker compose -f deploy/docker-compose.yml build gateway crawler price

# View service logs
docker compose -f deploy/docker-compose.yml logs -f gateway
```

### Docker Compose Profiles

```bash
# Development profile (all services + tools)
docker compose -f deploy/docker-compose.yml --profile dev up -d

# Production profile (no dev tools)
docker compose -f deploy/docker-compose.yml --profile prod up -d
```

---

## Kubernetes Deployment

### Namespace Setup

```bash
# Create namespace
kubectl create namespace stockmafia

# Or apply manifest
kubectl apply -f deploy/k8s/base/namespace.yaml
```

### Secrets Management

```bash
# Create secrets from files
kubectl create secret generic stockmafia-secrets \
  --from-literal=mysql-root-password=$(cat ~/auth/stockmafia/mysql-root-password.txt) \
  --from-literal=redis-password=$(cat ~/auth/stockmafia/redis-password.txt) \
  --from-literal=finnhub-api-key=$(cat ~/auth/stockmafia/finnhub-api-key.txt) \
  --from-literal=kite-api-key=$(cat ~/auth/stockmafia/kite-api-key.txt) \
  --from-literal=kite-api-secret=$(cat ~/auth/stockmafia/kite-api-secret.txt) \
  --from-literal=telegram-bot-token=$(cat ~/auth/stockmafia/telegram-bot-token.txt) \
  --from-literal=discord-webhook-url=$(cat ~/auth/stockmafia/discord-webhook-url.txt) \
  -n stockmafia
```

### Deploy with Manifests

```bash
# Apply all manifests in order
./scripts/deploy.sh deploy

# Or apply individually
kubectl apply -f deploy/k8s/base/namespace.yaml
kubectl apply -f deploy/k8s/base/configmap.yaml
kubectl apply -f deploy/k8s/base/secret.yaml
kubectl apply -f deploy/k8s/base/mysql.yaml
kubectl apply -f deploy/k8s/base/redis.yaml
kubectl apply -f deploy/k8s/base/kafka.yaml
kubectl apply -f deploy/k8s/base/services.yaml
kubectl apply -f deploy/k8s/base/crawler.yaml
kubectl apply -f deploy/k8s/base/price.yaml
kubectl apply -f deploy/k8s/base/analytics.yaml
kubectl apply -f deploy/k8s/base/alert.yaml
kubectl apply -f deploy/k8s/base/portfolio.yaml
kubectl apply -f deploy/k8s/base/gateway.yaml
kubectl apply -f deploy/k8s/base/ingress.yaml
kubectl apply -f deploy/k8s/base/hpa.yaml
kubectl apply -f deploy/k8s/base/pdb.yaml
```

### Verify Deployment

```bash
# Check pod status
kubectl get pods -n stockmafia -o wide

# Check services
kubectl get svc -n stockmafia

# Check ingress
kubectl get ingress -n stockmafia

# View logs
kubectl logs -n stockmafia -l app=gateway -f

# Check rollout status
kubectl rollout status deployment/gateway -n stockmafia
```

### Scaling

```bash
# Manual scaling
kubectl scale deployment gateway --replicas=3 -n stockmafia
kubectl scale deployment crawler --replicas=4 -n stockmafia

# Check HPA
kubectl get hpa -n stockmafia

# Update HPA
kubectl patch hpa gateway-hpa -n stockmafia --patch='{"spec":{"maxReplicas":10}}'
```

### Rollback

```bash
# Rollback all services
./scripts/deploy.sh rollback

# Rollback specific service
kubectl rollout undo deployment/gateway -n stockmafia

# View rollout history
kubectl rollout history deployment/gateway -n stockmafia
```

---

## Production Configuration

### Environment Variables

```bash
# Database
MYSQL_DSN=user:password@tcp(host:3306)/dbname
REDIS_URL=redis://:password@host:6379
KAFKA_BROKERS=host1:9092,host2:9092,host3:9092

# Tracing
JAEGER_ENDPOINT=http://jaeger:14268/api/traces
SERVICE_NAME=gateway
SERVICE_VERSION=1.0.0

# Crawler
PROXY_LIST=socks5://proxy1:1080,socks5://proxy2:1080,http://proxy3:8080
CRAWL_BATCH_SIZE=8
CRAWL_BATCH_DELAY_MS=3000
YAHOO_RATE_LIMIT=2
STOOQ_RATE_LIMIT=1
FINNHUB_RATE_LIMIT=60

# External APIs
FINNHUB_API_KEY=your_key
KITE_API_KEY=your_key
KITE_API_SECRET=your_secret
ALPHA_VANTAGE_API_KEY=your_key

# Notifications
TELEGRAM_BOT_TOKEN=your_token
DISCORD_WEBHOOK_URL=your_url
WEBHOOK_URL=your_url

# Auth
API_KEY=your_api_key
JWT_SECRET=your_jwt_secret
```

### Resource Limits

```yaml
# Gateway
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "500m"

# Crawler (higher for data processing)
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "512Mi"
    cpu: "1000m"

# Price (WebSocket connections)
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "500m"
```

### Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

---

## Monitoring

### Prometheus Metrics

All services expose Prometheus metrics at `/metrics`:

```yaml
# ServiceMonitor for Prometheus Operator
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: stockmafia
  namespace: stockmafia
spec:
  selector:
    matchLabels:
      app: stockmafia
  endpoints:
  - port: metrics
    path: /metrics
    interval: 15s
```

### Key Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `stockmafia_health_up` | Gauge | Service health status |
| `stockmafia_uptime_seconds` | Gauge | Service uptime |
| `stockmafia_requests_total` | Counter | Total HTTP requests |
| `stockmafia_request_duration_seconds` | Histogram | Request latency |
| `stockmafia_grpc_calls_total` | Counter | Total gRPC calls |
| `stockmafia_grpc_duration_seconds` | Histogram | gRPC call latency |
| `stockmafia_crawl_total` | Counter | Total crawl operations |
| `stockmafia_price_updates_total` | Counter | Total price updates |

### Grafana Dashboard

Import dashboard from `deploy/grafana/stockmafia.json` (if available) or create custom dashboards.

---

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and fixes.

---

## Backup & Restore

### MySQL Backup

```bash
# Backup
kubectl exec -n stockmafia deployment/mysql -- \
  mysqldump -u root -p$(kubectl get secret stockmafia-secrets -n stockmafia -o jsonpath='{.data.mysql-root-password}' | base64 -d) \
  --all-databases > backup-$(date +%Y%m%d).sql

# Restore
kubectl exec -i -n stockmafia deployment/mysql -- \
  mysql -u root -p$(kubectl get secret stockmafia-secrets -n stockmafia -o jsonpath='{.data.mysql-root-password}' | base64 -d) \
  < backup.sql
```

### Redis Backup

```bash
# Trigger BGSAVE
kubectl exec -n stockmafia deployment/redis -- redis-cli BGSAVE

# Copy dump
kubectl cp stockmafia/$(kubectl get pod -n stockmafia -l app=redis -o jsonpath='{.items[0].metadata.name}'):/data/dump.rdb ./redis-backup.rdb
```

---

## Security Hardening

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: stockmafia-network-policy
  namespace: stockmafia
spec:
  podSelector:
    matchLabels:
      app: stockmafia
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: stockmafia
    ports:
    - protocol: TCP
      port: 3306
    - protocol: TCP
      port: 6379
    - protocol: TCP
      port: 9092
```

### Pod Security

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
```
