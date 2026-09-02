package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.uber.org/zap"
)

const (
	kiteAPIBase    = "https://api.kite.trade"
	kiteConnectURL = "https://kite.zerodha.com/connect"
)

type KiteService struct {
	apiKey      string
	apiSecret   string
	redirectURL string
	logger      *zap.Logger
	client      *http.Client
	accessToken string
	publicToken string
	expiresAt   time.Time
}

type KiteConfig struct {
	APIKey      string
	APISecret   string
	RedirectURL string
}

type KiteLoginResponse struct {
	RequestToken  string `json:"request_token"`
	AccessToken   string `json:"access_token"`
	PublicToken   string `json:"public_token"`
	ExpiresIn     int    `json:"expires_in"`
LoginTime     string `json:"login_time"`
}

type KiteOrderResponse struct {
	Status       string  `json:"status"`
	OrderID      string  `json:"order_id"`
	Exchange     string  `json:"exchange"`
	Tradingsymbol string `json:"tradingsymbol"`
	OrderType    string  `json:"order_type"`
	TransactionType string `json:"transaction_type"`
	Quantity     float64 `json:"quantity"`
	Price        float64 `json:"price"`
	TriggerPrice float64 `json:"trigger_price"`
}

type KitePosition struct {
	Exchange     string  `json:"exchange"`
	Tradingsymbol string `json:"tradingsymbol"`
	InstrumentToken int `json:"instrument_token"`
	Quantity     float64 `json:"quantity"`
	AveragePrice float64  `json:"average_price"`
	LastPrice    float64  `json:"last_price"`
	PnL          float64  `json:"pnl"`
}

type KiteHolding struct {
	Exchange     string  `json:"exchange"`
	Tradingsymbol string `json:"tradingsymbol"`
	InstrumentToken int `json:"instrument_token"`
	Quantity     float64 `json:"quantity"`
	AveragePrice float64  `json:"average_price"`
	LastPrice    float64  `json:"last_price"`
	PnL          float64  `json:"pnl"`
}

type KiteGTT struct {
	ID           string  `json:"id"`
	Tradingsymbol string `json:"tradingsymbol"`
	Exchange     string  `json:"exchange"`
	TriggerType  string  `json:"trigger_type"`
	Quantity     float64 `json:"quantity"`
	Price        float64 `json:"price"`
	Status       string  `json:"status"`
}

