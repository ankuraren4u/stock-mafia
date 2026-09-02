package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"go.uber.org/zap"
)

const (
	priceCachePrefix = "price:"
	priceCacheTTL    = 5 * time.Minute
)

type PriceCache struct {
	client *Client
	logger *zap.Logger
}

type CachedPrice struct {
	Symbol        string    `json:"symbol"`
	Last          float64   `json:"last"`
	Change        float64   `json:"change"`
	ChangePercent float64   `json:"change_percent"`
	Volume        int64     `json:"volume"`
	Bid           float64   `json:"bid"`
	Ask           float64   `json:"ask"`
	Timestamp     time.Time `json:"timestamp"`
}

func NewPriceCache(client *Client, logger *zap.Logger) *PriceCache {
	return &PriceCache{
		client: client,
		logger: logger,
	}
}

func (pc *PriceCache) Set(ctx context.Context, symbol string, price *CachedPrice) error {
	key := priceCachePrefix + symbol
	data, err := json.Marshal(price)
	if err != nil {
		return fmt.Errorf("failed to marshal price: %w", err)
	}

	return pc.client.Set(ctx, key, data, priceCacheTTL)
}

func (pc *PriceCache) Get(ctx context.Context, symbol string) (*CachedPrice, error) {
	key := priceCachePrefix + symbol
	data, err := pc.client.Get(ctx, key)
	if err != nil {
		return nil, err
	}

	var price CachedPrice
	if err := json.Unmarshal([]byte(data), &price); err != nil {
		return nil, fmt.Errorf("failed to unmarshal price: %w", err)
	}

	return &price, nil
}

func (pc *PriceCache) GetMultiple(ctx context.Context, symbols []string) (map[string]*CachedPrice, error) {
	if len(symbols) == 0 {
		return make(map[string]*CachedPrice), nil
	}

	keys := make([]string, len(symbols))
	for i, symbol := range symbols {
		keys[i] = priceCachePrefix + symbol
	}

	values, err := pc.client.client.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get prices: %w", err)
	}

	result := make(map[string]*CachedPrice)
	for i, val := range values {
		if val == nil {
			continue
		}
		data, ok := val.(string)
		if !ok {
			continue
		}
		var price CachedPrice
		if err := json.Unmarshal([]byte(data), &price); err != nil {
			pc.logger.Error("failed to unmarshal cached price",
				zap.String("symbol", symbols[i]),
				zap.Error(err),
			)
			continue
		}
		result[symbols[i]] = &price
	}

	return result, nil
}

func (pc *PriceCache) Delete(ctx context.Context, symbol string) error {
	key := priceCachePrefix + symbol
	return pc.client.Del(ctx, key)
}

func (pc *PriceCache) SetBulk(ctx context.Context, prices map[string]*CachedPrice) error {
	pipe := pc.client.client.Pipeline()

	for symbol, price := range prices {
		key := priceCachePrefix + symbol
		data, err := json.Marshal(price)
		if err != nil {
			return fmt.Errorf("failed to marshal price for %s: %w", symbol, err)
		}
		pipe.Set(ctx, key, data, priceCacheTTL)
	}

	_, err := pipe.Exec(ctx)
	return err
}

func (pc *PriceCache) Exists(ctx context.Context, symbol string) bool {
	key := priceCachePrefix + symbol
	exists, err := pc.client.Exists(ctx, key)
	if err != nil {
		return false
	}
	return exists
}
