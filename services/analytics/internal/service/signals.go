package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stockmafia/trading-app/services/analytics/internal/indicators"
	"go.uber.org/zap"
)

type SignalsService struct {
	indicators *indicators.IndicatorService
	redis      *redis.Client
	logger     *zap.Logger
}

func NewSignalsService(indicators *indicators.IndicatorService, rdb *redis.Client, logger *zap.Logger) *SignalsService {
	return &SignalsService{
		indicators: indicators,
		redis:      rdb,
		logger:     logger,
	}
}

type Signal struct {
	Symbol      string            `json:"symbol"`
	Strategy    string            `json:"strategy"`
	Direction   string            `json:"direction"`
	Strength    float64           `json:"strength"`
	Confidence  float64           `json:"confidence"`
	Message     string            `json:"message"`
	Indicators  map[string]float64 `json:"indicators,omitempty"`
}

type SignalResult struct {
	Symbol       string    `json:"symbol"`
	Score        float64   `json:"score"`
	Action       string    `json:"action"`
	Confidence   float64   `json:"confidence"`
	Signals      []Signal  `json:"signals"`
	Reasons      []string  `json:"reasons"`
	ComputedAt   time.Time `json:"computed_at"`
}

func (s *SignalsService) CalculateSignals(symbol string, highs, lows, closes, volumes []float64) []Signal {
	if len(closes) < 30 {
		return nil
	}

	var signals []Signal

	s.addRSISignal(symbol, closes, &signals)
	s.addMACDSignal(symbol, closes, &signals)
	s.addEMASignal(symbol, closes, &signals)
	s.addADXSignal(symbol, highs, lows, closes, &signals)
	s.addBollingerSignal(symbol, closes, &signals)
	s.addSupertrendSignal(symbol, highs, lows, closes, &signals)
	s.addStochasticSignal(symbol, highs, lows, closes, &signals)
	s.addVWAPSignal(symbol, highs, lows, closes, volumes, &signals)
	s.addATRSignal(symbol, highs, lows, closes, &signals)

	return signals
}

func (s *SignalsService) addRSISignal(symbol string, closes []float64, signals *[]Signal) {
	rsi := s.indicators.CalculateRSI(closes, 14)
	if rsi < 30 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "RSI",
			Direction:  "buy",
			Strength:   (30 - rsi) / 30,
			Confidence: 0.75,
			Message:    fmt.Sprintf("RSI at %.1f indicates oversold condition", rsi),
			Indicators: map[string]float64{"rsi": rsi},
		})
	} else if rsi > 70 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "RSI",
			Direction:  "sell",
			Strength:   (rsi - 70) / 30,
			Confidence: 0.75,
			Message:    fmt.Sprintf("RSI at %.1f indicates overbought condition", rsi),
			Indicators: map[string]float64{"rsi": rsi},
		})
	} else if rsi < 40 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "RSI",
			Direction:  "buy",
			Strength:   (40 - rsi) / 40 * 0.5,
			Confidence: 0.5,
			Message:    fmt.Sprintf("RSI at %.1f approaching oversold", rsi),
			Indicators: map[string]float64{"rsi": rsi},
		})
	} else if rsi > 60 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "RSI",
			Direction:  "sell",
			Strength:   (rsi - 60) / 40 * 0.5,
			Confidence: 0.5,
			Message:    fmt.Sprintf("RSI at %.1f approaching overbought", rsi),
			Indicators: map[string]float64{"rsi": rsi},
		})
	}
}

