package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

const quoteCachePrefix = "quote:"
const quoteCacheTTL = 5 * time.Second
const crawlSnapshotPrefix = "crawl:snap:"

type QuotesRepository struct {
	db     *sql.DB
	redis  *redis.Client
	logger *zap.Logger
}

type CachedQuote struct {
	Symbol        string    `json:"symbol"`
	Name          string    `json:"name"`
	Yahoo         string    `json:"yahoo"`
	Price         float64   `json:"price"`
	Change        float64   `json:"change"`
	ChangePercent float64   `json:"change_percent"`
	PreviousClose float64   `json:"previous_close"`
	DayHigh       float64   `json:"day_high"`
	DayLow        float64   `json:"day_low"`
	Volume        int64     `json:"volume"`
	MarketCap     float64   `json:"market_cap"`
	Bid           float64   `json:"bid"`
	Ask           float64   `json:"ask"`
	Currency      string    `json:"currency"`
	Source        string    `json:"source"`
	Timestamp     time.Time `json:"timestamp"`
}

type CrawlSnapshot struct {
	Symbol        string  `json:"symbol"`
	Price         float64 `json:"price"`
	Change        float64 `json:"change"`
	ChangePercent float64 `json:"change_percent"`
	Volume        int64   `json:"volume"`
	Source        string  `json:"source"`
	Timestamp     int64   `json:"timestamp"`
}

type StockDetail struct {
	CachedQuote
	Candles []Candle `json:"candles,omitempty"`
}

type Candle struct {
	Symbol    string  `json:"symbol"`
	Interval  string  `json:"interval"`
	Open      float64 `json:"open"`
	High      float64 `json:"high"`
	Low       float64 `json:"low"`
	Close     float64 `json:"close"`
	Volume    int64   `json:"volume"`
	Timestamp int64   `json:"timestamp"`
}

func NewQuotesRepository(db *sql.DB, rdb *redis.Client, logger *zap.Logger) *QuotesRepository {
	return &QuotesRepository{
		db:     db,
		redis:  rdb,
		logger: logger,
	}
}

func (r *QuotesRepository) GetQuote(ctx context.Context, symbol string) (*CachedQuote, error) {
	cacheKey := quoteCachePrefix + symbol
	cached, err := r.redis.Get(ctx, cacheKey).Result()
	if err == nil {
		var quote CachedQuote
		if err := json.Unmarshal([]byte(cached), &quote); err == nil {
			return &quote, nil
		}
	}

	quote, err := r.getQuoteFromMySQL(ctx, symbol)
	if err != nil {
		return r.getQuoteFromCrawlSnapshot(ctx, symbol)
	}

	r.cacheQuote(ctx, symbol, quote)
	return quote, nil
}

func (r *QuotesRepository) getQuoteFromMySQL(ctx context.Context, symbol string) (*CachedQuote, error) {
	var q CachedQuote
	var prevClose, dayHigh, dayLow sql.NullFloat64
	var mktCap sql.NullFloat64
	var volume sql.NullInt64

	err := r.db.QueryRowContext(ctx, `
		SELECT s.yahoo, s.symbol, COALESCE(s.name, ''),
		       q.price, q.change, q.change_pct,
		       q.previous_close, q.day_high, q.day_low,
		       q.volume, q.market_cap, q.currency, q.source
		FROM quotes q JOIN stocks s ON q.stock_id = s.id
		WHERE s.yahoo = ? OR s.symbol = ?
		ORDER BY q.crawled_at DESC LIMIT 1
	`, symbol, symbol).Scan(
		&q.Yahoo, &q.Symbol, &q.Name,
		&q.Price, &q.Change, &q.ChangePercent,
		&prevClose, &dayHigh, &dayLow,
		&volume, &mktCap, &q.Currency, &q.Source,
	)
	if err != nil {
		return nil, err
	}

	if prevClose.Valid {
		q.PreviousClose = prevClose.Float64
	}
	if dayHigh.Valid {
		q.DayHigh = dayHigh.Float64
	}
	if dayLow.Valid {
		q.DayLow = dayLow.Float64
	}
	if volume.Valid {
		q.Volume = volume.Int64
	}
	if mktCap.Valid {
		q.MarketCap = mktCap.Float64
	}
	q.Timestamp = time.Now()

	return &q, nil
}

