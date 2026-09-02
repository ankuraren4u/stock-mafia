package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/stockmafia/trading-app/services/gateway/internal/grpc"
	commonv1 "github.com/stockmafia/trading-app/proto/stockmafia/common/v1"
	crawlerv1 "github.com/stockmafia/trading-app/proto/stockmafia/crawler/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type MarketHandler struct {
	clients *grpc.Clients
	logger  *zap.Logger
}

func NewMarketHandler(clients *grpc.Clients, logger *zap.Logger) *MarketHandler {
	return &MarketHandler{
		clients: clients,
		logger:  logger,
	}
}

func (h *MarketHandler) GetStocks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	exchange := r.URL.Query().Get("exchange")
	sector := r.URL.Query().Get("sector")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	resp, err := h.clients.Crawler.GetStocks(ctx, &crawlerv1.GetStocksRequest{
		Exchange: exchange,
		Sector:   sector,
		Pagination: &commonv1.PaginationRequest{
			Page:     int32(page),
			PageSize: int32(pageSize),
		},
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *MarketHandler) GetStock(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	symbol := r.URL.Query().Get("symbol")

	if symbol == "" {
		h.writeError(w, http.StatusBadRequest, "symbol is required")
		return
	}

	resp, err := h.clients.Crawler.GetStock(ctx, &crawlerv1.GetStockRequest{
		Symbol: symbol,
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *MarketHandler) GetQuotes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	symbolsParam := r.URL.Query().Get("symbols")

	if symbolsParam == "" {
		h.writeError(w, http.StatusBadRequest, "symbols parameter is required")
		return
	}

	symbols := splitAndTrim(symbolsParam)

	resp, err := h.clients.Crawler.GetQuotes(ctx, &crawlerv1.GetQuotesRequest{
		Symbols: symbols,
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *MarketHandler) GetQuote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	symbol := r.URL.Query().Get("symbol")

	if symbol == "" {
		h.writeError(w, http.StatusBadRequest, "symbol is required")
		return
	}

	resp, err := h.clients.Crawler.GetQuote(ctx, &crawlerv1.GetQuoteRequest{
		Symbol: symbol,
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *MarketHandler) GetCandles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	symbol := r.URL.Query().Get("symbol")
	interval := r.URL.Query().Get("interval")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	if symbol == "" {
		h.writeError(w, http.StatusBadRequest, "symbol is required")
		return
	}

	if interval == "" {
		interval = "1d"
	}

	resp, err := h.clients.Crawler.GetCandles(ctx, &crawlerv1.GetCandlesRequest{
		Symbol:   symbol,
		Interval: interval,
		Limit:    int32(limit),
	})
	if err != nil {
		h.handleGRPCError(w, err)
		return
	}

	h.writeJSON(w, http.StatusOK, resp)
}

func (h *MarketHandler) writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (h *MarketHandler) writeError(w http.ResponseWriter, statusCode int, message string) {
	h.writeJSON(w, statusCode, map[string]string{"error": message})
}

func (h *MarketHandler) handleGRPCError(w http.ResponseWriter, err error) {
	st, ok := status.FromError(err)
	if !ok {
		h.writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	switch st.Code() {
	case codes.NotFound:
		h.writeError(w, http.StatusNotFound, st.Message())
	case codes.InvalidArgument:
		h.writeError(w, http.StatusBadRequest, st.Message())
	case codes.PermissionDenied:
		h.writeError(w, http.StatusForbidden, st.Message())
	default:
		h.writeError(w, http.StatusInternalServerError, st.Message())
	}
}

func splitAndTrim(s string) []string {
	var result []string
	for _, item := range splitCSV(s) {
		trimmed := trimSpace(item)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func splitCSV(s string) []string {
	var result []string
	current := ""
	for _, c := range s {
		if c == ',' {
			result = append(result, current)
			current = ""
		} else {
			current += string(c)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && s[start] == ' ' {
		start++
	}
	for end > start && s[end-1] == ' ' {
		end--
	}
	return s[start:end]
}
