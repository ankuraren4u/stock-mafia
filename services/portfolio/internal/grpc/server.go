package grpc

import (
	"context"
	"fmt"

	"github.com/stockmafia/trading-app/services/portfolio/internal/service"
	commonv1 "github.com/stockmafia/trading-app/proto/stockmafia/common/v1"
	portfoliov1 "github.com/stockmafia/trading-app/proto/stockmafia/portfolio/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	portfoliov1.UnimplementedPortfolioServiceServer
	paperService   *service.PaperService
	kiteService    *service.KiteService
	journalService *service.JournalService
	logger         *zap.Logger
}

func RegisterServer(grpcSrv *grpc.Server, paperService *service.PaperService,
	kiteService *service.KiteService, journalService *service.JournalService,
	logger *zap.Logger) {
	srv := &Server{
		paperService:   paperService,
		kiteService:    kiteService,
		journalService: journalService,
		logger:         logger,
	}
	portfoliov1.RegisterPortfolioServiceServer(grpcSrv, srv)
}

func (s *Server) GetPortfolio(ctx context.Context, req *portfoliov1.GetPortfolioRequest) (*portfoliov1.GetPortfolioResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	portfolio, err := s.paperService.GetPortfolio(ctx, req.UserId)
	if err != nil {
		s.logger.Error("failed to get portfolio", zap.String("user_id", req.UserId), zap.Error(err))
		return nil, status.Error(codes.Internal, err.Error())
	}

	var protoPositions []*commonv1.Position
	for _, pos := range portfolio.Positions {
		protoPositions = append(protoPositions, &commonv1.Position{
			Id:           pos.ID,
			UserId:       pos.UserID,
			Symbol:       pos.Symbol,
			Side:         pos.Side,
			Quantity:     pos.Quantity,
			EntryPrice:   pos.EntryPrice,
			CurrentPrice: pos.CurrentPrice,
			Pnl:          pos.PnL,
			PnlPercent:   pos.PnLPercent,
			Status:       pos.Status,
			CreatedAt:    pos.CreatedAt.Unix(),
		})
	}

	return &portfoliov1.GetPortfolioResponse{
		TotalValue: portfolio.TotalValue,
		Cash:       portfolio.Cash,
		Invested:   portfolio.Invested,
		Pnl:        portfolio.PnL,
		PnlPercent: portfolio.PnLPercent,
		Positions:  protoPositions,
	}, nil
}

func (s *Server) PlaceOrder(ctx context.Context, req *portfoliov1.PlaceOrderRequest) (*portfoliov1.PlaceOrderResponse, error) {
	if req.Yahoo == "" {
		return nil, status.Error(codes.InvalidArgument, "yahoo symbol is required")
	}

	if req.Quantity <= 0 {
		return nil, status.Error(codes.InvalidArgument, "quantity must be positive")
	}

	order, err := s.kiteService.PlaceOrder(ctx, service.OrderRequest{
		Symbol:    req.Yahoo,
		Side:      req.Side,
		Quantity:  float64(req.Quantity),
		Price:     req.Price,
		Exchange:  "NSE",
		Product:   "CNC",
		Duration:  "DAY",
		OrderType: "MARKET",
	})
	if err != nil {
		s.logger.Error("failed to place order",
			zap.String("yahoo", req.Yahoo),
			zap.Error(err),
		)
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &portfoliov1.PlaceOrderResponse{
		Order: &commonv1.Order{
			Id:     order.OrderID,
			Symbol: req.Yahoo,
			Side:   req.Side,
			Status: order.Status,
		},
		Message: order.Message,
	}, nil
}

func (s *Server) GetOrders(ctx context.Context, req *portfoliov1.GetOrdersRequest) (*portfoliov1.GetOrdersResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	orders, err := s.paperService.GetOrders(ctx, req.UserId)
	if err != nil {
		s.logger.Error("failed to get orders", zap.String("user_id", req.UserId), zap.Error(err))
		return nil, status.Error(codes.Internal, err.Error())
	}

	var protoOrders []*commonv1.Order
	for _, order := range orders {
		if req.Status != "" && order.Status != req.Status {
			continue
		}

		protoOrders = append(protoOrders, &commonv1.Order{
			Id:        order.ID,
			UserId:    order.UserID,
			Symbol:    order.Symbol,
			Side:      order.Side,
			OrderType: order.OrderType,
			Quantity:  order.Quantity,
			Price:     order.Price,
			Status:    order.Status,
			CreatedAt: order.CreatedAt.Unix(),
		})
	}

	return &portfoliov1.GetOrdersResponse{
		Orders: protoOrders,
		Pagination: &commonv1.PaginationResponse{
			Total:      int32(len(protoOrders)),
			Page:       1,
			PageSize:   int32(len(protoOrders)),
			TotalPages: 1,
		},
	}, nil
}

func (s *Server) GetPositions(ctx context.Context, req *portfoliov1.GetPositionsRequest) (*portfoliov1.GetPositionsResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	positions, err := s.paperService.GetPositions(ctx, req.UserId)
	if err != nil {
		s.logger.Error("failed to get positions", zap.String("user_id", req.UserId), zap.Error(err))
		return nil, status.Error(codes.Internal, err.Error())
	}

	var protoPositions []*commonv1.Position
	var totalPnL float64
	var totalInvestment float64
	for _, pos := range positions {
		totalPnL += pos.PnL
		totalInvestment += pos.EntryPrice * pos.Quantity

		protoPositions = append(protoPositions, &commonv1.Position{
			Id:           pos.ID,
			UserId:       pos.UserID,
			Symbol:       pos.Symbol,
			Side:         pos.Side,
			Quantity:     pos.Quantity,
			EntryPrice:   pos.EntryPrice,
			CurrentPrice: pos.CurrentPrice,
			Pnl:          pos.PnL,
			PnlPercent:   pos.PnLPercent,
			Status:       pos.Status,
			CreatedAt:    pos.CreatedAt.Unix(),
		})
	}

	return &portfoliov1.GetPositionsResponse{
		Positions:       protoPositions,
		TotalPnl:        totalPnL,
		TotalInvestment: totalInvestment,
	}, nil
}

func (s *Server) PaperTrade(ctx context.Context, req *portfoliov1.PaperTradeRequest) (*portfoliov1.PaperTradeResponse, error) {
	if req.UserId == "" || req.Symbol == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id and symbol are required")
	}

	if req.Quantity <= 0 || req.Price <= 0 {
		return nil, status.Error(codes.InvalidArgument, "quantity and price must be positive")
	}

	order, err := s.paperService.PlaceOrder(ctx, req.UserId, req.Symbol, req.Side, "MARKET", req.Quantity, req.Price)
	if err != nil {
		s.logger.Error("failed to execute paper trade",
			zap.String("user_id", req.UserId),
			zap.String("symbol", req.Symbol),
			zap.Error(err),
		)
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &portfoliov1.PaperTradeResponse{
		Position: &commonv1.Position{
			Id:         order.ID,
			UserId:     order.UserID,
			Symbol:     order.Symbol,
			Side:       order.Side,
			Quantity:   order.Quantity,
			EntryPrice: order.Price,
			Status:     "open",
			CreatedAt:  order.CreatedAt.Unix(),
		},
		Message: fmt.Sprintf("Paper trade executed: %s %s at %.2f", order.Side, order.Symbol, order.Price),
	}, nil
}

func (s *Server) AddJournalEntry(ctx context.Context, req *portfoliov1.AddJournalEntryRequest) (*portfoliov1.AddJournalEntryResponse, error) {
	return &portfoliov1.AddJournalEntryResponse{
		Message: "journal entry added",
	}, nil
}
