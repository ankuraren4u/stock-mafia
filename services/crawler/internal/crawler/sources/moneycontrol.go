package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

type MoneycontrolAdapter struct {
	*BaseAdapter
}

type mcStockListResponse struct {
	Data []struct {
		Symbol  string `json:"symbol"`
		Name    string `json:"name"`
		Exch    string `json:"exch"`
		ExchSym string `json:"exch_sym"`
	} `json:"data"`
}

func (m *MoneycontrolAdapter) Name() string {
	return "moneycontrol"
}

func (m *MoneycontrolAdapter) RateLimit() int {
	return 4
}

func (m *MoneycontrolAdapter) HealthCheck(ctx context.Context) error {
	url := "https://www.moneycontrol.com/mc/widget/stockinfo/getStockInfo?scId=RELIANCE"
	_, err := m.fetch(ctx, url)
	return err
}

func (m *MoneycontrolAdapter) FetchQuote(ctx context.Context, symbol string, market string) (*Quote, error) {
	url := fmt.Sprintf("https://www.moneycontrol.com/mc/widget/stockinfo/getStockInfo?scId=%s", symbol)

	body, err := m.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("moneycontrol fetch failed: %w", err)
	}

	var result struct {
		Result struct {
			LastPrice  float64 `json:"lastPrice"`
			Open       float64 `json:"open"`
			High       float64 `json:"high"`
			Low        float64 `json:"low"`
			Volume     int64   `json:"volume"`
			Change     float64 `json:"change"`
			PChange     float64 `json:"pChange"`
			PrevClose  float64 `json:"prevClose"`
			MktCap     float64 `json:"mktCap"`
		} `json:"result"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse moneycontrol response: %w", err)
	}

	return &Quote{
		Symbol:         symbol,
		Last:           result.Result.LastPrice,
		Bid:            result.Result.LastPrice,
		Ask:            result.Result.LastPrice,
		DayHigh:        result.Result.High,
		DayLow:         result.Result.Low,
		PreviousClose:  result.Result.PrevClose,
		Volume:         result.Result.Volume,
		MarketCap:      result.Result.MktCap,
		Currency:       "INR",
		Timestamp:      time.Now(),
		Source:         "moneycontrol",
	}, nil
}

func (m *MoneycontrolAdapter) FetchCandles(ctx context.Context, symbol string, market string) ([]Candle, error) {
	url := fmt.Sprintf("https://www.moneycontrol.com/mc/widget/stockinfo/getStockInfo?scId=%s", symbol)

	body, err := m.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("moneycontrol candle fetch failed: %w", err)
	}

	var result struct {
		Result struct {
			Open  float64 `json:"open"`
			High  float64 `json:"high"`
			Low   float64 `json:"low"`
			Close float64 `json:"close"`
			Volume int64   `json:"volume"`
		} `json:"result"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse moneycontrol response: %w", err)
	}

	candle := Candle{
		Symbol:    symbol,
		Open:      result.Result.Open,
		High:      result.Result.High,
		Low:       result.Result.Low,
		Close:     result.Result.Close,
		Volume:    result.Result.Volume,
		Timestamp: time.Now(),
		Source:    "moneycontrol",
	}

	return []Candle{candle}, nil
}

func (m *MoneycontrolAdapter) FetchFundamentals(ctx context.Context, symbol string) (*Fundamentals, error) {
	return nil, fmt.Errorf("moneycontrol does not support fundamentals")
}

func (m *MoneycontrolAdapter) FetchStocksList(ctx context.Context, exchange string) ([]Stock, error) {
	url := "https://www.moneycontrol.com/markets/indian-indices/top-500-companies-list-of-companies-on-bse"

	body, err := m.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("moneycontrol stocks fetch failed: %w", err)
	}

	re := regexp.MustCompile(`"stockName"\s*:\s*"([^"]+)"`)
	matches := re.FindAllStringSubmatch(string(body), -1)

	var stocks []Stock
	seen := make(map[string]bool)
	for _, match := range matches {
		if len(match) >= 2 {
			name := strings.TrimSpace(match[1])
			if name != "" && !seen[name] {
				seen[name] = true
				stocks = append(stocks, Stock{
					Symbol:   name,
					Name:     name,
					Exchange: exchange,
				})
			}
		}
	}

	return stocks, nil
}
