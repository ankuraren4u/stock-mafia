CREATE TABLE IF NOT EXISTS stocks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    yahoo       TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL DEFAULT '',
    sector      TEXT    NOT NULL DEFAULT '',
    market      TEXT    NOT NULL CHECK (market IN ('IN','US')),
    exchange    TEXT    NOT NULL DEFAULT '',
    currency    TEXT    NOT NULL DEFAULT 'USD',
    is_active   INTEGER NOT NULL DEFAULT 1,
    priority    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_yahoo ON stocks(yahoo);
CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol);
CREATE INDEX IF NOT EXISTS idx_stocks_market ON stocks(market);
CREATE INDEX IF NOT EXISTS idx_stocks_active ON stocks(is_active);

CREATE TABLE IF NOT EXISTS candles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    time        INTEGER NOT NULL,
    open        REAL,
    high        REAL,
    low         REAL,
    close       REAL,
    volume      INTEGER,
    interval    TEXT    NOT NULL DEFAULT '1d',
    source      TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_stock_time_interval ON candles(stock_id, time, interval);
CREATE INDEX IF NOT EXISTS idx_candles_stock_id ON candles(stock_id);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_stock_id ON quotes(stock_id);

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
    source          TEXT    NOT NULL DEFAULT '',
    crawled_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fundamentals_stock_id ON fundamentals(stock_id);

CREATE TABLE IF NOT EXISTS news (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    link        TEXT    NOT NULL DEFAULT '',
    published   TEXT    NOT NULL DEFAULT '',
    source      TEXT    NOT NULL DEFAULT '',
    sentiment   REAL    NOT NULL DEFAULT 0,
    label       TEXT    NOT NULL DEFAULT 'neutral',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_stock_id ON news(stock_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_title_link ON news(title, link);

CREATE TABLE IF NOT EXISTS crawl_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER REFERENCES stocks(id),
    yahoo       TEXT    NOT NULL,
    symbol      TEXT    NOT NULL DEFAULT '',
    market      TEXT    NOT NULL DEFAULT '',
    sources     TEXT    NOT NULL DEFAULT '[]',
    has_quote   INTEGER NOT NULL DEFAULT 0,
    errors      TEXT    NOT NULL DEFAULT '[]',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crawl_logs_stock_id ON crawl_logs(stock_id);

CREATE TABLE IF NOT EXISTS crawl_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    status      TEXT    NOT NULL DEFAULT 'running',
    reason      TEXT    NOT NULL DEFAULT '',
    total       INTEGER NOT NULL DEFAULT 0,
    succeeded   INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
);
