CREATE TABLE IF NOT EXISTS stocks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    yahoo       TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL DEFAULT '',
    market      TEXT    NOT NULL CHECK (market IN ('IN','US')),
    exchange    TEXT    NOT NULL DEFAULT '',
    currency    TEXT    NOT NULL DEFAULT 'USD',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_yahoo ON stocks(yahoo);

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
