package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/stockmafia/trading-app/services/gateway/internal/config"
	"github.com/stockmafia/trading-app/services/gateway/internal/grpc"
	"github.com/stockmafia/trading-app/services/gateway/internal/handler"
	"github.com/stockmafia/trading-app/services/gateway/internal/middleware"
	"go.uber.org/zap"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	cfg := config.Load()

	grpcClients, err := grpc.NewClients(grpc.GRPCConfig{
		CrawlerAddr:   cfg.GRPC.CrawlerAddr,
		PriceAddr:     cfg.GRPC.PriceAddr,
		AnalyticsAddr: cfg.GRPC.AnalyticsAddr,
		AlertAddr:     cfg.GRPC.AlertAddr,
		PortfolioAddr: cfg.GRPC.PortfolioAddr,
	}, logger)
	if err != nil {
		logger.Fatal("failed to create gRPC clients", zap.Error(err))
	}
	defer grpcClients.Close()

	marketHandler := handler.NewMarketHandler(grpcClients, logger)
	screenerHandler := handler.NewScreenerHandler(grpcClients, logger)
	deskHandler := handler.NewDeskHandler(grpcClients, logger)
	paperHandler := handler.NewPaperHandler(grpcClients, logger)
	crawlerHandler := handler.NewCrawlerHandler(grpcClients, logger)
	sseHandler := handler.NewSSEHandler(grpcClients, logger)
	statusHandler := handler.NewStatusHandler(grpcClients, logger, "1.0.0")

	r := setupRouter(cfg, logger, marketHandler, screenerHandler, deskHandler, paperHandler, crawlerHandler, sseHandler, statusHandler)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("gateway starting", zap.Int("port", cfg.Server.Port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server failed", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("server forced to shutdown", zap.Error(err))
	}

	logger.Info("server exited")
}

func setupRouter(
	cfg *config.Config,
	logger *zap.Logger,
	marketHandler *handler.MarketHandler,
	screenerHandler *handler.ScreenerHandler,
	deskHandler *handler.DeskHandler,
	paperHandler *handler.PaperHandler,
	crawlerHandler *handler.CrawlerHandler,
	sseHandler *handler.SSEHandler,
	statusHandler *handler.StatusHandler,
) *http.ServeMux {
	mux := http.NewServeMux()

	authMiddleware := middleware.NewAuthMiddleware(cfg.JWT.Secret, logger)
	loggingMiddleware := middleware.NewLoggingMiddleware(logger)
	tracingMiddleware := middleware.NewTracingMiddleware("gateway")

	handlerFunc := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wrapped := loggingMiddleware.Handle(next)
			wrapped = tracingMiddleware.Handle(wrapped)
			wrapped.ServeHTTP(w, r)
		})
	}

	marketRoutes := http.NewServeMux()
	marketRoutes.HandleFunc("/api/market/stocks", marketHandler.GetStocks)
	marketRoutes.HandleFunc("/api/market/stocks/", marketHandler.GetStock)
	marketRoutes.HandleFunc("/api/market/quotes", marketHandler.GetQuotes)
	marketRoutes.HandleFunc("/api/market/quotes/", marketHandler.GetQuote)
	marketRoutes.HandleFunc("/api/market/candles", marketHandler.GetCandles)

	screenerRoutes := http.NewServeMux()
	screenerRoutes.HandleFunc("/api/screener/run", screenerHandler.RunScreener)
	screenerRoutes.HandleFunc("/api/screener/results", screenerHandler.GetResults)

	deskRoutes := http.NewServeMux()
	deskRoutes.HandleFunc("/api/desk/signals", deskHandler.GetSignals)
	deskRoutes.HandleFunc("/api/desk/strategies", deskHandler.GetStrategies)
	deskRoutes.HandleFunc("/api/desk/strategy/", deskHandler.RunStrategy)

	paperRoutes := http.NewServeMux()
	paperRoutes.HandleFunc("/api/paper/order", paperHandler.PlaceOrder)
	paperRoutes.HandleFunc("/api/paper/orders", paperHandler.GetOrders)
	paperRoutes.HandleFunc("/api/paper/positions", paperHandler.GetPositions)
	paperRoutes.HandleFunc("/api/paper/portfolio", paperHandler.GetPortfolio)

	crawlerRoutes := http.NewServeMux()
	crawlerRoutes.HandleFunc("/api/crawler/status", crawlerHandler.GetStatus)
	crawlerRoutes.HandleFunc("/api/crawler/trigger", crawlerHandler.TriggerCrawl)

	sseRoutes := http.NewServeMux()
	sseRoutes.HandleFunc("/api/sse/prices", sseHandler.SubscribePrices)
	sseRoutes.HandleFunc("/api/sse/alerts", sseHandler.SubscribeAlerts)

	mux.Handle("/api/market/", handlerFunc(marketRoutes))
	mux.Handle("/api/screener/", handlerFunc(screenerRoutes))
	mux.Handle("/api/desk/", handlerFunc(deskRoutes))
	mux.Handle("/api/paper/", handlerFunc(authMiddleware.Handle(paperRoutes)))
	mux.Handle("/api/crawler/", handlerFunc(crawlerRoutes))
	mux.Handle("/api/sse/", handlerFunc(sseRoutes))

	mux.HandleFunc("/health", statusHandler.SimpleHealth)
	mux.HandleFunc("/api/health", statusHandler.SimpleHealth)
	mux.HandleFunc("/api/status", statusHandler.BasicStatus)
	mux.HandleFunc("/api/status/detailed", statusHandler.DetailedStatus)
	mux.HandleFunc("/api/status/metrics", statusHandler.MetricsStatus)

	return mux
}
