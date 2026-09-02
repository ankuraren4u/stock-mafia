# StockMafia — Production Architecture

Complete microservices architecture for **10K+ stocks** with MySQL, Redis, Kafka, Kubernetes, and proxy-based crawling.

## Architecture Diagram

```
                                INTERNET
                                   │
                      ┌────────────┼────────────┐
                      │            │            │
                 ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
                 │  HTTPS  │ │  gRPC   │ │   WS    │
                 │  :443   │ │  :443   │ │  :443   │
                 └────┬────┘ └────┬────┘ └────┬────┘
                      │           │           │
                 ┌────▼───────────▼───────────▼────┐
                 │          KUBERNETES              │
                 │          INGRESS NGINX            │
                 └────────────┬────────────────────┘
                              │
            ┌─────────────────┼─────────────────────┐
            │                 │                     │
     ┌──────▼──────┐   ┌─────▼──────┐      ┌──────▼──────┐
     │   GATEWAY   │   │   PRICE    │      │   KIBANA    │
     │   :8787     │   │   :8082    │      │   :5601     │
     │  HTTP + SSE │   │  WS + SSE  │      │  Logs UI    │
     └──────┬──────┘   └─────┬──────┘      └─────────────┘
            │                │
            │ gRPC           │ gRPC
     ┌──────┼────────────────┼──────────┐
     │      │                │          │
┌────▼───┐ ┌▼────────┐ ┌────▼────┐ ┌────▼────┐
│CRAWLER │ │ANALYTICS│ │  ALERT  │ │PORTFOLIO│
│:9001   │ │ :9003   │ │ :9004   │ │ :9005   │
│Worker  │ │ Signals │ │ Triggers│ │ Trading │
│Pool    │ │ Scoring │ │ Notifs  │ │ P&L     │
└───┬────┘ └─────────┘ └────┬────┘ └────┬────┘
    │                       │           │
    │    ┌──────────────────┼───────────┼──────────┐
    │    │                  │           │          │
┌───▼────▼──────────────────▼───────────▼──────────▼──┐
│                    INFRASTRUCTURE LAYER               │
│                                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │  MySQL  │  │  Redis  │  │  Kafka  │  │  Jaeger ││
│  │  :3306  │  │  :6379  │  │ :9092   │  │:16686   ││
│  │ Primary │  │ Cache + │  │ Events  │  │ Tracing ││
│  │ + Read  │  │ Rate    │  │ + Queue │  │         ││
│  │ Replica │  │ Limiter │  │         │  │         ││
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘│
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │                    ELK STACK                     │  │
│  │  Logstash(:5000) → Elasticsearch(:9200) → Kibana│  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │              PROXY POOL (for crawling)           │  │
│  │  HTTP/SOCKS5 proxies → Rate-limited by domain    │  │
│  │  VPN rotation (WireGuard/OpenVPN)                │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

---

## Microservices

### 1. API Gateway (`services/gateway/`)

| Property | Value |
|----------|-------|
| **Port** | 8080 (HTTP), 9080 (gRPC) |
| **Language** | Go |
| **Database** | MySQL (auth, sessions, config) |
| **Cache** | Redis (rate limiting, sessions) |

**Responsibilities:**
- HTTP entry point for all frontend requests
- Authentication (API key, JWT)
- Rate limiting (token bucket in Redis)
- Request routing to backend services via gRPC
- SSE endpoint (`/api/sse`) — proxies price/alert events to frontend
- Static file serving (React frontend)
- CORS, security headers, request logging

**gRPC Clients:**
- CrawlerService (start, status, crawl symbol)
- PriceService (getQuote, getQuotes, getCandles, getStockDetail)
- AnalyticsService (getSignals, runScreener, getSuggestions)
- AlertService (getAlerts, createAlert, deleteAlert)
- PortfolioService (placeOrder, getPositions, getFills, getPortfolio)

---

### 2. Crawler Service (`services/crawler/`)

| Property | Value |
|----------|-------|
| **Port** | 9001 (gRPC only) |
| **Language** | Go |
| **Database** | MySQL (stocks, candles, quotes, fundamentals, news) |
| **Cache** | Redis (rate limiter state, crawl job queue) |
| **Events** | Kafka (crawl.complete topic) |

**Responsibilities:**
- Multi-source data collection (Stooq, Yahoo, Finnhub, NSE, Moneycontrol, etc.)
- Proxy rotation per request
- Rate limiting per domain (max 2 concurrent per domain)
- Parallel crawling across different domains
- Candle history accumulation (never overwrite)
- Fundamentals caching with Finnhub fallback
- News aggregation from 80+ RSS feeds

---

### 3. Price Service (`services/price/`)

| Property | Value |
|----------|-------|
| **Port** | 8082 (HTTP/WS), 9002 (gRPC) |
| **Language** | Go |
| **Database** | MySQL (quotes, candles — replicated from crawler) |
| **Cache** | Redis (live prices, TTL 5s) |
| **Events** | Kafka (price.update topic — publishes every 5s) |

**Responsibilities:**
- Real-time price streaming via WebSocket (`/ws`)
- SSE streaming (`/api/events`) for price updates
- Quote aggregation from multiple sources
- Historical candle data serving
- Stock detail endpoint (price + fundamentals + candles)
- Live price cache in Redis

---

### 4. Analytics Service (`services/analytics/`)

| Property | Value |
|----------|-------|
| **Port** | 9003 (gRPC only) |
| **Language** | Go |
| **Database** | MySQL (signal_scores, algo_rules, algo_suggestions) |
| **Cache** | Redis (computed signals, TTL 5min) |

**Responsibilities:**
- Technical indicators (RSI, MACD, EMA, ADX, VWAP, Bollinger, Supertrend, Ichimoku, Fibonacci, Stochastic)
- Signal scoring (composite score 0-100)
- Strategy evaluation (13 strategies)
- Stock screener with category filters
- Trade suggestion generation
- Walk-forward backtesting
- Monte Carlo simulation
- Multi-timeframe analysis

---

### 5. Alert Service (`services/alert/`)

| Property | Value |
|----------|-------|
| **Port** | 9004 (gRPC only) |
| **Language** | Go |
| **Database** | MySQL (alerts, watchlist, notification_log) |
| **Cache** | Redis (active alerts for quick lookup) |
| **Events** | Kafka (alert.trigger topic) |

**Responsibilities:**
- Price alert monitoring (check every 5s)
- Alert trigger detection (above/below price)
- Notification dispatch (Telegram, Discord, webhook)
- Alert history and logging
- Smart alerts with buy/sell analysis

---

### 6. Portfolio Service (`services/portfolio/`)

| Property | Value |
|----------|-------|
| **Port** | 9005 (gRPC only) |
| **Language** | Go |
| **Database** | MySQL (fills, positions, journal, portfolio_config) |
| **Cache** | Redis (live portfolio P&L) |
| **Events** | Kafka (trade.exec topic) |

**Responsibilities:**
- Paper trading engine
- Live trading via Zerodha Kite API
- Position tracking with real-time P&L
- Trade journal
- Risk calculations (VaR, Sharpe, Sortino, Max Drawdown)
- Portfolio analytics

---

## Infrastructure

### MySQL

**Purpose:** Primary relational database for all services

**Configuration:**
- Version: MySQL 8.0
- Max connections: 25 per service
- Character set: utf8mb4
- Collation: utf8mb4_unicode_ci

**Key Tables:**

| Service | Tables |
|---------|--------|
| Crawler | stocks, candles, quotes, fundamentals, news |
| Price | price_snapshots |
| Analytics | signal_scores, algo_suggestions |
| Alert | alerts, watchlist, notification_log |
| Portfolio | positions, fills, journal, portfolio_config |

**Indexing Strategy:**
- Composite indexes on (stock_id, time) for time-series queries
- Unique constraints on (stock_id) for upserts
- Descending indexes on timestamp columns for recent-first queries

**Connection Pooling:**
```go
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(10)
db.SetConnMaxLifetime(5 * time.Minute)
db.SetConnMaxIdleTime(3 * time.Minute)
```

---

### Redis

**Purpose:** Caching, rate limiting, pub/sub, session storage

**Configuration:**
- Version: Redis 7 Alpine
- Max memory: 256MB
- Eviction policy: allkeys-lru
- Persistence: AOF enabled

**Key Patterns:**

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `price:{symbol}` | 5s | Live price cache |
| `rate:{domain}` | sliding window | Rate limiter per domain |
| `crawl:job:{id}` | 5min | Crawl job status |
| `session:{token}` | 24h | User session |
| `signal:{symbol}` | 5min | Computed signal cache |
| `alert:active` | none | Set of active alert IDs |
| `portfolio:pnl` | 30s | Portfolio P&L cache |
| `pubsub:price` | none | Price update channel |
| `pubsub:alert` | none | Alert trigger channel |

**Redis Patterns Used:**
- **Caching:** GET/SET with TTL for price data
- **Rate Limiting:** Sliding window counter per domain
- **Pub/Sub:** Real-time price and alert broadcasting
- **Sorted Sets:** Alert priority queue
- **Hashes:** Portfolio P&L aggregation

---

### Kafka

**Purpose:** Event-driven communication between services

**Configuration:**
- Version: Confluent Kafka 7.5.0
- Replication factor: 1 (single broker for dev, 3 for prod)
- Retention: varies by topic

**Topics:**

| Topic | Partitions | Producers | Consumers | Retention |
|-------|-----------|-----------|-----------|-----------|
| `crawl.complete` | 3 | Crawler | Analytics, Price | 7 days |
| `price.update` | 6 | Price | Alert, Portfolio, Gateway(SSE) | 1 day |
| `alert.trigger` | 3 | Alert | Gateway(SSE), Notification | 30 days |
| `trade.exec` | 3 | Portfolio | Analytics, Audit | 90 days |
| `audit.trail` | 1 | All services | Logstash | 1 year |

**Consumer Groups:**
- `analytics-signals`: Processes crawl.complete events
- `alert-checker`: Processes price.update events
- `portfolio-tracker`: Processes price.update events
- `gateway-sse`: Proxies events to frontend via SSE

---

### Proxy System

**Purpose:** Rotating proxies for data crawling to avoid rate limits and blocks

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│                    PROXY MANAGER                         │
│                                                          │
│  Config:                                                 │
│  - proxies.yaml: list of HTTP/SOCKS5/HTTPS proxies       │
│  - domain_limits.yaml: max concurrent per domain         │
│                                                          │
│  Flow:                                                   │
│  1. Worker needs to fetch URL from domain X              │
│  2. Check domain semaphore (max 2 concurrent for X)      │
│  3. Get next proxy from rotation pool                    │
│  4. Make request via proxy                               │
│  5. On success: release semaphore, return data           │
│  6. On failure: mark proxy unhealthy, retry with new one │
│  7. On 429: pause domain for cooldown period             │
│                                                          │
│  Proxy Types Supported:                                  │
│  - HTTP proxy (http://proxy:port)                        │
│  - HTTPS proxy (https://proxy:port)                      │
│  - SOCKS5 proxy (socks5://proxy:port)                    │
│  - VPN tunnel (WireGuard/OpenVPN — rotation by interface)│
│                                                          │
│  Parallelism:                                            │
│  - Different domains: parallel (up to 20 workers)        │
│  - Same domain: sequential (max 2 concurrent)            │
│  - Batch size: 8 stocks per batch, 3s delay between      │
└─────────────────────────────────────────────────────────┘
```

