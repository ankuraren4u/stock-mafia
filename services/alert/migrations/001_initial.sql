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

CREATE INDEX IF NOT EXISTS idx_alerts_yahoo ON alerts(yahoo);

CREATE TABLE IF NOT EXISTS watchlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id    INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    yahoo       TEXT    NOT NULL,
    added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(stock_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_yahoo ON watchlist(yahoo);

CREATE TABLE IF NOT EXISTS notification_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id    TEXT    NOT NULL,
    channel     TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'sent',
    response    TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