func (s *SignalsService) addMACDSignal(symbol string, closes []float64, signals *[]Signal) {
	if len(closes) < 35 {
		return
	}
	macdLine, signalLine, histogram := s.indicators.CalculateMACD(closes, 12, 26, 9)
	if macdLine == 0 && signalLine == 0 {
		return
	}

	if histogram > 0 && macdLine > signalLine {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "MACD",
			Direction:  "buy",
			Strength:   clamp(histogram/5, 0, 1),
			Confidence: 0.65,
			Message:    "MACD bullish crossover detected",
			Indicators: map[string]float64{"macd": macdLine, "signal": signalLine, "histogram": histogram},
		})
	} else if histogram < 0 && macdLine < signalLine {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "MACD",
			Direction:  "sell",
			Strength:   clamp(-histogram/5, 0, 1),
			Confidence: 0.65,
			Message:    "MACD bearish crossover detected",
			Indicators: map[string]float64{"macd": macdLine, "signal": signalLine, "histogram": histogram},
		})
	}
}

func (s *SignalsService) addEMASignal(symbol string, closes []float64, signals *[]Signal) {
	if len(closes) < 50 {
		return
	}
	ema20 := s.indicators.CalculateEMA(closes, 20)
	ema50 := s.indicators.CalculateEMA(closes, 50)
	lastClose := closes[len(closes)-1]

	if len(closes) >= 200 {
		ema200 := s.indicators.CalculateEMA(closes, 200)
		if lastClose > ema20 && ema20 > ema50 && ema50 > ema200 {
			*signals = append(*signals, Signal{
				Symbol:     symbol,
				Strategy:   "EMA",
				Direction:  "buy",
				Strength:   0.8,
				Confidence: 0.7,
				Message:    "Strong uptrend: price > EMA20 > EMA50 > EMA200",
				Indicators: map[string]float64{"ema20": ema20, "ema50": ema50, "ema200": ema200},
			})
			return
		}
		if lastClose < ema20 && ema20 < ema50 {
			*signals = append(*signals, Signal{
				Symbol:     symbol,
				Strategy:   "EMA",
				Direction:  "sell",
				Strength:   0.7,
				Confidence: 0.65,
				Message:    "Downtrend: price < EMA20 < EMA50",
				Indicators: map[string]float64{"ema20": ema20, "ema50": ema50},
			})
			return
		}
	}

	if ema20 > ema50 && lastClose > ema20 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "EMA",
			Direction:  "buy",
			Strength:   clamp((ema20-ema50)/ema50*100, 0, 1),
			Confidence: 0.6,
			Message:    "EMA20 above EMA50, price above EMA20",
			Indicators: map[string]float64{"ema20": ema20, "ema50": ema50},
		})
	} else if ema20 < ema50 && lastClose < ema20 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "EMA",
			Direction:  "sell",
			Strength:   clamp((ema50-ema20)/ema50*100, 0, 1),
			Confidence: 0.6,
			Message:    "EMA20 below EMA50, price below EMA20",
			Indicators: map[string]float64{"ema20": ema20, "ema50": ema50},
		})
	}
}

func (s *SignalsService) addADXSignal(symbol string, highs, lows, closes []float64, signals *[]Signal) {
	if len(highs) < 29 || len(lows) < 29 || len(closes) < 29 {
		return
	}
	adx := s.indicators.CalculateADX(highs, lows, closes, 14)
	if adx < 20 {
		return
	}

	plusDI := s.indicators.CalculatePlusDI(highs, lows, closes, 14)
	minusDI := s.indicators.CalculateMinusDI(highs, lows, closes, 14)

	if plusDI > minusDI {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "ADX",
			Direction:  "buy",
			Strength:   clamp(adx/50, 0, 1),
			Confidence: 0.7,
			Message:    fmt.Sprintf("ADX %.1f with +DI > -DI indicates strong uptrend", adx),
			Indicators: map[string]float64{"adx": adx, "plus_di": plusDI, "minus_di": minusDI},
		})
	} else {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "ADX",
			Direction:  "sell",
			Strength:   clamp(adx/50, 0, 1),
			Confidence: 0.7,
			Message:    fmt.Sprintf("ADX %.1f with -DI > +DI indicates strong downtrend", adx),
			Indicators: map[string]float64{"adx": adx, "plus_di": plusDI, "minus_di": minusDI},
		})
	}
}

