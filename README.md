# StockMafia

Self-hosted microservices platform for **India (NSE)** and **US** market insights, strategy suggestions, dry-run, paper trading, and optional live NSE orders via **Zerodha Kite Connect**.

> This is a research and execution workstation, not a promise of profit and not investment advice.

---

## Architecture

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
         │          NGINX REVERSE PROXY     │
         └────────────┬────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
┌───▼─────┐    ┌──────▼──────┐    ┌────▼────┐
│ GATEWAY │    │    PRICE    │    │  KIBANA │
│  :8080  │    │   :8082     │    │  :5601  │
│ HTTP+SSE│    │  WS + SSE   │    │ Logs UI │
└────┬────┘    └──────┬──────┘    └─────────┘
     │                │
     │ gRPC           │ gRPC
┌────┼────────────────┼──────────┐
│    │                │          │
▼───▼───┐      ┌──────▼───┐ ┌───▼────┐
│CRAWLER│      │ ANALYTICS│ │ PORTF. │
│ :9001 │      │  :9003   │ │ :9005  │
│Worker │      │ Signals  │ │Trading │
│ Pool  │      │ Scoring  │ │  P&L   │
└───┬───┘      └──────────┘ └───┬────┘
    │                          │
    │    ┌─────────────────────┼──────────┐
    │    │                     │          │
┌───▼────▼─────────────────────▼──────────▼──┐
│              INFRASTRUCTURE LAYER           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │  MySQL  │  │  Redis  │  │  Kafka  │    │
│  │  :3306  │  │  :6379  │  │ :9092   │    │
│  └─────────┘  └─────────┘  └─────────┘    │
│  ┌─────────────────────────────────────┐   │
│  │          PROXY POOL                 │   │
│  │  HTTP/SOCKS5 + VPN rotation         │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Features

- **Multi-source data crawling** from 135+ data sources with proxy rotation
- **Real-time price streaming** via WebSocket and Server-Sent Events
- **Technical analysis** with 10+ indicators (RSI, MACD, EMA, ADX, VWAP, Bollinger, Supertrend, etc.)
- **Signal scoring** with composite scores and confidence levels
- **Stock screener** with category filters and custom strategies
- **Paper trading engine** for risk-free strategy testing
- **Live trading** via Zerodha Kite Connect (India only)
- **Alert system** with Telegram, Discord, and webhook notifications
- **Trade journal** for tracking and analyzing trades
- **Full observability** with Jaeger tracing, ELK stack, and Prometheus metrics

## Quick Start

### Prerequisites

- Go 1.21+
- Docker & Docker Compose
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/stockmafia/trading-app.git
cd trading-app

# Run full setup (prerequisites, build, infrastructure, verify)
./scripts/setup.sh
```

### Start Development

```bash
# Start all services
./scripts/dev.sh

# Or start just infrastructure
./scripts/dev.sh infra

# Start a single service
./scripts/dev.sh service gateway
```

### Access Services

| Service | URL |
|---------|-----|
| API Gateway | http://localhost:8080 |
| Price HTTP | http://localhost:8082 |
| WebSocket | ws://localhost:8082/ws |
| MySQL | localhost:3306 |
| Redis | localhost:6379 |
| Kafka | localhost:9092 |
| Jaeger | http://localhost:16686 |
| Kibana | http://localhost:5601 |

## Development

### Run Tests

```bash
# All tests
./scripts/test.sh

# Unit tests only
./scripts/test.sh unit

# Single service
cd services/{name} && go test ./...
```

### Build

```bash
# Build all services
./scripts/deploy.sh build

# Build specific service
cd services/{name} && go build -o bin/{name} ./cmd/main.go
```

### Proto Generation

```bash
# Generate protobuf code
./scripts/generate-protos.sh
```

## Deployment

### Docker Compose

```bash
# Start all services
docker compose -f deploy/docker-compose.yml up -d

# View logs
docker compose -f deploy/docker-compose.yml logs -f
```

### Kubernetes

```bash
# Deploy to K8s
./scripts/deploy.sh deploy

# Check status
kubectl get pods -n stockmafia

# Rollback
./scripts/deploy.sh rollback
```

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for complete deployment guide.

## Configuration

### Environment Variables

```bash
# Database
MYSQL_DSN=user:password@tcp(host:3306)/dbname
REDIS_URL=redis://:password@host:6379
KAFKA_BROKERS=host1:9092,host2:9092

# External APIs
FINNHUB_API_KEY=your_key
KITE_API_KEY=your_key
KITE_API_SECRET=your_secret

# Notifications
TELEGRAM_BOT_TOKEN=your_token
DISCORD_WEBHOOK_URL=your_url

# Auth
API_KEY=your_api_key
JWT_SECRET=your_jwt_secret
```

See [.env.example](./.env.example) for all configuration options.

## Project Structure

```
trading-app/
├── services/                    # Go microservices
│   ├── gateway/                 # HTTP API gateway
│   ├── crawler/                 # Data collection worker
│   ├── price/                   # Price streaming
│   ├── analytics/               # Technical analysis
│   ├── alert/                   # Alert system
│   └── portfolio/               # Trading engine
├── pkg/                         # Shared Go packages
├── proto/                       # Protobuf definitions
├── web/                         # React frontend (Vite + TypeScript)
├── deploy/                      # Deployment configs
├── scripts/                     # Automation scripts
└── docs/                        # Documentation
```

## API Documentation

- [REST/WebSocket/SSE/gRPC API Reference](./docs/API.md)
- [Data Sources Catalog](./docs/DATA_SOURCES.md)
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [AGENTS.md](./AGENTS.md) for AI development guidelines.

## License

This project is for personal use. See LICENSE file for details.

## Disclaimer

This software is for educational and research purposes only. It does not constitute financial advice. Trading involves risk. The authors are not responsible for any financial losses incurred from using this software.
