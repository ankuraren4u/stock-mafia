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

const (
	defaultCash          = 100000.0
	maxRiskPerTrade      = 0.01 // 1% risk per trade
	maxPositionPercent   = 0.20 // 20% max position size
	defaultStopLossPct   = 0.02 // 2% stop loss
)

type PaperService struct {
	redisClient *redis.Client
	logger      *zap.Logger
}

type PaperPosition struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	Symbol       string    `json:"symbol"`
	Side         string    `json:"side"`
	Quantity     float64   `json:"quantity"`
	EntryPrice   float64   `json:"entry_price"`
	CurrentPrice float64   `json:"current_price"`
	PnL          float64   `json:"pnl"`
	PnLPercent   float64   `json:"pnl_percent"`
	Status       string    `json:"status"`
	StopLoss     float64   `json:"stop_loss"`
	TakeProfit   float64   `json:"take_profit"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type PaperOrder struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	Symbol       string    `json:"symbol"`
	Side         string    `json:"side"`
	OrderType    string    `json:"order_type"`
	Quantity     float64   `json:"quantity"`
	Price        float64   `json:"price"`
	Total        float64   `json:"total"`
	Status       string    `json:"status"`
	FillPrice    float64   `json:"fill_price"`
	FilledAt     time.Time `json:"filled_at"`
	CreatedAt    time.Time `json:"created_at"`
}

type PaperPortfolio struct {
	TotalValue float64         `json:"total_value"`
	Cash       float64         `json:"cash"`
	Invested   float64         `json:"invested"`
	PnL        float64         `json:"pnl"`
	PnLPercent float64         `json:"pnl_percent"`
	Positions  []PaperPosition `json:"positions"`
}

type TradeJournal struct {
	Entries []TradeJournalEntry `json:"entries"`
	Stats   TradeStats          `json:"stats"`
}

type TradeJournalEntry struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Symbol     string    `json:"symbol"`
	Side       string    `json:"side"`
	Quantity   float64   `json:"quantity"`
	EntryPrice float64   `json:"entry_price"`
	ExitPrice  float64   `json:"exit_price"`
	PnL        float64   `json:"pnl"`
	PnLPercent float64   `json:"pnl_percent"`
	Strategy   string    `json:"strategy"`
	Notes      string    `json:"notes"`
	Duration   string    `json:"duration"`
	EntryTime  time.Time `json:"entry_time"`
	ExitTime   time.Time `json:"exit_time"`
}

type TradeStats struct {
	TotalTrades   int     `json:"total_trades"`
	WinningTrades int     `json:"winning_trades"`
	LosingTrades  int     `json:"losing_trades"`
	WinRate       float64 `json:"win_rate"`
	TotalPnL      float64 `json:"total_pnl"`
	AvgPnL        float64 `json:"avg_pnl"`
	MaxWin        float64 `json:"max_win"`
	MaxLoss       float64 `json:"max_loss"`
	AvgWin        float64 `json:"avg_win"`
	AvgLoss       float64 `json:"avg_loss"`
	ProfitFactor  float64 `json:"profit_factor"`
}

func NewPaperService(redisClient *redis.Client, logger *zap.Logger) *PaperService {
	return &PaperService{
		redisClient: redisClient,
		logger:      logger,
	}
}

func (s *PaperService) PlaceOrder(ctx context.Context, userID, symbol, side, orderType string, quantity, price float64) (*PaperOrder, error) {
	if quantity <= 0 || price <= 0 {
		return nil, fmt.Errorf("quantity and price must be positive")
	}

	side = normalizeSide(side)
	if side == "" {
		return nil, fmt.Errorf("invalid side: must be BUY or SELL")
	}

	orderType = normalizeOrderType(orderType)

	cash, err := s.getCash(ctx, userID)
	if err != nil {
		cash = defaultCash
		s.setCash(ctx, userID, cash)
	}

	total := price * quantity

	if side == "BUY" {
		riskAmount := cash * maxRiskPerTrade
		stopLoss := price * (1 - defaultStopLossPct)
		riskPerShare := price - stopLoss
		maxQuantity := math.Floor(riskAmount / riskPerShare)

		if quantity > maxQuantity && maxQuantity > 0 {
			quantity = maxQuantity
			total = price * quantity
		}

		if total > cash {
			return nil, fmt.Errorf("insufficient cash: have %.2f, need %.2f", cash, total)
		}

		maxAllowed := cash * maxPositionPercent
		if total > maxAllowed {
			return nil, fmt.Errorf("position size exceeds maximum: %.2f > %.2f", total, maxAllowed)
		}
	}

	if side == "SELL" {
		hasPosition, currentQty := s.hasPosition(ctx, userID, symbol)
		if !hasPosition || currentQty < quantity {
			return nil, fmt.Errorf("insufficient position to sell: have %.2f, want to sell %.2f", currentQty, quantity)
		}
	}

	order := &PaperOrder{
		ID:        uuid.New().String(),
		UserID:    userID,
		Symbol:    symbol,
		Side:      side,
		OrderType: orderType,
		Quantity:  quantity,
		Price:     price,
		Total:     total,
		Status:    "completed",
		FillPrice: price,
		FilledAt:  time.Now(),
		CreatedAt: time.Now(),
	}

	data, err := json.Marshal(order)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal order: %w", err)
	}

	orderKey := fmt.Sprintf("paper:order:%s", order.ID)
	if err := s.redisClient.Set(ctx, orderKey, string(data), 0).Err(); err != nil {
		return nil, fmt.Errorf("failed to save order: %w", err)
	}

	ordersKey := fmt.Sprintf("paper:orders:%s", userID)
	s.redisClient.LPush(ctx, ordersKey, order.ID)

	if _, err := s.createOrUpdatePosition(ctx, userID, symbol, side, quantity, price); err != nil {
		return nil, err
	}

	newCash := cash
	if side == "BUY" {
		newCash -= total
	} else {
		newCash += total
	}
	s.setCash(ctx, userID, newCash)

	s.logger.Info("paper order placed",
		zap.String("order_id", order.ID),
		zap.String("symbol", symbol),
		zap.String("side", side),
		zap.Float64("quantity", quantity),
		zap.Float64("price", price),
	)

	return order, nil
}

func (s *PaperService) createOrUpdatePosition(ctx context.Context, userID, symbol, side string, quantity, price float64) (*PaperPosition, error) {
	if side == "SELL" {
		return s.closePosition(ctx, userID, symbol, quantity, price)
	}

	positionsKey := fmt.Sprintf("paper:positions:%s", userID)
	positionIDs, err := s.redisClient.LRange(ctx, positionsKey, 0, -1).Result()
	if err != nil {
		return nil, err
	}

	for _, posID := range positionIDs {
		posKey := fmt.Sprintf("paper:position:%s", posID)
		posData, err := s.redisClient.Get(ctx, posKey).Result()
		if err != nil {
			continue
		}

		var pos PaperPosition
		if err := json.Unmarshal([]byte(posData), &pos); err != nil {
			continue
		}

		if pos.Symbol == symbol && pos.UserID == userID && pos.Status == "open" {
			totalQty := pos.Quantity + quantity
			avgPrice := (pos.EntryPrice*pos.Quantity + price*quantity) / totalQty

			pos.Quantity = totalQty
			pos.EntryPrice = avgPrice
			pos.UpdatedAt = time.Now()

			stopLoss := avgPrice * (1 - defaultStopLossPct)
			takeProfit := avgPrice * (1 + defaultStopLossPct*2)
			pos.StopLoss = stopLoss
			pos.TakeProfit = takeProfit

			data, _ := json.Marshal(pos)
			s.redisClient.Set(ctx, posKey, string(data), 0)

			return &pos, nil
		}
	}

	position := &PaperPosition{
		ID:           uuid.New().String(),
		UserID:       userID,
		Symbol:       symbol,
		Side:         side,
		Quantity:     quantity,
		EntryPrice:   price,
		CurrentPrice: price,
		Status:       "open",
		StopLoss:     price * (1 - defaultStopLossPct),
		TakeProfit:   price * (1 + defaultStopLossPct*2),
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	data, err := json.Marshal(position)
	if err != nil {
		return nil, err
	}

	posKey := fmt.Sprintf("paper:position:%s", position.ID)
	if err := s.redisClient.Set(ctx, posKey, string(data), 0).Err(); err != nil {
		return nil, err
	}

	s.redisClient.LPush(ctx, positionsKey, position.ID)

	return position, nil
}

func (s *PaperService) closePosition(ctx context.Context, userID, symbol string, quantity, exitPrice float64) (*PaperPosition, error) {
	positionsKey := fmt.Sprintf("paper:positions:%s", userID)
	positionIDs, err := s.redisClient.LRange(ctx, positionsKey, 0, -1).Result()
	if err != nil {
		return nil, err
	}

	for _, posID := range positionIDs {
		posKey := fmt.Sprintf("paper:position:%s", posID)
		posData, err := s.redisClient.Get(ctx, posKey).Result()
		if err != nil {
			continue
		}

		var pos PaperPosition
		if err := json.Unmarshal([]byte(posData), &pos); err != nil {
			continue
		}

		if pos.Symbol == symbol && pos.UserID == userID && pos.Status == "open" {
			pnl := (exitPrice - pos.EntryPrice) * quantity
			pos.PnL += pnl
			pos.Quantity -= quantity

			if pos.Quantity <= 0 {
				pos.Status = "closed"
				pos.Quantity = 0
			}

			pos.CurrentPrice = exitPrice
			pos.UpdatedAt = time.Now()

			data, _ := json.Marshal(pos)
			s.redisClient.Set(ctx, posKey, string(data), 0)

			journalEntry := TradeJournalEntry{
				ID:         uuid.New().String(),
				UserID:     userID,
				Symbol:     symbol,
				Side:       "SELL",
				Quantity:   quantity,
				EntryPrice: pos.EntryPrice,
				ExitPrice:  exitPrice,
				PnL:        pnl,
				PnLPercent: (exitPrice/pos.EntryPrice - 1) * 100,
				EntryTime:  pos.CreatedAt,
				ExitTime:   time.Now(),
			}
			s.saveJournalEntry(ctx, journalEntry)

			return &pos, nil
		}
	}

	return nil, fmt.Errorf("no open position found for %s", symbol)
}

func (s *PaperService) hasPosition(ctx context.Context, userID, symbol string) (bool, float64) {
	positionsKey := fmt.Sprintf("paper:positions:%s", userID)
	positionIDs, err := s.redisClient.LRange(ctx, positionsKey, 0, -1).Result()
	if err != nil {
		return false, 0
	}

	for _, posID := range positionIDs {
		posKey := fmt.Sprintf("paper:position:%s", posID)
		posData, err := s.redisClient.Get(ctx, posKey).Result()
		if err != nil {
			continue
		}

		var pos PaperPosition
		if err := json.Unmarshal([]byte(posData), &pos); err != nil {
			continue
		}

		if pos.Symbol == symbol && pos.UserID == userID && pos.Status == "open" {
			return true, pos.Quantity
		}
	}

	return false, 0
}

func (s *PaperService) getCash(ctx context.Context, userID string) (float64, error) {
	key := fmt.Sprintf("paper:cash:%s", userID)
	data, err := s.redisClient.Get(ctx, key).Result()
	if err != nil {
		return defaultCash, nil
	}

	var cash float64
	if err := json.Unmarshal([]byte(data), &cash); err != nil {
		return defaultCash, nil
	}

	return cash, nil
}

func (s *PaperService) setCash(ctx context.Context, userID string, cash float64) {
	key := fmt.Sprintf("paper:cash:%s", userID)
	data, _ := json.Marshal(cash)
	s.redisClient.Set(ctx, key, string(data), 0)
}

func (s *PaperService) saveJournalEntry(ctx context.Context, entry TradeJournalEntry) {
	data, err := json.Marshal(entry)
	if err != nil {
		s.logger.Error("failed to marshal journal entry", zap.Error(err))
		return
	}

	key := fmt.Sprintf("journal:entry:%s", entry.ID)
	s.redisClient.Set(ctx, key, string(data), 0)

	listKey := fmt.Sprintf("journal:entries:%s", entry.UserID)
	s.redisClient.LPush(ctx, listKey, entry.ID)
}

func (s *PaperService) GetOrders(ctx context.Context, userID string) ([]PaperOrder, error) {
	ordersKey := fmt.Sprintf("paper:orders:%s", userID)
	orderIDs, err := s.redisClient.LRange(ctx, ordersKey, 0, -1).Result()
	if err != nil {
		return nil, err
	}

	var orders []PaperOrder
	for _, orderID := range orderIDs {
		orderKey := fmt.Sprintf("paper:order:%s", orderID)
		data, err := s.redisClient.Get(ctx, orderKey).Result()
		if err != nil {
			continue
		}

		var order PaperOrder
		if err := json.Unmarshal([]byte(data), &order); err != nil {
			continue
		}

		orders = append(orders, order)
	}

	return orders, nil
}

func (s *PaperService) GetPositions(ctx context.Context, userID string) ([]PaperPosition, error) {
	positionsKey := fmt.Sprintf("paper:positions:%s", userID)
	positionIDs, err := s.redisClient.LRange(ctx, positionsKey, 0, -1).Result()
	if err != nil {
		return nil, err
	}

	var positions []PaperPosition
	for _, posID := range positionIDs {
		posKey := fmt.Sprintf("paper:position:%s", posID)
		data, err := s.redisClient.Get(ctx, posKey).Result()
		if err != nil {
			continue
		}

		var pos PaperPosition
		if err := json.Unmarshal([]byte(data), &pos); err != nil {
			continue
		}

		if pos.Status == "open" {
			positions = append(positions, pos)
		}
	}

	return positions, nil
}

func (s *PaperService) GetPortfolio(ctx context.Context, userID string) (*PaperPortfolio, error) {
	positions, err := s.GetPositions(ctx, userID)
	if err != nil {
		return nil, err
	}

	cash, err := s.getCash(ctx, userID)
	if err != nil {
		cash = defaultCash
	}

	var totalInvested, totalCurrent, totalPnL float64
	for _, pos := range positions {
		totalInvested += pos.EntryPrice * pos.Quantity
		totalCurrent += pos.CurrentPrice * pos.Quantity
		totalPnL += pos.PnL
	}

	portfolio := &PaperPortfolio{
		TotalValue: totalCurrent + cash,
		Cash:       cash,
		Invested:   totalInvested,
		PnL:        totalPnL,
		Positions:  positions,
	}

	if totalInvested > 0 {
		portfolio.PnLPercent = (totalPnL / totalInvested) * 100
	}

	return portfolio, nil
}

func (s *PaperService) GetJournal(ctx context.Context, userID string, limit, offset int) (*TradeJournal, error) {
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

	stats := s.calculateStats(entries)

	return &TradeJournal{
		Entries: entries,
		Stats:   stats,
	}, nil
}

func (s *PaperService) calculateStats(entries []TradeJournalEntry) TradeStats {
	stats := TradeStats{
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

	return stats
}

func normalizeSide(side string) string {
	switch side {
	case "BUY", "buy", "b", "B":
		return "BUY"
	case "SELL", "sell", "s", "S":
		return "SELL"
	default:
		return ""
	}
}

func normalizeOrderType(orderType string) string {
	switch orderType {
	case "MARKET", "market", "m", "M":
		return "MARKET"
	case "LIMIT", "limit", "l", "L":
		return "LIMIT"
	case "SL", "sl", "STOP_LOSS":
		return "SL"
	case "SLM", "slm", "STOP_LOSS_MARKET":
		return "SLM"
	default:
		return "MARKET"
	}
}
