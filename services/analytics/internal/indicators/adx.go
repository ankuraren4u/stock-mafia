package indicators

import "math"

func (s *IndicatorService) CalculateADX(highs, lows, closes []float64, period int) float64 {
	if len(highs) < period*2+1 || len(lows) < period*2+1 || len(closes) < period*2+1 {
		return 0
	}

	var plusDM, minusDM, tr []float64

	for i := 1; i < len(highs); i++ {
		upMove := highs[i] - highs[i-1]
		downMove := lows[i-1] - lows[i]

		if upMove > downMove && upMove > 0 {
			plusDM = append(plusDM, upMove)
		} else {
			plusDM = append(plusDM, 0)
		}

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
	smoothPlusDM := average(plusDM[:period])
	smoothMinusDM := average(minusDM[:period])

	var dx []float64
	for i := period; i < len(tr); i++ {
		smoothTR = (smoothTR*float64(period-1) + tr[i]) / float64(period)
		smoothPlusDM = (smoothPlusDM*float64(period-1) + plusDM[i]) / float64(period)
		smoothMinusDM = (smoothMinusDM*float64(period-1) + minusDM[i]) / float64(period)

		if smoothTR == 0 {
			continue
		}

		plusDI := (smoothPlusDM / smoothTR) * 100
		minusDI := (smoothMinusDM / smoothTR) * 100

		diSum := plusDI + minusDI
		if diSum == 0 {
			continue
		}

		dx = append(dx, math.Abs(plusDI-minusDI)/diSum*100)
	}

	if len(dx) < period {
		return 0
	}

	adx := average(dx[:period])
	for i := period; i < len(dx); i++ {
		adx = (adx*float64(period-1) + dx[i]) / float64(period)
	}

	return adx
}

func (s *IndicatorService) CalculateADXValue(highs, lows, closes []float64, period int) float64 {
	return s.CalculateADX(highs, lows, closes, period)
}

func max3(a, b, c float64) float64 {
	m := a
	if b > m {
		m = b
	}
	if c > m {
		m = c
	}
	return m
}
