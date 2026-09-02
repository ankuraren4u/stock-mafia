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

func (r *Repository) DB() *sql.DB {
	return r.db
}

func Migrate(db *sql.DB) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS stocks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol TEXT NOT NULL,
			yahoo TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL DEFAULT '',
			market TEXT NOT NULL CHECK (market IN ('IN','US')),
			exchange TEXT NOT NULL DEFAULT '',
			currency TEXT NOT NULL DEFAULT 'USD',
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_yahoo ON stocks(yahoo)`,
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
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return err
		}
	}
	return nil
}

type QuoteData struct {
	Yahoo    string  `json:"yahoo"`
	Symbol   string  `json:"symbol"`
	Price    float64 `json:"price"`
	Change   float64 `json:"change"`
	ChangePct float64 `json:"changePct"`
	Volume   *int64  `json:"volume"`
}

func (r *Repository) GetAllQuotes() ([]QuoteData, error) {
	rows, err := r.db.Query(`
		SELECT s.yahoo, s.symbol, q.price, q.change, q.change_pct, q.volume
		FROM quotes q JOIN stocks s ON q.stock_id = s.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var quotes []QuoteData
	for rows.Next() {
		var q QuoteData
		var volume sql.NullInt64
		if err := rows.Scan(&q.Yahoo, &q.Symbol, &q.Price, &q.Change, &q.ChangePct, &volume); err != nil {
			return nil, err
		}
		if volume.Valid {
			q.Volume = &volume.Int64
		}
		quotes = append(quotes, q)
	}
	return quotes, rows.Err()
}

func (r *Repository) GetQuote(yahoo string) (*QuoteData, error) {
	var q QuoteData
	var volume sql.NullInt64
	err := r.db.QueryRow(`
		SELECT s.yahoo, s.symbol, q.price, q.change, q.change_pct, q.volume
		FROM quotes q JOIN stocks s ON q.stock_id = s.id
		WHERE s.yahoo = ?
	`, yahoo).Scan(&q.Yahoo, &q.Symbol, &q.Price, &q.Change, &q.ChangePct, &volume)
	if err != nil {
		return nil, err
	}
	if volume.Valid {
		q.Volume = &volume.Int64
	}
	return &q, nil
}