func (r *QuotesRepository) getQuoteFromCrawlSnapshot(ctx context.Context, symbol string) (*CachedQuote, error) {
	key := crawlSnapshotPrefix + symbol
	data, err := r.redis.Get(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("quote not found for symbol: %s", symbol)
	}

	var snap CrawlSnapshot
	if err := json.Unmarshal([]byte(data), &snap); err != nil {
		return nil, err
	}

	return &CachedQuote{
		Symbol:        snap.Symbol,
		Yahoo:         symbol,
		Price:         snap.Price,
		Change:        snap.Change,
		ChangePercent: snap.ChangePercent,
		Volume:        snap.Volume,
		Source:        snap.Source,
		Currency:      "USD",
		Timestamp:     time.Now(),
	}, nil
}

func (r *QuotesRepository) cacheQuote(ctx context.Context, symbol string, quote *CachedQuote) {
	data, err := json.Marshal(quote)
	if err != nil {
		return
	}
	r.redis.Set(ctx, quoteCachePrefix+symbol, data, quoteCacheTTL)
}

func (r *QuotesRepository) GetQuotes(ctx context.Context, symbols []string) ([]*CachedQuote, error) {
	if len(symbols) == 0 {
		return []*CachedQuote{}, nil
	}

	keys := make([]string, len(symbols))
	for i, s := range symbols {
		keys[i] = quoteCachePrefix + s
	}

	values, err := r.redis.MGet(ctx, keys...).Result()
	if err != nil {
		return r.getQuotesFromMySQL(ctx, symbols)
	}

	result := make([]*CachedQuote, 0, len(symbols))
	missed := make([]string, 0)

	for i, val := range values {
		if val == nil {
			missed = append(missed, symbols[i])
			continue
		}
		data, ok := val.(string)
		if !ok {
			missed = append(missed, symbols[i])
			continue
		}
		var q CachedQuote
		if err := json.Unmarshal([]byte(data), &q); err != nil {
			missed = append(missed, symbols[i])
			continue
		}
		result = append(result, &q)
	}

	if len(missed) > 0 {
		dbQuotes, err := r.getQuotesFromMySQL(ctx, missed)
		if err == nil {
			for _, q := range dbQuotes {
				result = append(result, q)
				r.cacheQuote(ctx, q.Symbol, q)
			}
		}
	}

	return result, nil
}

