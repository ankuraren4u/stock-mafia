# StockMafia API Documentation

Complete REST, WebSocket, SSE, and gRPC API reference for all microservices.

## Base URLs

| Service | HTTP | gRPC | WebSocket | SSE |
|---------|------|------|-----------|-----|
| Gateway | `http://localhost:8080` | `localhost:9080` | - | `http://localhost:8080/api/sse` |
| Price | `http://localhost:8082` | `localhost:9002` | `ws://localhost:8082/ws` | `http://localhost:8082/api/events` |
| Crawler | - | `localhost:9001` | - | - |
| Analytics | - | `localhost:9003` | - | - |
| Alert | - | `localhost:9004` | - | - |
| Portfolio | - | `localhost:9005` | - | - |

---

## Gateway REST API (port 8080)

### Health & Status

```
GET /health
GET /api/health
GET /api/status
GET /api/status/detailed
GET /api/status/metrics
```

**Response (200):**
```json
{
  "status": "ok",
  "service": "stockmafia-gateway",
  "version": "1.0.0",
  "uptime": "2h30m15s",
  "dependencies": [
    {"name": "redis", "status": "up", "latency_ms": 1},
    {"name": "crawler", "status": "up", "latency_ms": 5}
  ],
  "timestamp": 1704067200000
}
```

### Market Data

```
GET  /api/market/stocks          # List all stocks
GET  /api/market/stocks/{symbol} # Get stock detail
GET  /api/market/quotes          # Get live quotes
GET  /api/market/quotes/{symbol} # Get single quote
GET  /api/market/candles         # Get candle history
```

**GET /api/market/quotes?symbols=AAPL,RELIANCE.NS**

Response:
```json
{
  "quotes": [
    {
      "symbol": "AAPL",
      "yahoo": "AAPL",
      "price": 195.50,
      "change": 2.30,
      "changePct": 1.19,
      "previousClose": 193.20,
      "volume": 52000000,
      "currency": "USD"
    }
  ]
}
```

**GET /api/market/candles?symbol=AAPL&interval=1d&from=2024-01-01&to=2024-12-31**

Response:
```json
{
  "candles": [
    {
      "time": "2024-01-02T00:00:00Z",
      "open": 185.50,
      "high": 186.80,
      "low": 184.20,
      "close": 185.60,
      "volume": 45000000
    }
  ]
}
```

### Screener

```
POST /api/screener/run           # Run stock screener
GET  /api/screener/results       # Get latest results
```

**POST /api/screener/run**
```json
{
  "filters": {
    "market": "IN",
    "sector": "IT",
    "rsi_max": "30",
    "volume_min": "1000000"
  },
  "sort_by": "market_cap",
  "sort_desc": true,
  "limit": 50
}
```

### Trading Desk

```
GET  /api/desk/signals           # Get trading signals
GET  /api/desk/strategies        # List available strategies
POST /api/desk/strategy/{id}     # Run a specific strategy
```

### Paper Trading

```
POST /api/paper/order            # Place paper order
GET  /api/paper/orders           # Get order history
GET  /api/paper/positions        # Get open positions
GET  /api/paper/portfolio        # Get portfolio summary
```

**POST /api/paper/order**
```json
{
  "yahoo": "AAPL",
  "side": "BUY",
  "quantity": 10,
  "price": 195.50,
  "mode": "paper",
  "note": "Testing strategy entry"
}
```

### Crawler

```
GET  /api/crawler/status         # Get crawler status
POST /api/crawler/trigger        # Trigger manual crawl
```

### Alerts (via Alert Service gRPC)

```
GET  /api/alerts                 # Get all alerts
GET  /api/watchlist              # Get watchlist
POST /api/alerts                 # Create alert
DELETE /api/alerts/{id}          # Delete alert
```

---

## Price Service API (port 8082)

### REST Endpoints

```
GET /health                      # Health check
GET /api/quotes                  # Get quotes
GET /api/candles                 # Get candle history
GET /api/stock/{symbol}          # Get stock detail
```

### WebSocket (ws://localhost:8082/ws)

**Client → Server:**
```json
{"type": "subscribe", "symbols": ["AAPL", "RELIANCE.NS"]}
{"type": "unsubscribe", "symbols": ["AAPL"]}
{"type": "ping"}
```

