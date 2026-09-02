# StockMafia Troubleshooting Guide

Common issues and their solutions for local development, Docker, and Kubernetes.

---

## Quick Diagnostics

```bash
# Check service status
./scripts/test.sh health

# Check gRPC connectivity
./scripts/test.sh grpc

# View all logs
tail -f /tmp/stockmafia-logs/services/*.log

# Check Docker containers
docker compose -f deploy/docker-compose.yml ps

# Check Kubernetes pods
kubectl get pods -n stockmafia -o wide
```

---

## Local Development Issues

### Go Module Errors

**Problem:** `go: module not found` or `go: requires go >= 1.21`

**Solution:**
```bash
# Clean module cache
go clean -modcache

# Re-tidy all modules
for svc in gateway crawler price analytics alert portfolio; do
  cd services/$svc && go mod tidy && cd ../..
done

# Verify go.work
go work sync
```

**Problem:** `replace directive points to nonexistent directory`

**Solution:**
```bash
# Verify proto directories exist
ls -la proto/stockmafia/

# Verify replace paths in go.mod
grep -r "replace" services/*/go.mod
```

### Port Conflicts

**Problem:** `bind: address already in use`

**Solution:**
```bash
# Find process using the port
lsof -i :8080
lsof -i :8082
lsof -i :9001
lsof -i :3306
lsof -i :6379

# Kill the process
kill -9 <PID>

# Or use different ports in .env
GATEWAY_PORT=8081
```

### Database Connection Issues

**Problem:** `dial tcp 127.0.0.1:3306: connect: connection refused`

**Solution:**
```bash
# Check MySQL is running
docker ps | grep mysql

# Start MySQL
docker compose -f deploy/docker-compose.yml up -d mysql

# Wait for MySQL to be ready
until docker exec stockmafia-mysql mysqladmin ping -h localhost --silent; do
  echo "Waiting for MySQL..."
  sleep 2
done
```

**Problem:** `Access denied for user 'stockmafia'@'%'`

**Solution:**
```bash
# Reset MySQL password
docker exec -it stockmafia-mysql mysql -u root -p
ALTER USER 'stockmafia'@'%' IDENTIFIED WITH mysql_native_password BY 'stockmafia';
FLUSH PRIVILEGES;
```

### Redis Connection Issues

**Problem:** `dial tcp 127.0.0.1:6379: connect: connection refused`

**Solution:**
```bash
# Check Redis is running
docker ps | grep redis

# Start Redis
docker compose -f deploy/docker-compose.yml up -d redis

# Test connection
docker exec stockmafia-redis redis-cli ping
```

### Kafka Connection Issues

**Problem:** `dial tcp 127.0.0.1:9092: connect: connection refused`

**Solution:**
```bash
# Check Kafka is running
docker ps | grep kafka

# Start Kafka and Zookeeper
docker compose -f deploy/docker-compose.yml up -d kafka zookeeper

# Wait for Kafka
until docker exec stockmafia-kafka kafka-broker-api-versions --bootstrap-server localhost:9092 >/dev/null 2>&1; do
  echo "Waiting for Kafka..."
  sleep 2
done
```

---

## Docker Issues

### Build Failures

**Problem:** `failed to solve: executor failed running`

**Solution:**
```bash
# Clean Docker build cache
docker builder prune -a

# Rebuild without cache
docker compose -f deploy/docker-compose.yml build --no-cache

# Check Dockerfile syntax
docker run --rm -i hadolint/hadolint < services/gateway/Dockerfile
```

**Problem:** `go build: cannot find module`

**Solution:**
```bash
# Ensure go.work exists and includes all services
cat go.work

# Add missing modules to go.work
go work use ./services/gateway ./services/crawler ./services/price ./services/analytics ./services/alert ./services/portfolio
```

### Container Startup Issues

**Problem:** Container exits immediately

**Solution:**
```bash
# Check container logs
docker compose -f deploy/docker-compose.yml logs gateway

# Check environment variables
docker inspect stockmafia-gateway | grep -A 20 "Env"

# Run container interactively
docker run -it --rm stockmafia/gateway /bin/sh
```

**Problem:** `standard_init_linux.go:211: exec user process caused: no such file or directory`

