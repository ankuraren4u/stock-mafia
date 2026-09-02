package kafka

import (
	"context"
	"encoding/json"
	"time"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type EventType string

const (
	EventTypePriceUpdate  EventType = "price.update"
	EventTypeAlertTrigger EventType = "alert.triggered"
	EventTypeSignalGen    EventType = "signal.generated"
	EventTypeCrawlComplete EventType = "crawl.completed"
	EventTypeOrderPlaced  EventType = "order.placed"
)

type Event struct {
	Type      EventType              `json:"type"`
	Payload   map[string]interface{} `json:"payload"`
	Source    string                 `json:"source"`
	Timestamp time.Time              `json:"timestamp"`
}

type EventPublisher struct {
	kafka  *Kafka
	logger *zap.Logger
}

func NewEventPublisher(k *Kafka, logger *zap.Logger) *EventPublisher {
	return &EventPublisher{
		kafka:  k,
		logger: logger,
	}
}

func (ep *EventPublisher) Publish(ctx context.Context, eventType EventType, source string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	event := Event{
		Type:      eventType,
		Source:    source,
		Timestamp: time.Now(),
		Payload:   make(map[string]interface{}),
	}

	if err := json.Unmarshal(data, &event.Payload); err != nil {
		return err
	}

	eventData, err := json.Marshal(event)
	if err != nil {
		return err
	}

	msg := kafka.Message{
		Key:   []byte(string(eventType)),
		Value: eventData,
		Time:  time.Now(),
	}

	return ep.kafka.Produce(ctx, msg.Key, eventData)
}

func (ep *EventPublisher) PublishPriceUpdate(ctx context.Context, symbol string, price float64, volume int64) error {
	return ep.Publish(ctx, EventTypePriceUpdate, "crawler-service", map[string]interface{}{
		"symbol": symbol,
		"price":  price,
		"volume": volume,
	})
}

func (ep *EventPublisher) PublishAlertTriggered(ctx context.Context, alertID, symbol, condition string, value, target float64) error {
	return ep.Publish(ctx, EventTypeAlertTrigger, "alert-service", map[string]interface{}{
		"alert_id":  alertID,
		"symbol":    symbol,
		"condition": condition,
		"value":     value,
		"target":    target,
	})
}

func (ep *EventPublisher) PublishSignalGenerated(ctx context.Context, symbol, strategy, direction string, strength, confidence float64) error {
	return ep.Publish(ctx, EventTypeSignalGen, "analytics-service", map[string]interface{}{
		"symbol":     symbol,
		"strategy":   strategy,
		"direction":  direction,
		"strength":   strength,
		"confidence": confidence,
	})
}

func (ep *EventPublisher) PublishCrawlCompleted(ctx context.Context, symbol, source string, success bool) error {
	return ep.Publish(ctx, EventTypeCrawlComplete, "crawler-service", map[string]interface{}{
		"symbol":  symbol,
		"source":  source,
		"success": success,
	})
}

func (ep *EventPublisher) PublishOrderPlaced(ctx context.Context, orderID, symbol, side string, quantity, price float64) error {
	return ep.Publish(ctx, EventTypeOrderPlaced, "portfolio-service", map[string]interface{}{
		"order_id": orderID,
		"symbol":   symbol,
		"side":     side,
		"quantity": quantity,
		"price":    price,
	})
}

type EventConsumer struct {
	kafka   *Kafka
	logger  *zap.Logger
	handlers map[EventType]EventHandler
}

type EventHandler func(ctx context.Context, event Event) error

func NewEventConsumer(k *Kafka, logger *zap.Logger) *EventConsumer {
	return &EventConsumer{
		kafka:    k,
		logger:   logger,
		handlers: make(map[EventType]EventHandler),
	}
}

func (ec *EventConsumer) RegisterHandler(eventType EventType, handler EventHandler) {
	ec.handlers[eventType] = handler
}

func (ec *EventConsumer) Start(ctx context.Context) error {
	return ec.kafka.StartConsumer(ctx, func(ctx context.Context, key, value []byte) error {
		var event Event
		if err := json.Unmarshal(value, &event); err != nil {
			ec.logger.Error("failed to unmarshal event", zap.Error(err))
			return nil
		}

		handler, ok := ec.handlers[event.Type]
		if !ok {
			ec.logger.Debug("no handler for event type", zap.String("type", string(event.Type)))
			return nil
		}

		return handler(ctx, event)
	})
}
