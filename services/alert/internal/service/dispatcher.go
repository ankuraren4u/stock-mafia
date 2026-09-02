package service

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
)

const (
	maxRetries     = 3
	retryBaseDelay = 1 * time.Second
)

type Dispatcher struct {
	logger   *zap.Logger
	channels map[string]NotificationChannel
}

type NotificationChannel interface {
	Send(ctx context.Context, message NotificationMessage) error
	Name() string
}

type NotificationMessage struct {
	Title      string
	Body       string
	Symbol     string
	AlertID    string
	UserID     string
	Value      float64
	Target     float64
	Channel    string
	Condition  string
	TriggeredAt time.Time
}

type NotificationLog struct {
	AlertID   string
	Channel   string
	Status    string
	Error     string
	Attempts  int
	Timestamp time.Time
}

func NewDispatcher(logger *zap.Logger) *Dispatcher {
	return &Dispatcher{
		logger:   logger,
		channels: make(map[string]NotificationChannel),
	}
}

func (d *Dispatcher) RegisterChannel(name string, channel NotificationChannel) {
	d.channels[name] = channel
	d.logger.Info("notification channel registered", zap.String("name", name))
}

func (d *Dispatcher) Dispatch(ctx context.Context, msg NotificationMessage) error {
	channel, ok := d.channels[msg.Channel]
	if !ok {
		d.logger.Warn("notification channel not found",
			zap.String("channel", msg.Channel),
			zap.String("symbol", msg.Symbol),
		)
		return fmt.Errorf("channel %s not found", msg.Channel)
	}

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		d.logger.Info("dispatching notification",
			zap.String("channel", msg.Channel),
			zap.String("symbol", msg.Symbol),
			zap.String("alert_id", msg.AlertID),
			zap.Int("attempt", attempt),
		)

		err := channel.Send(ctx, msg)
		if err == nil {
			d.logNotificationAttempt(msg.AlertID, msg.Channel, "success", "", attempt)
			return nil
		}

		lastErr = err
		d.logger.Warn("notification delivery failed",
			zap.String("channel", msg.Channel),
			zap.String("symbol", msg.Symbol),
			zap.Int("attempt", attempt),
			zap.Error(err),
		)

		if attempt < maxRetries {
			delay := retryBaseDelay * time.Duration(attempt)
			select {
			case <-ctx.Done():
				d.logNotificationAttempt(msg.AlertID, msg.Channel, "cancelled", ctx.Err().Error(), attempt)
				return ctx.Err()
			case <-time.After(delay):
			}
		}
	}

	d.logNotificationAttempt(msg.AlertID, msg.Channel, "failed", lastErr.Error(), maxRetries)
	return fmt.Errorf("failed to send notification after %d attempts: %w", maxRetries, lastErr)
}

func (d *Dispatcher) DispatchToMultiple(ctx context.Context, channels []string, msg NotificationMessage) map[string]error {
	results := make(map[string]error)

	for _, ch := range channels {
		msgCopy := msg
		msgCopy.Channel = ch
		results[ch] = d.Dispatch(ctx, msgCopy)
	}

	return results
}

func (d *Dispatcher) HandleAlertTriggered(ctx context.Context, alertData map[string]interface{}) error {
	msg := NotificationMessage{
		Title:   "Price Alert Triggered",
		Channel: "default",
	}

	if v, ok := alertData["alert_id"].(string); ok {
		msg.AlertID = v
	}
	if v, ok := alertData["user_id"].(string); ok {
		msg.UserID = v
	}
	if v, ok := alertData["symbol"].(string); ok {
		msg.Symbol = v
	}
	if v, ok := alertData["condition"].(string); ok {
		msg.Condition = v
	}
	if v, ok := alertData["channel"].(string); ok {
		msg.Channel = v
	}
	if v, ok := alertData["current"].(float64); ok {
		msg.Value = v
	}
	if v, ok := alertData["target"].(float64); ok {
		msg.Target = v
	}
	if v, ok := alertData["triggered_at"].(float64); ok {
		msg.TriggeredAt = time.Unix(int64(v), 0)
	}

	msg.Body = d.formatAlertMessage(msg)

	return d.Dispatch(ctx, msg)
}

func (d *Dispatcher) formatAlertMessage(msg NotificationMessage) string {
	return fmt.Sprintf(
		"Alert: %s %s %.2f (current: %.2f)\nSymbol: %s\nTime: %s",
		msg.Condition,
		msg.Symbol,
		msg.Target,
		msg.Value,
		msg.Symbol,
		msg.TriggeredAt.Format("2006-01-02 15:04:05"),
	)
}

func (d *Dispatcher) logNotificationAttempt(alertID, channel, status, errMsg string, attempts int) {
	log := NotificationLog{
		AlertID:   alertID,
		Channel:   channel,
		Status:    status,
		Error:     errMsg,
		Attempts:  attempts,
		Timestamp: time.Now(),
	}

	d.logger.Info("notification attempt logged",
		zap.String("alert_id", log.AlertID),
		zap.String("channel", log.Channel),
		zap.String("status", log.Status),
		zap.Int("attempts", log.Attempts),
		zap.String("error", log.Error),
		zap.Time("timestamp", log.Timestamp),
	)
}

func (d *Dispatcher) GetChannels() []string {
	channels := make([]string, 0, len(d.channels))
	for name := range d.channels {
		channels = append(channels, name)
	}
	return channels
}
