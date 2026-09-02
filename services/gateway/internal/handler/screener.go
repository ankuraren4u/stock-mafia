package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/stockmafia/trading-app/services/gateway/internal/grpc"
	analyticsv1 "github.com/stockmafia/trading-app/proto/stockmafia/analytics/v1"
	"go.uber.org/zap"
)

type ScreenerHandler struct {
	clients *grpc.Clients
	logger  *zap.Logger
}

func NewScreenerHandler(clients *grpc.Clients, logger *zap.Logger) *ScreenerHandler {
	return &ScreenerHandler{
		clients: clients,
		logger:  logger,
	}
}

func (h *ScreenerHandler) RunScreener(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req analyticsv1.RunScreenerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Analytics.RunScreener(ctx, &req)
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *ScreenerHandler) GetResults(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	req := &analyticsv1.RunScreenerRequest{
		Filters: map[string]string{},
	}

	resp, err := h.clients.Analytics.RunScreener(ctx, req)
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *ScreenerHandler) writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (h *ScreenerHandler) writeError(w http.ResponseWriter, statusCode int, message string) {
	h.writeJSON(w, statusCode, map[string]string{"error": message})
}

func (h *ScreenerHandler) handleGRPCError(w http.ResponseWriter, err error) {
	h.writeError(w, http.StatusInternalServerError, err.Error())
}
