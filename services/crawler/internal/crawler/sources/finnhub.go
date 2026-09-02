package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type FinnhubAdapter struct {
	*BaseAdapter
}

type finnhubQuoteResponse struct {
	C  float64 `json:"c"`
	D  float64 `json:"d"`
	Dp float64 `json:"dp"`
	H  float64 `json:"h"`
	L  float64 `json:"l"`
	O  float64 `json:"o"`
	P  float64 `json:"p"`
	Pc float64 `json:"pc"`
	V  int64   `json:"v"`
	T  int64   `json:"t"`
}

type finnhubCandleResponse struct {
	S     string    `json:"s"`
	C     []float64 `json:"c"`
	H     []float64 `json:"h"`
	L     []float64 `json:"l"`
	O     []float64 `json:"o"`
	V     []int64   `json:"v"`
	T     []int64   `json:"t"`
}

type finnhubProfileResponse struct {
	Name            string  `json:"name"`
	Ticker          string  `json:"ticker"`
	Exchange        string  `json:"exchange"`
	Currency        string  `json:"currency"`
	MarketCapitalization float64 `json:"marketCapitalization"`
	ShareOutstanding     float64 `json:"shareOutstanding"`
	IpoDate         string  `json:"ipo"`
}

func (f *FinnhubAdapter) Name() string {
	return "finnhub"
}

func (f *FinnhubAdapter) RateLimit() int {
	return 60
}

func (f *FinnhubAdapter) HealthCheck(ctx context.Context) error {
	apiKey := os.Getenv("FINNHUB_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("FINNHUB_API_KEY not set")
	}
	url := fmt.Sprintf("https://finnhub.io/api/v1/quote?symbol=AAPL&token=%s", apiKey)
	_, err := f.fetch(ctx, url)
	return err
}

func (f *FinnhubAdapter) FetchQuote(ctx context.Context, symbol string, market string) (*Quote, error) {
	apiKey := os.Getenv("FINNHUB_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("FINNHUB_API_KEY not set")
	}

	ticker := mapToFinnhubTicker(symbol, market)
	url := fmt.Sprintf("https://finnhub.io/api/v1/quote?symbol=%s&token=%s", ticker, apiKey)

	body, err := f.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("finnhub fetch failed: %w", err)
	}

	var result finnhubQuoteResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse finnhub response: %w", err)
	}

	if result.C == 0 && result.H == 0 && result.L == 0 {
		return nil, fmt.Errorf("no data returned for %s", symbol)
	}

	return &Quote{
		Symbol:         symbol,
		Last:           result.C,
		Bid:            result.O,
		Ask:            result.H,
		DayHigh:        result.H,
		DayLow:         result.L,
		PreviousClose:  result.Pc,
		Volume:         result.V,
		Currency:       "USD",
		Timestamp:      time.Now(),
		Source:         "finnhub",
	}, nil
}

func (f *FinnhubAdapter) FetchCandles(ctx context.Context, symbol string, market string) ([]Candle, error) {
	apiKey := os.Getenv("FINNHUB_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("FINNHUB_API_KEY not set")
	}

	ticker := mapToFinnhubTicker(symbol, market)

	from := time.Now().AddDate(0, 0, -730).Unix()
	to := time.Now().Unix()

	url := fmt.Sprintf("https://finnhub.io/api/v1/stock/candle?symbol=%s&resolution=D&from=%d&to=%d&token=%s",
		ticker, from, to, apiKey)

	body, err := f.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("finnhub candle fetch failed: %w", err)
	}

	var result finnhubCandleResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse finnhub response: %w", err)
	}

	if result.S != "ok" || len(result.C) == 0 {
		return nil, fmt.Errorf("no candle data returned for %s", symbol)
	}

	var candles []Candle
	for i := range result.C {
		candles = append(candles, Candle{
			Symbol:    symbol,
			Open:      result.O[i],
			High:      result.H[i],
			Low:       result.L[i],
			Close:     result.C[i],
			Volume:    result.V[i],
			Timestamp: time.Unix(result.T[i], 0),
			Source:    "finnhub",
		})
	}

	return candles, nil
}

func (f *FinnhubAdapter) FetchFundamentals(ctx context.Context, symbol string) (*Fundamentals, error) {
	apiKey := os.Getenv("FINNHUB_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("FINNHUB_API_KEY not set")
	}

	ticker := mapToFinnhubTicker(symbol, "US")

	profileURL := fmt.Sprintf("https://finnhub.io/api/v1/stock/profile2?symbol=%s&token=%s", ticker, apiKey)
	profileBody, err := f.fetch(ctx, profileURL)
	if err != nil {
		return nil, fmt.Errorf("finnhub profile fetch failed: %w", err)
	}

	var profile finnhubProfileResponse
	if err := json.Unmarshal(profileBody, &profile); err != nil {
		return nil, fmt.Errorf("failed to parse finnhub profile: %w", err)
	}

	return &Fundamentals{
		Symbol:    symbol,
		MarketCap: profile.MarketCapitalization,
		Source:    "finnhub",
		Timestamp: time.Now(),
	}, nil
}

func mapToFinnhubTicker(symbol, market string) string {
	symbol = strings.ToUpper(symbol)
	if market == "IN" {
		if strings.HasSuffix(symbol, ".NS") || strings.HasSuffix(symbol, ".BO") {
			return symbol
		}
		return symbol + ".NS"
	}
	return symbol
}