**Rate Limits by Domain:**

| Domain | Limit | Window |
|--------|-------|--------|
| Yahoo Finance | 2 req/s | per IP |
| Stooq | 1 req/s | per domain |
| NSE India | 0.5 req/s | per session |
| Finnhub | 60 req/min | per API key |
| Moneycontrol | 1 req/s | per IP |

**Unhealthy Proxy Detection:**
- 3 consecutive failures → mark unhealthy
- 429 response → pause for 60s
- Timeout → mark unhealthy, retry with different proxy
- Health check every 5 minutes

---

## Data Source Catalog

StockMafia crawls from **135+ data sources** across 7 categories:

| Category | Count | Free | Paid |
|----------|-------|------|------|
| Real-time Price Feeds | 30 | 25 | 5 |
| Historical Data | 25 | 20 | 5 |
| Fundamentals | 20 | 14 | 6 |
| News & Sentiment | 22 | 17 | 5 |
| Insider Trading | 15 | 12 | 3 |
| Options Data | 15 | 10 | 5 |
| Alternative Data | 22 | 8 | 14 |

**Primary Sources (by priority):**
1. Stooq — Historical data, no rate limit
2. NSE/Moneycontrol — Indian market data
3. Finnhub — US stocks, real-time + fundamentals
4. Yahoo Finance — Fallback, rate limited

