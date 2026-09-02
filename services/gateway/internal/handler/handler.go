package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	crawlerv1 "github.com/stockmafia/trading-app/proto/stockmafia/crawler/v1"
	pricev1 "github.com/stockmafia/trading-app/proto/stockmafia/price/v1"
	analyticsv1 "github.com/stockmafia/trading-app/proto/stockmafia/analytics/v1"
	alertv1 "github.com/stockmafia/trading-app/proto/stockmafia/alert/v1"
	portfoliov1 "github.com/stockmafia/trading-app/proto/stockmafia/portfolio/v1"
)

type GRPCClients struct {
	Crawler   crawlerv1.CrawlerServiceClient
	Price     pricev1.PriceServiceClient
	Analytics analyticsv1.AnalyticsServiceClient
	Alert     alertv1.AlertServiceClient
	Portfolio portfoliov1.PortfolioServiceClient
}

type Handler struct {
	clients *GRPCClients
}

func New(clients *GRPCClients) *Handler {
	return &Handler{clients: clients}
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]interface{}{
		"status":  "ok",
		"service": "stockmafia-gateway",
		"time":    time.Now().UnixMilli(),
	})
}

func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	crawlStatus, err := h.clients.Crawler.GetCrawlStatus(ctx, &crawlerv1.CrawlStatusRequest{})
	if err != nil {
		respondJSON(w, 200, map[string]interface{}{
			"status": "degraded",
			"crawler": "unavailable",
			"time":   time.Now().UnixMilli(),
		})
		return
	}

	respondJSON(w, 200, map[string]interface{}{
		"status":  "ok",
		"crawler": crawlStatus,
		"time":    time.Now().UnixMilli(),
	})
}

func (h *Handler) GetUniverse(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]interface{}{"stocks": []interface{}{}, "total": 0})
}

func (h *Handler) SearchStocks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		respondJSON(w, 200, map[string]interface{}{"results": []interface{}{}})
		return
	}
	respondJSON(w, 200, map[string]interface{}{"query": q, "results": []interface{}{}})
}

