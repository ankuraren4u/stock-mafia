package main

import (
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/stockmafia/trading-app/pkg/logging"
	"github.com/stockmafia/trading-app/pkg/redis"
	"github.com/stockmafia/trading-app/services/portfolio/internal/config"
	grpcserver "github.com/stockmafia/trading-app/services/portfolio/internal/grpc"
	"github.com/stockmafia/trading-app/services/portfolio/internal/service"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	logger, _ := logging.NewLogger(logging.Config{
		Level:       "info",
		Format:      "json",
		Output:      "stdout",
		ServiceName: "portfolio-service",
		Environment: os.Getenv("ENVIRONMENT"),
	})
	defer logger.Sync()

	cfg := config.Load()

	redisClient, err := redis.NewClient(redis.Config{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	}, logger.Logger)
	if err != nil {
		logger.Fatal("failed to connect to Redis", zap.Error(err))
	}
	defer redisClient.Close()

	paperService := service.NewPaperService(redisClient.Client(), logger.Logger)
	kiteService := service.NewKiteService(service.KiteConfig{
		APIKey:      cfg.Kite.APIKey,
		APISecret:   cfg.Kite.APISecret,
		RedirectURL: cfg.Kite.RedirectURL,
	}, logger.Logger)
	journalService := service.NewJournalService(redisClient.Client(), logger.Logger)

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.Server.GRPCPort))
	if err != nil {
		logger.Fatal("failed to listen", zap.Error(err))
	}

	grpcSrv := grpc.NewServer()
	grpcserver.RegisterServer(grpcSrv, paperService, kiteService, journalService, logger.Logger)

	go func() {
		logger.Info("portfolio gRPC server starting", zap.Int("port", cfg.Server.GRPCPort))
		if err := grpcSrv.Serve(lis); err != nil {
			logger.Fatal("failed to serve", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down portfolio service...")
	grpcSrv.GracefulStop()
}
