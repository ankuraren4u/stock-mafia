package sources

import (
	"context"
	"encoding/csv"
	"fmt"
	"strings"
	"time"
)

type StooqAdapter struct {
	*BaseAdapter
}

func (s *StooqAdapter) Name() string {
	return "stooq"
}

func (s *StooqAdapter) RateLimit() int {
	return 2
}

func (s *StooqAdapter) HealthCheck(ctx context.Context) error {
	url := "https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv"
	_, err := s.fetch(ctx, url)
	return err
}

func (s *StooqAdapter) FetchQuote(ctx context.Context, symbol string, market string) (*Quote, error) {
	stooqSymbol := mapSymbolToStooq(symbol, market)
	url := fmt.Sprintf("https://stooq.com/q/l/?s=%s&f=sd2t2ohlcv&h&e=csv", stooqSymbol)

	body, err := s.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("stooq fetch failed: %w", err)
	}

	reader := csv.NewReader(strings.NewReader(string(body)))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to parse CSV: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("no data returned for %s", symbol)
	}

	header := records[0]
	data := records[1]

	quote := &Quote{
		Symbol:    symbol,
		Source:    "stooq",
		Timestamp: time.Now(),
		Currency:  currencyForMarket(market),
	}

	for i, h := range header {
		if i >= len(data) {
			break
		}
		switch h {
		case "Close":
			quote.Last = ParseFloat(data[i])
		case "High":
			quote.DayHigh = ParseFloat(data[i])
		case "Low":
			quote.DayLow = ParseFloat(data[i])
		case "Volume":
			quote.Volume = ParseInt64(data[i])
		}
	}

	quote.Bid = quote.Last
	quote.Ask = quote.Last
	return quote, nil
}

func (s *StooqAdapter) FetchCandles(ctx context.Context, symbol string, market string) ([]Candle, error) {
	stooqSymbol := mapSymbolToStooq(symbol, market)
	url := fmt.Sprintf("https://stooq.com/q/d/l/?s=%s&d1=%s&d2=%s&i=d",
		stooqSymbol,
		time.Now().AddDate(-2, 0, 0).Format("20060102"),
		time.Now().Format("20060102"),
	)

	body, err := s.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("stooq candle fetch failed: %w", err)
	}

	reader := csv.NewReader(strings.NewReader(string(body)))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to parse CSV: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("no candle data returned for %s", symbol)
	}

	header := records[0]
	var candles []Candle

	for i := 1; i < len(records); i++ {
		record := records[i]
		if len(record) < 6 {
			continue
		}

		candle := Candle{
			Symbol: symbol,
			Source: "stooq",
		}

		for j, h := range header {
			if j >= len(record) {
				break
			}
			switch h {
			case "Date":
				if t, err := time.Parse("2006-01-02", record[j]); err == nil {
					candle.Timestamp = t
				}
			case "Open":
				candle.Open = ParseFloat(record[j])
			case "High":
				candle.High = ParseFloat(record[j])
			case "Low":
				candle.Low = ParseFloat(record[j])
			case "Close":
				candle.Close = ParseFloat(record[j])
			case "Volume":
				candle.Volume = ParseInt64(record[j])
			}
		}

		if candle.Timestamp.IsZero() {
			continue
		}

		candles = append(candles, candle)
	}

	return candles, nil
}

func (s *StooqAdapter) FetchFundamentals(ctx context.Context, symbol string) (*Fundamentals, error) {
	return nil, fmt.Errorf("stooq does not support fundamentals")
}

func mapSymbolToStooq(symbol, market string) string {
	symbol = strings.ToUpper(symbol)
	if market == "IN" {
		return symbol + ".NS"
	}
	if strings.HasSuffix(symbol, ".NS") || strings.HasSuffix(symbol, ".BO") {
		return symbol
	}
	return symbol + ".US"
}

func currencyForMarket(market string) string {
	if market == "IN" {
		return "INR"
	}
	return "USD"
}