func (h *Handler) TrackStock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, 405, "Method not allowed")
		return
	}
	var req struct {
		Yahoo string `json:"yahoo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "Invalid request body")
		return
	}
	respondJSON(w, 200, map[string]string{"yahoo": req.Yahoo, "status": "tracked"})
}

func (h *Handler) GetIndices(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]interface{}{"indices": []interface{}{}})
}

func (h *Handler) GetQuotes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	resp, err := h.clients.Price.GetQuotes(ctx, &pricev1.GetQuotesRequest{})
	if err != nil {
		respondError(w, 502, "Failed to fetch quotes: "+err.Error())
		return
	}

	quotes := make([]map[string]interface{}, 0)
	for _, q := range resp.GetQuotes() {
		quotes = append(quotes, map[string]interface{}{
			"symbol":        q.GetSymbol(),
			"yahoo":         q.GetSymbol(),
			"price":         q.GetClose(),
			"change":        q.GetChange(),
			"changePct":     q.GetChangePercent(),
			"previousClose": q.GetPreviousClose(),
			"volume":        q.GetVolume(),
			"currency":      q.GetCurrency(),
		})
	}
	respondJSON(w, 200, map[string]interface{}{"quotes": quotes})
}

func (h *Handler) GetStockDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		respondError(w, 400, "Missing symbol")
		return
	}
	symbol := parts[len(parts)-1]

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	resp, err := h.clients.Price.GetStockDetail(ctx, &pricev1.GetStockDetailRequest{Yahoo: symbol})
	if err != nil {
		respondError(w, 502, "Failed to fetch stock detail: "+err.Error())
		return
	}

	respondJSON(w, 200, map[string]interface{}{
		"stock":  resp.GetStock(),
		"quote":  resp.GetQuote(),
		"candles": resp.GetCandles(),
		"fundamentals": resp.GetFundamentals(),
		"news":   resp.GetNews(),
	})
}

func (h *Handler) GetSignals(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	resp, err := h.clients.Analytics.GetSignals(ctx, &analyticsv1.GetSignalsRequest{})
	if err != nil {
		respondError(w, 502, "Failed to fetch signals: "+err.Error())
		return
	}

	respondJSON(w, 200, map[string]interface{}{"signals": resp.GetSignals()})
}

func (h *Handler) GetWatchlist(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.clients.Alert.GetWatchlist(ctx, &alertv1.GetWatchlistRequest{})
	if err != nil {
		respondError(w, 502, "Failed to fetch watchlist: "+err.Error())
		return
	}

	respondJSON(w, 200, map[string]interface{}{"watchlist": resp.GetStocks()})
}

func (h *Handler) GetPortfolio(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "paper"
	}

	resp, err := h.clients.Portfolio.GetPortfolio(ctx, &portfoliov1.GetPortfolioRequest{Mode: mode})
	if err != nil {
		respondError(w, 502, "Failed to fetch portfolio: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) PlacePaperOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, 405, "Method not allowed")
		return
	}

	var req struct {
		Yahoo    string  `json:"yahoo"`
		Side     string  `json:"side"`
		Quantity int32   `json:"quantity"`
		Price    float64 `json:"price"`
		Mode     string  `json:"mode"`
		Note     string  `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "Invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.clients.Portfolio.PlaceOrder(ctx, &portfoliov1.PlaceOrderRequest{
		Yahoo:    req.Yahoo,
		Side:     req.Side,
		Quantity: req.Quantity,
		Price:    req.Price,
		Mode:     req.Mode,
		Note:     req.Note,
	})
	if err != nil {
		respondError(w, 502, "Failed to place order: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) GetAlgoConfig(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.clients.Analytics.GetAlgoConfig(ctx, &analyticsv1.GetAlgoConfigRequest{})
	if err != nil {
		respondError(w, 502, "Failed to fetch algo config: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) RunAlgoSuggest(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	resp, err := h.clients.Analytics.GenerateSuggestions(ctx, &analyticsv1.GenerateSuggestionsRequest{})
	if err != nil {
		respondError(w, 502, "Failed to generate suggestions: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) ExecuteTicket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, 405, "Method not allowed")
		return
	}

	var req struct {
		SuggestionID int64  `json:"suggestion_id"`
		Mode         string `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "Invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	resp, err := h.clients.Analytics.ExecuteSuggestion(ctx, &analyticsv1.ExecuteSuggestionRequest{
		SuggestionId: req.SuggestionID,
		Mode:         req.Mode,
	})
	if err != nil {
		respondError(w, 502, "Failed to execute: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) CrawlerStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.clients.Crawler.GetCrawlStatus(ctx, &crawlerv1.CrawlStatusRequest{})
	if err != nil {
		respondError(w, 502, "Failed to get crawler status: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) TriggerCrawl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, 405, "Method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.clients.Crawler.StartCrawl(ctx, &crawlerv1.StartCrawlRequest{
		Reason: "manual",
		Full:   true,
	})
	if err != nil {
		respondError(w, 502, "Failed to trigger crawl: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) CrawlSymbol(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		respondError(w, 400, "Missing symbol")
		return
	}
	symbol := parts[len(parts)-1]

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	resp, err := h.clients.Crawler.CrawlSymbol(ctx, &crawlerv1.CrawlSymbolRequest{Yahoo: symbol})
	if err != nil {
		respondError(w, 502, "Failed to crawl symbol: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) GetAlerts(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.clients.Alert.GetAlerts(ctx, &alertv1.GetAlertsRequest{})
	if err != nil {
		respondError(w, 502, "Failed to fetch alerts: "+err.Error())
		return
	}

	respondJSON(w, 200, map[string]interface{}{"alerts": resp.GetAlerts()})
}

func (h *Handler) GetDeskWatchlist(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.clients.Alert.GetWatchlist(ctx, &alertv1.GetWatchlistRequest{})
	if err != nil {
		respondError(w, 502, "Failed to fetch watchlist: "+err.Error())
		return
	}

	respondJSON(w, 200, map[string]interface{}{"watchlist": resp.GetStocks()})
}

func (h *Handler) AddJournal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, 405, "Method not allowed")
		return
	}

	var req struct {
		Yahoo  string `json:"yahoo"`
		Symbol string `json:"symbol"`
		Thesis string `json:"thesis"`
		Side   string `json:"side"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "Invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.clients.Portfolio.AddJournalEntry(ctx, &portfoliov1.AddJournalEntryRequest{
		Yahoo:  req.Yahoo,
		Symbol: req.Symbol,
		Thesis: req.Thesis,
		Side:   req.Side,
	})
	if err != nil {
		respondError(w, 502, "Failed to add journal entry: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) RunScreener(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, 405, "Method not allowed")
		return
	}

	var req struct {
		Filters  map[string]string `json:"filters"`
		SortBy   string            `json:"sort_by"`
		SortDesc bool              `json:"sort_desc"`
		Limit    int32             `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, 400, "Invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	resp, err := h.clients.Analytics.RunScreener(ctx, &analyticsv1.RunScreenerRequest{
		Filters:  req.Filters,
		SortBy:   req.SortBy,
		SortDesc: req.SortDesc,
		Limit:    req.Limit,
	})
	if err != nil {
		respondError(w, 502, "Failed to run screener: "+err.Error())
		return
	}

	respondJSON(w, 200, resp)
}

func (h *Handler) HandleSSE(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			data, _ := json.Marshal(map[string]interface{}{
				"type": "heartbeat",
				"time": time.Now().UnixMilli(),
			})
			_, err := w.Write([]byte("data: " + string(data) + "\n\n"))
			if err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request, upgrader interface{}) {
	respondJSON(w, 501, map[string]string{
		"error": "WebSocket should be handled by the Price service directly",
		"ws_url": "ws://price:8082/ws",
	})
}
