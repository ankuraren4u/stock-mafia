package indicators

import "math"

type IndicatorService struct{}

func NewIndicatorService() *IndicatorService {
	return &IndicatorService{}
}

func (s *IndicatorService) CalculateRSI(closes []float64, period int) float64 {
	if len(closes) < period+1 {
		return 50
	}

	var gains, losses []float64
	for i := 1; i < len(closes); i++ {
		change := closes[i] - closes[i-1]
		if change > 0 {
			gains = append(gains, change)
			losses = append(losses, 0)
		} else {
			gains = append(gains, 0)
			losses = append(losses, math.Abs(change))
		}
	}

	if len(gains) < period {
		return 50
	}

	avgGain := average(gains[:period])
	avgLoss := average(losses[:period])

	for i := period; i < len(gains); i++ {
		avgGain = (avgGain*float64(period-1) + gains[i]) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + losses[i]) / float64(period)
	}

	if avgLoss == 0 {
		return 100
	}

	rs := avgGain / avgLoss
	return 100 - (100 / (1 + rs))
}

func (s *IndicatorService) CalculateRSIValues(closes []float64, period int) []float64 {
	if len(closes) < period+1 {
		return nil
	}

	var gains, losses []float64
	for i := 1; i < len(closes); i++ {
		change := closes[i] - closes[i-1]
		if change > 0 {
			gains = append(gains, change)
			losses = append(losses, 0)
		} else {
			gains = append(gains, 0)
			losses = append(losses, math.Abs(change))
		}
	}

	if len(gains) < period {
		return nil
	}

	result := make([]float64, 0, len(gains)-period+1)

	avgGain := average(gains[:period])
	avgLoss := average(losses[:period])

	if avgLoss == 0 {
		result = append(result, 100)
	} else {
		rs := avgGain / avgLoss
		result = append(result, 100-(100/(1+rs)))
	}

	for i := period; i < len(gains); i++ {
		avgGain = (avgGain*float64(period-1) + gains[i]) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + losses[i]) / float64(period)

		if avgLoss == 0 {
			result = append(result, 100)
		} else {
			rs := avgGain / avgLoss
			result = append(result, 100-(100/(1+rs)))
		}
	}

	return result
}
