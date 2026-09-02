package grpc

import (
	"context"

	"github.com/stockmafia/trading-app/services/alert/internal/service"
	commonv1 "github.com/stockmafia/trading-app/proto/stockmafia/common/v1"
	alertv1 "github.com/stockmafia/trading-app/proto/stockmafia/alert/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

type Server struct {
	alertv1.UnimplementedAlertServiceServer
	checker    *service.Checker
	dispatcher *service.Dispatcher
	logger     *zap.Logger
}

func RegisterServer(grpcSrv *grpc.Server, checker *service.Checker, dispatcher *service.Dispatcher, logger *zap.Logger) {
	srv := &Server{
		checker:    checker,
		dispatcher: dispatcher,
		logger:     logger,
	}
	alertv1.RegisterAlertServiceServer(grpcSrv, srv)
}

func (s *Server) GetWatchlist(ctx context.Context, req *alertv1.GetWatchlistRequest) (*alertv1.GetWatchlistResponse, error) {
	return &alertv1.GetWatchlistResponse{
		Stocks: []*commonv1.Stock{},
	}, nil
}

func (s *Server) GetAlerts(ctx context.Context, req *alertv1.GetAlertsRequest) (*alertv1.GetAlertsResponse, error) {
	return &alertv1.GetAlertsResponse{
		Alerts: []*commonv1.Alert{},
	}, nil
}
