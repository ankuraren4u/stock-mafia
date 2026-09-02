package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type StocksRepository struct {
	db *sql.DB
}

func NewStocksRepository(db *sql.DB) *StocksRepository {
	return &StocksRepository{db: db}
}

type StockRow struct {
	ID        int64
	Symbol    string
	Name      string
	Exchange  string
	Sector    string
	Industry  string
	IsActive  bool
	Priority  int
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (r *StocksRepository) GetAllActive(ctx context.Context) ([]StockRow, error) {
	query := `SELECT id, symbol, name, exchange, sector, industry, is_active, COALESCE(priority, 0), created_at, updated_at 
		FROM stocks WHERE is_active = TRUE ORDER BY symbol`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query stocks: %w", err)
	}
	defer rows.Close()

	var stocks []StockRow
	for rows.Next() {
		var stock StockRow
		if err := rows.Scan(&stock.ID, &stock.Symbol, &stock.Name, &stock.Exchange,
			&stock.Sector, &stock.Industry, &stock.IsActive, &stock.Priority, &stock.CreatedAt, &stock.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan stock: %w", err)
		}
		stocks = append(stocks, stock)
	}

	return stocks, nil
}

func (r *StocksRepository) GetBySymbol(ctx context.Context, symbol string) (*StockRow, error) {
	query := `SELECT id, symbol, name, exchange, sector, industry, is_active, created_at, updated_at 
		FROM stocks WHERE symbol = ?`

	var stock StockRow
	err := r.db.QueryRowContext(ctx, query, symbol).Scan(
		&stock.ID, &stock.Symbol, &stock.Name, &stock.Exchange,
		&stock.Sector, &stock.Industry, &stock.IsActive, &stock.CreatedAt, &stock.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get stock: %w", err)
	}

	return &stock, nil
}

func (r *StocksRepository) GetByExchange(ctx context.Context, exchange string) ([]StockRow, error) {
	query := `SELECT id, symbol, name, exchange, sector, industry, is_active, created_at, updated_at 
		FROM stocks WHERE exchange = ? AND is_active = TRUE ORDER BY symbol`

	rows, err := r.db.QueryContext(ctx, query, exchange)
	if err != nil {
		return nil, fmt.Errorf("failed to query stocks by exchange: %w", err)
	}
	defer rows.Close()

	var stocks []StockRow
	for rows.Next() {
		var stock StockRow
		if err := rows.Scan(&stock.ID, &stock.Symbol, &stock.Name, &stock.Exchange,
			&stock.Sector, &stock.Industry, &stock.IsActive, &stock.CreatedAt, &stock.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan stock: %w", err)
		}
		stocks = append(stocks, stock)
	}

	return stocks, nil
}

func (r *StocksRepository) Upsert(ctx context.Context, stock *StockRow) error {
	query := `INSERT INTO stocks (symbol, name, exchange, sector, industry, is_active) 
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE 
			name = VALUES(name),
			sector = VALUES(sector),
			industry = VALUES(industry),
			is_active = VALUES(is_active),
			updated_at = CURRENT_TIMESTAMP`

	_, err := r.db.ExecContext(ctx, query,
		stock.Symbol, stock.Name, stock.Exchange,
		stock.Sector, stock.Industry, stock.IsActive)
	if err != nil {
		return fmt.Errorf("failed to upsert stock: %w", err)
	}

	return nil
}

func (r *StocksRepository) UpsertBatch(ctx context.Context, stocks []StockRow) error {
	if len(stocks) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	query := `INSERT INTO stocks (symbol, name, exchange, sector, industry, is_active) 
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE 
			name = VALUES(name),
			sector = VALUES(sector),
			industry = VALUES(industry),
			is_active = VALUES(is_active),
			updated_at = CURRENT_TIMESTAMP`

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, stock := range stocks {
		_, err := stmt.ExecContext(ctx,
			stock.Symbol, stock.Name, stock.Exchange,
			stock.Sector, stock.Industry, stock.IsActive)
		if err != nil {
			return fmt.Errorf("failed to upsert stock %s: %w", stock.Symbol, err)
		}
	}

	return tx.Commit()
}

func (r *StocksRepository) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM stocks").Scan(&count)
	return count, err
}
