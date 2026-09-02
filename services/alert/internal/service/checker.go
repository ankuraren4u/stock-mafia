package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/stockmafia/trading-app/pkg/kafka"
	"github.com/stockmafia/trading-app/pkg/redis"
	"go.uber.org/zap"
)

type Checker struct {
	config      CheckerConfig
	redisClient *redis.Client
	publisher   *kafka.EventPublisher
	logger      *zap.Logger
	stopCh      chan struct{}
	wg          sync.WaitGroup
}

type CheckerConfig struct {
	Interval time.Duration
}

type AlertCheck struct {
	AlertID   string  `json:"alert_id"`
	UserID    string  `json:"user_id"`
	Symbol    string  `json:"symbol"`
	Condition string  `json:"condition"`
	Target    float64 `json:"target"`
	Channel   string  `json:"channel"`
	Active    bool    `json:"active"`
	CreatedAt int64   `json:"created_at"`
}

func NewChecker(cfg CheckerConfig, redisClient *redis.Client, publisher *kafka.EventPublisher, logger *zap.Logger) *Checker {
	return &Checker{
		config:      cfg,
		redisClient: redisClient,
		publisher:   publisher,
		logger:      logger,
		stopCh:      make(chan struct{}),
	}
}

func (c *Checker) Start(ctx context.Context) {
	c.wg.Add(1)
	defer c.wg.Done()

	c.logger.Info("alert checker started", zap.Duration("interval", c.config.Interval))

	ticker := time.NewTicker(c.config.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-c.stopCh:
			return
		case <-ticker.C:
			c.checkAlerts(ctx)
		}
	}
}

func (c *Checker) Stop() {
	close(c.stopCh)
	c.wg.Wait()
}

func (c *Checker) checkAlerts(ctx context.Context) {
	alerts, err := c.getActiveAlerts(ctx)
	if err != nil {
		c.logger.Error("failed to get active alerts", zap.Error(err))
		return
	}

	c.logger.Debug("checking alerts", zap.Int("count", len(alerts)))

	for _, alert := range alerts {
		select {
		case <-ctx.Done():
			return
		default:
			c.checkAlert(ctx, alert)
		}
	}
}

func (c *Checker) checkAlert(ctx context.Context, alert AlertCheck) {
	quoteKey := "price:" + alert.Symbol
	quoteData, err := c.redisClient.Get(ctx, quoteKey)
	if err != nil {
		c.logger.Debug("no quote found for symbol",
			zap.String("symbol", alert.Symbol),
			zap.Error(err),
		)
		return
	}

	var quote struct {
		Last float64 `json:"last"`
	}
	if err := json.Unmarshal([]byte(quoteData), &quote); err != nil {
		c.logger.Error("failed to unmarshal quote",
			zap.String("symbol", alert.Symbol),
			zap.Error(err),
		)
		return
	}

	triggered := false
	switch alert.Condition {
	case "above":
		triggered = quote.Last > alert.Target
	case "below":
		triggered = quote.Last < alert.Target
	case "crosses_above":
		triggered = quote.Last >= alert.Target
	case "crosses_below":
		triggered = quote.Last <= alert.Target
	case "equals":
		triggered = quote.Last == alert.Target
	}

	if triggered {
		c.logger.Info("alert triggered",
			zap.String("alert_id", alert.AlertID),
			zap.String("symbol", alert.Symbol),
			zap.String("condition", alert.Condition),
			zap.Float64("current", quote.Last),
			zap.Float64("target", alert.Target),
		)

		c.triggerAlert(ctx, alert, quote.Last)
	}
}

func (c *Checker) triggerAlert(ctx context.Context, alert AlertCheck, currentValue float64) {
	alertKey := "alert:active:" + alert.AlertID
	c.redisClient.Del(ctx, alertKey)

	triggeredKey := "alert:triggered:" + alert.AlertID
	triggeredData := map[string]interface{}{
		"alert_id":     alert.AlertID,
		"user_id":      alert.UserID,
		"symbol":       alert.Symbol,
		"condition":    alert.Condition,
		"target":       alert.Target,
		"current":      currentValue,
		"channel":      alert.Channel,
		"triggered_at": time.Now().Unix(),
	}
	data, _ := json.Marshal(triggeredData)
	c.redisClient.Set(ctx, triggeredKey, string(data), 24*time.Hour)

	historyKey := fmt.Sprintf("alert:history:%s", alert.UserID)
	c.redisClient.Client().LPush(ctx, historyKey, alert.AlertID)
	c.redisClient.Client().LTrim(ctx, historyKey, 0, 99)

	if c.publisher != nil {
		if err := c.publisher.PublishAlertTriggered(ctx, alert.AlertID, alert.Symbol, alert.Condition, currentValue, alert.Target); err != nil {
			c.logger.Error("failed to publish alert triggered event",
				zap.String("alert_id", alert.AlertID),
				zap.Error(err),
			)
		}
	}

	c.redisClient.Publish(ctx, "events:alert", string(data))
}

