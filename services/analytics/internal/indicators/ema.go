package indicators

func (s *IndicatorService) CalculateEMA(data []float64, period int) float64 {
	if len(data) == 0 {
		return 0
	}
	if len(data) < period {
		return data[len(data)-1]
	}

	multiplier := 2.0 / float64(period+1)
	ema := average(data[:period])

	for i := period; i < len(data); i++ {
		ema = (data[i]-ema)*multiplier + ema
	}

	return ema
}

func (s *IndicatorService) CalculateEMALine(data []float64, period int) []float64 {
	if len(data) < period {
		return nil
	}

	result := make([]float64, len(data))
	multiplier := 2.0 / float64(period+1)

	result[period-1] = average(data[:period])

	for i := period; i < len(data); i++ {
		result[i] = (data[i]-result[i-1])*multiplier + result[i-1]
	}

	return result
}

func (s *IndicatorService) CalculateEMADifference(closes []float64, shortPeriod, longPeriod int) float64 {
	if len(closes) < longPeriod {
		return 0
	}

	shortEMA := s.CalculateEMA(closes, shortPeriod)
	longEMA := s.CalculateEMA(closes, longPeriod)

	return shortEMA - longEMA
}

func (s *IndicatorService) CalculateEMA2050200(closes []float64) (ema20, ema50, ema200 float64) {
	ema20 = s.CalculateEMA(closes, 20)
	ema50 = s.CalculateEMA(closes, 50)
	ema200 = s.CalculateEMA(closes, 200)
	return
}
