package indicators

func (s *IndicatorService) CalculateStochastic(highs, lows, closes []float64, kPeriod, dPeriod int) (float64, float64) {
	if len(closes) < kPeriod || len(highs) < kPeriod || len(lows) < kPeriod {
		return 50, 50
	}

	var kValues []float64
	for i := kPeriod - 1; i < len(closes); i++ {
		highest := maxVal(highs[i-kPeriod+1 : i+1]...)
		lowest := minVal(lows[i-kPeriod+1 : i+1]...)

		if highest == lowest {
			kValues = append(kValues, 50)
		} else {
			k := ((closes[i] - lowest) / (highest - lowest)) * 100
			kValues = append(kValues, k)
		}
	}

	if len(kValues) < dPeriod {
		return 50, 50
	}

	k := kValues[len(kValues)-1]
	d := average(kValues[len(kValues)-dPeriod:])

	return k, d
}

func (s *IndicatorService) CalculateStochasticValues(highs, lows, closes []float64, kPeriod, dPeriod int) ([]float64, []float64) {
	if len(closes) < kPeriod || len(highs) < kPeriod || len(lows) < kPeriod {
		return nil, nil
	}

	var kValues []float64
	for i := kPeriod - 1; i < len(closes); i++ {
		highest := maxVal(highs[i-kPeriod+1 : i+1]...)
		lowest := minVal(lows[i-kPeriod+1 : i+1]...)

		if highest == lowest {
			kValues = append(kValues, 50)
		} else {
			k := ((closes[i] - lowest) / (highest - lowest)) * 100
			kValues = append(kValues, k)
		}
	}

	dValues := make([]float64, 0)
	for i := dPeriod - 1; i < len(kValues); i++ {
		d := average(kValues[i-dPeriod+1 : i+1])
		dValues = append(dValues, d)
	}

	return kValues, dValues
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