func (c *Checker) getActiveAlerts(ctx context.Context) ([]AlertCheck, error) {
	keys, err := c.redisClient.Client().Keys(ctx, "alert:active:*").Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get active alert keys: %w", err)
	}

	if len(keys) == 0 {
		return nil, nil
	}

	var alerts []AlertCheck
	for _, key := range keys {
		data, err := c.redisClient.Get(ctx, key)
		if err != nil {
			c.logger.Debug("failed to get alert data", zap.String("key", key), zap.Error(err))
			continue
		}

		var alert AlertCheck
		if err := json.Unmarshal([]byte(data), &alert); err != nil {
			c.logger.Debug("failed to unmarshal alert", zap.String("key", key), zap.Error(err))
			continue
		}

		if alert.Active {
			alerts = append(alerts, alert)
		}
	}

	return alerts, nil
}

func (c *Checker) CreateAlert(ctx context.Context, alert AlertCheck) error {
	alert.Active = true
	alert.CreatedAt = time.Now().Unix()

	data, err := json.Marshal(alert)
	if err != nil {
		return fmt.Errorf("failed to marshal alert: %w", err)
	}

	key := "alert:active:" + alert.AlertID
	if err := c.redisClient.Set(ctx, key, string(data), 0); err != nil {
		return fmt.Errorf("failed to save alert: %w", err)
	}

	symbolIndexKey := fmt.Sprintf("alert:symbol:%s", alert.Symbol)
	c.redisClient.Client().SAdd(ctx, symbolIndexKey, alert.AlertID)

	userIndexKey := fmt.Sprintf("alert:user:%s", alert.UserID)
	c.redisClient.Client().SAdd(ctx, userIndexKey, alert.AlertID)

	c.logger.Info("alert created",
		zap.String("alert_id", alert.AlertID),
		zap.String("symbol", alert.Symbol),
		zap.String("user_id", alert.UserID),
	)

	return nil
}

func (c *Checker) DeleteAlert(ctx context.Context, alertID string) error {
	alertKey := "alert:active:" + alertID

	data, err := c.redisClient.Get(ctx, alertKey)
	if err != nil {
		return fmt.Errorf("alert not found: %w", err)
	}

	var alert AlertCheck
	if err := json.Unmarshal([]byte(data), &alert); err != nil {
		return fmt.Errorf("failed to unmarshal alert: %w", err)
	}

	if err := c.redisClient.Del(ctx, alertKey); err != nil {
		return fmt.Errorf("failed to delete alert: %w", err)
	}

	symbolIndexKey := fmt.Sprintf("alert:symbol:%s", alert.Symbol)
	c.redisClient.Client().SRem(ctx, symbolIndexKey, alertID)

	userIndexKey := fmt.Sprintf("alert:user:%s", alert.UserID)
	c.redisClient.Client().SRem(ctx, userIndexKey, alertID)

	c.logger.Info("alert deleted", zap.String("alert_id", alertID))
	return nil
}

func (c *Checker) GetUserAlerts(ctx context.Context, userID string) ([]AlertCheck, error) {
	userIndexKey := fmt.Sprintf("alert:user:%s", userID)
	alertIDs, err := c.redisClient.Client().SMembers(ctx, userIndexKey).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get user alert IDs: %w", err)
	}

	var alerts []AlertCheck
	for _, alertID := range alertIDs {
		alertKey := "alert:active:" + alertID
		data, err := c.redisClient.Get(ctx, alertKey)
		if err != nil {
			continue
		}

		var alert AlertCheck
		if err := json.Unmarshal([]byte(data), &alert); err != nil {
			continue
		}

		if alert.Active {
			alerts = append(alerts, alert)
		}
	}

	return alerts, nil
}

func (c *Checker) GetAlertHistory(ctx context.Context, userID string, limit int) ([]AlertCheck, error) {
	if limit <= 0 {
		limit = 50
	}

	historyKey := fmt.Sprintf("alert:history:%s", userID)
	alertIDs, err := c.redisClient.Client().LRange(ctx, historyKey, 0, int64(limit-1)).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get alert history: %w", err)
	}

	var alerts []AlertCheck
	for _, alertID := range alertIDs {
		triggeredKey := "alert:triggered:" + alertID
		data, err := c.redisClient.Get(ctx, triggeredKey)
		if err != nil {
			continue
		}

		var alert AlertCheck
		if err := json.Unmarshal([]byte(data), &alert); err != nil {
			continue
		}

		alerts = append(alerts, alert)
	}

	return alerts, nil
}

func (c *Checker) GetAlertByID(ctx context.Context, alertID string) (*AlertCheck, error) {
	key := "alert:active:" + alertID
	data, err := c.redisClient.Get(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("alert not found: %w", err)
	}

	var alert AlertCheck
	if err := json.Unmarshal([]byte(data), &alert); err != nil {
		return nil, fmt.Errorf("failed to unmarshal alert: %w", err)
	}

	return &alert, nil
}

func GenerateAlertID() string {
	return fmt.Sprintf("alert-%d", time.Now().UnixNano())
}
