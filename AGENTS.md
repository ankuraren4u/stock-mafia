# StockMafia — AI Development Guidelines

This document provides guidelines for AI assistants working on the StockMafia codebase.

## Project Structure

```
trading-app/
├── services/                    # Go microservices
│   ├── gateway/                 # HTTP API gateway (port 8080)
│   ├── crawler/                 # Data collection worker (gRPC :9001)
│   ├── price/                   # Price streaming (gRPC :9002, HTTP :8082, WS :8082/ws)
│   ├── analytics/               # Technical analysis (gRPC :9003)
│   ├── alert/                   # Alert system (gRPC :9004)
│   └── portfolio/               # Trading engine (gRPC :9005)
├── pkg/                         # Shared Go packages
│   ├── database/                # MySQL connection and migrations
│   ├── redis/                   # Redis client and caching
│   ├── kafka/                   # Kafka producer/consumer
│   ├── proxy/                   # Proxy rotation for crawling
│   ├── logging/                 # Structured logging (zap)
│   ├── health/                  # Health check framework
│   └── tracing/                 # OpenTelemetry/Jaeger tracing
├── proto/                       # Protobuf definitions
│   └── stockmafia/              # Proto modules per domain
│       ├── common/v1/           # Shared types
│       ├── crawler/v1/          # Crawler service proto
│       ├── price/v1/            # Price service proto
│       ├── analytics/v1/        # Analytics service proto
│       ├── alert/v1/            # Alert service proto
│       └── portfolio/v1/        # Portfolio service proto
├── web/                         # React frontend (Vite + TypeScript)
├── deploy/                      # Deployment configs
│   ├── docker-compose.yml       # Local development infrastructure
│   ├── k8s/                     # Kubernetes manifests
│   ├── nginx/                   # Nginx reverse proxy config
│   └── elk/                     # ELK stack configs
├── scripts/                     # Automation scripts
│   ├── setup.sh                 # Local development setup
│   ├── dev.sh                   # Start dev environment
│   ├── deploy.sh                # Production deployment
│   ├── test.sh                  # Test runner
│   └── generate-protos.sh       # Proto code generation
├── go.work                      # Go workspace configuration
├── docker-compose.yml           # Legacy Docker compose
└── stock_market_data_sources.json  # 135+ data source catalog
```

## Code Conventions

### Go Services

- **Module path**: `github.com/stockmafia/trading-app/services/{service}`
- **Package structure**: `cmd/main.go` (entry), `internal/{config,handler,service,repository,grpc}/`
- **Error handling**: Use `fmt.Errorf("context: %w", err)` for wrapping
- **Logging**: Use `go.uber.org/zap` structured logging
- **gRPC**: Define services in `proto/stockmafia/{domain}/v1/`
- **Config**: Load from environment variables with sensible defaults
- **Testing**: Use `go test ./...` with table-driven tests

### TypeScript (Web)

- **Framework**: React 18+ with Vite
- **Styling**: Tailwind CSS
- **State**: React Query for server state
- **Linting**: ESLint with TypeScript parser
- **Build**: `npm run build` (Vite production build)

## How to Add a New Microservice

1. Create service directory:
```bash
mkdir -p services/{name}/cmd
mkdir -p services/{name}/internal/{config,handler,service,repository,grpc}
```

2. Create `services/{name}/go.mod`:
```go
module github.com/stockmafia/trading-app/services/{name}

go 1.21

require (
    github.com/stockmafia/trading-app/pkg/logging v0.0.0
    go.uber.org/zap v1.26.0
    google.golang.org/grpc v1.60.1
)

replace (
    github.com/stockmafia/trading-app/pkg/logging => ../../pkg/logging
)
```

3. Create `cmd/main.go` with gRPC server setup
4. Create proto definitions in `proto/stockmafia/{domain}/v1/`
5. Add to `go.work` file
6. Add to `deploy/docker-compose.yml`
7. Add to `deploy/k8s/base/` with K8s manifests
8. Update gateway routes in `services/gateway/cmd/main.go`

## How to Add a New Data Source Adapter

