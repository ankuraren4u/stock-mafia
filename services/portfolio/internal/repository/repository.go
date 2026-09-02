package repository

import (
	"database/sql"
	"fmt"
)

type Repository struct {
	db           *sql.DB
	startingCash float64
}

func New(db *sql.DB, startingCash float64) *Repository {
	return &Repository{db: db, startingCash: startingCash}
}

func Migrate(db *sql.DB) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS fills (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			symbol TEXT NOT NULL, yahoo TEXT NOT NULL DEFAULT '',
			side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
			quantity INTEGER NOT NULL, price REAL NOT NULL,
			total REAL NOT NULL DEFAULT 0,
			mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper','live')),
			note TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE INDEX IF NOT EXISTS idx_fills_mode ON fills(mode)`,
		`CREATE TABLE IF NOT EXISTS positions (
			symbol TEXT PRIMARY KEY, yahoo TEXT NOT NULL DEFAULT '',
			quantity INTEGER NOT NULL DEFAULT 0,
			avg_price REAL NOT NULL DEFAULT 0,
			mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper','live'))
		)`,
		`CREATE TABLE IF NOT EXISTS journal (
			id TEXT PRIMARY KEY, yahoo TEXT NOT NULL,
			symbol TEXT NOT NULL, thesis TEXT NOT NULL DEFAULT '',
			side TEXT NOT NULL DEFAULT 'BUY',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE TABLE IF NOT EXISTS portfolio_config (
			key TEXT PRIMARY KEY, value TEXT NOT NULL
		)`,
		`INSERT OR IGNORE INTO portfolio_config (key, value) VALUES ('cash', '1000000')`,
		`INSERT OR IGNORE INTO portfolio_config (key, value) VALUES ('starting_cash', '1000000')`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return err
		}
	}
	return nil
}

type Position struct {
	Symbol     string
	Yahoo      string
	Quantity   int
	AvgPrice   float64
	Mode       string
}

type Fill struct {
	ID        int64
	Symbol    string
	Yahoo     string
	Side      string
	Quantity  int
	Price     float64
	Total     float64
	Mode      string
	Note      string
	CreatedAt string
}

func (r *Repository) GetCash(mode string) (float64, error) {
	var cash float64
	err := r.db.QueryRow(`SELECT value FROM portfolio_config WHERE key = 'cash'`).Scan(&cash)
	if err != nil {
		return r.startingCash, nil
	}
	return cash, nil
}

func (r *Repository) SetCash(cash float64) error {
	_, err := r.db.Exec(`UPDATE portfolio_config SET value = ? WHERE key = 'cash'`,
		func() string {
			return fmt.Sprintf("%.2f", cash)
		}())
	return err
}

func (r *Repository) GetPositions(mode string) ([]Position, error) {
	rows, err := r.db.Query(`SELECT symbol, yahoo, quantity, avg_price, mode FROM positions WHERE quantity > 0 AND mode = ?`, mode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var positions []Position
	for rows.Next() {
		var p Position
		if err := rows.Scan(&p.Symbol, &p.Yahoo, &p.Quantity, &p.AvgPrice, &p.Mode); err != nil {
			return nil, err
		}
		positions = append(positions, p)
	}
	return positions, rows.Err()
}

func (r *Repository) UpsertPosition(symbol, yahoo, side string, quantity int, price float64, mode string) error {
	var pos Position
	err := r.db.QueryRow(`SELECT symbol, quantity, avg_price FROM positions WHERE symbol = ? AND mode = ?`, symbol, mode).Scan(&pos.Symbol, &pos.Quantity, &pos.AvgPrice)
	if err == sql.ErrNoRows {
		qty := quantity
		if side == "SELL" {
			qty = -quantity
		}
		_, err = r.db.Exec(`INSERT INTO positions (symbol, yahoo, quantity, avg_price, mode) VALUES (?, ?, ?, ?, ?)`,
			symbol, yahoo, qty, price, mode)
		return err
	}
	if err != nil {
		return err
	}

	newQty := pos.Quantity
	if side == "BUY" {
		totalCost := pos.AvgPrice*float64(pos.Quantity) + price*float64(quantity)
		newQty += quantity
		if newQty > 0 {
			pos.AvgPrice = totalCost / float64(newQty)
		}
	} else {
		newQty -= quantity
	}

	_, err = r.db.Exec(`UPDATE positions SET quantity = ?, avg_price = ? WHERE symbol = ? AND mode = ?`,
		newQty, pos.AvgPrice, symbol, mode)
	return err
}

func (r *Repository) InsertFill(fill Fill) error {
	_, err := r.db.Exec(`
		INSERT INTO fills (symbol, yahoo, side, quantity, price, total, mode, note)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, fill.Symbol, fill.Yahoo, fill.Side, fill.Quantity, fill.Price, fill.Total, fill.Mode, fill.Note)
	return err
}

func (r *Repository) GetFills(mode string, limit int) ([]Fill, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.db.Query(`SELECT id, symbol, yahoo, side, quantity, price, total, mode, note, created_at
		FROM fills WHERE mode = ? ORDER BY id DESC LIMIT ?`, mode, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fills []Fill
	for rows.Next() {
		var f Fill
		if err := rows.Scan(&f.ID, &f.Symbol, &f.Yahoo, &f.Side, &f.Quantity, &f.Price, &f.Total, &f.Mode, &f.Note, &f.CreatedAt); err != nil {
			return nil, err
		}
		fills = append(fills, f)
	}
	return fills, rows.Err()
}

type JournalEntry struct {
	ID        string
	Yahoo     string
	Symbol    string
	Thesis    string
	Side      string
	CreatedAt string
}

func (r *Repository) InsertJournalEntry(entry JournalEntry) error {
	_, err := r.db.Exec(`INSERT INTO journal (id, yahoo, symbol, thesis, side) VALUES (?, ?, ?, ?, ?)`,
		entry.ID, entry.Yahoo, entry.Symbol, entry.Thesis, entry.Side)
	return err
}

func (r *Repository) GetJournalEntries(limit int) ([]JournalEntry, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.db.Query(`SELECT id, yahoo, symbol, thesis, side, created_at FROM journal ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []JournalEntry
	for rows.Next() {
		var e JournalEntry
		if err := rows.Scan(&e.ID, &e.Yahoo, &e.Symbol, &e.Thesis, &e.Side, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
