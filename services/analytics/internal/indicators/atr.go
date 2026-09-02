package indicators

import "math"

func (s *IndicatorService) CalculateATR(highs, lows, closes []float64, period int) float64 {
	return s.calculateATR(highs, lows, closes, period)
}

func (s *IndicatorService) CalculateATRValues(highs, lows, closes []float64, period int) []float64 {
	if len(highs) < period+1 || len(lows) < period+1 || len(closes) < period+1 {
		return nil
	}

	var tr []float64
	for i := 1; i < len(highs); i++ {
		tr = append(tr, max3(
			highs[i]-lows[i],
			math.Abs(highs[i]-closes[i-1]),
			math.Abs(lows[i]-closes[i-1]),
		))
	}

	if len(tr) < period {
		return nil
	}

	result := make([]float64, len(tr)-period+1)
	atr := average(tr[:period])
	result[0] = atr

	for i := period; i < len(tr); i++ {
		atr = (atr*float64(period-1) + tr[i]) / float64(period)
		result[i-period+1] = atr
	}

	return result
}
