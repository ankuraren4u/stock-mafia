package service

import (
	"fmt"
	"math"

	"github.com/stockmafia/trading-app/services/analytics/internal/indicators"
	"go.uber.org/zap"
)

type StrategiesService struct {
	indicators *indicators.IndicatorService
	logger     *zap.Logger
	strategies map[string]*Strategy
}

func NewStrategiesService(indicators *indicators.IndicatorService, logger *zap.Logger) *StrategiesService {
	svc := &StrategiesService{
		indicators: indicators,
		logger:     logger,
		strategies: make(map[string]*Strategy),
	}
	svc.registerStrategies()
	return svc
}

type Strategy struct {
	ID          string
	Name        string
	Description string
	IsActive    bool
	WinRate     float64
	TotalTrades int
	Execute     func(data StrategyInput) StrategyOutput
}

type StrategyInput struct {
	Symbol  string
	Highs   []float64
	Lows    []float64
	Closes  []float64
	Volumes []float64
}

type StrategyOutput struct {
	Signal     string
	Confidence float64
	Metrics    map[string]float64
}

func (s *StrategiesService) registerStrategies() {
	s.strategies["trend-pullback"] = &Strategy{
		ID:          "trend-pullback",
		Name:        "Trend Pullback",
		Description: "Buy on pullbacks in strong uptrends using EMA and RSI",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 50 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			ema20 := s.indicators.CalculateEMA(data.Closes, 20)
			ema50 := s.indicators.CalculateEMA(data.Closes, 50)
			rsi := s.indicators.CalculateRSI(data.Closes, 14)
			lastClose := data.Closes[len(data.Closes)-1]

			signal := "hold"
			confidence := 0.0

			if ema20 > ema50 && lastClose < ema20 && rsi < 45 && rsi > 30 {
				signal = "buy"
				pullbackStrength := (ema20 - lastClose) / ema20
				confidence = clamp(pullbackStrength*10+0.3, 0, 1)
			} else if ema20 > ema50 && lastClose > ema20 && rsi > 65 {
				signal = "sell"
				confidence = clamp((rsi-65)/35*0.5, 0, 0.5)
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics:    map[string]float64{"ema20": ema20, "ema50": ema50, "rsi": rsi},
			}
		},
	}

	s.strategies["momentum-breakout"] = &Strategy{
		ID:          "momentum-breakout",
		Name:        "Momentum Breakout",
		Description: "Buy on volume-confirmed breakouts above recent highs",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 20 || len(data.Volumes) < 20 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			high20 := maxVal(data.Highs[len(data.Highs)-20:]...)
			avgVolume := average(data.Volumes[len(data.Volumes)-20:])
			lastClose := data.Closes[len(data.Closes)-1]
			prevClose := data.Closes[len(data.Closes)-2]
			currentVolume := data.Volumes[len(data.Volumes)-1]

			signal := "hold"
			confidence := 0.0

			if lastClose > high20 && prevClose <= high20 && currentVolume > avgVolume*1.5 {
				signal = "buy"
				confidence = clamp(currentVolume/avgVolume/5, 0, 1)
			} else if lastClose < prevClose*0.97 && currentVolume > avgVolume*2 {
				signal = "sell"
				confidence = clamp(currentVolume/avgVolume/5, 0, 1)
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics: map[string]float64{
					"high_20":      high20,
					"avg_volume":   avgVolume,
					"curr_volume":  currentVolume,
				},
			}
		},
	}

	s.strategies["mean-reversion"] = &Strategy{
		ID:          "mean-reversion",
		Name:        "Mean Reversion",
		Description: "Buy when price deviates significantly below mean, sell above",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 20 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			window := data.Closes[len(data.Closes)-20:]
			ma := average(window)
			std := stddev(window)
			if std == 0 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			lastClose := data.Closes[len(data.Closes)-1]
			zScore := (lastClose - ma) / std

			signal := "hold"
			confidence := 0.0

			if zScore < -2 {
				signal = "buy"
				confidence = clamp(-zScore/5, 0, 1)
			} else if zScore > 2 {
				signal = "sell"
				confidence = clamp(zScore/5, 0, 1)
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics:    map[string]float64{"ma": ma, "std": std, "z_score": zScore},
			}
		},
	}

	s.strategies["quality-dip"] = &Strategy{
		ID:          "quality-dip",
		Name:        "Quality Dip Buy",
		Description: "Buy quality stocks during oversold conditions with volume spike",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 20 || len(data.Volumes) < 20 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			rsi := s.indicators.CalculateRSI(data.Closes, 14)
			avgVolume := average(data.Volumes[len(data.Volumes)-20:])
			currentVolume := data.Volumes[len(data.Volumes)-1]
			lastClose := data.Closes[len(data.Closes)-1]
			prevClose := data.Closes[len(data.Closes)-2]
			ema50 := s.indicators.CalculateEMA(data.Closes, 50)

			signal := "hold"
			confidence := 0.0

			if rsi < 35 && currentVolume > avgVolume*1.5 && lastClose > prevClose && ema50 > 0 && lastClose > ema50*0.9 {
				signal = "buy"
				confidence = clamp((35-rsi)/35+0.2, 0, 1)
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics: map[string]float64{
					"rsi":         rsi,
					"avg_volume":  avgVolume,
					"curr_volume": currentVolume,
					"ema50":       ema50,
				},
			}
		},
	}

	s.strategies["dual-momentum"] = &Strategy{
		ID:          "dual-momentum",
		Name:        "Dual Momentum",
		Description: "Buy when both absolute and relative momentum are positive",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 60 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			lastClose := data.Closes[len(data.Closes)-1]
			ret1m := (lastClose/data.Closes[len(data.Closes)-21] - 1) * 100
			ret3m := (lastClose/data.Closes[len(data.Closes)-63] - 1) * 100

			absMomentum := ret1m > 0 && ret3m > 0
			ema20 := s.indicators.CalculateEMA(data.Closes, 20)
			ema50 := s.indicators.CalculateEMA(data.Closes, 50)
			trendUp := ema20 > ema50

			signal := "hold"
			confidence := 0.0

			if absMomentum && trendUp {
				signal = "buy"
				confidence = clamp((ret1m+ret3m)/20, 0, 1)
			} else if !absMomentum && !trendUp {
				signal = "sell"
				confidence = clamp((-ret1m-ret3m)/20, 0, 1)
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics:    map[string]float64{"ret_1m": ret1m, "ret_3m": ret3m, "ema20": ema20, "ema50": ema50},
			}
		},
	}

	s.strategies["risk-off"] = &Strategy{
		ID:          "risk-off",
		Name:        "Risk-Off Signal",
		Description: "Sell when multiple risk indicators trigger simultaneously",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 20 || len(data.Highs) < 14 || len(data.Lows) < 14 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			rsi := s.indicators.CalculateRSI(data.Closes, 14)
			adx := s.indicators.CalculateADX(data.Highs, data.Lows, data.Closes, 14)
			minusDI := s.indicators.CalculateMinusDI(data.Highs, data.Lows, data.Closes, 14)
			plusDI := s.indicators.CalculatePlusDI(data.Highs, data.Lows, data.Closes, 14)
			ema20 := s.indicators.CalculateEMA(data.Closes, 20)
			lastClose := data.Closes[len(data.Closes)-1]

			riskScore := 0
			if rsi > 70 {
				riskScore++
			}
			if adx > 25 && minusDI > plusDI {
				riskScore++
			}
			if lastClose < ema20 {
				riskScore++
			}

			signal := "hold"
			confidence := 0.0

			if riskScore >= 2 {
				signal = "sell"
				confidence = float64(riskScore) / 3.0
			} else if riskScore == 0 && rsi < 40 && plusDI > minusDI {
				signal = "buy"
				confidence = 0.5
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics: map[string]float64{
					"rsi":      rsi,
					"adx":      adx,
					"plus_di":  plusDI,
					"minus_di": minusDI,
					"ema20":    ema20,
				},
			}
		},
	}

	s.strategies["vwap-bounce"] = &Strategy{
		ID:          "vwap-bounce",
		Name:        "VWAP Bounce",
		Description: "Buy when price bounces off VWAP with volume confirmation",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 10 || len(data.Volumes) < 10 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			vwap := s.indicators.CalculateVWAP(data.Highs, data.Lows, data.Closes, data.Volumes)
			if vwap == 0 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}

			lastClose := data.Closes[len(data.Closes)-1]
			prevClose := data.Closes[len(data.Closes)-2]
			avgVolume := average(data.Volumes[len(data.Volumes)-10:])
			currentVolume := data.Volumes[len(data.Volumes)-1]

			signal := "hold"
			confidence := 0.0

			if prevClose < vwap && lastClose > vwap && currentVolume > avgVolume*1.2 {
				signal = "buy"
				confidence = clamp((lastClose-vwap)/vwap*50+0.3, 0, 1)
			} else if prevClose > vwap && lastClose < vwap && currentVolume > avgVolume*1.2 {
				signal = "sell"
				confidence = clamp((vwap-lastClose)/vwap*50+0.3, 0, 1)
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics:    map[string]float64{"vwap": vwap, "last_close": lastClose},
			}
		},
	}

	s.strategies["supertrend-flip"] = &Strategy{
		ID:          "supertrend-flip",
		Name:        "Supertrend Flip",
		Description: "Trade on Supertrend direction changes",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 12 || len(data.Highs) < 12 || len(data.Lows) < 12 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}

			_, currentDir := s.indicators.CalculateSupertrend(data.Highs, data.Lows, data.Closes, 10, 3)

			n := len(data.Closes)
			if n < 2 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}

			_, prevDir := s.indicators.CalculateSupertrend(
				data.Highs[:n-1], data.Lows[:n-1], data.Closes[:n-1], 10, 3)

			signal := "hold"
			confidence := 0.7

			if prevDir == "down" && currentDir == "up" {
				signal = "buy"
			} else if prevDir == "up" && currentDir == "down" {
				signal = "sell"
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics:    map[string]float64{"current_dir": directionToFloat(currentDir), "prev_dir": directionToFloat(prevDir)},
			}
		},
	}

	s.strategies["ichimoku-breakout"] = &Strategy{
		ID:          "ichimoku-breakout",
		Name:        "Ichimoku Breakout",
		Description: "Trade breakouts above Ichimoku cloud",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 52 || len(data.Highs) < 52 || len(data.Lows) < 52 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}

			tenkanHigh := maxVal(data.Highs[len(data.Highs)-9:]...)
			tenkanLow := minVal(data.Lows[len(data.Lows)-9:]...)
			tenkanSen := (tenkanHigh + tenkanLow) / 2

			kijunHigh := maxVal(data.Highs[len(data.Highs)-26:]...)
			kijunLow := minVal(data.Lows[len(data.Lows)-26:]...)
			kijunSen := (kijunHigh + kijunLow) / 2

			senkouA := (tenkanSen + kijunSen) / 2
			senkouHigh := maxVal(data.Highs[len(data.Highs)-52:]...)
			senkouLow := minVal(data.Lows[len(data.Lows)-52:]...)
			senkouB := (senkouHigh + senkouLow) / 2

			cloudTop := math.Max(senkouA, senkouB)
			cloudBottom := math.Min(senkouA, senkouB)
			lastClose := data.Closes[len(data.Closes)-1]

			signal := "hold"
			confidence := 0.0

			if lastClose > cloudTop && tenkanSen > kijunSen {
				signal = "buy"
				confidence = clamp((lastClose-cloudTop)/cloudTop*20+0.4, 0, 1)
			} else if lastClose < cloudBottom && tenkanSen < kijunSen {
				signal = "sell"
				confidence = clamp((cloudBottom-lastClose)/cloudBottom*20+0.4, 0, 1)
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics: map[string]float64{
					"tenkan_sen": tenkanSen,
					"kijun_sen":  kijunSen,
					"senkou_a":   senkouA,
					"senkou_b":   senkouB,
					"cloud_top":  cloudTop,
				},
			}
		},
	}

	s.strategies["adx-trend"] = &Strategy{
		ID:          "adx-trend",
		Name:        "ADX Trend",
		Description: "Trade based on ADX trend strength with DI confirmation",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 29 || len(data.Highs) < 29 || len(data.Lows) < 29 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}
			adx := s.indicators.CalculateADX(data.Highs, data.Lows, data.Closes, 14)
			plusDI := s.indicators.CalculatePlusDI(data.Highs, data.Lows, data.Closes, 14)
			minusDI := s.indicators.CalculateMinusDI(data.Highs, data.Lows, data.Closes, 14)

			signal := "hold"
			confidence := 0.0

			if adx > 25 {
				if plusDI > minusDI {
					signal = "buy"
					confidence = clamp(adx/50, 0, 1)
				} else {
					signal = "sell"
					confidence = clamp(adx/50, 0, 1)
				}
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics:    map[string]float64{"adx": adx, "plus_di": plusDI, "minus_di": minusDI},
			}
		},
	}

	s.strategies["fibonacci-retrace"] = &Strategy{
		ID:          "fibonacci-retrace",
		Name:        "Fibonacci Retracement",
		Description: "Buy at Fibonacci support levels in uptrends",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 20 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}

			high50 := maxVal(data.Highs[len(data.Highs)-50:]...)
			low50 := minVal(data.Lows[len(data.Lows)-50:]...)
			range50 := high50 - low50
			if range50 == 0 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}

			fib382 := high50 - range50*0.382
			fib500 := high50 - range50*0.500
			fib618 := high50 - range50*0.618

			lastClose := data.Closes[len(data.Closes)-1]
			ema20 := s.indicators.CalculateEMA(data.Closes, 20)
			ema50 := s.indicators.CalculateEMA(data.Closes, 50)

			signal := "hold"
			confidence := 0.0

			if ema20 > ema50 {
				if lastClose <= fib382*1.01 && lastClose >= fib382*0.99 {
					signal = "buy"
					confidence = 0.7
				} else if lastClose <= fib500*1.01 && lastClose >= fib500*0.99 {
					signal = "buy"
					confidence = 0.75
				} else if lastClose <= fib618*1.01 && lastClose >= fib618*0.99 {
					signal = "buy"
					confidence = 0.8
				}
			}

			if lastClose > high50*0.98 {
				signal = "sell"
				confidence = 0.5
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics: map[string]float64{
					"fib_382": fib382,
					"fib_500": fib500,
					"fib_618": fib618,
					"high_50": high50,
					"low_50":  low50,
				},
			}
		},
	}

	s.strategies["stochastic-snap"] = &Strategy{
		ID:          "stochastic-snap",
		Name:        "Stochastic Snap Back",
		Description: "Buy when stochastic K crosses above D in oversold zone",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 17 || len(data.Highs) < 17 || len(data.Lows) < 17 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}

			n := len(data.Closes)
			kCurr, dCurr := s.indicators.CalculateStochastic(data.Highs, data.Lows, data.Closes, 14, 3)
			kPrev, dPrev := s.indicators.CalculateStochastic(
				data.Highs[:n-1], data.Lows[:n-1], data.Closes[:n-1], 14, 3)

			signal := "hold"
			confidence := 0.0

			if kPrev < 20 && dPrev < 20 && kCurr > dCurr && kPrev <= dPrev {
				signal = "buy"
				confidence = clamp((20-kCurr)/20+0.3, 0, 1)
			} else if kPrev > 80 && dPrev > 80 && kCurr < dCurr && kPrev >= dPrev {
				signal = "sell"
				confidence = clamp((kCurr-80)/20+0.3, 0, 1)
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics:    map[string]float64{"k": kCurr, "d": dCurr, "k_prev": kPrev, "d_prev": dPrev},
			}
		},
	}

	s.strategies["volume-spike"] = &Strategy{
		ID:          "volume-spike",
		Name:        "Volume Spike",
		Description: "Trade on unusual volume spikes with price direction",
		IsActive:    true,
		Execute: func(data StrategyInput) StrategyOutput {
			if len(data.Closes) < 20 || len(data.Volumes) < 20 {
				return StrategyOutput{Signal: "hold", Confidence: 0}
			}

			avgVolume := average(data.Volumes[len(data.Volumes)-20:])
			currentVolume := data.Volumes[len(data.Volumes)-1]
			lastClose := data.Closes[len(data.Closes)-1]
			prevClose := data.Closes[len(data.Closes)-2]

			signal := "hold"
			confidence := 0.0

			if avgVolume > 0 && currentVolume > avgVolume*3 {
				if lastClose > prevClose {
					signal = "buy"
					confidence = clamp(currentVolume/avgVolume/10, 0, 1)
				} else {
					signal = "sell"
					confidence = clamp(currentVolume/avgVolume/10, 0, 1)
				}
			} else if avgVolume > 0 && currentVolume > avgVolume*2 {
				priceChange := (lastClose - prevClose) / prevClose
				if priceChange > 0.03 {
					signal = "buy"
					confidence = 0.5
				} else if priceChange < -0.03 {
					signal = "sell"
					confidence = 0.5
				}
			}

			return StrategyOutput{
				Signal:     signal,
				Confidence: confidence,
				Metrics: map[string]float64{
					"avg_volume":   avgVolume,
					"curr_volume":  currentVolume,
					"volume_ratio": currentVolume / avgVolume,
				},
			}
		},
	}
}

func (s *StrategiesService) GetStrategies(activeOnly bool) []*Strategy {
	var strategies []*Strategy
	for _, strategy := range s.strategies {
		if !activeOnly || strategy.IsActive {
			strategies = append(strategies, strategy)
		}
	}
	return strategies
}

func (s *StrategiesService) RunStrategy(strategyID string, data StrategyInput) (*StrategyOutput, error) {
	strategy, ok := s.strategies[strategyID]
	if !ok {
		return nil, ErrStrategyNotFound
	}

	output := strategy.Execute(data)
	return &output, nil
}

func directionToFloat(dir string) float64 {
	if dir == "up" {
		return 1
	}
	return -1
}

func maxVal(values ...float64) float64 {
	if len(values) == 0 {
		return 0
	}
	m := values[0]
	for _, v := range values[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

func minVal(values ...float64) float64 {
	if len(values) == 0 {
		return 0
	}
	m := values[0]
	for _, v := range values[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

var ErrStrategyNotFound = &StrategyError{Message: "strategy not found"}

type StrategyError struct {
	Message string
}

func (e *StrategyError) Error() string {
	return fmt.Sprintf("strategy error: %s", e.Message)
}
