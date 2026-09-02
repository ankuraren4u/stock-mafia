package service

import (
	"sort"

	"github.com/stockmafia/trading-app/services/analytics/internal/indicators"
	"go.uber.org/zap"
)

type ScreenerService struct {
	indicators *indicators.IndicatorService
	logger     *zap.Logger
}

func NewScreenerService(indicators *indicators.IndicatorService, logger *zap.Logger) *ScreenerService {
	return &ScreenerService{
		indicators: indicators,
		logger:     logger,
	}
}

type ScreenerResult struct {
	Symbol     string
	Name       string
	Score      float64
	Signal     string
	Indicators map[string]float64
}

type ScreenerFilter struct {
	Type      string
	Min       float64
	Max       float64
	Indicator string
}

type StockData struct {
	Symbol  string
	Name    string
	Highs   []float64
	Lows    []float64
	Closes  []float64
	Volumes []float64
}

func (s *ScreenerService) RunScreener(stocks []StockData, filters []ScreenerFilter) []ScreenerResult {
	var results []ScreenerResult

	for _, stock := range stocks {
		result := s.analyzeStock(stock, filters)
		if result != nil {
			results = append(results, *result)
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	return results
}

func (s *ScreenerService) analyzeStock(stock StockData, filters []ScreenerFilter) *ScreenerResult {
	if len(stock.Closes) < 30 {
		return nil
	}

	ind := s.computeAllIndicators(stock)

	if !s.applyFilters(ind, filters) {
		return nil
	}

	score := s.calculateScore(ind, filters)
	signal := s.determineSignal(ind)

	return &ScreenerResult{
		Symbol:     stock.Symbol,
		Name:       stock.Name,
		Score:      score,
		Signal:     signal,
		Indicators: ind,
	}
}

func (s *ScreenerService) computeAllIndicators(stock StockData) map[string]float64 {
	ind := make(map[string]float64)

	ind["rsi"] = s.indicators.CalculateRSI(stock.Closes, 14)

	if len(stock.Highs) >= 29 && len(stock.Lows) >= 29 && len(stock.Closes) >= 29 {
		ind["adx"] = s.indicators.CalculateADX(stock.Highs, stock.Lows, stock.Closes, 14)
		ind["plus_di"] = s.indicators.CalculatePlusDI(stock.Highs, stock.Lows, stock.Closes, 14)
		ind["minus_di"] = s.indicators.CalculateMinusDI(stock.Highs, stock.Lows, stock.Closes, 14)
	}

	if len(stock.Closes) >= 35 {
		macdLine, signalLine, histogram := s.indicators.CalculateMACD(stock.Closes, 12, 26, 9)
		ind["macd"] = macdLine
		ind["macd_signal"] = signalLine
		ind["macd_histogram"] = histogram
	}

	if len(stock.Closes) >= 20 {
		upper, middle, lower := s.indicators.CalculateBollingerBands(stock.Closes, 20, 2)
		ind["bb_upper"] = upper
		ind["bb_middle"] = middle
		ind["bb_lower"] = lower

		lastClose := stock.Closes[len(stock.Closes)-1]
		if upper != lower {
			ind["bb_pct"] = (lastClose - lower) / (upper - lower)
		}
	}

	if len(stock.Highs) > 0 && len(stock.Volumes) > 0 {
		ind["vwap"] = s.indicators.CalculateVWAP(stock.Highs, stock.Lows, stock.Closes, stock.Volumes)
	}

	if len(stock.Highs) >= 11 && len(stock.Lows) >= 11 && len(stock.Closes) >= 11 {
		_, direction := s.indicators.CalculateSupertrend(stock.Highs, stock.Lows, stock.Closes, 10, 3)
		if direction == "up" {
			ind["supertrend_direction"] = 1
		} else {
			ind["supertrend_direction"] = -1
		}
	}

	if len(stock.Highs) >= 14 && len(stock.Lows) >= 14 && len(stock.Closes) >= 14 {
		k, d := s.indicators.CalculateStochastic(stock.Highs, stock.Lows, stock.Closes, 14, 3)
		ind["stoch_k"] = k
		ind["stoch_d"] = d
	}

	if len(stock.Closes) >= 20 {
		ind["ema20"] = s.indicators.CalculateEMA(stock.Closes, 20)
	}
	if len(stock.Closes) >= 50 {
		ind["ema50"] = s.indicators.CalculateEMA(stock.Closes, 50)
	}
	if len(stock.Closes) >= 200 {
		ind["ema200"] = s.indicators.CalculateEMA(stock.Closes, 200)
	}

	if len(stock.Highs) >= 15 && len(stock.Lows) >= 15 && len(stock.Closes) >= 15 {
		atr := s.indicators.CalculateATR(stock.Highs, stock.Lows, stock.Closes, 14)
		ind["atr"] = atr
		if len(stock.Closes) > 0 {
			ind["atr_pct"] = atr / stock.Closes[len(stock.Closes)-1] * 100
		}
	}

	if len(stock.Closes) >= 14 {
		ind["momentum_14"] = stock.Closes[len(stock.Closes)-1] - stock.Closes[len(stock.Closes)-14]
	}

	if len(stock.Volumes) >= 20 {
		ind["avg_volume_20"] = average(stock.Volumes[len(stock.Volumes)-20:])
		ind["volume_ratio"] = stock.Volumes[len(stock.Volumes)-1] / ind["avg_volume_20"]
	}

	return ind
}

func (s *ScreenerService) calculateScore(ind map[string]float64, filters []ScreenerFilter) float64 {
	score := 50.0

	if rsi, ok := ind["rsi"]; ok {
		if rsi < 30 {
			score += (30 - rsi) / 30 * 20
		} else if rsi > 70 {
			score -= (rsi - 70) / 30 * 20
		} else if rsi < 40 {
			score += (40 - rsi) / 40 * 10
		} else if rsi > 60 {
			score -= (rsi - 60) / 40 * 10
		}
	}

	if adx, ok := ind["adx"]; ok && adx > 20 {
		plusDI := ind["plus_di"]
		minusDI := ind["minus_di"]
		if plusDI > minusDI {
			score += (adx - 20) / 30 * 15
		} else {
			score -= (adx - 20) / 30 * 15
		}
	}

	if histogram, ok := ind["macd_histogram"]; ok {
		if histogram > 0 {
			score += 10
		} else {
			score -= 10
		}
	}

	if dir, ok := ind["supertrend_direction"]; ok {
		if dir > 0 {
			score += 10
		} else {
			score -= 10
		}
	}

	if k, ok := ind["stoch_k"]; ok {
		if k < 20 {
			score += 10
		} else if k > 80 {
			score -= 10
		}
	}

	if ema20, ok := ind["ema20"]; ok {
		if ema50, ok := ind["ema50"]; ok {
			if ema20 > ema50 {
				score += 5
			} else {
				score -= 5
			}
		}
	}

	for _, filter := range filters {
		if filter.Type == "category" {
			categoryScore := s.applyCategoryFilter(ind, filter)
			score += categoryScore
		}
	}

	return clamp(score, 0, 100)
}

func (s *ScreenerService) applyCategoryFilter(ind map[string]float64, filter ScreenerFilter) float64 {
	switch filter.Type {
	case "category":
		switch filter.Indicator {
		case "oversold":
			rsi := ind["rsi"]
			if rsi < 30 {
				return 15
			} else if rsi < 40 {
				return 5
			}
		case "overbought":
			rsi := ind["rsi"]
			if rsi > 70 {
				return -15
			} else if rsi > 60 {
				return -5
			}
		case "strong_uptrend":
			adx := ind["adx"]
			plusDI := ind["plus_di"]
			minusDI := ind["minus_di"]
			if adx > 25 && plusDI > minusDI {
				return 15
			}
		case "strong_downtrend":
			adx := ind["adx"]
			plusDI := ind["plus_di"]
			minusDI := ind["minus_di"]
			if adx > 25 && minusDI > plusDI {
				return -15
			}
		case "breaking_out":
			if len(ind) > 0 {
				if volRatio, ok := ind["volume_ratio"]; ok && volRatio > 2 {
					return 10
				}
			}
		case "value":
			if ema200, ok := ind["ema200"]; ok {
				if lastClose, ok := ind["bb_lower"]; ok {
					if lastClose < ema200 {
						return 10
					}
				}
			}
		case "momentum":
			if mom, ok := ind["momentum_14"]; ok && mom > 0 {
				return 10
			}
		case "low_volatility":
			if atrPct, ok := ind["atr_pct"]; ok && atrPct < 2 {
				return 5
			}
		case "high_volatility":
			if atrPct, ok := ind["atr_pct"]; ok && atrPct > 4 {
				return -5
			}
		}
	}
	return 0
}

func (s *ScreenerService) determineSignal(ind map[string]float64) string {
	score := s.calculateScore(ind, nil)

	if score > 70 {
		return "strong_buy"
	} else if score > 60 {
		return "buy"
	} else if score < 30 {
		return "strong_sell"
	} else if score < 40 {
		return "sell"
	}

	return "neutral"
}

func (s *ScreenerService) applyFilters(ind map[string]float64, filters []ScreenerFilter) bool {
	for _, filter := range filters {
		if filter.Type == "category" {
			continue
		}

		value, ok := ind[filter.Indicator]
		if !ok {
			continue
		}

		if filter.Min > 0 && value < filter.Min {
			return false
		}
		if filter.Max > 0 && value > filter.Max {
			return false
		}
	}

	return true
}

func (s *ScreenerService) GetScreenerCategories() []string {
	return []string{
		"oversold",
		"overbought",
		"strong_uptrend",
		"strong_downtrend",
		"breaking_out",
		"value",
		"momentum",
		"low_volatility",
		"high_volatility",
		"all",
	}
}
