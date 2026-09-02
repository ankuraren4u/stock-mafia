package indicators

import "math"

func (s *IndicatorService) CalculateSupertrend(highs, lows, closes []float64, period int, multiplier float64) (float64, string) {
	if len(closes) < period+1 || len(highs) < period+1 || len(lows) < period+1 {
		return 0, ""
	}

	atr := s.calculateATR(highs, lows, closes, period)
	if atr == 0 {
		return 0, ""
	}

	n := len(closes)
	upperBand := make([]float64, n)
	lowerBand := make([]float64, n)
	supertrendVal := make([]float64, n)
	direction := make([]string, n)

	for i := period; i < n; i++ {
		hl2 := (highs[i] + lows[i]) / 2
		upperBand[i] = hl2 + multiplier*atr
		lowerBand[i] = hl2 - multiplier*atr

		if i > period {
			if lowerBand[i] <= lowerBand[i-1] && closes[i-1] >= lowerBand[i-1] {
				lowerBand[i] = lowerBand[i-1]
			}
			if upperBand[i] >= upperBand[i-1] && closes[i-1] <= upperBand[i-1] {
				upperBand[i] = upperBand[i-1]
			}
		}

		if i == period {
			supertrendVal[i] = upperBand[i]
			direction[i] = "down"
		} else {
			if supertrendVal[i-1] == upperBand[i-1] {
				if closes[i] > upperBand[i] {
					supertrendVal[i] = lowerBand[i]
					direction[i] = "up"
				} else {
					supertrendVal[i] = upperBand[i]
					direction[i] = "down"
				}
			} else {
				if closes[i] < lowerBand[i] {
					supertrendVal[i] = upperBand[i]
					direction[i] = "down"
				} else {
					supertrendVal[i] = lowerBand[i]
					direction[i] = "up"
				}
			}
		}
	}

	return supertrendVal[n-1], direction[n-1]
}

func (s *IndicatorService) CalculateSupertrendValues(highs, lows, closes []float64, period int, multiplier float64) ([]float64, []string) {
	if len(closes) < period+1 || len(highs) < period+1 || len(lows) < period+1 {
		return nil, nil
	}

	atr := s.calculateATR(highs, lows, closes, period)
	if atr == 0 {
		return nil, nil
	}

	n := len(closes)
	upperBand := make([]float64, n)
	lowerBand := make([]float64, n)
	supertrendVal := make([]float64, n)
	direction := make([]string, n)

	for i := period; i < n; i++ {
		hl2 := (highs[i] + lows[i]) / 2
		upperBand[i] = hl2 + multiplier*atr
		lowerBand[i] = hl2 - multiplier*atr

		if i > period {
			if lowerBand[i] <= lowerBand[i-1] && closes[i-1] >= lowerBand[i-1] {
				lowerBand[i] = lowerBand[i-1]
			}
			if upperBand[i] >= upperBand[i-1] && closes[i-1] <= upperBand[i-1] {
				upperBand[i] = upperBand[i-1]
			}
		}

		if i == period {
			supertrendVal[i] = upperBand[i]
			direction[i] = "down"
		} else {
			if supertrendVal[i-1] == upperBand[i-1] {
				if closes[i] > upperBand[i] {
					supertrendVal[i] = lowerBand[i]
					direction[i] = "up"
				} else {
					supertrendVal[i] = upperBand[i]
					direction[i] = "down"
				}
			} else {
				if closes[i] < lowerBand[i] {
					supertrendVal[i] = upperBand[i]
					direction[i] = "down"
				} else {
					supertrendVal[i] = lowerBand[i]
					direction[i] = "up"
				}
			}
		}
	}

	return supertrendVal, direction
}

func (s *IndicatorService) calculateATR(highs, lows, closes []float64, period int) float64 {
	if len(highs) < period+1 || len(lows) < period+1 || len(closes) < period+1 {
		return 0
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
		return 0
	}

	atr := average(tr[:period])
	for i := period; i < len(tr); i++ {
		atr = (atr*float64(period-1) + tr[i]) / float64(period)
	}

	return atr
}
