package repository

import (
	"database/sql"
)

type Repository struct {
	db *sql.DB
}

func New(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func Migrate(db *sql.DB) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS stocks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol TEXT NOT NULL,
			yahoo TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL DEFAULT '',
			sector TEXT NOT NULL DEFAULT '',
			market TEXT NOT NULL CHECK (market IN ('IN','US')),
			exchange TEXT NOT NULL DEFAULT '',
			currency TEXT NOT NULL DEFAULT 'USD',
			is_active INTEGER NOT NULL DEFAULT 1,
			priority INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_yahoo ON stocks(yahoo)`,
		`CREATE INDEX IF NOT EXISTS idx_stocks_market ON stocks(market)`,
		`CREATE INDEX IF NOT EXISTS idx_stocks_active ON stocks(is_active)`,
		`CREATE TABLE IF NOT EXISTS candles (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
			time INTEGER NOT NULL,
			open REAL, high REAL, low REAL, close REAL,
			volume INTEGER,
			interval TEXT NOT NULL DEFAULT '1d',
			source TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_stock_time_interval ON candles(stock_id, time, interval)`,
		`CREATE TABLE IF NOT EXISTS quotes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
			price REAL, change REAL, change_pct REAL,
			previous_close REAL, day_high REAL, day_low REAL,
			volume INTEGER, market_cap REAL,
			currency TEXT NOT NULL DEFAULT 'USD',
			source TEXT NOT NULL DEFAULT '',
			crawled_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_stock_id ON quotes(stock_id)`,
		`CREATE TABLE IF NOT EXISTS fundamentals (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
			pe REAL, forward_pe REAL, pb REAL, dividend_yield REAL,
			market_cap REAL, beta REAL, eps REAL, roe REAL,
			debt_to_equity REAL, profit_margins REAL, revenue_growth REAL,
			earnings_growth REAL, target_mean REAL, recommendation TEXT,
			week52_high REAL, week52_low REAL, revenue REAL, net_income REAL,
			free_cashflow REAL, operating_margins REAL, gross_margins REAL,
			source TEXT NOT NULL DEFAULT '',
			crawled_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_fundamentals_stock_id ON fundamentals(stock_id)`,
		`CREATE TABLE IF NOT EXISTS news (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
			title TEXT NOT NULL, link TEXT NOT NULL DEFAULT '',
			published TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
			sentiment REAL NOT NULL DEFAULT 0,
			label TEXT NOT NULL DEFAULT 'neutral',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_news_title_link ON news(title, link)`,
		`CREATE TABLE IF NOT EXISTS crawl_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			stock_id INTEGER REFERENCES stocks(id),
			yahoo TEXT NOT NULL, symbol TEXT NOT NULL DEFAULT '',
			market TEXT NOT NULL DEFAULT '',
			sources TEXT NOT NULL DEFAULT '[]',
			has_quote INTEGER NOT NULL DEFAULT 0,
			errors TEXT NOT NULL DEFAULT '[]',
			duration_ms INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE TABLE IF NOT EXISTS crawl_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			status TEXT NOT NULL DEFAULT 'running',
			reason TEXT NOT NULL DEFAULT '',
			total INTEGER NOT NULL DEFAULT 0,
			succeeded INTEGER NOT NULL DEFAULT 0,
			failed INTEGER NOT NULL DEFAULT 0,
			started_at TEXT NOT NULL DEFAULT (datetime('now')),
			finished_at TEXT
		)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return err
		}
	}
	return nil
}

type Stock struct {
	ID       int64
	Symbol   string
	Yahoo    string
	Name     string
	Sector   string
	Market   string
	Exchange string
	Currency string
	IsActive bool
	Priority int
}