1. Create source file in `services/crawler/internal/crawler/sources/`:
```go
package sources

import (
    "context"
    "github.com/stockmafia/trading-app/services/crawler/internal/crawler"
)

type NewSource struct {
    base *BaseSource
}

func NewNewSource(base *BaseSource) crawler.Source {
    return &NewSource{base: base}
}

func (s *NewSource) Name() string { return "newsource" }

func (s *NewSource) FetchQuote(ctx context.Context, symbol string) (*crawler.Quote, error) {
    // Implementation
}

func (s *NewSource) FetchCandles(ctx context.Context, symbol string, interval string, from, to time.Time) ([]crawler.Candle, error) {
    // Implementation
}
```

2. Register in `services/crawler/internal/crawler/orchestrator.go`
3. Add rate limits in config
4. Update `stock_market_data_sources.json`

## How to Add a New API Endpoint

1. Define proto in `proto/stockmafia/{domain}/v1/{domain}.proto`
2. Generate Go code: `./scripts/generate-protos.sh`
3. Add gRPC client in `services/gateway/internal/grpc/client.go`
4. Add handler in `services/gateway/internal/handler/{domain}.go`
5. Register route in `services/gateway/cmd/main.go`:
```go
mux.Handle("/api/{domain}/", handlerFunc({domain}Routes))
```

## How to Run Tests

```bash
# All tests
./scripts/test.sh

# Unit tests only
./scripts/test.sh unit

# Single service
cd services/{name} && go test ./...

# With coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out

# Integration tests
go test -tags=integration ./...
```

## How to Deploy

### Local Development
```bash
./scripts/setup.sh    # First time setup
./scripts/dev.sh      # Start all services
```

### Docker Compose
```bash
docker compose -f deploy/docker-compose.yml up -d
```

### Production (Kubernetes)
```bash
./scripts/deploy.sh build    # Build images
./scripts/deploy.sh push     # Push to registry
./scripts/deploy.sh deploy   # Apply K8s manifests
```

## Common Patterns

### Graceful Shutdown
```go
quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
srv.Shutdown(ctx)
```

### gRPC Client with Timeout
```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
resp, err := client.Method(ctx, &Request{})
```

### Redis Cache Pattern
```go
key := fmt.Sprintf("price:%s", symbol)
cached, err := rdb.Get(ctx, key).Result()
if err == nil {
    return json.Unmarshal([]byte(cached), &result)
}
// Fetch from source, cache result
rdb.Set(ctx, key, jsonData, 5*time.Second)
```

### Kafka Producer
```go
msg := kafka.Message{
    Key:   []byte(symbol),
    Value: jsonData,
    Time:  time.Now(),
}
writer.WriteMessages(ctx, msg)
```

## Anti-Patterns to Avoid

1. **Don't** use `time.Sleep` for rate limiting — use token buckets or sliding windows
2. **Don't** log sensitive data (API keys, passwords, tokens)
3. **Don't** ignore errors — always handle or propagate them
4. **Don't** use global mutable state — prefer dependency injection
5. **Don't** make HTTP calls without timeouts
6. **Don't** store credentials in code — use environment variables
7. **Don't** use `panic` for normal error handling
8. **Don't** share database connections across goroutines without pooling

## Performance Guidelines

- Use connection pooling for MySQL (max 25 connections per service)
- Use Redis pipelines for batch operations
- Implement circuit breakers for external API calls
- Cache aggressively with appropriate TTLs:
  - Live prices: 5s
  - Fundamentals: 24h
  - Signals: 5min
  - Session data: 24h
- Use `context.Context` for request-scoped cancellation
- Profile with `go tool pprof` when optimizing

## Security Guidelines

- Never commit secrets to git
- Use environment variables for all configuration
- Validate and sanitize all user inputs
- Use parameterized SQL queries (prevent SQL injection)
- Implement rate limiting on all public endpoints
- Use CORS headers appropriately
- Hash passwords with bcrypt
- Use JWT with short expiry for authentication
- Rotate API keys regularly
- Audit dependencies with `go vet` and `govulncheck`
