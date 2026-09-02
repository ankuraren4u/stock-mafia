package indicators

func (s *IndicatorService) CalculateVWAP(highs, lows, closes, volumes []float64) float64 {
	if len(highs) == 0 || len(lows) == 0 || len(closes) == 0 || len(volumes) == 0 {
		return 0
	}

	var totalTPV, totalVolume float64
	n := len(highs)
	if len(lows) < n {
		n = len(lows)
	}
	if len(closes) < n {
		n = len(closes)
	}
	if len(volumes) < n {
		n = len(volumes)
	}

	for i := 0; i < n; i++ {
		tp := (highs[i] + lows[i] + closes[i]) / 3
		totalTPV += tp * volumes[i]
		totalVolume += volumes[i]
	}

	if totalVolume == 0 {
		return 0
	}

	return totalTPV / totalVolume
}

func (s *IndicatorService) CalculateVWAPValues(highs, lows, closes, volumes []float64) []float64 {
	if len(highs) == 0 || len(lows) == 0 || len(closes) == 0 || len(volumes) == 0 {
		return nil
	}

	n := len(highs)
	if len(lows) < n {
		n = len(lows)
	}
	if len(closes) < n {
		n = len(closes)
	}
	if len(volumes) < n {
		n = len(volumes)
	}

	result := make([]float64, n)
	var totalTPV, totalVolume float64

	for i := 0; i < n; i++ {
		tp := (highs[i] + lows[i] + closes[i]) / 3
		totalTPV += tp * volumes[i]
		totalVolume += volumes[i]

		if totalVolume > 0 {
			result[i] = totalTPV / totalVolume
		}
	}

	return result
}
