CREATE TABLE IF NOT EXISTS stocks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    yahoo       TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL DEFAULT '',
    market      TEXT    NOT NULL CHECK (market IN ('IN','US')),
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_yahoo ON stocks(yahoo);

CREATE TABLE IF NOT EXISTS signal_scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    yahoo       TEXT    NOT NULL,
    score       REAL    NOT NULL DEFAULT 0,
    label       TEXT    NOT NULL DEFAULT 'neutral',
    indicators  TEXT    NOT NULL DEFAULT '{}',
    thesis      TEXT    NOT NULL DEFAULT '',
    computed_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_scores_yahoo ON signal_scores(yahoo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_scores_stock ON signal_scores(stock_id);

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
    thesis      TEXT    NOT NULL DEFAULT '[]',
    product     TEXT    NOT NULL DEFAULT 'CNC',
    status      TEXT    NOT NULL DEFAULT 'open',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS screener_presets (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    filters     TEXT    NOT NULL DEFAULT '{}',
    sort_by     TEXT    NOT NULL DEFAULT 'score',
    sort_desc   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
