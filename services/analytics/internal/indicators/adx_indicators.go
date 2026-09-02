package indicators

import "math"

func (s *IndicatorService) CalculatePlusDI(highs, lows, closes []float64, period int) float64 {
	if len(highs) < period+1 || len(lows) < period+1 || len(closes) < period+1 {
		return 0
	}

	var plusDM, tr []float64
	for i := 1; i < len(highs); i++ {
		upMove := highs[i] - highs[i-1]
		downMove := lows[i-1] - lows[i]

		if upMove > downMove && upMove > 0 {
			plusDM = append(plusDM, upMove)
		} else {
			plusDM = append(plusDM, 0)
		}

		tr = append(tr, max3(
			highs[i]-lows[i],
			math.Abs(highs[i]-closes[i-1]),
			math.Abs(lows[i]-closes[i-1]),
		))
	}

	if len(tr) < period {
		return 0
	}

	smoothTR := average(tr[:period])
	smoothPlusDM := average(plusDM[:period])

	for i := period; i < len(tr); i++ {
		smoothTR = (smoothTR*float64(period-1) + tr[i]) / float64(period)
		smoothPlusDM = (smoothPlusDM*float64(period-1) + plusDM[i]) / float64(period)
	}

	if smoothTR == 0 {
		return 0
	}

	return (smoothPlusDM / smoothTR) * 100
}

func (s *IndicatorService) CalculateMinusDI(highs, lows, closes []float64, period int) float64 {
	if len(highs) < period+1 || len(lows) < period+1 || len(closes) < period+1 {
		return 0
	}

	var minusDM, tr []float64
	for i := 1; i < len(highs); i++ {
		upMove := highs[i] - highs[i-1]
		downMove := lows[i-1] - lows[i]

		if downMove > upMove && downMove > 0 {
			minusDM = append(minusDM, downMove)
		} else {
			minusDM = append(minusDM, 0)
		}

		tr = append(tr, max3(
			highs[i]-lows[i],
			math.Abs(highs[i]-closes[i-1]),
			math.Abs(lows[i]-closes[i-1]),
		))
	}

	if len(tr) < period {
		return 0
	}

	smoothTR := average(tr[:period])
	smoothMinusDM := average(minusDM[:period])

	for i := period; i < len(tr); i++ {
		smoothTR = (smoothTR*float64(period-1) + tr[i]) / float64(period)
		smoothMinusDM = (smoothMinusDM*float64(period-1) + minusDM[i]) / float64(period)
	}

	if smoothTR == 0 {
		return 0
	}

	return (smoothMinusDM / smoothTR) * 100
}