func NewKiteService(cfg KiteConfig, logger *zap.Logger) *KiteService {
	return &KiteService{
		apiKey:      cfg.APIKey,
		apiSecret:   cfg.APISecret,
		redirectURL: cfg.RedirectURL,
		logger:      logger,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (k *KiteService) GetLoginURL() string {
	return fmt.Sprintf("%s/login?api_key=%s", kiteConnectURL, k.apiKey)
}

func (k *KiteService) GenerateSession(ctx context.Context, requestToken string) (*KiteLoginResponse, error) {
	if k.apiKey == "" || k.apiSecret == "" {
		return nil, fmt.Errorf("kite API key and secret are required")
	}

	checksum := fmt.Sprintf("%s%s%s", k.apiKey, requestToken, k.apiSecret)

	data := url.Values{}
	data.Set("api_key", k.apiKey)
	data.Set("request_token", requestToken)
	data.Set("checksum", checksum)

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/session/token", kiteAPIBase), strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := k.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to generate session: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kite API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data KiteLoginResponse `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	k.accessToken = result.Data.AccessToken
	k.publicToken = result.Data.PublicToken
	if result.Data.ExpiresIn > 0 {
		k.expiresAt = time.Now().Add(time.Duration(result.Data.ExpiresIn) * time.Second)
	}

	k.logger.Info("kite session generated",
		zap.String("login_time", result.Data.LoginTime),
		zap.Time("expires_at", k.expiresAt),
	)

	return &result.Data, nil
}

func (k *KiteService) SetAccessToken(token string) {
	k.accessToken = token
	k.logger.Info("kite access token set manually")
}

func (k *KiteService) isAuthenticated() bool {
	if k.accessToken == "" {
		return false
	}
	if !k.expiresAt.IsZero() && time.Now().After(k.expiresAt) {
		return false
	}
	return true
}

func (k *KiteService) PlaceOrder(ctx context.Context, order OrderRequest) (*OrderResponse, error) {
	if !k.isAuthenticated() {
		return nil, fmt.Errorf("not authenticated with Kite")
	}

	params := url.Values{}
	params.Set("exchange", order.Exchange)
	params.Set("tradingsymbol", order.Symbol)
	params.Set("transaction_type", order.Side)
	params.Set("order_type", order.OrderType)
	params.Set("quantity", fmt.Sprintf("%.0f", order.Quantity))
	params.Set("product", order.Product)
	params.Set("duration", order.Duration)

	if order.OrderType == "LIMIT" || order.OrderType == "L" {
		params.Set("price", fmt.Sprintf("%.2f", order.Price))
	}
	if order.OrderType == "SL" || order.OrderType == "SL-M" || order.OrderType == "SLM" {
		params.Set("trigger_price", fmt.Sprintf("%.2f", order.TriggerPrice))
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/orders/regular", kiteAPIBase), strings.NewReader(params.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("token %s:%s", k.accessToken, k.publicToken))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := k.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to place order: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kite API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data struct {
			OrderID string `json:"order_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	k.logger.Info("order placed via Kite",
		zap.String("order_id", result.Data.OrderID),
		zap.String("symbol", order.Symbol),
		zap.String("side", order.Side),
	)

	return &OrderResponse{
		OrderID: result.Data.OrderID,
		Status:  "placed",
		Message: "Order placed successfully",
	}, nil
}

func (k *KiteService) GetPositions(ctx context.Context) ([]Position, error) {
	if !k.isAuthenticated() {
		return nil, fmt.Errorf("not authenticated with Kite")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/portfolio/positions", kiteAPIBase), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("token %s:%s", k.accessToken, k.publicToken))

	resp, err := k.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get positions: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kite API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data struct {
			Net []KitePosition `json:"net"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	var positions []Position
	for _, p := range result.Data.Net {
		positions = append(positions, Position{
			Symbol:    p.Tradingsymbol,
			Quantity:  p.Quantity,
			AvgPrice:  p.AveragePrice,
			LTP:       p.LastPrice,
			PnL:       p.PnL,
		})
	}

	return positions, nil
}

func (k *KiteService) GetHoldings(ctx context.Context) ([]KiteHolding, error) {
	if !k.isAuthenticated() {
		return nil, fmt.Errorf("not authenticated with Kite")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/portfolio/holdings", kiteAPIBase), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("token %s:%s", k.accessToken, k.publicToken))

	resp, err := k.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get holdings: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kite API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []KiteHolding `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return result.Data, nil
}

func (k *KiteService) GetOrders(ctx context.Context) ([]OrderResponse, error) {
	if !k.isAuthenticated() {
		return nil, fmt.Errorf("not authenticated with Kite")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/orders", kiteAPIBase), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("token %s:%s", k.accessToken, k.publicToken))

	resp, err := k.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get orders: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kite API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []struct {
			OrderID      string `json:"order_id"`
			Status       string `json:"status"`
			Tradingsymbol string `json:"tradingsymbol"`
			TransactionType string `json:"transaction_type"`
			OrderType    string `json:"order_type"`
			Quantity     float64 `json:"quantity"`
			Price        float64 `json:"price"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	var orders []OrderResponse
	for _, o := range result.Data {
		orders = append(orders, OrderResponse{
			OrderID: o.OrderID,
			Status:  o.Status,
			Message: fmt.Sprintf("%s %s %s", o.TransactionType, o.Tradingsymbol, o.Status),
		})
	}

	return orders, nil
}

func (k *KiteService) CancelOrder(ctx context.Context, orderID string) error {
	if !k.isAuthenticated() {
		return fmt.Errorf("not authenticated with Kite")
	}

	req, err := http.NewRequestWithContext(ctx, "DELETE", fmt.Sprintf("%s/orders/regular/%s", kiteAPIBase, orderID), nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("token %s:%s", k.accessToken, k.publicToken))

	resp, err := k.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to cancel order: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("kite API error (status %d): %s", resp.StatusCode, string(body))
	}

	k.logger.Info("order cancelled via Kite", zap.String("order_id", orderID))
	return nil
}

func (k *KiteService) GetMargins(ctx context.Context) (map[string]float64, error) {
	if !k.isAuthenticated() {
		return nil, fmt.Errorf("not authenticated with Kite")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/user/margins", kiteAPIBase), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("token %s:%s", k.accessToken, k.publicToken))

	resp, err := k.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get margins: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kite API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data struct {
			Equity struct {
				Available struct {
					Cash float64 `json:"cash"`
				} `json:"available"`
			} `json:"equity"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return map[string]float64{
		"cash": result.Data.Equity.Available.Cash,
	}, nil
}

type OrderRequest struct {
	Symbol       string
	Side         string
	OrderType    string
	Quantity     float64
	Price        float64
	TriggerPrice float64
	Exchange     string
	Product      string
	Duration     string
}

type OrderResponse struct {
	OrderID string
	Status  string
	Message string
}

type Position struct {
	Symbol   string
	Quantity float64
	AvgPrice float64
	LTP      float64
	PnL      float64
}
