package handler

import (
	"encoding/json"
	"net/http"

	"github.com/stockmafia/trading-app/services/gateway/internal/grpc"
	portfoliov1 "github.com/stockmafia/trading-app/proto/stockmafia/portfolio/v1"
	"go.uber.org/zap"
)

type PaperHandler struct {
	clients *grpc.Clients
	logger  *zap.Logger
}

func NewPaperHandler(clients *grpc.Clients, logger *zap.Logger) *PaperHandler {
	return &PaperHandler{
		clients: clients,
		logger:  logger,
	}
}

func (h *PaperHandler) PlaceOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req portfoliov1.PaperTradeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.IsPaper = true

	ctx := r.Context()
	resp, err := h.clients.Portfolio.PaperTrade(ctx, &req)
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *PaperHandler) GetOrders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := r.Context().Value("user_id").(string)

	resp, err := h.clients.Portfolio.GetOrders(ctx, &portfoliov1.GetOrdersRequest{
		UserId:  userID,
		IsPaper: true,
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *PaperHandler) GetPositions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := r.Context().Value("user_id").(string)

	resp, err := h.clients.Portfolio.GetPositions(ctx, &portfoliov1.GetPositionsRequest{
		UserId:  userID,
		IsPaper: true,
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *PaperHandler) GetPortfolio(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := r.Context().Value("user_id").(string)

	resp, err := h.clients.Portfolio.GetPortfolio(ctx, &portfoliov1.GetPortfolioRequest{
		UserId:  userID,
		IsPaper: true,
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *PaperHandler) writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (h *PaperHandler) writeError(w http.ResponseWriter, statusCode int, message string) {
	h.writeJSON(w, statusCode, map[string]string{"error": message})
}

func (h *PaperHandler) handleGRPCError(w http.ResponseWriter, err error) {
	h.writeError(w, http.StatusInternalServerError, err.Error())
}
