package grpc

import (
	"context"

	crawlerv1 "github.com/stockmafia/trading-app/proto/stockmafia/crawler/v1"
	commonv1 "github.com/stockmafia/trading-app/proto/stockmafia/common/v1"
	"github.com/stockmafia/trading-app/services/crawler/internal/crawler"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	crawlerv1.UnimplementedCrawlerServiceServer
	orchestrator *crawler.Orchestrator
	logger       *zap.Logger
}

func RegisterServer(grpcSrv *grpc.Server, orchestrator *crawler.Orchestrator, logger *zap.Logger) {
	srv := &Server{
		orchestrator: orchestrator,
		logger:       logger,
	}
	crawlerv1.RegisterCrawlerServiceServer(grpcSrv, srv)
}

func (s *Server) GetStocks(ctx context.Context, req *crawlerv1.GetStocksRequest) (*crawlerv1.GetStocksResponse, error) {
	s.logger.Info("GetStocks called", zap.String("exchange", req.Exchange))

	return &crawlerv1.GetStocksResponse{
		Stocks: []*commonv1.Stock{},
		Pagination: &commonv1.PaginationResponse{
			Total:      0,
			Page:       req.Pagination.GetPage(),
			PageSize:   req.Pagination.GetPageSize(),
			TotalPages: 0,
		},
	}, nil
}

func (s *Server) GetStock(ctx context.Context, req *crawlerv1.GetStockRequest) (*crawlerv1.GetStockResponse, error) {
	if req.Symbol == "" {
		return nil, status.Error(codes.InvalidArgument, "symbol is required")
	}

	return &crawlerv1.GetStockResponse{
		Stock: &commonv1.Stock{
			Symbol: req.Symbol,
			Name:   req.Symbol,
		},
	}, nil
}

func (s *Server) GetCrawlStatus(ctx context.Context, req *crawlerv1.CrawlStatusRequest) (*crawlerv1.CrawlStatusResponse, error) {
	return &crawlerv1.CrawlStatusResponse{
		ActiveWorkers: 10,
		QueuedJobs:    0,
		Sources:       make(map[string]*crawlerv1.SourceStatus),
	}, nil
}

func (s *Server) StartCrawl(ctx context.Context, req *crawlerv1.StartCrawlRequest) (*crawlerv1.StartCrawlResponse, error) {
	return &crawlerv1.StartCrawlResponse{
		JobId:  "pending",
		Status: "queued",
	}, nil
}

func (s *Server) CrawlSymbol(ctx context.Context, req *crawlerv1.CrawlSymbolRequest) (*crawlerv1.CrawlSymbolResponse, error) {
	if req.Yahoo == "" {
		return nil, status.Error(codes.InvalidArgument, "yahoo symbol is required")
	}

	return &crawlerv1.CrawlSymbolResponse{
		Symbol: req.Yahoo,
		Status: "queued",
	}, nil
}

func (s *Server) GetCandles(ctx context.Context, req *crawlerv1.GetCandlesRequest) (*crawlerv1.GetCandlesResponse, error) {
	if req.Symbol == "" {
		return nil, status.Error(codes.InvalidArgument, "symbol is required")
	}

	return &crawlerv1.GetCandlesResponse{
		Candles: []*commonv1.Candle{},
	}, nil
}

func (s *Server) GetQuote(ctx context.Context, req *crawlerv1.GetQuoteRequest) (*crawlerv1.GetQuoteResponse, error) {
	if req.Symbol == "" {
		return nil, status.Error(codes.InvalidArgument, "symbol is required")
	}

	return &crawlerv1.GetQuoteResponse{
		Quote: &commonv1.Quote{
			Symbol: req.Symbol,
		},
	}, nil
}

func (s *Server) GetQuotes(ctx context.Context, req *crawlerv1.GetQuotesRequest) (*crawlerv1.GetQuotesResponse, error) {
	return &crawlerv1.GetQuotesResponse{
		Quotes: []*commonv1.Quote{},
	}, nil
}

func (s *Server) TriggerCrawl(ctx context.Context, req *crawlerv1.TriggerCrawlRequest) (*crawlerv1.TriggerCrawlResponse, error) {
	if len(req.Symbols) == 0 {
		return nil, status.Error(codes.InvalidArgument, "symbols are required")
	}

	jobID := s.orchestrator.TriggerCrawl(ctx, req.Symbols, req.Source)

	return &crawlerv1.TriggerCrawlResponse{
		JobId:  jobID,
		Status: "queued",
	}, nil
}
