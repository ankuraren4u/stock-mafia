package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"go.uber.org/zap"
)

type EventBus struct {
	client      *Client
	logger      *zap.Logger
	subscribers map[string][]EventHandler
	mu          sync.RWMutex
}

type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
	Source  string      `json:"source"`
}

type EventHandler func(ctx context.Context, event Event) error

func NewEventBus(client *Client, logger *zap.Logger) *EventBus {
	return &EventBus{
		client:      client,
		logger:      logger,
		subscribers: make(map[string][]EventHandler),
	}
}

func (eb *EventBus) Publish(ctx context.Context, channel string, event Event) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	return eb.client.Publish(ctx, channel, string(data))
}

func (eb *EventBus) Subscribe(ctx context.Context, channel string, handler EventHandler) error {
	eb.mu.Lock()
	eb.subscribers[channel] = append(eb.subscribers[channel], handler)
	eb.mu.Unlock()

	pubsub := eb.client.Subscribe(ctx, channel)

	go func() {
		defer pubsub.Close()
		for msg := range pubsub.Channel() {
			var event Event
			if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
				eb.logger.Error("failed to unmarshal event",
					zap.String("channel", channel),
					zap.Error(err),
				)
				continue
			}

			eb.mu.RLock()
			handlers := eb.subscribers[channel]
			eb.mu.RUnlock()

			for _, handler := range handlers {
				if err := handler(ctx, event); err != nil {
					eb.logger.Error("failed to handle event",
						zap.String("channel", channel),
						zap.String("type", event.Type),
						zap.Error(err),
					)
				}
			}
		}
	}()

	return nil
}

func (eb *EventBus) Unsubscribe(channel string) {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	delete(eb.subscribers, channel)
}

type PriceEvent struct {
	Symbol        string  `json:"symbol"`
	Price         float64 `json:"price"`
	Change        float64 `json:"change"`
	ChangePercent float64 `json:"change_percent"`
	Volume        int64   `json:"volume"`
}

type AlertEvent struct {
	AlertID   string  `json:"alert_id"`
	UserID    string  `json:"user_id"`
	Symbol    string  `json:"symbol"`
	Condition string  `json:"condition"`
	Value     float64 `json:"value"`
	Target    float64 `json:"target"`
}

type SignalEvent struct {
	Symbol     string  `json:"symbol"`
	Strategy   string  `json:"strategy"`
	Direction  string  `json:"direction"`
	Strength   float64 `json:"strength"`
	Confidence float64 `json:"confidence"`
}

func (eb *EventBus) PublishPriceEvent(ctx context.Context, event PriceEvent) error {
	return eb.Publish(ctx, "events:price", Event{
		Type:    "price.update",
		Payload: event,
		Source:  "price-service",
	})
}

func (eb *EventBus) PublishAlertEvent(ctx context.Context, event AlertEvent) error {
	return eb.Publish(ctx, "events:alert", Event{
		Type:    "alert.triggered",
		Payload: event,
		Source:  "alert-service",
	})
}

func (eb *EventBus) PublishSignalEvent(ctx context.Context, event SignalEvent) error {
	return eb.Publish(ctx, "events:signal", Event{
		Type:    "signal.generated",
		Payload: event,
		Source:  "analytics-service",
	})
}

func (eb *EventBus) SubscribePriceUpdates(ctx context.Context, handler EventHandler) error {
	return eb.Subscribe(ctx, "events:price", handler)
}

func (eb *EventBus) SubscribeAlerts(ctx context.Context, handler EventHandler) error {
	return eb.Subscribe(ctx, "events:alert", handler)
}

func (eb *EventBus) SubscribeSignals(ctx context.Context, handler EventHandler) error {
	return eb.Subscribe(ctx, "events:signal", handler)
}

func (eb *EventBus) close() {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	eb.subscribers = make(map[string][]EventHandler)
}
