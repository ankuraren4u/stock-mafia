package handler

import (
	"encoding/json"
	"net/http"

	"github.com/stockmafia/trading-app/services/gateway/internal/grpc"
	crawlerv1 "github.com/stockmafia/trading-app/proto/stockmafia/crawler/v1"
	"go.uber.org/zap"
)

type CrawlerHandler struct {
	clients *grpc.Clients
	logger  *zap.Logger
}

func NewCrawlerHandler(clients *grpc.Clients, logger *zap.Logger) *CrawlerHandler {
	return &CrawlerHandler{
		clients: clients,
		logger:  logger,
	}
}

func (h *CrawlerHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	resp, err := h.clients.Crawler.GetCrawlStatus(ctx, &crawlerv1.CrawlStatusRequest{})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *CrawlerHandler) TriggerCrawl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req crawlerv1.TriggerCrawlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Crawler.TriggerCrawl(ctx, &req)
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *CrawlerHandler) writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (h *CrawlerHandler) writeError(w http.ResponseWriter, statusCode int, message string) {
	h.writeJSON(w, statusCode, map[string]string{"error": message})
}

func (h *CrawlerHandler) handleGRPCError(w http.ResponseWriter, err error) {
	h.writeError(w, http.StatusInternalServerError, err.Error())
}
