package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/stockmafia/trading-app/services/gateway/internal/grpc"
	"go.uber.org/zap"
)

type SSEHandler struct {
	clients *grpc.Clients
	logger  *zap.Logger
}

func NewSSEHandler(clients *grpc.Clients, logger *zap.Logger) *SSEHandler {
	return &SSEHandler{
		clients: clients,
		logger:  logger,
	}
}

func (h *SSEHandler) SubscribePrices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	symbols := r.URL.Query().Get("symbols")

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			data := map[string]interface{}{
				"timestamp": time.Now().Unix(),
				"symbols":   symbols,
			}

			jsonData, err := json.Marshal(data)
			if err != nil {
				h.logger.Error("failed to marshal SSE data", zap.Error(err))
				continue
			}

			fmt.Fprintf(w, "data: %s\n\n", jsonData)
			flusher.Flush()
		}
	}
}

func (h *SSEHandler) SubscribeAlerts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			data := map[string]interface{}{
				"timestamp": time.Now().Unix(),
				"type":      "heartbeat",
			}

			jsonData, err := json.Marshal(data)
			if err != nil {
				h.logger.Error("failed to marshal SSE data", zap.Error(err))
				continue
			}

			fmt.Fprintf(w, "data: %s\n\n", jsonData)
			flusher.Flush()
		}
	}
}
