package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type CandlesRepository struct {
	db *sql.DB
}

func NewCandlesRepository(db *sql.DB) *CandlesRepository {
	return &CandlesRepository{db: db}
}

type Candle struct {
	ID        int64
	Symbol    string
	Interval  string
	Open      float64
	High      float64
	Low       float64
	Close     float64
	Volume    int64
	Timestamp time.Time
	CreatedAt time.Time
}

func (r *CandlesRepository) SaveCandle(ctx context.Context, candle *Candle) error {
	query := `INSERT INTO candles (symbol, interval, open, high, low, close, volume, timestamp) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE 
			open = LEAST(VALUES(open), candles.open),
			high = GREATEST(VALUES(high), candles.high),
			low = LEAST(VALUES(low), candles.low),
			close = VALUES(close),
			volume = GREATEST(VALUES(volume), candles.volume)`

	_, err := r.db.ExecContext(ctx, query,
		candle.Symbol, candle.Interval, candle.Open, candle.High,
		candle.Low, candle.Close, candle.Volume, candle.Timestamp.Unix())
	if err != nil {
		return fmt.Errorf("failed to save candle: %w", err)
	}

	return nil
}

func (r *CandlesRepository) MergeCandles(ctx context.Context, symbol, interval string, newCandles []Candle) (int, error) {
	if len(newCandles) == 0 {
		return 0, nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	lookupQuery := `SELECT id, open, high, low, close, volume FROM candles 
		WHERE symbol = ? AND interval = ? AND timestamp = ?`

	insertQuery := `INSERT INTO candles (symbol, interval, open, high, low, close, volume, timestamp) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

	updateQuery := `UPDATE candles SET 
		open = LEAST(?, open),
		high = GREATEST(?, high),
		low = LEAST(?, low),
		close = ?,
		volume = GREATEST(?, volume)
		WHERE id = ?`

	lookupStmt, err := tx.PrepareContext(ctx, lookupQuery)
	if err != nil {
		return 0, fmt.Errorf("failed to prepare lookup: %w", err)
	}
	defer lookupStmt.Close()

	insertStmt, err := tx.PrepareContext(ctx, insertQuery)
	if err != nil {
		return 0, fmt.Errorf("failed to prepare insert: %w", err)
	}
	defer insertStmt.Close()

	updateStmt, err := tx.PrepareContext(ctx, updateQuery)
	if err != nil {
		return 0, fmt.Errorf("failed to prepare update: %w", err)
	}
	defer updateStmt.Close()

	merged := 0
	for _, c := range newCandles {
		var existingID int64
		var existingOpen, existingHigh, existingLow, existingClose float64
		var existingVolume int64

		err := lookupStmt.QueryRowContext(ctx, symbol, interval, c.Timestamp.Unix()).Scan(
			&existingID, &existingOpen, &existingHigh, &existingLow, &existingClose, &existingVolume)

		if err == sql.ErrNoRows {
			_, err = insertStmt.ExecContext(ctx, symbol, interval,
				c.Open, c.High, c.Low, c.Close, c.Volume, c.Timestamp.Unix())
			if err != nil {
				return 0, fmt.Errorf("failed to insert candle: %w", err)
			}
			merged++
		} else if err != nil {
			return 0, fmt.Errorf("failed to lookup candle: %w", err)
		} else {
			_, err = updateStmt.ExecContext(ctx,
				c.Open, c.High, c.Low, c.Close, c.Volume, existingID)
			if err != nil {
				return 0, fmt.Errorf("failed to update candle: %w", err)
			}
			merged++
		}
	}

	return merged, tx.Commit()
}

func (r *CandlesRepository) SaveBatch(ctx context.Context, candles []Candle) error {
	if len(candles) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	query := `INSERT INTO candles (symbol, interval, open, high, low, close, volume, timestamp) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE 
			open = LEAST(VALUES(open), candles.open),
			high = GREATEST(VALUES(high), candles.high),
			low = LEAST(VALUES(low), candles.low),
			close = VALUES(close),
			volume = GREATEST(VALUES(volume), candles.volume)`

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, candle := range candles {
		_, err := stmt.ExecContext(ctx,
			candle.Symbol, candle.Interval, candle.Open, candle.High,
			candle.Low, candle.Close, candle.Volume, candle.Timestamp.Unix())
		if err != nil {
			return fmt.Errorf("failed to save candle: %w", err)
		}
	}

	return tx.Commit()
}

func (r *CandlesRepository) GetLatest(ctx context.Context, symbol, interval string) (*Candle, error) {
	query := `SELECT id, symbol, interval, open, high, low, close, volume, timestamp, created_at 
		FROM candles WHERE symbol = ? AND interval = ? 
		ORDER BY timestamp DESC LIMIT 1`

	var candle Candle
	err := r.db.QueryRowContext(ctx, query, symbol, interval).Scan(
		&candle.ID, &candle.Symbol, &candle.Interval, &candle.Open, &candle.High,
		&candle.Low, &candle.Close, &candle.Volume, &candle.Timestamp, &candle.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get latest candle: %w", err)
	}

	return &candle, nil
}

func (r *CandlesRepository) GetHistory(ctx context.Context, symbol, interval string, limit int) ([]Candle, error) {
	query := `SELECT id, symbol, interval, open, high, low, close, volume, timestamp, created_at 
		FROM candles WHERE symbol = ? AND interval = ? 
		ORDER BY timestamp DESC LIMIT ?`

	rows, err := r.db.QueryContext(ctx, query, symbol, interval, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query candles: %w", err)
	}
	defer rows.Close()

	var candles []Candle
	for rows.Next() {
		var candle Candle
		if err := rows.Scan(&candle.ID, &candle.Symbol, &candle.Interval, &candle.Open,
			&candle.High, &candle.Low, &candle.Close, &candle.Volume,
			&candle.Timestamp, &candle.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan candle: %w", err)
		}
		candles = append(candles, candle)
	}

	return candles, nil
}

func (r *CandlesRepository) GetByTimeRange(ctx context.Context, symbol, interval string, start, end time.Time) ([]Candle, error) {
	query := `SELECT id, symbol, interval, open, high, low, close, volume, timestamp, created_at 
		FROM candles WHERE symbol = ? AND interval = ? AND timestamp BETWEEN ? AND ?
		ORDER BY timestamp ASC`

	rows, err := r.db.QueryContext(ctx, query, symbol, interval, start.Unix(), end.Unix())
	if err != nil {
		return nil, fmt.Errorf("failed to query candles: %w", err)
	}
	defer rows.Close()

	var candles []Candle
	for rows.Next() {
		var candle Candle
		if err := rows.Scan(&candle.ID, &candle.Symbol, &candle.Interval, &candle.Open,
			&candle.High, &candle.Low, &candle.Close, &candle.Volume,
			&candle.Timestamp, &candle.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan candle: %w", err)
		}
		candles = append(candles, candle)
	}

	return candles, nil
}

func (r *CandlesRepository) Cleanup(ctx context.Context, keepYears int) (int64, error) {
	if keepYears <= 0 {
		keepYears = 2
	}

	cutoff := time.Now().AddDate(-keepYears, 0, 0)
	result, err := r.db.ExecContext(ctx,
		"DELETE FROM candles WHERE timestamp < ?", cutoff.Unix())
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup candles: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	return rows, nil
}

func (r *CandlesRepository) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM candles").Scan(&count)
	return count, err
}

func (r *CandlesRepository) CountBySymbol(ctx context.Context, symbol, interval string) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM candles WHERE symbol = ? AND interval = ?",
		symbol, interval).Scan(&count)
	return count, err
}
