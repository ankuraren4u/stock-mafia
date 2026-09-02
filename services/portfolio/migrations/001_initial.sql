CREATE TABLE IF NOT EXISTS fills (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    yahoo       TEXT    NOT NULL DEFAULT '',
    side        TEXT    NOT NULL CHECK (side IN ('BUY','SELL')),
    quantity    INTEGER NOT NULL,
    price       REAL    NOT NULL,
    total       REAL    NOT NULL DEFAULT 0,
    mode        TEXT    NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper','live')),
    note        TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fills_mode ON fills(mode);
CREATE INDEX IF NOT EXISTS idx_fills_symbol ON fills(symbol);

CREATE TABLE IF NOT EXISTS positions (
    symbol      TEXT    PRIMARY KEY,
    yahoo       TEXT    NOT NULL DEFAULT '',
    quantity    INTEGER NOT NULL DEFAULT 0,
    avg_price   REAL    NOT NULL DEFAULT 0,
    mode        TEXT    NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper','live'))
);

CREATE TABLE IF NOT EXISTS journal (
    id          TEXT    PRIMARY KEY,
    yahoo       TEXT    NOT NULL,
    symbol      TEXT    NOT NULL,
    thesis      TEXT    NOT NULL DEFAULT '',
    side        TEXT    NOT NULL DEFAULT 'BUY',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO portfolio_config (key, value) VALUES
    ('cash', '1000000'),
    ('starting_cash', '1000000');
