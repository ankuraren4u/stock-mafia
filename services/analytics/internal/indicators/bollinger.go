package indicators

func (s *IndicatorService) CalculateBollingerBands(closes []float64, period int, stdDevMult float64) (upper, middle, lower float64) {
	if len(closes) < period {
		return 0, 0, 0
	}

	recent := closes[len(closes)-period:]
	middle = average(recent)
	std := stddev(recent)
	upper = middle + stdDevMult*std
	lower = middle - stdDevMult*std

	return
}

func (s *IndicatorService) CalculateBollingerBandsValues(closes []float64, period int, stdDevMult float64) (upper, middle, lower []float64) {
	if len(closes) < period {
		return nil, nil, nil
	}

	count := len(closes) - period + 1
	upper = make([]float64, count)
	middle = make([]float64, count)
	lower = make([]float64, count)

	for i := period - 1; i < len(closes); i++ {
		window := closes[i-period+1 : i+1]
		ma := average(window)
		std := stddev(window)

		idx := i - period + 1
		upper[idx] = ma + stdDevMult*std
		middle[idx] = ma
		lower[idx] = ma - stdDevMult*std
	}

	return
}
