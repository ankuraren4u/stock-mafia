package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type JournalService struct {
	redisClient *redis.Client
	logger      *zap.Logger
}

func NewJournalService(redisClient *redis.Client, logger *zap.Logger) *JournalService {
	return &JournalService{
		redisClient: redisClient,
		logger:      logger,
	}
}

func (s *JournalService) AddEntry(ctx context.Context, entry TradeJournalEntry) error {
	if entry.ID == "" {
		entry.ID = uuid.New().String()
	}
	if entry.EntryTime.IsZero() {
		entry.EntryTime = time.Now()
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("failed to marshal entry: %w", err)
	}

	key := fmt.Sprintf("journal:entry:%s", entry.ID)
	if err := s.redisClient.Set(ctx, key, string(data), 0).Err(); err != nil {
		return fmt.Errorf("failed to save entry: %w", err)
	}

	listKey := fmt.Sprintf("journal:entries:%s", entry.UserID)
	s.redisClient.LPush(ctx, listKey, entry.ID)

	s.logger.Info("trade journal entry added",
		zap.String("id", entry.ID),
		zap.String("symbol", entry.Symbol),
		zap.String("side", entry.Side),
	)

	return nil
}

func (s *JournalService) GetEntries(ctx context.Context, userID string, limit, offset int) ([]TradeJournalEntry, error) {
	if limit <= 0 {
		limit = 50
	}

	listKey := fmt.Sprintf("journal:entries:%s", userID)
	entryIDs, err := s.redisClient.LRange(ctx, listKey, int64(offset), int64(offset+limit-1)).Result()
	if err != nil {
		return nil, err
	}

	var entries []TradeJournalEntry
	for _, entryID := range entryIDs {
		key := fmt.Sprintf("journal:entry:%s", entryID)
		data, err := s.redisClient.Get(ctx, key).Result()
		if err != nil {
			continue
		}

		var entry TradeJournalEntry
		if err := json.Unmarshal([]byte(data), &entry); err != nil {
			continue
		}

		entries = append(entries, entry)
	}

	return entries, nil
}

func (s *JournalService) GetEntry(ctx context.Context, entryID string) (*TradeJournalEntry, error) {
	key := fmt.Sprintf("journal:entry:%s", entryID)
	data, err := s.redisClient.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	var entry TradeJournalEntry
	if err := json.Unmarshal([]byte(data), &entry); err != nil {
		return nil, err
	}

	return &entry, nil
}

func (s *JournalService) UpdateEntry(ctx context.Context, entry TradeJournalEntry) error {
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	key := fmt.Sprintf("journal:entry:%s", entry.ID)
	return s.redisClient.Set(ctx, key, string(data), 0).Err()
}

func (s *JournalService) DeleteEntry(ctx context.Context, userID, entryID string) error {
	key := fmt.Sprintf("journal:entry:%s", entryID)
	if err := s.redisClient.Del(ctx, key).Err(); err != nil {
		return err
	}

	listKey := fmt.Sprintf("journal:entries:%s", userID)
	return s.redisClient.LRem(ctx, listKey, 1, entryID).Err()
}

func (s *JournalService) GetStats(ctx context.Context, userID string) (*TradeStats, error) {
	entries, err := s.GetEntries(ctx, userID, 1000, 0)
	if err != nil {
		return nil, err
	}

	stats := &TradeStats{
		TotalTrades: len(entries),
	}

	var totalWinAmount, totalLossAmount float64

	for _, entry := range entries {
		stats.TotalPnL += entry.PnL

		if entry.PnL > 0 {
			stats.WinningTrades++
			totalWinAmount += entry.PnL
			if entry.PnL > stats.MaxWin {
				stats.MaxWin = entry.PnL
			}
		} else {
			stats.LosingTrades++
			totalLossAmount += math.Abs(entry.PnL)
			if math.Abs(entry.PnL) > stats.MaxLoss {
				stats.MaxLoss = math.Abs(entry.PnL)
			}
		}
	}

	if stats.TotalTrades > 0 {
		stats.WinRate = float64(stats.WinningTrades) / float64(stats.TotalTrades) * 100
		stats.AvgPnL = stats.TotalPnL / float64(stats.TotalTrades)
	}

	if stats.WinningTrades > 0 {
		stats.AvgWin = totalWinAmount / float64(stats.WinningTrades)
	}

	if stats.LosingTrades > 0 {
		stats.AvgLoss = totalLossAmount / float64(stats.LosingTrades)
	}

	if totalLossAmount > 0 {
		stats.ProfitFactor = totalWinAmount / totalLossAmount
	}

	return stats, nil
}

func (s *JournalService) GetRecentEntries(ctx context.Context, userID string, limit int) ([]TradeJournalEntry, error) {
	return s.GetEntries(ctx, userID, limit, 0)
}

func (s *JournalService) SearchEntries(ctx context.Context, userID, symbol string) ([]TradeJournalEntry, error) {
	entries, err := s.GetEntries(ctx, userID, 1000, 0)
	if err != nil {
		return nil, err
	}

	var filtered []TradeJournalEntry
	for _, entry := range entries {
		if symbol == "" || entry.Symbol == symbol {
			filtered = append(filtered, entry)
		}
	}

	return filtered, nil
}
