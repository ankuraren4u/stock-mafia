package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"go.uber.org/zap"
)

type SSEBroadcaster struct {
	clients    sync.Map
	broadcast  chan []byte
	register   chan chan []byte
	unregister chan chan []byte
	logger     *zap.Logger
}

func NewSSEBroadcaster(logger *zap.Logger) *SSEBroadcaster {
	return &SSEBroadcaster{
		broadcast:  make(chan []byte, 1024),
		register:   make(chan chan []byte, 256),
		unregister: make(chan chan []byte, 256),
		logger:     logger,
	}
}

func (b *SSEBroadcaster) Start() {
	for {
		select {
		case client := <-b.register:
			b.clients.Store(client, true)
			b.logger.Info("sse client connected", zap.Int("total", b.GetClientCount()))

		case client := <-b.unregister:
			b.clients.Delete(client)
			close(client)

		case message := <-b.broadcast:
			b.clients.Range(func(key, value interface{}) bool {
				ch := key.(chan []byte)
				select {
				case ch <- message:
				default:
					close(ch)
					b.clients.Delete(ch)
				}
				return true
			})
		}
	}
}

func (b *SSEBroadcaster) BroadcastEvent(eventType string, data interface{}) {
	msg := map[string]interface{}{
		"type": eventType,
		"data": data,
	}
	payload, _ := json.Marshal(msg)
	b.broadcast <- payload
}

func (b *SSEBroadcaster) BroadcastPrice(update PriceUpdate) {
	b.BroadcastEvent("price", update)
}

func (b *SSEBroadcaster) BroadcastAlert(alert interface{}) {
	b.BroadcastEvent("alert", alert)
}

func (b *SSEBroadcaster) BroadcastCrawler(event interface{}) {
	b.BroadcastEvent("crawler", event)
}

func (b *SSEBroadcaster) HandleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no")

	topicStr := r.URL.Query().Get("topics")
	topics := parseTopics(topicStr)

	clientChan := make(chan []byte, 256)
	b.register <- clientChan

	defer func() {
		b.unregister <- clientChan
	}()

	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-clientChan:
			if !ok {
				return
			}

			if len(topics) > 0 {
				var event map[string]interface{}
				if err := json.Unmarshal(msg, &event); err != nil {
					continue
				}
				eventType, _ := event["type"].(string)
				if !matchTopic(eventType, topics) {
					continue
				}
			}

			eventType := extractEventType(msg)
			if eventType != "" {
				fmt.Fprintf(w, "event: %s\n", eventType)
			}
			fmt.Fprintf(w, "data: %s\n\n", string(msg))
			flusher.Flush()

		case <-heartbeat.C:
			keepalive := map[string]interface{}{
				"type":      "heartbeat",
				"timestamp": time.Now().Unix(),
			}
			data, _ := json.Marshal(keepalive)
			fmt.Fprintf(w, "data: %s\n\n", string(data))
			flusher.Flush()
		}
	}
}

func (b *SSEBroadcaster) GetClientCount() int {
	count := 0
	b.clients.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	return count
}

func (b *SSEBroadcaster) Stop() {
	b.clients.Range(func(key, value interface{}) bool {
		ch := key.(chan []byte)
		close(ch)
		b.clients.Delete(ch)
		return true
	})
}

func parseTopics(topicStr string) []string {
	if topicStr == "" {
		return nil
	}
	var topics []string
	for _, t := range splitComma(topicStr) {
		topics = append(topics, t)
	}
	return topics
}

func splitComma(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			if i > start {
				result = append(result, s[start:i])
			}
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}

func matchTopic(eventType string, topics []string) bool {
	for _, t := range topics {
		if t == eventType {
			return true
		}
	}
	return false
}

func extractEventType(msg []byte) string {
	var event map[string]interface{}
	if err := json.Unmarshal(msg, &event); err != nil {
		return ""
	}
	t, _ := event["type"].(string)
	return t
}