func (r *QuotesRepository) getQuotesFromMySQL(ctx context.Context, symbols []string) ([]*CachedQuote, error) {
	if len(symbols) == 0 {
		return []*CachedQuote{}, nil
	}

	placeholders := ""
	args := make([]interface{}, 0, len(symbols))
	for i, s := range symbols {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
		args = append(args, s)
	}

	query := fmt.Sprintf(`
		SELECT s.yahoo, s.symbol, COALESCE(s.name, ''),
		       q.price, q.change, q.change_pct,
		       q.previous_close, q.day_high, q.day_low,
		       q.volume, q.market_cap, q.currency, q.source
		FROM quotes q JOIN stocks s ON q.stock_id = s.id
		WHERE s.yahoo IN (%s) OR s.symbol IN (%s)
		ORDER BY q.crawled_at DESC
	`, placeholders, placeholders)

	dupArgs := make([]interface{}, 0, len(args)*2)
	dupArgs = append(dupArgs, args...)
	dupArgs = append(dupArgs, args...)

	rows, err := r.db.QueryContext(ctx, query, dupArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seen := make(map[string]bool)
	var quotes []*CachedQuote
	for rows.Next() {
		var q CachedQuote
		var prevClose, dayHigh, dayLow sql.NullFloat64
		var mktCap sql.NullFloat64
		var volume sql.NullInt64

		if err := rows.Scan(
			&q.Yahoo, &q.Symbol, &q.Name,
			&q.Price, &q.Change, &q.ChangePercent,
			&prevClose, &dayHigh, &dayLow,
			&volume, &mktCap, &q.Currency, &q.Source,
		); err != nil {
			continue
		}

		if seen[q.Yahoo] {
			continue
		}
		seen[q.Yahoo] = true

		if prevClose.Valid {
			q.PreviousClose = prevClose.Float64
		}
		if dayHigh.Valid {
			q.DayHigh = dayHigh.Float64
		}
		if dayLow.Valid {
			q.DayLow = dayLow.Float64
		}
		if volume.Valid {
			q.Volume = volume.Int64
		}
		if mktCap.Valid {
			q.MarketCap = mktCap.Float64
		}
		q.Timestamp = time.Now()
		quotes = append(quotes, &q)
	}

	return quotes, nil
}

func (r *QuotesRepository) GetCandles(ctx context.Context, symbol, interval string, startTime, endTime int64) ([]Candle, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT s.yahoo, c.interval, c.open, c.high, c.low, c.close, c.volume, c.time
		FROM candles c JOIN stocks s ON c.stock_id = s.id
		WHERE (s.yahoo = ? OR s.symbol = ?) AND c.interval = ?
		  AND c.time >= ? AND c.time <= ?
		ORDER BY c.time ASC
	`, symbol, symbol, interval, startTime, endTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var candles []Candle
	for rows.Next() {
		var c Candle
		var vol sql.NullInt64
		if err := rows.Scan(&c.Symbol, &c.Interval, &c.Open, &c.High, &c.Low, &c.Close, &vol, &c.Timestamp); err != nil {
			continue
		}
		if vol.Valid {
			c.Volume = vol.Int64
		}
		candles = append(candles, c)
	}

	return candles, nil
}

func (r *QuotesRepository) GetStockDetail(ctx context.Context, symbol string) (*StockDetail, error) {
	quote, err := r.GetQuote(ctx, symbol)
	if err != nil {
		return nil, err
	}

	endTime := time.Now().Unix()
	startTime := time.Now().AddDate(0, -1, 0).Unix()
	candles, _ := r.GetCandles(ctx, symbol, "1d", startTime, endTime)

	return &StockDetail{
		CachedQuote: *quote,
		Candles:     candles,
	}, nil
}

func (r *QuotesRepository) GetAllQuotes(ctx context.Context) ([]*CachedQuote, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT s.yahoo, s.symbol, COALESCE(s.name, ''),
		       q.price, q.change, q.change_pct,
		       q.previous_close, q.day_high, q.day_low,
		       q.volume, q.market_cap, q.currency, q.source
		FROM quotes q JOIN stocks s ON q.stock_id = s.id
		ORDER BY q.crawled_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seen := make(map[string]bool)
	var quotes []*CachedQuote
	for rows.Next() {
		var q CachedQuote
		var prevClose, dayHigh, dayLow sql.NullFloat64
		var mktCap sql.NullFloat64
		var volume sql.NullInt64

		if err := rows.Scan(
			&q.Yahoo, &q.Symbol, &q.Name,
			&q.Price, &q.Change, &q.ChangePercent,
			&prevClose, &dayHigh, &dayLow,
			&volume, &mktCap, &q.Currency, &q.Source,
		); err != nil {
			continue
		}
		if seen[q.Yahoo] {
			continue
		}
		seen[q.Yahoo] = true

		if prevClose.Valid {
			q.PreviousClose = prevClose.Float64
		}
		if dayHigh.Valid {
			q.DayHigh = dayHigh.Float64
		}
		if dayLow.Valid {
			q.DayLow = dayLow.Float64
		}
		if volume.Valid {
			q.Volume = volume.Int64
		}
		if mktCap.Valid {
			q.MarketCap = mktCap.Float64
		}
		q.Timestamp = time.Now()
		quotes = append(quotes, &q)
	}

	return quotes, nil
}
