# StockMafia Documentation Update Plan

## Overview

Comprehensive documentation update for the StockMafia trading platform covering 7 files across README, architecture, AI guidelines, API docs, deployment, troubleshooting, and data sources.

## Project Understanding

StockMafia is a self-hosted trading platform with:
- **Backend**: Node.js/TypeScript (server/) + Go microservices (services/)
- **Frontend**: React/TypeScript (web/)
- **Infrastructure**: MySQL, Redis, Kafka, Kubernetes
- **Services**: Gateway, Crawler, Price, Analytics, Alert, Portfolio (6 Go microservices)
- **Data Sources**: 135+ sources across 7 categories
- **Trading Strategies**: 13 algorithmic strategies
- **Markets**: India (NSE/BSE) and US (NYSE/NASDAQ)
- **Integration**: Zerodha Kite Connect for live trading

## Documentation Files to Create/Update

### 1. README.md (Complete Rewrite)
- Project overview and features
- Architecture diagram (ASCII art)
- Quick start guide
- Development setup
- Deployment guide
- API documentation summary
- Configuration reference
- Contributing guidelines
- License

### 2. ARCHITECTURE.md (Comprehensive Rewrite)
- System overview
- Microservices description (6 services)
- Data flow diagrams
- Database schemas (MySQL)
- API contracts (REST + gRPC)
- Deployment architecture (Kubernetes)
- Security considerations
- Scaling strategy
- Monitoring and alerting

### 3. AGENTS.md (New File)
- Project structure
- Code conventions
- Testing requirements
- Deployment process
- Common patterns
- Anti-patterns to avoid
- Performance guidelines
- Security guidelines
- Documentation standards

### 4. docs/API.md (New File)
- All endpoints with examples
- Request/response formats
- Authentication
- Rate limiting
- Error codes
- WebSocket protocol
- SSE protocol
- gRPC proto definitions

### 5. docs/DEPLOYMENT.md (New File)
- Prerequisites
- Local development
- Docker Compose
- Kubernetes deployment
- Production checklist
- Monitoring setup
- Backup procedures
- Disaster recovery

### 6. docs/TROUBLESHOOTING.md (New File)
- Service won't start
- Database connection issues
- Redis connection issues
- Kafka connection issues
- WebSocket not connecting
- SSE not streaming
- gRPC errors
- Rate limiting issues
- Proxy connection issues

### 7. docs/DATA_SOURCES.md (New File)
- All 135+ data sources
- API endpoints
- Rate limits
- Authentication
- Coverage
- Reliability ratings

## Implementation Order

1. Create docs/ directory
2. Write README.md
3. Write ARCHITECTURE.md
4. Write AGENTS.md
5. Write docs/API.md
6. Write docs/DEPLOYMENT.md
7. Write docs/TROUBLESHOOTING.md
8. Write docs/DATA_SOURCES.md

## Key Information Sources

- `/Users/ankur/Documents/work/trading-app/ARCHITECTURE.md` - Existing architecture
- `/Users/ankur/Documents/work/trading-app/MIGRATION_PLAN.md` - Migration details
- `/Users/ankur/Documents/work/trading-app/stock_market_data_sources.json` - 135+ data sources
- `/Users/ankur/Documents/work/trading-app/proto/` - gRPC definitions
- `/Users/ankur/Documents/work/trading-app/services/` - Go microservices
- `/Users/ankur/Documents/work/trading-app/server/` - Node.js backend
- `/Users/ankur/Documents/work/trading-app/web/` - React frontend
- `/Users/ankur/Documents/work/trading-app/deploy/` - Deployment configs
