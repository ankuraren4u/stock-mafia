package service

import (
	"github.com/stockmafia/trading-app/services/analytics/internal/repository"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

type LegacySignalResult struct {
	Yahoo      string
	Symbol     string
	Score      float64
	Label      string
	Indicators map[string]float64
	Thesis     string
}

func (s *Service) ComputeSignals(yahoos []string) ([]LegacySignalResult, error) {
	scores, err := s.repo.GetSignals(yahoos)
	if err != nil {
		return nil, err
	}

	var results []LegacySignalResult
	for _, sc := range scores {
		score := computeScore(sc)
		label := "hold"
		if score >= 75 {
			label = "buy"
		} else if score <= 35 {
			label = "sell"
		}

		results = append(results, LegacySignalResult{
			Yahoo:  sc.Yahoo,
			Score:  score,
			Label:  label,
			Thesis: sc.Thesis,
		})
	}
	return results, nil
}

func computeScore(sc repository.SignalScore) float64 {
	base := 50.0
	if sc.Score > 0 {
		base = sc.Score
	}
	return base
}