func (s *SignalsService) addBollingerSignal(symbol string, closes []float64, signals *[]Signal) {
	if len(closes) < 20 {
		return
	}
	upper, middle, lower := s.indicators.CalculateBollingerBands(closes, 20, 2)
	lastClose := closes[len(closes)-1]

	if lastClose <= lower {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "Bollinger",
			Direction:  "buy",
			Strength:   clamp((lower-lastClose)/lastClose*100, 0, 1),
			Confidence: 0.6,
			Message:    fmt.Sprintf("Price %.2f below lower band %.2f", lastClose, lower),
			Indicators: map[string]float64{"upper": upper, "middle": middle, "lower": lower},
		})
	} else if lastClose >= upper {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "Bollinger",
			Direction:  "sell",
			Strength:   clamp((lastClose-upper)/lastClose*100, 0, 1),
			Confidence: 0.6,
			Message:    fmt.Sprintf("Price %.2f above upper band %.2f", lastClose, upper),
			Indicators: map[string]float64{"upper": upper, "middle": middle, "lower": lower},
		})
	} else if lastClose < middle && (middle-lastClose)/middle > 0.01 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "Bollinger",
			Direction:  "buy",
			Strength:   clamp((middle-lastClose)/(middle-lower), 0, 0.5),
			Confidence: 0.45,
			Message:    "Price below middle band, potential bounce",
			Indicators: map[string]float64{"upper": upper, "middle": middle, "lower": lower},
		})
	}
}

func (s *SignalsService) addSupertrendSignal(symbol string, highs, lows, closes []float64, signals *[]Signal) {
	if len(highs) < 11 || len(lows) < 11 || len(closes) < 11 {
		return
	}
	_, direction := s.indicators.CalculateSupertrend(highs, lows, closes, 10, 3)

	if direction == "up" {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "Supertrend",
			Direction:  "buy",
			Strength:   0.7,
			Confidence: 0.65,
			Message:    "Supertrend indicates uptrend",
		})
	} else if direction == "down" {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "Supertrend",
			Direction:  "sell",
			Strength:   0.7,
			Confidence: 0.65,
			Message:    "Supertrend indicates downtrend",
		})
	}
}

func (s *SignalsService) addStochasticSignal(symbol string, highs, lows, closes []float64, signals *[]Signal) {
	if len(highs) < 14 || len(lows) < 14 || len(closes) < 14 {
		return
	}
	k, d := s.indicators.CalculateStochastic(highs, lows, closes, 14, 3)

	if k < 20 && d < 20 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "Stochastic",
			Direction:  "buy",
			Strength:   (20 - k) / 20,
			Confidence: 0.65,
			Message:    fmt.Sprintf("Stochastic K%.1f D%.1f oversold", k, d),
			Indicators: map[string]float64{"stoch_k": k, "stoch_d": d},
		})
	} else if k > 80 && d > 80 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "Stochastic",
			Direction:  "sell",
			Strength:   (k - 80) / 20,
			Confidence: 0.65,
			Message:    fmt.Sprintf("Stochastic K%.1f D%.1f overbought", k, d),
			Indicators: map[string]float64{"stoch_k": k, "stoch_d": d},
		})
	}
}

func (s *SignalsService) addVWAPSignal(symbol string, highs, lows, closes, volumes []float64, signals *[]Signal) {
	if len(highs) == 0 || len(volumes) == 0 || len(closes) == 0 {
		return
	}
	vwap := s.indicators.CalculateVWAP(highs, lows, closes, volumes)
	if vwap == 0 {
		return
	}

	lastClose := closes[len(closes)-1]
	pctDiff := (lastClose - vwap) / vwap

	if pctDiff > 0.02 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "VWAP",
			Direction:  "buy",
			Strength:   clamp(pctDiff*10, 0, 1),
			Confidence: 0.55,
			Message:    fmt.Sprintf("Price %.2f above VWAP %.2f by %.1f%%", lastClose, vwap, pctDiff*100),
			Indicators: map[string]float64{"vwap": vwap},
		})
	} else if pctDiff < -0.02 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "VWAP",
			Direction:  "sell",
			Strength:   clamp(-pctDiff*10, 0, 1),
			Confidence: 0.55,
			Message:    fmt.Sprintf("Price %.2f below VWAP %.2f by %.1f%%", lastClose, vwap, -pctDiff*100),
			Indicators: map[string]float64{"vwap": vwap},
		})
	}
}