See [DATA_SOURCES.md](./docs/DATA_SOURCES.md) for complete catalog.

---

## Scaling Strategy

### Horizontal Scaling

| Service | Min Replicas | Max Replicas | Scale Metric |
|---------|--------------|--------------|--------------|
| Gateway | 2 | 10 | CPU 70%, connections |
| Crawler | 2 | 8 | CPU 70%, queue depth |
| Price | 2 | 6 | CPU 70%, WebSocket connections |
| Analytics | 2 | 4 | CPU 70%, computation queue |
| Alert | 2 | 4 | CPU 70%, alert queue |
| Portfolio | 2 | 4 | CPU 70%, order queue |

### Vertical Scaling

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| Gateway | 100m | 500m | 128Mi | 256Mi |
| Crawler | 200m | 1000m | 256Mi | 512Mi |
| Price | 100m | 500m | 128Mi | 256Mi |
| Analytics | 200m | 1000m | 256Mi | 512Mi |
| Alert | 100m | 500m | 128Mi | 256Mi |
| Portfolio | 100m | 500m | 128Mi | 256Mi |

### Database Scaling

- **Read replicas:** Add MySQL read replicas for analytics queries
- **Sharding:** Shard by market (IN vs US) if needed
- **Connection pooling:** PgBouncer equivalent for MySQL