func (r *Repository) GetActiveStocks() ([]Stock, error) {
	rows, err := r.db.Query(`SELECT id, symbol, yahoo, name, sector, market, exchange, currency, is_active, priority FROM stocks WHERE is_active = 1 ORDER BY priority DESC, symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stocks []Stock
	for rows.Next() {
		var s Stock
		if err := rows.Scan(&s.ID, &s.Symbol, &s.Yahoo, &s.Name, &s.Sector, &s.Market, &s.Exchange, &s.Currency, &s.IsActive, &s.Priority); err != nil {
			return nil, err
		}
		stocks = append(stocks, s)
	}
	return stocks, rows.Err()
}

func (r *Repository) UpsertStock(s Stock) error {
	_, err := r.db.Exec(`
		INSERT INTO stocks (symbol, yahoo, name, sector, market, exchange, currency, is_active, priority)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(yahoo) DO UPDATE SET
			symbol=excluded.symbol, name=excluded.name, sector=excluded.sector,
			market=excluded.market, exchange=excluded.exchange, currency=excluded.currency,
			is_active=excluded.is_active, priority=excluded.priority, updated_at=datetime('now')
	`, s.Symbol, s.Yahoo, s.Name, s.Sector, s.Market, s.Exchange, s.Currency, s.IsActive, s.Priority)
	return err
}

func (r *Repository) UpsertCandle(stockID int64, timeMs int64, open, high, low, close float64, volume int64, interval, source string) error {
	_, err := r.db.Exec(`
		INSERT INTO candles (stock_id, time, open, high, low, close, volume, interval, source)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(stock_id, time, interval) DO UPDATE SET
			open=excluded.open, high=excluded.high, low=excluded.low,
			close=excluded.close, volume=excluded.volume, source=excluded.source
	`, stockID, timeMs, open, high, low, close, volume, interval, source)
	return err
}

func (r *Repository) UpsertQuote(stockID int64, price, change, changePct, prevClose, dayHigh, dayLow, marketCap float64, volume int64, currency, source string) error {
	_, err := r.db.Exec(`
		INSERT INTO quotes (stock_id, price, change, change_pct, previous_close, day_high, day_low, volume, market_cap, currency, source)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(stock_id) DO UPDATE SET
			price=excluded.price, change=excluded.change, change_pct=excluded.change_pct,
			previous_close=excluded.previous_close, day_high=excluded.day_high, day_low=excluded.day_low,
			volume=excluded.volume, market_cap=excluded.market_cap, currency=excluded.currency,
			source=excluded.source, crawled_at=datetime('now')
	`, stockID, price, change, changePct, prevClose, dayHigh, dayLow, volume, marketCap, currency, source)
	return err
}

func (r *Repository) UpsertFundamentals(stockID int64, pe, pb, divYield, mcap, beta, eps float64, source string) error {
	_, err := r.db.Exec(`
		INSERT INTO fundamentals (stock_id, pe, pb, dividend_yield, market_cap, beta, eps, source)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(stock_id) DO UPDATE SET
			pe=excluded.pe, pb=excluded.pb, dividend_yield=excluded.dividend_yield,
			market_cap=excluded.market_cap, beta=excluded.beta, eps=excluded.eps,
			source=excluded.source, crawled_at=datetime('now')
	`, stockID, pe, pb, divYield, mcap, beta, eps, source)
	return err
}

func (r *Repository) InsertNews(stockID int64, title, link, published, source string, sentiment float64, label string) error {
	_, err := r.db.Exec(`
		INSERT OR IGNORE INTO news (stock_id, title, link, published, source, sentiment, label)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, stockID, title, link, published, source, sentiment, label)
	return err
}

func (r *Repository) InsertCrawlLog(stockID int64, yahoo, symbol, market, sources, errors string, hasQuote bool, durationMs int64) error {
	hasQuoteInt := 0
	if hasQuote {
		hasQuoteInt = 1
	}
	_, err := r.db.Exec(`
		INSERT INTO crawl_logs (stock_id, yahoo, symbol, market, sources, has_quote, errors, duration_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, stockID, yahoo, symbol, market, sources, hasQuoteInt, errors, durationMs)
	return err
}

func (r *Repository) StartCrawlRun(reason string) (int64, error) {
	res, err := r.db.Exec(`INSERT INTO crawl_runs (reason, status) VALUES (?, 'running')`, reason)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repository) FinishCrawlRun(id int64, total, succeeded, failed int) error {
	_, err := r.db.Exec(`
		UPDATE crawl_runs SET status='completed', total=?, succeeded=?, failed=?, finished_at=datetime('now')
		WHERE id=?
	`, total, succeeded, failed, id)
	return err
}

func (r *Repository) GetCrawlStatus() (running bool, lastRun string, total, succeeded, failed int) {
	row := r.db.QueryRow(`SELECT status, total, succeeded, failed, started_at FROM crawl_runs ORDER BY id DESC LIMIT 1`)
	var status string
	err := row.Scan(&status, &total, &succeeded, &failed, &lastRun)
	if err != nil {
		return false, "", 0, 0, 0
	}
	return status == "running", lastRun, total, succeeded, failed
}

func (r *Repository) GetRecentLogs(limit int) ([]map[string]interface{}, error) {
	rows, err := r.db.Query(`SELECT yahoo, sources, has_quote, created_at FROM crawl_logs ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var yahoo, sources, createdAt string
		var hasQuote int
		if err := rows.Scan(&yahoo, &sources, &hasQuote, &createdAt); err != nil {
			return nil, err
		}
		logs = append(logs, map[string]interface{}{
			"yahoo": yahoo,
			"sources": sources,
			"has_quote": hasQuote == 1,
			"time": createdAt,
		})
	}
	return logs, rows.Err()
}
