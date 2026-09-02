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
		`CREATE TABLE IF NOT EXISTS alerts (
			id TEXT PRIMARY KEY,
			stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
			yahoo TEXT NOT NULL,
			direction TEXT NOT NULL CHECK (direction IN ('above','below')),
			price REAL NOT NULL,
			note TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			triggered_at TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS idx_alerts_yahoo ON alerts(yahoo)`,
		`CREATE TABLE IF NOT EXISTS watchlist (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
			yahoo TEXT NOT NULL,
			added_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(stock_id)
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_yahoo ON watchlist(yahoo)`,
		`CREATE TABLE IF NOT EXISTS notification_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			alert_id TEXT NOT NULL, channel TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'sent',
			response TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return err
		}
	}
	return nil
}

type Alert struct {
	ID          string
	StockID     *int64
	Yahoo       string
	Direction   string
	Price       float64
	Note        string
	CreatedAt   string
	TriggeredAt *string
}

func (r *Repository) GetAlerts() ([]Alert, error) {
	rows, err := r.db.Query(`SELECT id, stock_id, yahoo, direction, price, note, created_at, triggered_at FROM alerts`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []Alert
	for rows.Next() {
		var a Alert
		if err := rows.Scan(&a.ID, &a.StockID, &a.Yahoo, &a.Direction, &a.Price, &a.Note, &a.CreatedAt, &a.TriggeredAt); err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	return alerts, rows.Err()
}

func (r *Repository) AddAlert(id, yahoo, direction string, price float64, note string) error {
	_, err := r.db.Exec(`INSERT INTO alerts (id, yahoo, direction, price, note) VALUES (?, ?, ?, ?, ?)`,
		id, yahoo, direction, price, note)
	return err
}

func (r *Repository) RemoveAlert(id string) error {
	_, err := r.db.Exec(`DELETE FROM alerts WHERE id = ?`, id)
	return err
}

func (r *Repository) GetPendingAlerts() ([]Alert, error) {
	rows, err := r.db.Query(`SELECT id, yahoo, direction, price, note FROM alerts WHERE triggered_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []Alert
	for rows.Next() {
		var a Alert
		if err := rows.Scan(&a.ID, &a.Yahoo, &a.Direction, &a.Price, &a.Note); err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	return alerts, rows.Err()
}

func (r *Repository) MarkAlertTriggered(id string) error {
	_, err := r.db.Exec(`UPDATE alerts SET triggered_at = datetime('now') WHERE id = ?`, id)
	return err
}

type WatchlistEntry struct {
	ID      int64
	StockID int64
	Yahoo   string
	AddedAt string
}

func (r *Repository) GetWatchlist() ([]WatchlistEntry, error) {
	rows, err := r.db.Query(`SELECT id, stock_id, yahoo, added_at FROM watchlist ORDER BY added_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []WatchlistEntry
	for rows.Next() {
		var e WatchlistEntry
		if err := rows.Scan(&e.ID, &e.StockID, &e.Yahoo, &e.AddedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func (r *Repository) AddToWatchlist(stockID int64, yahoo string) error {
	_, err := r.db.Exec(`INSERT OR IGNORE INTO watchlist (stock_id, yahoo) VALUES (?, ?)`, stockID, yahoo)
	return err
}

func (r *Repository) RemoveFromWatchlist(yahoo string) error {
	_, err := r.db.Exec(`DELETE FROM watchlist WHERE yahoo = ?`, yahoo)
	return err
}
