package grpc

import (
	"context"

	"github.com/stockmafia/trading-app/services/price/internal/handler"
	"github.com/stockmafia/trading-app/services/price/internal/repository"
	pricev1 "github.com/stockmafia/trading-app/proto/stockmafia/price/v1"
	commonv1 "github.com/stockmafia/trading-app/proto/stockmafia/common/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

type Server struct {
	pricev1.UnimplementedPriceServiceServer
	quotesRepo     *repository.QuotesRepository
	wsHub          *handler.Hub
	sseBroadcaster *handler.SSEBroadcaster
	logger         *zap.Logger
}

func RegisterServer(grpcSrv *grpc.Server, quotesRepo *repository.QuotesRepository,
	wsHub *handler.Hub, sseBroadcaster *handler.SSEBroadcaster, logger *zap.Logger) {
	srv := &Server{
		quotesRepo:     quotesRepo,
		wsHub:          wsHub,
		sseBroadcaster: sseBroadcaster,
		logger:         logger,
	}
	pricev1.RegisterPriceServiceServer(grpcSrv, srv)
}

func (s *Server) GetQuotes(ctx context.Context, req *pricev1.GetQuotesRequest) (*pricev1.GetQuotesResponse, error) {
	return &pricev1.GetQuotesResponse{
		Quotes: []*commonv1.Quote{},
	}, nil
}

func (s *Server) GetStockDetail(ctx context.Context, req *pricev1.GetStockDetailRequest) (*pricev1.GetStockDetailResponse, error) {
	if req.Yahoo == "" {
		return &pricev1.GetStockDetailResponse{}, nil
	}

	detail, err := s.quotesRepo.GetStockDetail(ctx, req.Yahoo)
	if err != nil {
		return &pricev1.GetStockDetailResponse{}, nil
	}

	return &pricev1.GetStockDetailResponse{
		Stock: &commonv1.Stock{
			Symbol: detail.Symbol,
			Name:   detail.Symbol,
		},
		Quote: &commonv1.Quote{
			Symbol:        detail.Symbol,
			Last:          detail.Price,
			Change:        detail.Change,
			ChangePercent: detail.ChangePercent,
			Volume:        detail.Volume,
			Bid:           detail.Bid,
			Ask:           detail.Ask,
			Timestamp:     detail.Timestamp.Unix(),
			Source:        detail.Source,
		},
		Candles:     []*commonv1.Candle{},
		Fundamentals: "",
		News:         "",
	}, nil
}