### Redis Scaling

- **Cluster mode:** Enable Redis Cluster for horizontal scaling
- **Sentinel:** Use Redis Sentinel for high availability
- **Memory:** Increase maxmemory, tune eviction policy

### Kafka Scaling

- **Partitions:** Increase partition count for high-throughput topics
- **Brokers:** Add brokers for higher throughput
- **Consumer groups:** Scale consumers horizontally

---

## Performance Guidelines

### Caching Strategy

| Data Type | TTL | Cache Layer |
|-----------|-----|-------------|
| Live prices | 5s | Redis |
| Fundamentals | 24h | Redis + MySQL |
| Signals | 5min | Redis |
| Sessions | 24h | Redis |
| Crawl jobs | 5min | Redis |

### Connection Pooling

```go
// MySQL
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(10)
db.SetConnMaxLifetime(5 * time.Minute)

// Redis
poolSize := 10 * runtime.GOMAXPROCS(0)
rdb := redis.NewClient(&redis.Options{
    PoolSize: poolSize,
})
```

### Rate Limiting

- **Token bucket** for API endpoints (100 req/min)
- **Sliding window** for crawler domains
- **Circuit breaker** for external API calls

---

## Security

### Authentication

- **API Key:** Simple key-based auth for internal services
- **JWT:** Short-lived tokens (24h expiry) for user sessions
- **OAuth:** Optional OAuth2 for external integrations

### Network Security

- **Network policies:** Restrict pod-to-pod communication
- **mTLS:** Enable service mesh (Istio/Linkerd) for production
- **Secrets:** Use Kubernetes Secrets or external vault

### Data Security

- **Encryption at rest:** MySQL transparent data encryption
- **Encryption in transit:** TLS for all connections
- **PII handling:** Never log or store sensitive user data

---

## Monitoring & Observability

### Distributed Tracing

- **Jaeger:** OpenTelemetry-compatible tracing
- **Trace context:** Propagated across all gRPC calls
- **Sampling:** 10% in production, 100% in development

### Logging

- **Structured logging:** JSON format with zap
- **ELK Stack:** Logstash → Elasticsearch → Kibana
- **Log levels:** DEBUG, INFO, WARN, ERROR

### Metrics

- **Prometheus:** Export custom metrics
- **Grafana:** Dashboards for all services
- **Alerts:** PagerDuty/Slack integration

### Health Checks

- **Liveness:** `/health` endpoint
- **Readiness:** `/ready` endpoint
- **Startup:** Delay initial probes for slow-starting services

---

## Disaster Recovery

### Backup Strategy

| Component | Frequency | Retention | Method |
|-----------|-----------|-----------|--------|
| MySQL | Daily | 30 days | mysqldump + S3 |
| Redis | Hourly | 7 days | RDB snapshots |
| Kafka | Daily | 14 days | Topic snapshots |
| Config | On change | Forever | Git |

### Recovery Procedures

1. **MySQL recovery:** Restore from latest dump, replay binlogs
2. **Redis recovery:** Load RDB snapshot, replay AOF
3. **Service recovery:** Rolling restart with health checks
4. **Full recovery:** Rebuild from scratch, restore from backups

### RTO/RPO Targets

| Metric | Target |
|--------|--------|
| RTO (Recovery Time Objective) | 15 minutes |
| RPO (Recovery Point Objective) | 1 hour |
| Availability | 99.9% (8.76 hours downtime/year) |
