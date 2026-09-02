# StockMafia Go Migration Plan — 10K+ Stocks, Production-Grade

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Go Project Structure](#2-go-project-structure)
3. [Database Schema](#3-database-schema)
4. [Crawler Architecture](#4-crawler-architecture)
5. [Rate Limiter Design](#5-rate-limiter-design)
6. [WebSocket Implementation](#6-websocket-implementation)
7. [API Route Mapping](#7-api-route-mapping)
8. [Key Go Interfaces and Types](#8-key-go-interfaces-and-types)
9. [Deployment Strategy](#9-deployment-strategy)
10. [Migration Steps](#10-migration-steps)

---

## 1. Current State Analysis

### Existing Architecture
- **Backend**: Node.js/Express + TypeScript
- **Storage**: JSON files (`store.json`, `tickers.json`, `crawler-log.json`, `data/crawl/*.json`)
- **Crawlers**: 8 source adapters (Yahoo, Stooq, NSE, Moneycontrol, Finnhub, MarketWatch, CNBC, Nasdaq)
- **WebSocket**: `ws` library, broadcasts cached prices every 5s
- **Universe**: ~79 India stocks + ~127 US stocks = ~206 hardcoded instruments
- **Batch crawling**: 8 concurrent symbols, 3s delay between batches

### Scaling Bottlenecks in Current Design
1. **JSON file I/O**: No concurrency control, file locking, or atomic writes
2. **In-memory quote cache**: Lost on restart, no persistence
3. **Single-process crawling**: No worker pool, no distributed coordination
4. **Hardcoded universe**: Cannot dynamically add 10K+ stocks
5. **No candle accumulation persistence**: Candles stored in per-symbol JSON files, fragile

### What We Keep
- Source adapter logic (Stooq, NSE, Moneycontrol, Finnhub, Yahoo)
- News sentiment scoring algorithm
- Strategy engine and indicator math (RSI, ADX, MACD, VWAP, etc.)
- Frontend WebSocket protocol (subscribe/unsubscribe/ping/pong)
- API contract (all REST endpoints remain identical)

---

## 2. Go Project Structure

```
stockmafia/
├── cmd/
│   └── stockmafia/
│       └── main.go                    # Entry point: wires everything, starts HTTP + WS + crawler
├── internal/
│   ├── config/
│   │   └── config.go                  # Env-based config (ports, API keys, DB path, batch sizes)
│   ├── db/
│   │   ├── sqlite.go                  # SQLite connection pool + migrations
│   │   ├── migrations.go              # Embedded SQL schema migrations
│   │   └── queries/
│   │       ├── stocks.sql             # Stock CRUD queries
│   │       ├── candles.sql            # Candle upsert (accumulate) queries
│   │       ├── quotes.sql             # Latest quote cache queries
│   │       ├── fundamentals.sql       # Fundamental data queries
│   │       ├── news.sql               # News item queries
│   │       ├── watchlist.sql          # Watchlist + portfolio queries
│   │       └── crawl_logs.sql         # Crawl audit log queries
│   ├── crawler/
│   │   ├── crawler.go                 # Orchestrator: dispatches jobs to worker pool
│   │   ├── worker.go                  # Worker goroutine: picks jobs, runs source chain
│   │   ├── ratelimit.go               # Token bucket rate limiter per source
│   │   ├── retry.go                   # Exponential backoff + circuit breaker
│   │   ├── sources.go                 # Source chain orchestrator (priority + fallback)
│   │   └── adapters/
│   │       ├── adapter.go             # SourceAdapter interface
│   │       ├── yahoo.go               # Yahoo Finance adapter
│   │       ├── stooq.go               # Stooq CSV adapter
│   │       ├── nse.go                 # NSE India adapter
│   │       ├── moneycontrol.go        # Moneycontrol adapter
│   │       ├── finnhub.go             # Finnhub API adapter
│   │       ├── marketwatch.go         # MarketWatch adapter
│   │       ├── cnbc.go                # CNBC adapter
│   │       └── nasdaq.go              # Nasdaq adapter
│   ├── api/
│   │   ├── router.go                  # All route registration (mirrors current Express)
│   │   ├── middleware.go              # Auth, rate limiting, CORS, security headers, logging
│   │   ├── market.go                  # /api/market handlers
│   │   ├── signals.go                 # /api/signals handlers
│   │   ├── paper.go                   # /api/paper handlers
│   │   ├── algo.go                    # /api/algo handlers
│   │   ├── crawler.go                 # /api/crawler handlers
│   │   ├── desk.go                    # /api/desk handlers
│   │   ├── screener.go                # /api/screener handlers
│   │   ├── advanced.go                # /api/advanced handlers
│   │   ├── intel.go                   # /api/intel handlers
│   │   └── suggestions.go             # /api/suggestions handlers
│   ├── ws/
│   │   └── websocket.go               # WebSocket hub: client mgmt, broadcast, subscribe/unsubscribe
│   ├── models/
│   │   ├── stock.go                   # Instrument, Stock types
│   │   ├── candle.go                  # Candle, ChartPayload types
│   │   ├── quote.go                   # Quote type
│   │   ├── fundamental.go             # Fundamental data type
│   │   ├── news.go                    # NewsItem type
│   │   └── store.go                   # Portfolio, Watchlist, AlgoRule, etc.
│   ├── universe/
│   │   ├── universe.go                # Load from DB, search, classify market
│   │   └── ingest.go                  # Bulk import NSE/BSE/NASDAQ/NYSE lists from CSV/APIs
│   ├── indicators/
│   │   └── indicators.go              # RSI, ADX, EMA, MACD, VWAP (pure math, no I/O)
│   └── news/
│       ├── crawl.go                   # RSS feed aggregation + dedup
│       └── sentiment.go               # Keyword-based sentiment scoring
├── pkg/
│   └── httputil/
│       ├── client.go                  # Configurable HTTP client (timeouts, retry, UA rotation)
│       └── xmlparse.go                # XML/RSS parsing (replaces fast-xml-parser)
├── data/
│   ├── seed/
│   │   ├── nse_equities.csv           # NSE full equity list (auto-refreshed weekly)
│   │   ├── bse_equities.csv           # BSE full list
│   │   ├── nasdaq_listed.csv          # NASDAQ listed
│   │   └── nyse_listed.csv            # NYSE listed
│   └── stockmafia.db                  # SQLite database (gitignored)
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_add_indexes.sql
├── deploy/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── stockmafia.service              # systemd unit file
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

---

## 3. Database Schema

### migrations/001_initial_schema.sql

```sql
-- ============================================================
-- STOCKMAFIA DATABASE SCHEMA
-- SQLite primary, PostgreSQL migration path preserved
-- ============================================================

-- Enable WAL mode for concurrent reads during crawling
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- ============================================================
-- STOCKS: Master instrument registry (10K+)
-- ============================================================
CREATE TABLE IF NOT EXISTS stocks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,                          -- e.g. "RELIANCE", "AAPL"
    yahoo       TEXT    NOT NULL UNIQUE,                   -- e.g. "RELIANCE.NS", "AAPL"
    name        TEXT    NOT NULL DEFAULT '',
    sector      TEXT    NOT NULL DEFAULT '',
    market      TEXT    NOT NULL CHECK (market IN ('IN','US')),
    exchange    TEXT    NOT NULL DEFAULT '',               -- NSE, BSE, NASDAQ, NYSE
    currency    TEXT    NOT NULL DEFAULT 'USD',
    is_active   INTEGER NOT NULL DEFAULT 1,               -- 0 = delisted / excluded
    priority    INTEGER NOT NULL DEFAULT 0,               -- higher = crawled first (watchlist boost)
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_stocks_yahoo ON stocks(yahoo);
CREATE INDEX idx_stocks_symbol     ON stocks(symbol);
CREATE INDEX idx_stocks_market     ON stocks(market);
CREATE INDEX idx_stocks_active     ON stocks(is_active);
CREATE INDEX idx_stocks_priority   ON stocks(priority DESC);

-- ============================================================
-- CANDLES: OHLCV historical data (accumulated, never overwritten)
-- ============================================================
CREATE TABLE IF NOT EXISTS candles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    time        INTEGER NOT NULL,                          -- Unix millis (same as current TS)
    open        REAL,
    high        REAL,
    low         REAL,
    close       REAL,
    volume      INTEGER,
    interval    TEXT    NOT NULL DEFAULT '1d',             -- 1d, 1wk, 1mo, 5m
    source      TEXT    NOT NULL DEFAULT '',               -- which source provided this candle
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Composite unique: one candle per stock per timestamp per interval
CREATE UNIQUE INDEX idx_candles_stock_time_interval ON candles(stock_id, time, interval);
CREATE INDEX idx_candles_stock_id    ON candles(stock_id);
CREATE INDEX idx_candles_time        ON candles(time);
CREATE INDEX idx_candles_stock_time  ON candles(stock_id, time);

-- ============================================================
-- QUOTES: Latest quote cache (replaces in-memory Map)
-- ============================================================
CREATE TABLE IF NOT EXISTS quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id        INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    price           REAL,
    change          REAL,
    change_pct      REAL,
    previous_close  REAL,
    day_high        REAL,
    day_low         REAL,
    volume          INTEGER,
    market_cap      REAL,
    currency        TEXT    NOT NULL DEFAULT 'USD',
    source          TEXT    NOT NULL DEFAULT '',
    crawled_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_quotes_stock_id ON quotes(stock_id);
CREATE INDEX idx_quotes_crawled_at      ON quotes(crawled_at);

-- ============================================================
-- FUNDAMENTALS: Key financial metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS fundamentals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id        INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    pe              REAL,
    forward_pe      REAL,
    pb              REAL,
    dividend_yield  REAL,
    market_cap      REAL,
    beta            REAL,
    eps             REAL,
    roe             REAL,
    debt_to_equity  REAL,
    profit_margins  REAL,
    revenue_growth  REAL,
    earnings_growth REAL,
    target_mean     REAL,
    recommendation  TEXT,
    week52_high     REAL,
    week52_low      REAL,
    revenue         REAL,
    net_income      REAL,
    free_cashflow   REAL,
    operating_margins REAL,
    gross_margins   REAL,
    book_value      REAL,
    price_to_sales  REAL,
    peg_ratio       REAL,
    source          TEXT    NOT NULL DEFAULT '',
    crawled_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_fundamentals_stock_id ON fundamentals(stock_id);

-- ============================================================
-- NEWS: Aggregated news with sentiment
-- ============================================================
CREATE TABLE IF NOT EXISTS news (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER REFERENCES stocks(id) ON DELETE CASCADE,  -- NULL for market-wide news
    title       TEXT    NOT NULL,
    link        TEXT    NOT NULL DEFAULT '',
    published   TEXT    NOT NULL DEFAULT '',
    source      TEXT    NOT NULL DEFAULT '',
    sentiment   REAL    NOT NULL DEFAULT 0,
    label       TEXT    NOT NULL DEFAULT 'neutral',     -- positive, negative, neutral
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_news_stock_id   ON news(stock_id);
CREATE INDEX idx_news_published  ON news(published);
CREATE INDEX idx_news_sentiment  ON news(sentiment);
CREATE UNIQUE INDEX idx_news_title_link ON news(title, link);

-- ============================================================
-- WATCHLIST: User's tracked symbols
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(stock_id)
);

-- ============================================================
-- PORTFOLIO: Paper/live trading
-- ============================================================
CREATE TABLE IF NOT EXISTS fills (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    side        TEXT    NOT NULL CHECK (side IN ('BUY','SELL')),
    quantity    INTEGER NOT NULL,
    price       REAL    NOT NULL,
    mode        TEXT    NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper','live')),
    note        TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS positions (
    symbol      TEXT    PRIMARY KEY,
    quantity    INTEGER NOT NULL DEFAULT 0,
    avg_price   REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alerts (
    id          TEXT    PRIMARY KEY,
    stock_id    INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    yahoo       TEXT    NOT NULL,
    direction   TEXT    NOT NULL CHECK (direction IN ('above','below')),
    price       REAL    NOT NULL,
    note        TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    triggered_at TEXT
);

CREATE TABLE IF NOT EXISTS journal (
    id          TEXT    PRIMARY KEY,
    stock_id    INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    yahoo       TEXT    NOT NULL,
    symbol      TEXT    NOT NULL,
    thesis      TEXT    NOT NULL DEFAULT '',
    side        TEXT    NOT NULL DEFAULT 'BUY',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ALGO: Strategy rules and suggestions
-- ============================================================
CREATE TABLE IF NOT EXISTS algo_rules (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    min_score   REAL    NOT NULL DEFAULT 72,
    action      TEXT    NOT NULL DEFAULT 'BUY',
    quantity    INTEGER NOT NULL DEFAULT 1,
    product     TEXT    NOT NULL DEFAULT 'CNC'
);

CREATE TABLE IF NOT EXISTS algo_suggestions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT    NOT NULL,
    strategy_name TEXT  NOT NULL,
    stock_id    INTEGER REFERENCES stocks(id),
    yahoo       TEXT    NOT NULL,
    symbol      TEXT    NOT NULL,
    market      TEXT    NOT NULL,
    side        TEXT    NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    entry       REAL,
    stop        REAL,
    target      REAL,
    risk_reward REAL,
    conviction  REAL,
    thesis      TEXT    NOT NULL DEFAULT '[]',     -- JSON array
    product     TEXT    NOT NULL DEFAULT 'CNC',
    status      TEXT    NOT NULL DEFAULT 'open',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- CRAWL_LOGS: Audit trail for debugging crawl runs
-- ============================================================
CREATE TABLE IF NOT EXISTS crawl_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER REFERENCES stocks(id),
    yahoo       TEXT    NOT NULL,
    symbol      TEXT    NOT NULL DEFAULT '',
    market      TEXT    NOT NULL DEFAULT '',
    sources     TEXT    NOT NULL DEFAULT '[]',     -- JSON array of source names
    has_quote   INTEGER NOT NULL DEFAULT 0,
    errors      TEXT    NOT NULL DEFAULT '[]',     -- JSON array of error strings
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_crawl_logs_stock_id  ON crawl_logs(stock_id);
CREATE INDEX idx_crawl_logs_created   ON crawl_logs(created_at);

CREATE TABLE IF NOT EXISTS crawl_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    status      TEXT    NOT NULL DEFAULT 'running', -- running, completed, failed
    reason      TEXT    NOT NULL DEFAULT '',
    total       INTEGER NOT NULL DEFAULT 0,
    succeeded   INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
);

-- ============================================================
-- CONFIG: Key-value store for runtime settings
-- ============================================================
CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO config (key, value) VALUES
    ('kite_access_token', ''),
    ('kite_user_id', ''),
    ('yahoo_paused_until', '0'),
    ('last_crawl_run', '0'),
    ('paper_starting_cash', '1000000');
```

### migrations/002_add_indexes.sql

```sql
-- Performance indexes for 10K+ stock scale
-- These are created after initial data load

-- For screener queries: filter by market + order by score-relevant columns
CREATE INDEX IF NOT EXISTS idx_candles_stock_close ON candles(stock_id, close);

-- For time-range queries on candles
CREATE INDEX IF NOT EXISTS idx_candles_stock_time_close ON candles(stock_id, time, close);

-- For news feed queries
CREATE INDEX IF NOT EXISTS idx_news_created_stock ON news(created_at DESC, stock_id);

-- For quote freshness checks
CREATE INDEX IF NOT EXISTS idx_quotes_crawled_stock ON quotes(crawled_at, stock_id);
```

---

## 4. Crawler Architecture

### Worker Pool Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        CRAWL ORCHESTRATOR                       │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │ Job Queue │───▶│ Scheduler│───▶│ Dispatcher│                  │
│  │ (channel) │    │ (priority)│    │ (round-robin)│             │
│  └──────────┘    └──────────┘    └─────┬────┘                  │
│                                        │                        │
│         ┌──────────┬──────────┬────────┼────────┬──────────┐   │
│         ▼          ▼          ▼        ▼        ▼          ▼   │
│    ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐    │
│    │Worker 1 ││Worker 2 ││Worker 3 ││Worker N ││Worker M │    │
│    │(IN池)   ││(US池)   ││(混合)   ││(混合)   ││(新闻)   │    │
│    └────┬────┘└────┬────┘└────┬────┘└────┬────┘└────┬────┘    │
│         │          │          │          │          │           │
│    ┌────▼──────────▼──────────▼──────────▼──────────▼────┐     │
│    │              RATE LIMITER POOL                       │     │
│    │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │     │
│    │  │ Yahoo  │ │ Stooq  │ │  NSE   │ │Finnhub │       │     │
│    │  │ 2 r/s  │ │ 1 r/s  │ │ 1 r/s  │ │ 60/min │       │     │
│    │  └────────┘ └────────┘ └────────┘ └────────┘       │     │
│    └─────────────────────┬───────────────────────────────┘     │
│                          │                                      │
│    ┌─────────────────────▼───────────────────────────────┐     │
│    │               SOURCE CHAIN                           │     │
│    │  For each symbol, try sources in priority order:     │     │
│    │  1. Stooq (candles) ──▶ 2. Yahoo (candles + quote)  │     │
│    │  3. NSE/Moneycontrol (IN quote) ──▶ 4. Finnhub      │     │
│    │  First success = stop trying (for that data type)    │     │
│    └─────────────────────┬───────────────────────────────┘     │
│                          │                                      │
│    ┌─────────────────────▼───────────────────────────────┐     │
│    │              PERSIST TO SQLite                        │     │
│    │  candles: UPSERT (only new timestamps)               │     │
│    │  quotes:  REPLACE ON stock_id                        │     │
│    │  fundamentals: REPLACE ON stock_id                   │     │
│    │  news:    INSERT OR IGNORE (dedup by title+link)     │     │
│    │  crawl_logs: INSERT                                   │     │
│    └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### internal/crawler/crawler.go

```go
package crawler

import (
    "context"
    "database/sql"
    "sync"
    "time"
)

// Job represents one symbol to crawl
type Job struct {
    Symbol   string  // yahoo symbol e.g. "RELIANCE.NS"
    StockID  int64
    Market   string  // "IN" or "US"
    Priority int     // higher = sooner
}

// CrawlResult holds the outcome of crawling one symbol
type CrawlResult struct {
    Job        Job
    Quote      *Quote
    Candles    []Candle
    Fundamentals *Fundamentals
    News       []NewsItem
    Errors     []string
    Sources    []string
    Duration   time.Duration
}

// Orchestrator manages the full crawl lifecycle
type Orchestrator struct {
    db         *sql.DB
    pool       *WorkerPool
    rateLimits map[string]*TokenBucket // source -> limiter
    mu         sync.RWMutex
    running    bool
    runID      int64
}

// NewOrchestrator creates a crawler with configurable concurrency
func NewOrchestrator(db *sql.DB, cfg Config) *Orchestrator

// StartFullCrawl crawls all active stocks (called on schedule / manual trigger)
func (o *Orchestrator) StartFullCrawl(ctx context.Context, reason string) error

// CrawlSymbol crawls a single symbol immediately (for on-demand requests)
func (o *Orchestrator) CrawlSymbol(ctx context.Context, yahoo string) (*CrawlResult, error)

// Status returns current crawl state for the /api/crawler/status endpoint
func (o *Orchestrator) Status() CrawlStatus

// Stop gracefully stops all workers
func (o *Orchestrator) Stop()

// Config holds crawler tuning parameters
type Config struct {
    BatchSize      int           // symbols per batch (default: 20)
    BatchDelay     time.Duration // delay between batches (default: 2s)
    WorkerCount    int           // goroutine pool size (default: 10)
    MaxRetries     int           // per-symbol retry count (default: 3)
    CrawlInterval  time.Duration // between full crawls (default: 15m)
    CandleHistory  time.Duration // how far back to fetch candles (default: 730d)
    IndiaWorkers   int           // dedicated workers for IN symbols
    USWorkers      int           // dedicated workers for US symbols
}
```

### internal/crawler/worker.go

```go
package crawler

import (
    "context"
    "sync"
)

// WorkerPool manages goroutine workers
type WorkerPool struct {
    jobs      chan Job
    results   chan CrawlResult
    workers   int
    ctx       context.Context
    cancel    context.CancelFunc
    wg        sync.WaitGroup
}

// NewWorkerPool creates a pool with the given number of goroutines
func NewWorkerPool(workers int, jobChan chan Job, resultChan chan CrawlResult) *WorkerPool

// Start launches all worker goroutines
func (wp *WorkerPool) Start(ctx context.Context)

// Stop signals all workers to finish and waits
func (wp *WorkerPool) Stop()

// worker is the goroutine loop: read job -> crawl -> write result
func (wp *WorkerPool) worker(id int)
```

---

## 5. Rate Limiter Design

### internal/crawler/ratelimit.go

```go
package crawler

import (
    "sync"
    "time"
)

// TokenBucket implements a per-source token bucket rate limiter
type TokenBucket struct {
    mu       sync.Mutex
    tokens   float64
    maxTokens float64
    refillRate float64  // tokens per second
    lastRefill time.Time
}

// NewTokenBucket creates a rate limiter
// maxTokens = burst capacity, refillRate = sustained rate per second
func NewTokenBucket(maxTokens, refillRate float64) *TokenBucket

// Acquire blocks until a token is available
func (tb *TokenBucket) Acquire(ctx context.Context) error

// TryAcquire returns immediately if a token is available
func (tb *TokenBucket) TryAcquire() bool

// refill adds tokens based on elapsed time
func (tb *TokenBucket) refill()

// Source rate limits (configurable via env)
//
// Source        Max Tokens   Refill Rate   Burst
// ───────────────────────────────────────────────
// Yahoo         1            2.0/s         2
// Stooq         1            1.0/s         1
// NSE           1            0.5/s         1  (aggressive anti-ban)
// Moneycontrol  1            1.0/s         1
// Finnhub       5            1.0/s         5  (60 req/min free tier)
// MarketWatch   1            0.5/s         1
// CNBC          1            0.5/s         1
// Nasdaq        1            1.0/s         1

// RateLimitPool manages all source rate limiters
type RateLimitPool struct {
    limiters map[string]*TokenBucket
}

func NewRateLimitPool() *RateLimitPool {
    return &RateLimitPool{
        limiters: map[string]*TokenBucket{
            "yahoo":        NewTokenBucket(2, 2.0),
            "stooq":        NewTokenBucket(1, 1.0),
            "nse":          NewTokenBucket(1, 0.5),
            "moneycontrol": NewTokenBucket(1, 1.0),
            "finnhub":      NewTokenBucket(5, 1.0),
            "marketwatch":  NewTokenBucket(1, 0.5),
            "cnbc":         NewTokenBucket(1, 0.5),
            "nasdaq":       NewTokenBucket(1, 1.0),
        },
    }
}

func (r *RateLimitPool) Acquire(ctx context.Context, source string) error {
    if limiter, ok := r.limiters[source]; ok {
        return limiter.Acquire(ctx)
    }
    return nil
}
```

### internal/crawler/retry.go

```go
package crawler

import (
    "context"
    "math"
    "time"
)

// RetryConfig controls exponential backoff
type RetryConfig struct {
    MaxAttempts int
    BaseDelay   time.Duration
    MaxDelay    time.Duration
    Multiplier  float64
}

// DefaultRetryConfig returns sensible defaults
func DefaultRetryConfig() RetryConfig {
    return RetryConfig{
        MaxAttempts: 3,
        BaseDelay:   500 * time.Millisecond,
        MaxDelay:    30 * time.Second,
        Multiplier:  2.0,
    }
}

// CircuitBreaker tracks failure counts per source
type CircuitBreaker struct {
    mu           sync.Mutex
    failures     map[string]int
    lastFail     map[string]time.Time
    threshold    int           // failures before opening
    resetAfter   time.Duration // time before half-open
    isClosed     map[string]bool
}

// NewCircuitBreaker creates a breaker with the given threshold
func NewCircuitBreaker(threshold int, resetAfter time.Duration) *CircuitBreaker

// Allow returns true if the source should be tried
func (cb *CircuitBreaker) Allow(source string) bool

// RecordSuccess resets the failure count for a source
func (cb *CircuitBreaker) RecordSuccess(source string)

// RecordFailure increments the failure count
func (cb *CircuitBreaker) RecordFailure(source string)

// ExecuteWithRetry runs fn with exponential backoff
func ExecuteWithRetry(ctx context.Context, cfg RetryConfig, fn func() error) error {
    var lastErr error
    for attempt := 0; attempt < cfg.MaxAttempts; attempt++ {
        if err := fn(); err != nil {
            lastErr = err
            delay := time.Duration(float64(cfg.BaseDelay) * math.Pow(cfg.Multiplier, float64(attempt)))
            if delay > cfg.MaxDelay {
                delay = cfg.MaxDelay
            }
            select {
            case <-ctx.Done():
                return ctx.Err()
            case <-time.After(delay):
                continue
            }
        } else {
            return nil
        }
    }
    return lastErr
}
```

### internal/crawler/sources.go

```go
package crawler

import (
    "context"
    "database/sql"
    "time"
)

// SourceChain tries multiple data sources in priority order
type SourceChain struct {
    adapters  []SourceAdapter
    rateLimit *RateLimitPool
    breaker   *CircuitBreaker
    db        *sql.DB
}

// CrawlSymbol orchestrates fetching all data for one symbol
func (sc *SourceChain) CrawlSymbol(ctx context.Context, job Job) (*CrawlResult, error) {
    result := &CrawlResult{Job: job}
    start := time.Now()
    defer func() { result.Duration = time.Since(start) }()

    // 1. CANDLES: Try Stooq first (works from any server), Yahoo as bonus
    sc.fetchCandles(ctx, job, result)

    // 2. QUOTE: NSE/Moneycontrol for IN, Finnhub for US, Yahoo as last resort
    sc.fetchQuote(ctx, job, result)

    // 3. FUNDAMENTALS: Yahoo first, Finnhub metrics as fallback
    sc.fetchFundamentals(ctx, job, result)

    // 4. NEWS: RSS aggregation from multiple feeds
    sc.fetchNews(ctx, job, result)

    // 5. PERSIST: Write everything to SQLite
    sc.persist(ctx, job, result)

    return result, nil
}

// fetchCandles tries Stooq then Yahoo for candle data
func (sc *SourceChain) fetchCandles(ctx context.Context, job Job, result *CrawlResult) {
    // Read existing candles from DB to accumulate
    existing := sc.loadExistingCandles(ctx, job.StockID)

    for _, adapter := range sc.adapters {
        if adapter.Type() != DataTypeCandles {
            continue
        }
        if !sc.breaker.Allow(adapter.Name()) {
            continue
        }
        if err := sc.rateLimit.Acquire(ctx, adapter.Name()); err != nil {
            continue
        }

        candles, err := adapter.FetchCandles(ctx, job.Symbol, job.Market)
        if err != nil {
            sc.breaker.RecordFailure(adapter.Name())
            result.Errors = append(result.Errors, adapter.Name()+": "+err.Error())
            continue
        }

        sc.breaker.RecordSuccess(adapter.Name())
        result.Sources = append(result.Sources, adapter.Name())

        // Merge: accumulate new candles, keep history
        merged := mergeCandles(existing, candles)
        result.Candles = merged
        break // first successful source wins
    }
}
```

---

## 6. WebSocket Implementation

### internal/ws/websocket.go

```go
package ws

import (
    "context"
    "database/sql"
    "encoding/json"
    "net/http"
    "sync"
    "time"

    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return true },
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
}

// Client represents a WebSocket connection
type Client struct {
    conn    *websocket.Conn
    symbols map[string]bool
    send    chan []byte
    lastPong time.Time
}

// Hub manages all WebSocket clients and broadcasts
type Hub struct {
    clients    map[*Client]bool
    register   chan *Client
    unregister chan *Client
    broadcast  chan []byte
    db         *sql.DB
    mu         sync.RWMutex
}

// NewHub creates a new WebSocket hub
func NewHub(db *sql.DB) *Hub

// Run starts the hub's event loop (run in a goroutine)
func (h *Hub) Run(ctx context.Context)

// HandleWS is the HTTP handler for /ws
func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request)

// BroadcastAlert sends a price alert to subscribed clients
func (h *Hub) BroadcastAlert(alert AlertMessage)

// ClientCount returns connected client count
func (h *Hub) ClientCount() int

// Message types (matching current protocol)
type (
    ConnectMessage struct {
        Type    string `json:"type"`
        Time    int64  `json:"time"`
        Message string `json:"message"`
    }
    SubscribeMessage struct {
        Type    string   `json:"type"`
        Symbols []string `json:"symbols"`
    }
    PricesMessage struct {
        Type string                 `json:"type"`
        Data map[string]PriceData   `json:"data"`
        Time int64                  `json:"time"`
    }
    PriceData struct {
        Price     float64 `json:"price"`
        Change    float64 `json:"change"`
        ChangePct float64 `json:"changePct"`
        Volume    *int64  `json:"volume"`
    }
    AlertMessage struct {
        Type      string  `json:"type"`
        Symbol    string  `json:"symbol"`
        Direction string  `json:"direction"`
        Price     float64 `json:"price"`
        Note      string  `json:"note"`
        Time      int64   `json:"time"`
    }
    PongMessage struct {
        Type string `json:"type"`
        Time int64  `json:"time"`
    }
)

// broadcastPrices runs on a 5-second ticker, reads from DB (not Yahoo)
func (h *Hub) broadcastPrices(ctx context.Context) {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            h.mu.RLock()
            allSymbols := make(map[string]bool)
            for client := range h.clients {
                for sym := range client.symbols {
                    allSymbols[sym] = true
                }
            }
            h.mu.RUnlock()

            if len(allSymbols) == 0 {
                continue
            }

            // Batch query prices from quotes table
            prices := h.fetchPrices(allSymbols)

            // Send to each client their subscribed symbols
            h.mu.RLock()
            for client := range h.clients {
                payload := make(map[string]PriceData)
                for sym := range client.symbols {
                    if data, ok := prices[sym]; ok {
                        payload[sym] = data
                    }
                }
                if len(payload) > 0 {
                    msg := PricesMessage{Type: "prices", Data: payload, Time: time.Now().UnixMilli()}
                    if bytes, err := json.Marshal(msg); err == nil {
                        select {
                        case client.send <- bytes:
                        default:
                            // client too slow, drop
                        }
                    }
                }
            }
            h.mu.RUnlock()
        }
    }
}

// readPump reads messages from client (subscribe/unsubscribe/ping)
func (c *Client) readPump(h *Hub)

// writePump writes messages to client, handles close
func (c *Client) writePump()

// pruneStale removes clients with no pong in 5 minutes
func (h *Hub) pruneStale(ctx context.Context)
```

---

## 7. API Route Mapping

All routes preserve the existing `/api/*` prefix so the frontend works unchanged.

| Method | Current Path | Go Handler | Notes |
|--------|-------------|------------|-------|
| GET | `/api/health` | `api.HealthHandler` | Returns service info |
| GET | `/api/status` | `api.StatusHandler` | Crawler status + features |
| **Market** | | | |
| GET | `/api/market/universe` | `api.GetUniverse` | From DB, not hardcoded |
| GET | `/api/market/search` | `api.SearchStocks` | Full-text search |
| POST | `/api/market/track` | `api.TrackStock` | Add to watchlist |
| DELETE | `/api/market/track/:symbol` | `api.UntrackStock` | Remove from watchlist |
| GET | `/api/market/indices` | `api.GetIndices` | Index quotes |
| GET | `/api/market/quotes` | `api.GetQuotes` | All stock quotes |
| GET | `/api/market/stocks/:symbol` | `api.GetStockDetail` | Full stock analysis |
| **Signals** | | | |
| GET | `/api/signals` | `api.GetSignals` | Watchlist signal scores |
| GET | `/api/signals/watchlist` | `api.GetWatchlist` | Current watchlist |
| POST | `/api/signals/watchlist` | `api.AddToWatchlist` | Add symbol |
| DELETE | `/api/signals/watchlist/:symbol` | `api.RemoveFromWatchlist` | Remove symbol |
| **Paper** | | | |
| GET | `/api/paper/portfolio` | `api.GetPortfolio` | Paper portfolio snapshot |
| POST | `/api/paper/order` | `api.PlacePaperOrder` | Paper trade |
| **Algo** | | | |
| GET | `/api/algo` | `api.GetAlgoConfig` | Algo settings |
| POST | `/api/algo` | `api.UpdateAlgoConfig` | Update settings |
| POST | `/api/algo/suggest` | `api.RunAlgoSuggest` | Generate suggestions |
| POST | `/api/algo/run` | `api.RunAlgoOnce` | Execute algo |
| POST | `/api/algo/dry-run` | `api.DryRunStrategies` | Dry run all strategies |
| POST | `/api/algo/execute` | `api.ExecuteTicket` | Execute suggestion |
| **Crawler** | | | |
| GET | `/api/crawler/status` | `api.CrawlerStatus` | Crawl state + logs |
| POST | `/api/crawler/run` | `api.TriggerCrawl` | Manual crawl trigger |
| POST | `/api/crawler/symbol/:symbol` | `api.CrawlSymbol` | Crawl one symbol |
| **Desk** | | | |
| GET | `/api/desk/session` | `api.MarketSessions` | Market session status |
| GET | `/api/desk/risk` | `api.PortfolioRisk` | Risk metrics |
| GET | `/api/desk/ideas` | `api.SnapshotIdeas` | Trade ideas |
| GET | `/api/desk/plan/:symbol` | `api.TradePlan` | Trade plan for symbol |
| GET | `/api/desk/alerts` | `api.GetAlerts` | Price alerts |
| POST | `/api/desk/alerts` | `api.AddAlert` | Create alert |
| DELETE | `/api/desk/alerts/:id` | `api.RemoveAlert` | Delete alert |
| POST | `/api/desk/journal` | `api.AddJournal` | Trade journal entry |
| GET | `/api/desk/watchlist` | `api.GetDeskWatchlist` | Desk watchlist |
| POST | `/api/desk/watchlist` | `api.AddToDeskWatchlist` | Add to desk watchlist |
| DELETE | `/api/desk/watchlist/:symbol` | `api.RemoveFromDeskWatchlist` | Remove |
| **Screener** | | | |
| POST | `/api/screener/run` | `api.RunScreener` | Run screener with filters |
| GET | `/api/screener/presets` | `api.GetScreenerPresets` | Preset filters |
| GET | `/api/screener/radar` | `api.GetRadar` | Market radar |
| **Advanced** | | | |
| GET | `/api/advanced/multi-timeframe/:symbol` | `api.MultiTimeframe` | MTF analysis |
| GET | `/api/advanced/options/:symbol` | `api.OptionsChain` | Options chain |
| POST | `/api/advanced/backtest/walk-forward` | `api.WalkForwardBacktest` | Walk-forward BT |
| POST | `/api/advanced/backtest/monte-carlo` | `api.MonteCarloSim` | Monte Carlo sim |
| GET | `/api/advanced/correlation` | `api.CorrelationMatrix` | Correlation |
| POST | `/api/advanced/notify` | `api.SendNotification` | Webhook notification |
| GET | `/api/advanced/portfolio-analytics` | `api.PortfolioAnalytics` | Analytics |
| **Intel** | | | |
| GET | `/api/intel/earnings/:symbol` | `api.AnalyzeEarnings` | Earnings analysis |
| GET | `/api/intel/insider/:symbol` | `api.FetchInsider` | Insider activity |
| GET | `/api/intel/sector-rotation` | `api.SectorRotation` | Sector rotation |
| GET | `/api/intel/gaps/:symbol` | `api.AnalyzeGaps` | Gap analysis |
| GET | `/api/intel/breadth` | `api.MarketBreadth` | Market breadth |
| GET | `/api/intel/macro` | `api.MacroDashboard` | Macro dashboard |
| GET | `/api/intel/pairs` | `api.PairTrades` | Pair trading |
| GET | `/api/intel/seasonality/:symbol` | `api.Seasonality` | Seasonality |
| GET | `/api/intel/ideas` | `api.TradeIdeas` | Trade ideas |
| GET | `/api/intel/risk` | `api.RiskDashboard` | Risk metrics |
| POST | `/api/intel/greeks` | `api.ComputeGreeks` | Options Greeks |
| **Suggestions** | | | |
| GET | `/api/suggestions` | `api.GetSuggestions` | Auto suggestions |

---

## 8. Key Go Interfaces and Types

### internal/models/stock.go

```go
package models

import "time"

type Market string

const (
    MarketIN Market = "IN"
    MarketUS Market = "US"
)

type Instrument struct {
    ID       int64
    Symbol   string
    Yahoo    string
    Name     string
    Sector   string
    Market   Market
    Exchange string
    Currency string
    IsActive bool
    Priority int
}

type Quote struct {
    Symbol        string
    Yahoo         string
    Price         float64
    Change        float64
    ChangePct     float64
    PreviousClose float64
    DayHigh       *float64
    DayLow        *float64
    Volume        *int64
    MarketCap     *float64
    Currency      string
}

type Candle struct {
    Time     int64   // Unix millis
    Open     float64
    High     float64
    Low      float64
    Close    float64
    Volume   int64
    Interval string // "1d", "1wk", "5m"
    Source   string
}

type Fundamentals struct {
    PE              *float64
    ForwardPE       *float64
    PB              *float64
    DividendYield   *float64
    MarketCap       *float64
    Beta            *float64
    EPS             *float64
    ROE             *float64
    DebtToEquity    *float64
    ProfitMargins   *float64
    RevenueGrowth   *float64
    EarningsGrowth  *float64
    TargetMean      *float64
    Recommendation  *string
    Week52High      *float64
    Week52Low       *float64
    Revenue         *float64
    NetIncome       *float64
    FreeCashflow    *float64
    OperatingMargins *float64
    GrossMargins    *float64
    BookValue       *float64
    PriceToSales    *float64
    PEGRatio        *float64
}

type NewsItem struct {
    Title     string
    Link      string
    Published string
    Source    string
    Sentiment float64
    Label     string // "positive", "negative", "neutral"
}

type CrawlStatus struct {
    Running    bool
    LastRun    *time.Time
    Snapshots  int
    LastError  *string
    Finnhub    bool
    Symbols    []string
    Recent     []CrawlLogEntry
}

type CrawlLogEntry struct {
    Time    time.Time
    Yahoo   string
    OK      bool
    Sources []string
}
```

---

## 9. Deployment Strategy

### Phase 1: Binary + SQLite (MVP)

```makefile
# Makefile
.PHONY: build run dev test lint

BINARY=stockmafia
VERSION=$(shell git describe --tags --always --dirty)

build:
	CGO_ENABLED=1 go build -ldflags "-s -w -X main.Version=$(VERSION)" \
		-o bin/$(BINARY) ./cmd/stockmafia

run: build
	./bin/$(BINARY)

dev:
	go run ./cmd/stockmafia -dev

test:
	go test ./... -count=1 -race

lint:
	golangci-lint run ./...

migrate:
	go run ./cmd/stockmafia -migrate

# SQLite needs CGO, Docker builds use musl
docker-build:
	docker build -t stockmafia:$(VERSION) -f deploy/Dockerfile .

docker-run:
	docker compose -f deploy/docker-compose.yml up -d
```

### deploy/Dockerfile

```dockerfile
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache gcc musl-dev sqlite-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o /stockmafia ./cmd/stockmafia

FROM alpine:3.19
RUN apk add --no-cache ca-certificates sqlite-libs
WORKDIR /app
COPY --from=builder /stockmafia .
COPY migrations/ ./migrations/
COPY data/seed/ ./data/seed/
EXPOSE 8787
VOLUME /app/data
ENTRYPOINT ["./stockmafia"]
```

### deploy/docker-compose.yml

```yaml
services:
  stockmafia:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
    restart: unless-stopped
    ports:
      - "8787:8787"
    env_file:
      - ../.env
    environment:
      - HOST=0.0.0.0
      - PORT=8787
      - DB_PATH=/app/data/stockmafia.db
    volumes:
      - stockmafia-data:/app/data

volumes:
  stockmafia-data:
```

### deploy/stockmafia.service

```ini
[Unit]
Description=StockMafia Trading Platform
After=network.target

[Service]
Type=simple
User=stockmafia
Group=stockmafia
WorkingDirectory=/opt/stockmafia
ExecStart=/opt/stockmafia/stockmafia
Environment=HOST=0.0.0.0
Environment=PORT=8787
Environment=DB_PATH=/var/lib/stockmafia/stockmafia.db
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

### Phase 2: PostgreSQL Migration (when needed)

When SQLite hits write contention at scale:
1. Add `pgx` driver alongside SQLite
2. Use build tags: `//go:build pg`
3. Config flag: `DB_DRIVER=sqlite|postgres`
4. Migrations are ANSI SQL, mostly compatible
5. SQLite-specific: `PRAGMA journal_mode=WAL` → PostgreSQL handles natively

---

## 10. Migration Steps

### Step 1: Scaffold + Database (Week 1)
```bash
# Initialize Go module
go mod init github.com/youruser/stockmafia

# Add dependencies
go get github.com/gorilla/websocket
go get modernc.org/sqlite          # Pure Go SQLite (no CGO needed)
go get github.com/pressly/goose/v3  # migrations
go get github.com/rs/cors           # CORS middleware
go get github.com/joho/godotenv     # env loading
go get github.com/mmcdole/gofeed    # RSS parsing (replaces fast-xml-parser)
```

- Create `internal/models/` with all types
- Create `internal/config/config.go`
- Create `internal/db/sqlite.go` + `migrations.go`
- Write and test migration SQL
- Seed initial stocks from `universe.ts` (10K+ via NSE/BSE/NASDAQ CSV imports)

### Step 2: Crawler Core (Week 2)
- Port `crawler-stooq.ts` → `internal/crawler/adapters/stooq.go`
- Port `crawler-nse.ts` → `internal/crawler/adapters/nse.go`
- Port `crawler-moneycontrol.ts` → `internal/crawler/adapters/moneycontrol.go`
- Port `crawler-finnhub.ts` → `internal/crawler/adapters/finnhub.go`
- Port Yahoo finance (chart, quote, fundamentals) → `adapters/yahoo.go`
- Implement `SourceAdapter` interface
- Implement `TokenBucket` rate limiter
- Implement worker pool with `Job` channel

### Step 3: Crawler Orchestration (Week 2-3)
- Implement `Orchestrator` with batch scheduling
- Implement candle accumulation (merge with existing DB candles)
- Implement `CircuitBreaker`
- Port cron scheduling (15-min interval)
- Port `crawlSymbol()` source chain logic
- Test with 100 symbols, verify rate limits

### Step 4: API Layer (Week 3)
- Port `middleware/auth.ts` → `internal/api/middleware.go`
- Port all 11 route files to Go handlers
- Use `database/sql` for all queries
- Verify JSON response format matches exactly (frontend compatibility)

### Step 5: WebSocket (Week 3)
- Port `websocket.ts` → `internal/ws/websocket.go`
- Same protocol: `subscribe`, `unsubscribe`, `ping`, `pong`, `prices`, `alert`
- Read prices from SQLite `quotes` table (not from Yahoo)

### Step 6: Universe Expansion (Week 4)
- Create CSV importers for NSE (5000+), BSE (5000+), NASDAQ (3000+), NYSE (2000+)
- `internal/universe/ingest.go`:
  - Download NSE equity list from `nseindia.com`
  - Download NASDAQ/NYSE lists from their APIs
  - Bulk INSERT into `stocks` table
  - Auto-refresh weekly via crawler cron

### Step 7: Frontend Compatibility (Week 4)
- Verify all API responses match current TypeScript types
- Frontend `api.ts` works unchanged (same URLs, same JSON shapes)
- WebSocket `useWebSocket.ts` works unchanged (same message protocol)

### Step 8: Testing + Hardening (Week 5)
- Unit tests for indicators, rate limiter, candle merge
- Integration tests for crawlers (with mock HTTP servers)
- Load test: crawl 10K symbols concurrently
- Stress test: WebSocket with 100 concurrent connections

### Step 9: Docker + Deploy (Week 5)
- Build Docker image (alpine + musl + sqlite)
- Deploy to LXC (same as current `create-lxc.sh`)
- systemd service file
- Health check endpoint

### Step 10: Decommission Node.js (Week 6)
- Run Go server alongside Node.js for 1 week
- Verify all endpoints return identical responses
- Switch nginx/proxy to Go port
- Remove Node.js server

---

## Scaling Math: 10K Stocks

| Source | Rate Limit | Batch Size | Time for 10K |
|--------|-----------|------------|---------------|
| Stooq (candles) | 1 req/s | 20 | ~8 min |
| Yahoo (quote + chart) | 2 req/s | 20 | ~4 min |
| NSE (quotes) | 0.5 req/s | 20 | ~4 min |
| Moneycontrol | 1 req/s | 20 | ~2 min |
| Finnhub | 60/min | 20 | ~3 min |
| News RSS | 0.5 req/s | 20 | ~4 min |

**Total full crawl**: ~15-20 minutes with 10 workers, 2s batch delay
**Incremental crawl** (only stale >15min): ~3-5 minutes

### Memory footprint at 10K scale
- SQLite DB: ~500MB (10K stocks × 2yr daily candles)
- Go process RSS: ~80MB (no in-memory caches needed)
- WebSocket connections: ~1MB per 100 clients

### Comparison to current Node.js
| Metric | Node.js | Go |
|--------|---------|-----|
| Memory | ~300MB + growing | ~80MB stable |
| Crawl 200 stocks | ~2 min | ~30 sec |
| Crawl 10K stocks | N/A (fails) | ~15 min |
| Concurrent connections | ~100 | ~10K+ |
| Startup time | ~5s | ~200ms |
| Binary size | N/A (needs node) | ~12MB |
