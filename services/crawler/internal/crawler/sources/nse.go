package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type NSEAdapter struct {
	*BaseAdapter
	cookieOnce sync.Once
	cookies    []*http.Cookie
	cookieErr  error
}

func (n *NSEAdapter) Name() string {
	return "nse"
}

func (n *NSEAdapter) RateLimit() int {
	return 3
}

func (n *NSEAdapter) HealthCheck(ctx context.Context) error {
	url := "https://www.nseindia.com/api/quote-equity?symbol=RELIANCE"
	_, err := n.fetchWithCookies(ctx, url)
	return err
}

func (n *NSEAdapter) FetchQuote(ctx context.Context, symbol string, market string) (*Quote, error) {
	url := fmt.Sprintf("https://www.nseindia.com/api/quote-equity?symbol=%s", symbol)

	body, err := n.fetchWithCookies(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("nse fetch failed: %w", err)
	}

	var result struct {
		PriceInfo struct {
			LastPrice   float64 `json:"lastPrice"`
			Open        float64 `json:"open"`
			High        float64 `json:"high"`
			Low         float64 `json:"low"`
			Change      float64 `json:"change"`
			PChange      float64 `json:"pChange"`
			Volume      int64   `json:"totalTradedVolume"`
			PreviousClose float64 `json:"previousClose"`
		} `json:"priceInfo"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse NSE response: %w", err)
	}

	return &Quote{
		Symbol:         symbol,
		Last:           result.PriceInfo.LastPrice,
		Bid:            result.PriceInfo.LastPrice,
		Ask:            result.PriceInfo.LastPrice,
		DayHigh:        result.PriceInfo.High,
		DayLow:         result.PriceInfo.Low,
		PreviousClose:  result.PriceInfo.PreviousClose,
		Volume:         result.PriceInfo.Volume,
		Currency:       "INR",
		Timestamp:      time.Now(),
		Source:         "nse",
	}, nil
}

func (n *NSEAdapter) FetchCandles(ctx context.Context, symbol string, market string) ([]Candle, error) {
	url := fmt.Sprintf("https://www.nseindia.com/api/historical/cm/equity?symbol=%s&from=%s&to=%s",
		symbol,
		time.Now().AddDate(0, 0, -730).Format("02-01-2006"),
		time.Now().Format("02-01-2006"),
	)

	body, err := n.fetchWithCookies(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("nse candle fetch failed: %w", err)
	}

	var result struct {
		Data []struct {
			Date                string  `json:"Date"`
			Open                float64 `json:"Open"`
			High                float64 `json:"High"`
			Low                 float64 `json:"Low"`
			Close               float64 `json:"Close"`
			TotalTradedVolume   int64   `json:"TotalTradedVolume"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse NSE response: %w", err)
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("no candle data returned for %s", symbol)
	}

	var candles []Candle
	for _, record := range result.Data {
		ts, err := time.Parse("02-Jan-2006", record.Date)
		if err != nil {
			continue
		}

		candles = append(candles, Candle{
			Symbol:    symbol,
			Open:      record.Open,
			High:      record.High,
			Low:       record.Low,
			Close:     record.Close,
			Volume:    record.TotalTradedVolume,
			Timestamp: ts,
			Source:    "nse",
		})
	}

	return candles, nil
}

func (n *NSEAdapter) FetchFundamentals(ctx context.Context, symbol string) (*Fundamentals, error) {
	url := fmt.Sprintf("https://www.nseindia.com/api/quote-equity?symbol=%s", symbol)

	body, err := n.fetchWithCookies(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("nse fundamentals fetch failed: %w", err)
	}

	var result struct {
		PriceInfo struct {
			LastPrice float64 `json:"lastPrice"`
		} `json:"priceInfo"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse NSE response: %w", err)
	}

	return &Fundamentals{
		Symbol:    symbol,
		MarketCap: 0,
		Source:    "nse",
		Timestamp: time.Now(),
	}, nil
}

func (n *NSEAdapter) fetchWithCookies(ctx context.Context, url string) ([]byte, error) {
	n.cookieOnce.Do(func() {
		cookieReq, err := http.NewRequestWithContext(ctx, "GET", "https://www.nseindia.com", nil)
		if err != nil {
			n.cookieErr = err
			return
		}
		cookieReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		cookieReq.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

		resp, err := n.getHTTPClient().Do(cookieReq)
		if err != nil {
			n.cookieErr = err
			return
		}
		defer resp.Body.Close()

		n.cookies = resp.Cookies()
	})

	if n.cookieErr != nil {
		return nil, n.cookieErr
	}

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Referer", "https://www.nseindia.com/")

	for _, cookie := range n.cookies {
		req.AddCookie(cookie)
	}

	resp, err := n.getHTTPClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("NSE returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body[:min(len(body), 200)])))
	}

	return body, nil
}
