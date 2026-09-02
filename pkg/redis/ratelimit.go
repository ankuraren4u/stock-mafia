package redis

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
)

type RateLimiter struct {
	client  *Client
	logger  *zap.Logger
	buckets map[string]*TokenBucket
	mu      sync.RWMutex
}

type TokenBucket struct {
	Tokens     float64
	MaxTokens  float64
	RefillRate float64
	LastRefill time.Time
}

type RateLimitConfig struct {
	MaxTokens  float64
	RefillRate float64
}

func NewRateLimiter(client *Client, logger *zap.Logger) *RateLimiter {
	rl := &RateLimiter{
		client:  client,
		logger:  logger,
		buckets: make(map[string]*TokenBucket),
	}

	go rl.cleanupLoop()

	return rl
}

func (rl *RateLimiter) Allow(ctx context.Context, key string, config RateLimitConfig) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	bucket, exists := rl.buckets[key]
	if !exists {
		bucket = &TokenBucket{
			Tokens:     config.MaxTokens,
			MaxTokens:  config.MaxTokens,
			RefillRate: config.RefillRate,
			LastRefill: time.Now(),
		}
		rl.buckets[key] = bucket
	}

	rl.refill(bucket)

	if bucket.Tokens >= 1 {
		bucket.Tokens--
		return true
	}

	return false
}

func (rl *RateLimiter) refill(bucket *TokenBucket) {
	now := time.Now()
	elapsed := now.Sub(bucket.LastRefill).Seconds()
	bucket.Tokens += elapsed * bucket.RefillRate
	if bucket.Tokens > bucket.MaxTokens {
		bucket.Tokens = bucket.MaxTokens
	}
	bucket.LastRefill = now
}

func (rl *RateLimiter) GetTokens(ctx context.Context, key string) float64 {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	bucket, exists := rl.buckets[key]
	if !exists {
		return 0
	}

	rl.refill(bucket)
	return bucket.Tokens
}

func (rl *RateLimiter) Reset(ctx context.Context, key string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	delete(rl.buckets, key)
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		rl.cleanup()
	}
}

func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for key, bucket := range rl.buckets {
		if now.Sub(bucket.LastRefill) > 10*time.Minute {
			delete(rl.buckets, key)
		}
	}
}

func (rl *RateLimiter) DomainKey(domain string) string {
	return "ratelimit:domain:" + domain
}

func (rl *RateLimiter) SourceKey(source string) string {
	return "ratelimit:source:" + source
}

func (rl *RateLimiter) UserKey(userID string) string {
	return "ratelimit:user:" + userID
}
