package sources

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type SourceAdapter interface {
	Name() string
	FetchCandles(ctx context.Context, symbol string, market string) ([]Candle, error)
	FetchQuote(ctx context.Context, symbol string, market string) (*Quote, error)
	FetchFundamentals(ctx context.Context, symbol string) (*Fundamentals, error)
	RateLimit() int
	HealthCheck(ctx context.Context) error
}

type Quote struct {
	Symbol         string
	Last           float64
	Bid            float64
	Ask            float64
	Volume         int64
	PreviousClose  float64
	DayHigh        float64
	DayLow         float64
	MarketCap      float64
	Currency       string
	Timestamp      time.Time
	Source         string
}

type Candle struct {
	Symbol    string
	Open      float64
	High      float64
	Low       float64
	Close     float64
	Volume    int64
	Timestamp time.Time
	Source    string
}

type Stock struct {
	Symbol   string
	Name     string
	Exchange string
}

type Fundamentals struct {
	Symbol            string
	PE                float64
	ForwardPE         float64
	PB                float64
	DividendYield     float64
	MarketCap         float64
	Beta              float64
	EPS               float64
	ROE               float64
	DebtToEquity      float64
	ProfitMargins     float64
	RevenueGrowth     float64
	EarningsGrowth    float64
	TargetMean        float64
	Recommendation    string
	Week52High        float64
	Week52Low         float64
	Revenue           float64
	NetIncome         float64
	FreeCashflow      float64
	OperatingMargins  float64
	GrossMargins      float64
	Source            string
	Timestamp         time.Time
}

type BaseAdapter struct {
	httpClient *http.Client
	transport  *http.Transport
	proxyURL   *url.URL
}

func NewBaseAdapter() *BaseAdapter {
	return &BaseAdapter{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func NewBaseAdapterWithProxy(proxyAddr string) *BaseAdapter {
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: false},
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}

	if proxyAddr != "" {
		proxyURL, _ := url.Parse(proxyAddr)
		transport.Proxy = http.ProxyURL(proxyURL)
	}

	return &BaseAdapter{
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: transport,
		},
		transport: transport,
	}
}

func (b *BaseAdapter) fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch URL %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status code %d for URL %s: %s", resp.StatusCode, url, string(body[:min(len(body), 200)]))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	return body, nil
}

func (b *BaseAdapter) fetchWithHeaders(ctx context.Context, url string, headers map[string]string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch URL: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	return body, nil
}

func (b *BaseAdapter) getHTTPClient() *http.Client {
	return b.httpClient
}

func CreateAdapter(source string) SourceAdapter {
	base := NewBaseAdapter()
	switch strings.ToLower(source) {
	case "stooq":
		return &StooqAdapter{base}
	case "yahoo":
		return &YahooAdapter{base}
	case "finnhub":
		return &FinnhubAdapter{base}
	case "nse":
		return &NSEAdapter{BaseAdapter: base}
	case "moneycontrol":
		return &MoneycontrolAdapter{base}
	default:
		return nil
	}
}

func CreateAdapterWithProxy(source, proxyAddr string) SourceAdapter {
	base := NewBaseAdapterWithProxy(proxyAddr)
	switch strings.ToLower(source) {
	case "stooq":
		return &StooqAdapter{base}
	case "yahoo":
		return &YahooAdapter{base}
	case "finnhub":
		return &FinnhubAdapter{base}
	case "nse":
		return &NSEAdapter{BaseAdapter: base}
	case "moneycontrol":
		return &MoneycontrolAdapter{base}
	default:
		return nil
	}
}

func ParseFloat(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}

func ParseInt64(s string) int64 {
	var i int64
	fmt.Sscanf(s, "%d", &i)
	return i
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
