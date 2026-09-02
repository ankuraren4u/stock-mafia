package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type YahooAdapter struct {
	*BaseAdapter
}

type yahooChartResponse struct {
	Chart struct {
		Result []struct {
			Timestamp []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Close  []*float64 `json:"close"`
					Volume []*int64   `json:"volume"`
					High   []*float64 `json:"high"`
					Low    []*float64 `json:"low"`
					Open   []*float64 `json:"open"`
				} `json:"quote"`
			} `json:"indicators"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}

type yahooQuoteResponse struct {
	QuoteSummary struct {
		Result []struct {
			Price struct {
				RegularMarketPrice struct {
					Raw float64 `json:"raw"`
				} `json:"regularMarketPrice"`
				RegularMarketVolume struct {
					Raw int64 `json:"raw"`
				} `json:"regularMarketVolume"`
				Bid struct {
					Raw float64 `json:"raw"`
				} `json:"bid"`
				Ask struct {
					Raw float64 `json:"raw"`
				} `json:"ask"`
				RegularMarketPreviousClose struct {
					Raw float64 `json:"raw"`
				} `json:"regularMarketPreviousClose"`
				RegularMarketDayHigh struct {
					Raw float64 `json:"raw"`
				} `json:"regularMarketDayHigh"`
				RegularMarketDayLow struct {
					Raw float64 `json:"raw"`
				} `json:"regularMarketDayLow"`
				MarketCap struct {
					Raw float64 `json:"raw"`
				} `json:"marketCap"`
				Currency string `json:"currency"`
			} `json:"price"`
			DefaultKeyStatistics struct {
				ForwardPE struct {
					Raw float64 `json:"raw"`
				} `json:"forwardPE"`
				PriceToBook struct {
					Raw float64 `json:"raw"`
				} `json:"priceToBook"`
				TrailingEps struct {
					Raw float64 `json:"raw"`
				} `json:"trailingEps"`
				Beta struct {
					Raw float64 `json:"raw"`
				} `json:"beta"`
			} `json:"defaultKeyStatistics"`
			SummaryDetail struct {
				DividendYield struct {
					Raw float64 `json:"raw"`
				} `json:"dividendYield"`
			} `json:"summaryDetail"`
			FinancialData struct {
				TargetMeanPrice struct {
					Raw float64 `json:"raw"`
				} `json:"targetMeanPrice"`
				RecommendationKey string `json:"recommendationKey"`
				CurrentPrice struct {
					Raw float64 `json:"raw"`
				} `json:"currentPrice"`
				TotalRevenue struct {
					Raw float64 `json:"raw"`
				} `json:"totalRevenue"`
				NetIncomeToCommon struct {
					Raw float64 `json:"raw"`
				} `json:"netIncomeToCommon"`
				FreeCashflow struct {
					Raw float64 `json:"raw"`
				} `json:"freeCashflow"`
				OperatingMargins struct {
					Raw float64 `json:"raw"`
				} `json:"operatingMargins"`
				GrossMargins struct {
					Raw float64 `json:"raw"`
				} `json:"grossMargins"`
				ProfitMargins struct {
					Raw float64 `json:"raw"`
				} `json:"profitMargins"`
				RevenueGrowth struct {
					Raw float64 `json:"raw"`
				} `json:"revenueGrowth"`
				EarningsGrowth struct {
					Raw float64 `json:"raw"`
				} `json:"earningsGrowth"`
				DebtToEquity struct {
					Raw float64 `json:"raw"`
				} `json:"debtToEquity"`
				ReturnOnEquity struct {
					Raw float64 `json:"raw"`
				} `json:"returnOnEquity"`
			} `json:"financialData"`
			YearPrice struct {
				YearHigh struct {
					Raw float64 `json:"raw"`
				} `json:"yearHigh"`
				YearLow struct {
					Raw float64 `json:"raw"`
				} `json:"yearLow"`
			} `json:"price"`
		} `json:"result"`
	} `json:"quoteSummary"`
}

func (y *YahooAdapter) Name() string {
	return "yahoo"
}

func (y *YahooAdapter) RateLimit() int {
	return 5
}

func (y *YahooAdapter) HealthCheck(ctx context.Context) error {
	url := "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d"
	_, err := y.fetch(ctx, url)
	return err
}

func (y *YahooAdapter) FetchQuote(ctx context.Context, symbol string, market string) (*Quote, error) {
	ticker := mapToYahooTicker(symbol, market)
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=1d", ticker)

	body, err := y.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("yahoo fetch failed: %w", err)
	}

	var result yahooChartResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse yahoo response: %w", err)
	}

	if result.Chart.Error != nil {
		return nil, fmt.Errorf("yahoo API error: %s", result.Chart.Error.Description)
	}

	if len(result.Chart.Result) == 0 || len(result.Chart.Result[0].Indicators.Quote) == 0 {
		return nil, fmt.Errorf("no data returned for %s", symbol)
	}

	quotes := result.Chart.Result[0].Indicators.Quote[0]
	lastIdx := len(quotes.Close) - 1

	if lastIdx < 0 || quotes.Close[lastIdx] == nil {
		return nil, fmt.Errorf("no valid close price for %s", symbol)
	}

	return &Quote{
		Symbol:    symbol,
		Last:      *quotes.Close[lastIdx],
		Bid:       *quotes.Close[lastIdx],
		Ask:       *quotes.Close[lastIdx],
		Volume:    derefInt64(quotes.Volume[lastIdx]),
		Currency:  "USD",
		Timestamp: time.Now(),
		Source:    "yahoo",
	}, nil
}

func (y *YahooAdapter) FetchCandles(ctx context.Context, symbol string, market string) ([]Candle, error) {
	ticker := mapToYahooTicker(symbol, market)

	ranges := []string{"2y", "1y", "6mo", "3mo"}
	var body []byte
	var err error

	for _, r := range ranges {
		url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=%s", ticker, r)
		body, err = y.fetch(ctx, url)
		if err == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("yahoo candle fetch failed: %w", err)
	}

	var result yahooChartResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse yahoo response: %w", err)
	}

	if len(result.Chart.Result) == 0 || len(result.Chart.Result[0].Indicators.Quote) == 0 {
		return nil, fmt.Errorf("no candle data returned for %s", symbol)
	}

	timestamps := result.Chart.Result[0].Timestamp
	quotes := result.Chart.Result[0].Indicators.Quote[0]

	var candles []Candle
	for i := range timestamps {
		if i >= len(quotes.Close) || quotes.Close[i] == nil {
			continue
		}

		candles = append(candles, Candle{
			Symbol:    symbol,
			Open:      derefFloat64(quotes.Open[i]),
			High:      derefFloat64(quotes.High[i]),
			Low:       derefFloat64(quotes.Low[i]),
			Close:     *quotes.Close[i],
			Volume:    derefInt64(quotes.Volume[i]),
			Timestamp: time.Unix(timestamps[i], 0),
			Source:    "yahoo",
		})
	}

	return candles, nil
}

func (y *YahooAdapter) FetchFundamentals(ctx context.Context, symbol string) (*Fundamentals, error) {
	ticker := mapToYahooTicker(symbol, "US")
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v10/finance/quoteSummary/%s?modules=price,defaultKeyStatistics,summaryDetail,financialData", ticker)

	body, err := y.fetch(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("yahoo fundamentals fetch failed: %w", err)
	}

	var result yahooQuoteResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse yahoo response: %w", err)
	}

	if len(result.QuoteSummary.Result) == 0 {
		return nil, fmt.Errorf("no fundamentals returned for %s", symbol)
	}

	r := result.QuoteSummary.Result[0]

	return &Fundamentals{
		Symbol:         symbol,
		PE:             r.DefaultKeyStatistics.TrailingEps.Raw,
		ForwardPE:      r.DefaultKeyStatistics.ForwardPE.Raw,
		PB:             r.DefaultKeyStatistics.PriceToBook.Raw,
		DividendYield:  r.SummaryDetail.DividendYield.Raw,
		MarketCap:      r.Price.MarketCap.Raw,
		Beta:           r.DefaultKeyStatistics.Beta.Raw,
		EPS:            r.DefaultKeyStatistics.TrailingEps.Raw,
		ROE:            r.FinancialData.ReturnOnEquity.Raw,
		DebtToEquity:   r.FinancialData.DebtToEquity.Raw,
		ProfitMargins:  r.FinancialData.ProfitMargins.Raw,
		RevenueGrowth:  r.FinancialData.RevenueGrowth.Raw,
		EarningsGrowth: r.FinancialData.EarningsGrowth.Raw,
		TargetMean:     r.FinancialData.TargetMeanPrice.Raw,
		Recommendation: r.FinancialData.RecommendationKey,
		Week52High:     r.YearPrice.YearHigh.Raw,
		Week52Low:      r.YearPrice.YearLow.Raw,
		Revenue:        r.FinancialData.TotalRevenue.Raw,
		NetIncome:      r.FinancialData.NetIncomeToCommon.Raw,
		FreeCashflow:   r.FinancialData.FreeCashflow.Raw,
		OperatingMargins: r.FinancialData.OperatingMargins.Raw,
		GrossMargins:   r.FinancialData.GrossMargins.Raw,
		Source:         "yahoo",
		Timestamp:      time.Now(),
	}, nil
}

func mapToYahooTicker(symbol, market string) string {
	symbol = strings.ToUpper(symbol)
	if market == "IN" {
		if strings.HasSuffix(symbol, ".NS") || strings.HasSuffix(symbol, ".BO") {
			return symbol
		}
		return symbol + ".NS"
	}
	return symbol
}

func derefFloat64(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

func derefInt64(i *int64) int64 {
	if i == nil {
		return 0
	}
	return *i
}