**Solution:**
```bash
# Ensure binary is built for Linux
GOOS=linux GOARCH=amd64 go build -o bin/gateway ./cmd/main.go

# Or use multi-stage Docker build
docker build -t stockmafia/gateway:latest -f services/gateway/Dockerfile .
```

### Network Issues

**Problem:** Containers cannot communicate

**Solution:**
```bash
# Check Docker network
docker network inspect stockmafia_stockmafia

# Ensure all services are on same network
docker compose -f deploy/docker-compose.yml up -d

# Test connectivity between containers
docker exec stockmafia-gateway ping redis
docker exec stockmafia-gateway ping mysql
```

---

## Kubernetes Issues

### Pod Issues

**Problem:** `CrashLoopBackOff`

**Solution:**
```bash
# Check pod logs
kubectl logs -n stockmafia <pod-name> --previous

# Check events
kubectl describe pod -n stockmafia <pod-name>

# Common causes:
# 1. Missing secrets
kubectl get secrets -n stockmafia

# 2. Database not ready
kubectl logs -n stockmafia -l app=mysql

# 3. Invalid configuration
kubectl get configmap -n stockmafia -o yaml
```

**Problem:** `ImagePullBackOff`

**Solution:**
```bash
# Check image exists
kubectl describe pod -n stockmafia <pod-name>

# Ensure image is pushed
docker images | grep stockmafia

# Check image pull secrets
kubectl get serviceaccount -n stockmafia default -o yaml
```

**Problem:** `Pending` (unschedulable)

**Solution:**
```bash
# Check node resources
kubectl describe nodes | grep -A 5 "Allocated resources"

# Check resource limits
kubectl get pods -n stockmafia -o json | jq '.items[] | {name: .metadata.name, resources: .spec.containers[].resources}'

# Scale cluster or reduce resource requests
```

### Service Issues

**Problem:** Service cannot reach other services

**Solution:**
```bash
# Check service endpoints
kubectl get endpoints -n stockmafia

# Test DNS resolution
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup gateway.stockmafia.svc.cluster.local

# Check service labels
kubectl get svc -n stockmafia --show-labels
```

### Ingress Issues

**Problem:** Ingress not routing traffic

**Solution:**
```bash
# Check ingress configuration
kubectl get ingress -n stockmafia -o yaml

# Check ingress controller
kubectl get pods -n ingress-nginx

# Test with curl
curl -H "Host: your-domain.com" http://<ingress-ip>/health
```

---

## Service-Specific Issues

### Crawler Service

**Problem:** `rate limit exceeded` or `429 Too Many Requests`

**Solution:**
```bash
# Reduce crawl rate in .env
YAHOO_RATE_LIMIT=1
STOOQ_RATE_LIMIT=0.5
FINNHUB_RATE_LIMIT=30

# Check proxy status
docker exec stockmafia-redis redis-cli SMEMBERS crawl:proxies:unhealthy
```

**Problem:** `proxy connection refused`

**Solution:**
```bash
# Check proxy list
echo $PROXY_LIST | tr ',' '\n'

# Test proxy
curl --proxy socks5://proxy:1080 https://httpbin.org/ip

# Remove unhealthy proxies
docker exec stockmafia-redis redis-cli SREM crawl:proxies:unhealthy socks5://proxy:1080
```

### Price Service

**Problem:** WebSocket connections not working

**Solution:**
```bash
# Check WebSocket endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" http://localhost:8082/ws

# Check nginx configuration
cat deploy/nginx/nginx.conf | grep -A 10 "location /ws"
```

**Problem:** Price updates not streaming

**Solution:**
```bash
# Check Kafka topics
docker exec stockmafia-kafka kafka-topics --bootstrap-server localhost:9092 --list

# Check price.update topic
docker exec stockmafia-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic price.update --from-beginning
```

### Analytics Service

**Problem:** Signal computation fails

**Solution:**
```bash
# Check candle data exists
mysql -u stockmafia -p stockmafia -e "SELECT COUNT(*) FROM candles WHERE stock_id = 1"

# Check Redis cache
docker exec stockmafia-redis redis-cli KEYS "signal:*"

# Clear stale cache
docker exec stockmafia-redis redis-cli FLUSHDB
```

### Alert Service

**Problem:** Telegram/Discord notifications not sent

**Solution:**
```bash
# Test Telegram bot
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  -d text="Test message"

# Test Discord webhook
curl -X POST "${DISCORD_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message"}'

# Check notification log
mysql -u stockmafia -p stockmafia -e "SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT 10"
```

