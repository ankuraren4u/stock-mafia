package grpc

import (
	"context"
	"time"

	"github.com/stockmafia/trading-app/services/analytics/internal/service"
	analyticsv1 "github.com/stockmafia/trading-app/proto/stockmafia/analytics/v1"
	commonv1 "github.com/stockmafia/trading-app/proto/stockmafia/common/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	analyticsv1.UnimplementedAnalyticsServiceServer
	signalsService    *service.SignalsService
	screenerService   *service.ScreenerService
	strategiesService *service.StrategiesService
	logger            *zap.Logger
}

func RegisterServer(grpcSrv *grpc.Server, signalsService *service.SignalsService,
	screenerService *service.ScreenerService, strategiesService *service.StrategiesService,
	logger *zap.Logger) {
	srv := &Server{
		signalsService:    signalsService,
		screenerService:   screenerService,
		strategiesService: strategiesService,
		logger:            logger,
	}
	analyticsv1.RegisterAnalyticsServiceServer(grpcSrv, srv)
}

func (s *Server) GetSignals(ctx context.Context, req *analyticsv1.GetSignalsRequest) (*analyticsv1.GetSignalsResponse, error) {
	if req.Symbol == "" {
		return nil, status.Error(codes.InvalidArgument, "symbol is required")
	}

	cached, err := s.signalsService.GetCachedSignals(ctx, req.Symbol)
	if err == nil && cached != nil {
		return s.buildSignalsResponse(cached), nil
	}

	signals := s.signalsService.CalculateSignals(req.Symbol, nil, nil, nil, nil)
	score, recommendation := s.signalsService.CalculateOverallScore(signals)

	protoSignals := s.convertSignals(req.Symbol, signals, nil, nil, nil, nil)

	result := &service.SignalResult{
		Symbol:     req.Symbol,
		Score:      score,
		Action:     recommendation,
		Signals:    signals,
		ComputedAt: time.Now(),
	}
	_ = s.signalsService.CacheSignals(ctx, req.Symbol, result)

	return &analyticsv1.GetSignalsResponse{
		Signals: protoSignals,
	}, nil
}

func (s *Server) RunScreener(ctx context.Context, req *analyticsv1.RunScreenerRequest) (*analyticsv1.RunScreenerResponse, error) {
	var filters []service.ScreenerFilter
	for key, value := range req.Filters {
		filters = append(filters, service.ScreenerFilter{
			Type:      key,
			Indicator: value,
		})
	}

	results := s.screenerService.RunScreener(nil, filters)

	var protoResults []*analyticsv1.ScreenerResult
	for _, r := range results {
		protoResults = append(protoResults, &analyticsv1.ScreenerResult{
			Symbol: r.Symbol,
			Name:   r.Name,
			Score:  r.Score,
			Signal: r.Signal,
			Indicators: s.convertIndicatorMap(r.Indicators),
		})
	}

	return &analyticsv1.RunScreenerResponse{
		Results:    protoResults,
		TotalCount: int32(len(protoResults)),
	}, nil
}

func (s *Server) GetStrategies(ctx context.Context, req *analyticsv1.GetStrategiesRequest) (*analyticsv1.GetStrategiesResponse, error) {
	strategies := s.strategiesService.GetStrategies(req.ActiveOnly)

	var protoStrategies []*analyticsv1.Strategy
	for _, strat := range strategies {
		protoStrategies = append(protoStrategies, &analyticsv1.Strategy{
			Id:          strat.ID,
			Name:        strat.Name,
			Description: strat.Description,
			IsActive:    strat.IsActive,
			WinRate:     strat.WinRate,
			TotalTrades: int32(strat.TotalTrades),
		})
	}

	return &analyticsv1.GetStrategiesResponse{
		Strategies: protoStrategies,
	}, nil
}

func (s *Server) RunStrategy(ctx context.Context, req *analyticsv1.RunStrategyRequest) (*analyticsv1.RunStrategyResponse, error) {
	if req.StrategyId == "" || req.Symbol == "" {
		return nil, status.Error(codes.InvalidArgument, "strategy_id and symbol are required")
	}

	input := service.StrategyInput{
		Symbol: req.Symbol,
	}

	output, err := s.strategiesService.RunStrategy(req.StrategyId, input)
	if err != nil {
		return nil, status.Error(codes.NotFound, err.Error())
	}

	return &analyticsv1.RunStrategyResponse{
		StrategyId: req.StrategyId,
		Symbol:     req.Symbol,
		Signal:     output.Signal,
		Confidence: output.Confidence,
		Metrics:    output.Metrics,
	}, nil
}

func (s *Server) GetAlgoConfig(ctx context.Context, req *analyticsv1.GetAlgoConfigRequest) (*analyticsv1.GetAlgoConfigResponse, error) {
	return &analyticsv1.GetAlgoConfigResponse{
		Config: make(map[string]string),
	}, nil
}

func (s *Server) GenerateSuggestions(ctx context.Context, req *analyticsv1.GenerateSuggestionsRequest) (*analyticsv1.GenerateSuggestionsResponse, error) {
	return &analyticsv1.GenerateSuggestionsResponse{
		Suggestions: []*analyticsv1.Suggestion{},
	}, nil
}

func (s *Server) ExecuteSuggestion(ctx context.Context, req *analyticsv1.ExecuteSuggestionRequest) (*analyticsv1.ExecuteSuggestionResponse, error) {
	return &analyticsv1.ExecuteSuggestionResponse{
		Success: false,
		Message: "not implemented",
	}, nil
}

func (s *Server) buildSignalsResponse(result *service.SignalResult) *analyticsv1.GetSignalsResponse {
	var protoSignals []*commonv1.Signal
	for _, sig := range result.Signals {
		protoSignals = append(protoSignals, &commonv1.Signal{
			Symbol:     sig.Symbol,
			Strategy:   sig.Strategy,
			Direction:  sig.Direction,
			Strength:   sig.Strength,
			Confidence: sig.Confidence,
			Message:    sig.Message,
			Timestamp:  result.ComputedAt.Unix(),
		})
	}

	return &analyticsv1.GetSignalsResponse{
		Signals: protoSignals,
	}
}

func (s *Server) convertSignals(symbol string, signals []service.Signal, highs, lows, closes, volumes []float64) []*commonv1.Signal {
	var protoSignals []*commonv1.Signal
	for _, sig := range signals {
		protoSignals = append(protoSignals, &commonv1.Signal{
			Symbol:     sig.Symbol,
			Strategy:   sig.Strategy,
			Direction:  sig.Direction,
			Strength:   sig.Strength,
			Confidence: sig.Confidence,
			Message:    sig.Message,
			Timestamp:  time.Now().Unix(),
		})
	}
	return protoSignals
}

func (s *Server) convertIndicatorMap(ind map[string]float64) []*commonv1.Indicator {
	var indicators []*commonv1.Indicator
	for name, value := range ind {
		indicators = append(indicators, &commonv1.Indicator{
			Name:  name,
			Value: value,
		})
	}
	return indicators
}
