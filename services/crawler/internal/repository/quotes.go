package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type QuotesRepository struct {
	db *sql.DB
}

func NewQuotesRepository(db *sql.DB) *QuotesRepository {
	return &QuotesRepository{db: db}
}

type Quote struct {
	ID        int64
	Symbol    string
	Last      float64
	Bid       float64
	Ask       float64
	Volume    int64
	Timestamp time.Time
	Source    string
	CreatedAt time.Time
}

func (r *QuotesRepository) SaveQuote(ctx context.Context, quote *Quote) error {
	query := `INSERT INTO quotes (symbol, last_price, bid, ask, volume, timestamp, source) 
		VALUES (?, ?, ?, ?, ?, ?, ?)`

	_, err := r.db.ExecContext(ctx, query,
		quote.Symbol, quote.Last, quote.Bid, quote.Ask,
		quote.Volume, quote.Timestamp.Unix(), quote.Source)
	if err != nil {
		return fmt.Errorf("failed to save quote: %w", err)
	}

	return nil
}

func (r *QuotesRepository) GetLatest(ctx context.Context, symbol string) (*Quote, error) {
	query := `SELECT id, symbol, last_price, bid, ask, volume, timestamp, source, created_at 
		FROM quotes WHERE symbol = ? 
		ORDER BY timestamp DESC LIMIT 1`

	var quote Quote
	err := r.db.QueryRowContext(ctx, query, symbol).Scan(
		&quote.ID, &quote.Symbol, &quote.Last, &quote.Bid, &quote.Ask,
		&quote.Volume, &quote.Timestamp, &quote.Source, &quote.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get quote: %w", err)
	}

	return &quote, nil
}

func (r *QuotesRepository) GetLatestBySource(ctx context.Context, symbol, source string) (*Quote, error) {
	query := `SELECT id, symbol, last_price, bid, ask, volume, timestamp, source, created_at 
		FROM quotes WHERE symbol = ? AND source = ?
		ORDER BY timestamp DESC LIMIT 1`

	var quote Quote
	err := r.db.QueryRowContext(ctx, query, symbol, source).Scan(
		&quote.ID, &quote.Symbol, &quote.Last, &quote.Bid, &quote.Ask,
		&quote.Volume, &quote.Timestamp, &quote.Source, &quote.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get quote: %w", err)
	}

	return &quote, nil
}

func (r *QuotesRepository) GetMultipleLatest(ctx context.Context, symbols []string) (map[string]*Quote, error) {
	if len(symbols) == 0 {
		return make(map[string]*Quote), nil
	}

	query := `SELECT id, symbol, last_price, bid, ask, volume, timestamp, source, created_at 
		FROM quotes WHERE symbol IN (` + placeholders(len(symbols)) + `) 
		AND id IN (
			SELECT id FROM (
				SELECT id, symbol, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn
				FROM quotes WHERE symbol IN (` + placeholders(len(symbols)) + `)
			) t WHERE rn = 1
		)`

	args := make([]interface{}, 0, len(symbols)*2)
	for _, s := range symbols {
		args = append(args, s)
	}
	for _, s := range symbols {
		args = append(args, s)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query quotes: %w", err)
	}
	defer rows.Close()

	result := make(map[string]*Quote)
	for rows.Next() {
		var quote Quote
		if err := rows.Scan(&quote.ID, &quote.Symbol, &quote.Last, &quote.Bid, &quote.Ask,
			&quote.Volume, &quote.Timestamp, &quote.Source, &quote.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan quote: %w", err)
		}
		result[quote.Symbol] = &quote
	}

	return result, nil
}

func (r *QuotesRepository) GetHistory(ctx context.Context, symbol string, limit int) ([]Quote, error) {
	query := `SELECT id, symbol, last_price, bid, ask, volume, timestamp, source, created_at 
		FROM quotes WHERE symbol = ? 
		ORDER BY timestamp DESC LIMIT ?`

	rows, err := r.db.QueryContext(ctx, query, symbol, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query quotes: %w", err)
	}
	defer rows.Close()

	var quotes []Quote
	for rows.Next() {
		var quote Quote
		if err := rows.Scan(&quote.ID, &quote.Symbol, &quote.Last, &quote.Bid, &quote.Ask,
			&quote.Volume, &quote.Timestamp, &quote.Source, &quote.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan quote: %w", err)
		}
		quotes = append(quotes, quote)
	}

	return quotes, nil
}

func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	result := "?"
	for i := 1; i < n; i++ {
		result += ", ?"
	}
	return result
}