func (s *SignalsService) addATRSignal(symbol string, highs, lows, closes []float64, signals *[]Signal) {
	if len(highs) < 15 || len(lows) < 15 || len(closes) < 15 {
		return
	}
	atr := s.indicators.CalculateATR(highs, lows, closes, 14)
	lastClose := closes[len(closes)-1]
	if lastClose == 0 {
		return
	}

	atrPct := atr / lastClose * 100
	if atrPct > 4 {
		*signals = append(*signals, Signal{
			Symbol:     symbol,
			Strategy:   "ATR",
			Direction:  "hold",
			Strength:   clamp(atrPct/10, 0, 1),
			Confidence: 0.5,
			Message:    fmt.Sprintf("High volatility: ATR %.1f%% of price", atrPct),
			Indicators: map[string]float64{"atr": atr, "atr_pct": atrPct},
		})
	}
}

func (s *SignalsService) CalculateOverallScore(signals []Signal) (float64, string) {
	if len(signals) == 0 {
		return 50, "HOLD"
	}

	var buyScore, sellScore, holdScore float64
	var buyCount, sellCount int

	for _, signal := range signals {
		weightedScore := signal.Strength * signal.Confidence
		switch signal.Direction {
		case "buy":
			buyScore += weightedScore
			buyCount++
		case "sell":
			sellScore += weightedScore
			sellCount++
		default:
			holdScore += weightedScore
		}
	}

	totalWeight := buyScore + sellScore + holdScore
	if totalWeight == 0 {
		return 50, "HOLD"
	}

	netScore := (buyScore - sellScore) / totalWeight
	score := 50 + netScore*50
	score = clamp(score, 0, 100)

	action := "HOLD"
	if score >= 70 {
		action = "BUY"
	} else if score >= 60 {
		action = "WEAK_BUY"
	} else if score <= 30 {
		action = "SELL"
	} else if score <= 40 {
		action = "WEAK_SELL"
	}

	return score, action
}

func (s *SignalsService) ComputeSignalResult(symbol string, highs, lows, closes, volumes []float64) *SignalResult {
	signals := s.CalculateSignals(symbol, highs, lows, closes, volumes)
	score, action := s.CalculateOverallScore(signals)

	var reasons []string
	for _, sig := range signals {
		if sig.Direction != "hold" {
			reasons = append(reasons, sig.Message)
		}
	}

	var totalConfidence float64
	if len(signals) > 0 {
		for _, sig := range signals {
			totalConfidence += sig.Confidence
		}
		totalConfidence /= float64(len(signals))
	}

	result := &SignalResult{
		Symbol:     symbol,
		Score:      score,
		Action:     action,
		Confidence: totalConfidence,
		Signals:    signals,
		Reasons:    reasons,
		ComputedAt: time.Now(),
	}

	return result
}

func (s *SignalsService) GetCachedSignals(ctx context.Context, symbol string) (*SignalResult, error) {
	if s.redis == nil {
		return nil, fmt.Errorf("redis not available")
	}

	key := fmt.Sprintf("analytics:signals:%s", symbol)
	data, err := s.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var result SignalResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (s *SignalsService) CacheSignals(ctx context.Context, symbol string, result *SignalResult) error {
	if s.redis == nil {
		return nil
	}

	key := fmt.Sprintf("analytics:signals:%s", symbol)
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}

	return s.redis.Set(ctx, key, data, 5*time.Minute).Err()
}

func clamp(val, min, max float64) float64 {
	if val < min {
		return min
	}
	if val > max {
		return max
	}
	return val
}