**Server → Client:**
```json
{"type": "connected", "time": 1234567890}
{"type": "prices", "data": {"AAPL": {"price": 195.5, "changePct": 1.2}}, "time": 1234567890}
{"type": "alert", "symbol": "AAPL", "direction": "above", "price": 200, "note": "target"}
{"type": "pong", "time": 1234567890}
```

### SSE (http://localhost:8082/api/events?topics=prices,alerts)

```
event: price
data: {"AAPL":{"price":195.5,"changePct":1.2},"RELIANCE.NS":{"price":2450,"changePct":-0.5}}

event: alert
data: {"symbol":"AAPL","direction":"above","price":200,"note":"target reached"}
```

---

## gRPC Services

### CrawlerService (port 9001)

```protobuf
service CrawlerService {
  rpc GetStatus(GetStatusRequest) returns (GetStatusResponse);
  rpc StartCrawl(StartCrawlRequest) returns (StartCrawlResponse);
  rpc CrawlSymbol(CrawlSymbolRequest) returns (CrawlSymbolResponse);
}
```

### PriceService (port 9002)

```protobuf
service PriceService {
  rpc GetQuotes(GetQuotesRequest) returns (GetQuotesResponse);
  rpc GetStockDetail(GetStockDetailRequest) returns (GetStockDetailResponse);
  rpc GetCandles(GetCandlesRequest) returns (GetCandlesResponse);
}
```

### AnalyticsService (port 9003)

```protobuf
service AnalyticsService {
  rpc GetSignals(GetSignalsRequest) returns (GetSignalsResponse);
  rpc GetAlgoConfig(GetAlgoConfigRequest) returns (GetAlgoConfigResponse);
  rpc GenerateSuggestions(GenerateSuggestionsRequest) returns (GenerateSuggestionsResponse);
  rpc ExecuteSuggestion(ExecuteSuggestionRequest) returns (ExecuteSuggestionResponse);
  rpc RunScreener(RunScreenerRequest) returns (RunScreenerResponse);
}
```

### AlertService (port 9004)

```protobuf
service AlertService {
  rpc GetAlerts(GetAlertsRequest) returns (GetAlertsResponse);
  rpc GetWatchlist(GetWatchlistRequest) returns (GetWatchlistResponse);
  rpc CreateAlert(CreateAlertRequest) returns (CreateAlertResponse);
  rpc DeleteAlert(DeleteAlertRequest) returns (DeleteAlertResponse);
}
```

### PortfolioService (port 9005)

```protobuf
service PortfolioService {
  rpc PlaceOrder(PlaceOrderRequest) returns (PlaceOrderResponse);
  rpc GetPortfolio(GetPortfolioRequest) returns (GetPortfolioResponse);
  rpc GetOrders(GetOrdersRequest) returns (GetOrdersResponse);
  rpc AddJournalEntry(AddJournalEntryRequest) returns (AddJournalEntryResponse);
}
```

---

## Authentication

### API Key
```
X-API-Key: your-api-key
```

### JWT Bearer Token
```
Authorization: Bearer <jwt-token>
```

### Token Refresh
```
POST /api/auth/refresh
{
  "refresh_token": "..."
}
```

---

## Error Responses

All endpoints return errors in consistent format:

```json
{
  "error": "Description of what went wrong",
  "code": "ERROR_CODE",
  "details": {}
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request / validation error |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 405 | Method not allowed |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 502 | Upstream service unavailable |
| 503 | Service temporarily unavailable |

### gRPC Status Codes

| Code | Meaning |
|------|---------|
| OK (0) | Success |
| INVALID_ARGUMENT (3) | Invalid request |
| NOT_FOUND (5) | Resource not found |
| ALREADY_EXISTS (6) | Resource already exists |
| INTERNAL (13) | Internal error |
| UNAVAILABLE (14) | Service unavailable |
| UNAUTHENTICATED (16) | Authentication required |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/market/* | 100 req | 1 min |
| /api/screener/run | 10 req | 1 min |
| /api/paper/order | 30 req | 1 min |
| /api/crawler/* | 20 req | 1 min |
| /api/sse/* | 5 connections | - |
| WebSocket | 10 connections | - |

---

## CORS Configuration

```yaml
allowed_origins:
  - http://localhost:5173
  - http://localhost:8080
  - https://your-domain.com
allowed_methods:
  - GET
  - POST
  - PUT
  - DELETE
  - OPTIONS
allowed_headers:
  - Authorization
  - Content-Type
  - X-API-Key
  - X-Request-ID
```