### Portfolio Service

**Problem:** Kite API connection fails

**Solution:**
```bash
# Check Kite credentials
echo "API Key: ${KITE_API_KEY}"
echo "Redirect URL: ${KITE_REDIRECT_URL}"

# Verify Kite app settings
# 1. Redirect URL must match exactly
# 2. API key must be active
# 3. Account must have API access enabled
```

---

## Performance Issues

### Slow Queries

**Problem:** Database queries taking too long

**Solution:**
```bash
# Enable slow query log
mysql -u root -p -e "SET GLOBAL slow_query_log = 'ON'; SET GLOBAL long_query_time = 2;"

# Analyze slow queries
mysqldumpslow -s t /var/log/mysql/mysql-slow.log

# Add indexes
mysql -u root -p stockmafia -e "CREATE INDEX idx_candles_stock_time ON candles(stock_id, time);"
```

### High Memory Usage

**Problem:** Services consuming too much memory

**Solution:**
```bash
# Check memory usage
kubectl top pods -n stockmafia

# Adjust resource limits
kubectl patch deployment gateway -n stockmafia --type='json' -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/resources/limits/memory", "value": "512Mi"}]'

# Enable GC tuning
GOGC=20 go run ./cmd/main.go
```

### Connection Pool Exhaustion

**Problem:** `too many connections`

**Solution:**
```bash
# Check MySQL connections
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected'"

# Increase max connections
mysql -u root -p -e "SET GLOBAL max_connections = 500;"

# Or reduce connection pool size in config
DB_MAX_CONNECTIONS=20
```

---

## Logging Issues

### No Logs Appearing

**Problem:** Service logs not visible

**Solution:**
```bash
# Check log directory
ls -la /tmp/stockmafia-logs/services/

# Check log level
cat .env | grep LOG_LEVEL

# Set debug logging
LOG_LEVEL=debug
```

### ELK Stack Not Working

**Problem:** Logs not appearing in Kibana

**Solution:**
```bash
# Check Elasticsearch
curl -s http://localhost:9200/_cluster/health

# Check Logstash pipeline
docker logs stockmafia-logstash

# Check Kibana index pattern
curl -s http://localhost:5601/api/saved_objects/index-pattern -H "kbn-xsrf: true"
```

---

## Network Issues

### DNS Resolution Failures

**Problem:** `unknown host` errors

**Solution:**
```bash
# Check DNS configuration
cat /etc/resolv.conf

# Add DNS server
echo "nameserver 8.8.8.8" >> /etc/resolv.conf

# Or use IP addresses directly
MYSQL_DSN=root:password@tcp(127.0.0.1:3306)/stockmafia
```

### Firewall Blocking

**Problem:** Connections timing out

**Solution:**
```bash
# Check firewall rules
sudo iptables -L -n

# Allow ports
sudo ufw allow 8080/tcp
sudo ufw allow 8082/tcp
sudo ufw allow 9001/tcp
sudo ufw allow 3306/tcp
sudo ufw allow 6379/tcp
sudo ufw allow 9092/tcp
```

---

## Recovery Procedures

### Database Recovery

```bash
# Stop all services
./scripts/dev.sh stop

# Restore MySQL from backup
docker run -it --rm -v mysql_data:/var/lib/mysql -v $(pwd):/backup \
  mysql:8.0 bash -c "mysql -u root -p密码 < /backup/backup.sql"

# Restart services
./scripts/dev.sh start
```

### Redis Recovery

```bash
# Stop Redis
docker stop stockmafia-redis

# Restore dump
docker run -it --rm -v redis_data:/data -v $(pwd):/backup \
  redis:7-alpine cp /backup/dump.rdb /data/dump.rdb

# Restart Redis
docker start stockmafia-redis
```

### Full Reset

```bash
# Stop everything
./scripts/setup.sh teardown

# Remove all data
docker volume rm stockmafia_mysql_data stockmafia_redis_data stockmafia_es_data

# Start fresh
./scripts/setup.sh
```

---

## Getting Help

If you're still experiencing issues:

1. Check the [GitHub Issues](https://github.com/stockmafia/trading-app/issues)
2. Search existing issues for similar problems
3. Create a new issue with:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Logs (redact sensitive data)
   - Environment details (OS, Docker version, Go version)
