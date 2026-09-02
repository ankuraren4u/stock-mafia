package handler

import (
	"encoding/json"
	"net/http"

	"github.com/stockmafia/trading-app/services/gateway/internal/grpc"
	analyticsv1 "github.com/stockmafia/trading-app/proto/stockmafia/analytics/v1"
	"go.uber.org/zap"
)

type DeskHandler struct {
	clients *grpc.Clients
	logger  *zap.Logger
}

func NewDeskHandler(clients *grpc.Clients, logger *zap.Logger) *DeskHandler {
	return &DeskHandler{
		clients: clients,
		logger:  logger,
	}
}

func (h *DeskHandler) GetSignals(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	symbol := r.URL.Query().Get("symbol")

	req := &analyticsv1.GetSignalsRequest{
		Symbol: symbol,
	}

	resp, err := h.clients.Analytics.GetSignals(ctx, req)
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *DeskHandler) GetStrategies(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	resp, err := h.clients.Analytics.GetStrategies(ctx, &analyticsv1.GetStrategiesRequest{
		ActiveOnly: true,
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *DeskHandler) RunStrategy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req analyticsv1.RunStrategyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	resp, err := h.clients.Analytics.RunStrategy(ctx, &req)
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *DeskHandler) writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (h *DeskHandler) writeError(w http.ResponseWriter, statusCode int, message string) {
	h.writeJSON(w, statusCode, map[string]string{"error": message})
}

func (h *DeskHandler) handleGRPCError(w http.ResponseWriter, err error) {
	h.writeError(w, http.StatusInternalServerError, err.Error())
}
