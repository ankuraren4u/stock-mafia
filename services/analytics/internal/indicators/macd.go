package indicators

func (s *IndicatorService) CalculateMACD(closes []float64, fastPeriod, slowPeriod, signalPeriod int) (float64, float64, float64) {
	if len(closes) < slowPeriod+signalPeriod {
		return 0, 0, 0
	}

	fastEMAValues := s.CalculateEMALine(closes, fastPeriod)
	slowEMAValues := s.CalculateEMALine(closes, slowPeriod)

	if fastEMAValues == nil || slowEMAValues == nil {
		return 0, 0, 0
	}

	macdLine := make([]float64, len(closes))
	for i := range closes {
		if fastEMAValues[i] != 0 && slowEMAValues[i] != 0 {
			macdLine[i] = fastEMAValues[i] - slowEMAValues[i]
		}
	}

	startIdx := slowPeriod - 1
	validMACD := make([]float64, 0)
	for i := startIdx; i < len(macdLine); i++ {
		if macdLine[i] != 0 {
			validMACD = append(validMACD, macdLine[i])
		}
	}

	if len(validMACD) < signalPeriod {
		return 0, 0, 0
	}

	signalLine := calculateEMAFromValues(validMACD, signalPeriod)

	lastMACD := validMACD[len(validMACD)-1]
	histogram := lastMACD - signalLine

	return lastMACD, signalLine, histogram
}

func (s *IndicatorService) CalculateMACDLine(closes []float64, fastPeriod, slowPeriod int) (float64, float64, float64) {
	return s.CalculateMACD(closes, fastPeriod, slowPeriod, 9)
}

func calculateEMAFromValues(data []float64, period int) float64 {
	if len(data) < period {
		return 0
	}

	multiplier := 2.0 / float64(period+1)
	ema := average(data[:period])

	for i := period; i < len(data); i++ {
		ema = (data[i]-ema)*multiplier + ema
	}

	return ema
}
