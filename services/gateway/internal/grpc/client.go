package grpc

import (
	"fmt"

	alertv1 "github.com/stockmafia/trading-app/proto/stockmafia/alert/v1"
	analyticsv1 "github.com/stockmafia/trading-app/proto/stockmafia/analytics/v1"
	crawlerv1 "github.com/stockmafia/trading-app/proto/stockmafia/crawler/v1"
	portfoliov1 "github.com/stockmafia/trading-app/proto/stockmafia/portfolio/v1"
	pricev1 "github.com/stockmafia/trading-app/proto/stockmafia/price/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type GRPCConfig struct {
	CrawlerAddr   string
	PriceAddr     string
	AnalyticsAddr string
	AlertAddr     string
	PortfolioAddr string
}

type Clients struct {
	Crawler   crawlerv1.CrawlerServiceClient
	Price     pricev1.PriceServiceClient
	Analytics analyticsv1.AnalyticsServiceClient
	Alert     alertv1.AlertServiceClient
	Portfolio portfoliov1.PortfolioServiceClient
	conns     []*grpc.ClientConn
}

func NewClients(cfg GRPCConfig, logger *zap.Logger) (*Clients, error) {
	clients := &Clients{}

	crawlerConn, err := grpc.Dial(cfg.CrawlerAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to crawler service: %w", err)
	}
	clients.Crawler = crawlerv1.NewCrawlerServiceClient(crawlerConn)
	clients.conns = append(clients.conns, crawlerConn)

	priceConn, err := grpc.Dial(cfg.PriceAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to price service: %w", err)
	}
	clients.Price = pricev1.NewPriceServiceClient(priceConn)
	clients.conns = append(clients.conns, priceConn)

	analyticsConn, err := grpc.Dial(cfg.AnalyticsAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to analytics service: %w", err)
	}
	clients.Analytics = analyticsv1.NewAnalyticsServiceClient(analyticsConn)
	clients.conns = append(clients.conns, analyticsConn)

	alertConn, err := grpc.Dial(cfg.AlertAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to alert service: %w", err)
	}
	clients.Alert = alertv1.NewAlertServiceClient(alertConn)
	clients.conns = append(clients.conns, alertConn)

	portfolioConn, err := grpc.Dial(cfg.PortfolioAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to portfolio service: %w", err)
	}
	clients.Portfolio = portfoliov1.NewPortfolioServiceClient(portfolioConn)
	clients.conns = append(clients.conns, portfolioConn)

	logger.Info("all gRPC clients connected")
	return clients, nil
}

func (c *Clients) Close() {
	for _, conn := range c.conns {
		conn.Close()
	}
}
