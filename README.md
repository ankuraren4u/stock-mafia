# StockMafia

Self-hosted trading platform for **India (NSE)** and **US** market insights, strategy suggestions, paper trading, and optional live NSE orders.

> This is a research and execution workstation, not a promise of profit and not investment advice.

---

## Architecture

```
                          INTERNET
                             │
                    ┌────────┼────────┐
                    │        │        │
               ┌────▼───┐ ┌─▼────┐ ┌─▼────┐
               │ HTTPS  │ │ gRPC │ │  WS  │
               │ :8787  │ │:9087 │ │:8082 │
               └────┬───┘ └──┬───┘ └──┬───┘
                    │        │        │
               ┌────▼────────▼────────▼────┐
               │    API GATEWAY (Node.js)   │
               │    Express + HTTPS         │
               └────────────┬──────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
    ┌─────▼─────┐    ┌──────▼──────┐    ┌────▼────┐
    │  CRAWLER  │    │   PRICE     │    │ANALYTICS│
    │  Worker   │    │  WebSocket  │    │ Signals │
    │  Pool     │    │  + SSE      │    │ Scoring │
    └─────┬─────┘    └──────┬──────┘    └────┬────┘
          │                 │                 │
          │                 │            ┌────▼────┐
          │                 │            │  ALERT  │
          │                 │            │ Monitor │
          │                 │            └────┬────┘
          │                 │                 │
    ┌─────▼─────────────────▼─────────────────▼────┐
    │              INFRASTRUCTURE LAYER              │
    │  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │
    │  │  MySQL  │  │  Redis  │  │   Kafka     │  │
    │  │  :3306  │  │  :6379  │  │   :9092     │  │
    │  └─────────┘  └─────────┘  └─────────────┘  │
    │  ┌─────────────────────────────────────────┐ │
    │  │         PROXY POOL + RATE LIMITING      │ │
    │  │  HTTP/SOCKS5 + Domain throttling        │ │
    │  └─────────────────────────────────────────┘ │
    └──────────────────────────────────────────────┘
```

## Features

- **Multi-source data crawling** from 135+ data sources with proxy rotation
- **Real-time price streaming** via WebSocket and Server-Sent Events
- **Technical analysis** with 10+ indicators (RSI, MACD, EMA, ADX, VWAP, Bollinger, Supertrend, etc.)
- **Signal scoring** with composite scores and confidence levels
- **Stock screener** with category filters and custom strategies
- **Paper trading engine** for risk-free strategy testing
- **Live trading** via Zerodha Kite Connect (disabled by default - India only)
- **Alert system** with Telegram, Discord, and webhook notifications
- **Trade journal** for tracking and analyzing trades
- **Full observability** with Jaeger tracing, ELK stack, and Prometheus metrics

### Enabling Zerodha Kite (Optional)

Zerodha Kite integration is disabled by default. To enable:

1. Set `KITE_ENABLED=true` in server/.env
2. Set `KITE_API_KEY` and `KITE_API_SECRET`
3. Whitelist IP in Kite Connect settings
4. Add redirect URL: `https://YOUR_IP:8787/api/kite/callback`

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for details.

## Quick Start

### Prerequisites

- Node.js 18+
- Go 1.22+ (for Go microservices)
- MySQL 8.0+ (or Docker Compose)
- Redis 7+ (or Docker Compose)

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access the app
open http://localhost:8787
```

### Deploy to Proxmox LXC

```bash
# Full deploy
./deploy-lxc.sh

# Deploy specific service
./deploy-lxc.sh server    # Node.js backend
./deploy-lxc.sh web       # React frontend
./deploy-lxc.sh gateway   # Go Gateway service
./deploy-lxc.sh crawler   # Go Crawler service
./deploy-lxc.sh price     # Go Price service
./deploy-lxc.sh analytics # Go Analytics service
./deploy-lxc.sh alert     # Go Alert service
./deploy-lxc.sh portfolio # Go Portfolio service

# Check status
./deploy-lxc.sh status
```

### Docker Compose (Local)

```bash
cd deploy
docker compose up -d
```

## Access Services

| Service | URL |
|---------|-----|
| Web App | https://YOUR_IP:8787 |
| API Health | https://YOUR_IP:8787/api/health |
| API Status | https://YOUR_IP:8787/api/status/detailed |
| WebSocket | wss://YOUR_IP:8787/ws |
| SSE Events | https://YOUR_IP:8787/api/events |

## Configuration

### Environment Variables (server/.env)

```bash
# Server
PORT=8787
HOST=0.0.0.0
SSL_CERT=/etc/ssl/certs/stockmafia.crt
SSL_KEY=/etc/ssl/private/stockmafia.key

# Proxy rotation
PROXY_LIST=socks5://proxy1:1080,socks5://proxy2:1080

# API Keys
FINNHUB_API_KEY=your_key
TWELVE_DATA_API_KEY=your_key
ALPHA_VANTAGE_API_KEY=your_key
TIINGO_API_KEY=your_key
FMP_API_KEY=your_key
POLYGON_API_KEY=your_key

# Rate limiting
YAHOO_RATE_LIMIT=2
STOOQ_RATE_LIMIT=1
FINNHUB_RATE_LIMIT=60
TWELVE_DATA_RATE_LIMIT=800
TIINGO_RATE_LIMIT=1000
FMP_RATE_LIMIT=250
POLYGON_RATE_LIMIT=5

# Zerodha Kite (disabled by default)
KITE_ENABLED=false
KITE_API_KEY=your_key
KITE_API_SECRET=your_secret
```

### API Keys (~/Documents/work/auth/stockmafia/)

| File | API | Free Tier |
|------|-----|-----------|
| finnhub-api-key.txt | Finnhub | 60 req/min |
| twelve-data-api-key.txt | Twelve Data | 800 req/day |
| alpha-vantage-api-key.txt | Alpha Vantage | 25 req/day |
| tiingo-api-key.txt | Tiingo | 1000 req/hr |
| fmp-api-key.txt | FMP | 250 req/day |
| polygon-api-key.txt | Polygon.io | 5 req/min |

## Data Sources

### Indian Stocks (80+ sources)
- **Prices**: NSE India, Moneycontrol, Yahoo Finance
- **News**: Google News IN, Economic Times, Moneycontrol, Business Standard, Livemint, NDTV, Hindu BusinessLine (10+ RSS feeds)
- **Fundamentals**: Yahoo Finance, Screener.in

### US Stocks (80+ sources)
- **Prices**: Finnhub, Twelve Data, Alpha Vantage, Tiingo, FMP, Polygon.io, Yahoo Finance
- **News**: Google News US, CNBC, Reuters, MarketWatch, Bloomberg, WSJ, Seeking Alpha, Motley Fool, InvestorPlace, Benzinga (10+ RSS feeds)
- **Fundamentals**: Yahoo Finance, Finnhub, Alpha Vantage, FMP

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
├── server/                      # Node.js backend
├── web/                         # React frontend (Vite + TypeScript)
├── deploy/                      # Deployment configs
├── scripts/                     # Automation scripts
├── docs/                        # Documentation
├── deploy-lxc.sh               # LXC deployment script
├── Makefile                     # Build system
└── AGENTS.md                    # AI development guidelines
```

## API Documentation

- [REST/WebSocket/SSE/gRPC API Reference](./docs/API.md)
- [Data Sources Catalog](./docs/DATA_SOURCES.md)
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

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
