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
			symbol TEXT NOT NULL, yahoo TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL DEFAULT '', market TEXT NOT NULL CHECK (market IN ('IN','US')),
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_yahoo ON stocks(yahoo)`,
		`CREATE TABLE IF NOT EXISTS signal_scores (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
			yahoo TEXT NOT NULL, score REAL NOT NULL DEFAULT 0,
			label TEXT NOT NULL DEFAULT 'neutral',
			indicators TEXT NOT NULL DEFAULT '{}',
			thesis TEXT NOT NULL DEFAULT '',
			computed_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_scores_stock ON signal_scores(stock_id)`,
		`CREATE TABLE IF NOT EXISTS algo_rules (
			id TEXT PRIMARY KEY, name TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			min_score REAL NOT NULL DEFAULT 72,
			action TEXT NOT NULL DEFAULT 'BUY',
			quantity INTEGER NOT NULL DEFAULT 1,
			product TEXT NOT NULL DEFAULT 'CNC'
		)`,
		`CREATE TABLE IF NOT EXISTS algo_suggestions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			strategy_id TEXT NOT NULL, strategy_name TEXT NOT NULL,
			stock_id INTEGER REFERENCES stocks(id),
			yahoo TEXT NOT NULL, symbol TEXT NOT NULL, market TEXT NOT NULL,
			side TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
			entry REAL, stop REAL, target REAL, risk_reward REAL,
			conviction REAL, thesis TEXT NOT NULL DEFAULT '[]',
			product TEXT NOT NULL DEFAULT 'CNC',
			status TEXT NOT NULL DEFAULT 'open',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE TABLE IF NOT EXISTS screener_presets (
			id TEXT PRIMARY KEY, name TEXT NOT NULL,
			filters TEXT NOT NULL DEFAULT '{}',
			sort_by TEXT NOT NULL DEFAULT 'score',
			sort_desc INTEGER NOT NULL DEFAULT 1,
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

type SignalScore struct {
	StockID    int64
	Yahoo      string
	Score      float64
	Label      string
	Indicators string
	Thesis     string
	ComputedAt string
}

func (r *Repository) GetSignals(yahoos []string) ([]SignalScore, error) {
	query := `SELECT ss.stock_id, ss.yahoo, ss.score, ss.label, ss.indicators, ss.thesis, ss.computed_at
		FROM signal_scores ss JOIN stocks s ON ss.stock_id = s.id`
	var args []interface{}
	if len(yahoos) > 0 {
		placeholders := ""
		for i, y := range yahoos {
			if i > 0 {
				placeholders += ","
			}
			placeholders += "?"
			args = append(args, y)
		}
		query += " WHERE s.yahoo IN (" + placeholders + ")"
	}
	query += " ORDER BY ss.score DESC"

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scores []SignalScore
	for rows.Next() {
		var s SignalScore
		if err := rows.Scan(&s.StockID, &s.Yahoo, &s.Score, &s.Label, &s.Indicators, &s.Thesis, &s.ComputedAt); err != nil {
			return nil, err
		}
		scores = append(scores, s)
	}
	return scores, rows.Err()
}

type AlgoRule struct {
	ID       string
	Name     string
	Enabled  bool
	MinScore float64
	Action   string
	Quantity int
	Product  string
}

func (r *Repository) GetAlgoRules() ([]AlgoRule, error) {
	rows, err := r.db.Query(`SELECT id, name, enabled, min_score, action, quantity, product FROM algo_rules`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []AlgoRule
	for rows.Next() {
		var rule AlgoRule
		if err := rows.Scan(&rule.ID, &rule.Name, &rule.Enabled, &rule.MinScore, &rule.Action, &rule.Quantity, &rule.Product); err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, rows.Err()
}
