package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stockmafia/trading-app/pkg/logging"
	"github.com/stockmafia/trading-app/services/analytics/internal/config"
	grpcserver "github.com/stockmafia/trading-app/services/analytics/internal/grpc"
	"github.com/stockmafia/trading-app/services/analytics/internal/indicators"
	"github.com/stockmafia/trading-app/services/analytics/internal/service"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	logger, _ := logging.NewLogger(logging.Config{
		Level:       "info",
		Format:      "json",
		Output:      "stdout",
		ServiceName: "analytics-service",
		Environment: os.Getenv("ENVIRONMENT"),
	})
	defer logger.Sync()

	cfg := config.Load()

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	defer rdb.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.Warn("failed to connect to Redis, running without cache", zap.Error(err))
	}

	indicatorsSvc := indicators.NewIndicatorService()
	signalsService := service.NewSignalsService(indicatorsSvc, rdb, logger.Logger)
	screenerService := service.NewScreenerService(indicatorsSvc, logger.Logger)
	strategiesService := service.NewStrategiesService(indicatorsSvc, logger.Logger)

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.Server.GRPCPort))
	if err != nil {
		logger.Fatal("failed to listen", zap.Error(err))
	}

	grpcSrv := grpc.NewServer()
	grpcserver.RegisterServer(grpcSrv, signalsService, screenerService, strategiesService, logger.Logger)

	go func() {
		logger.Info("analytics gRPC server starting", zap.Int("port", cfg.Server.GRPCPort))
		if err := grpcSrv.Serve(lis); err != nil {
			logger.Fatal("failed to serve", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down analytics service...")
	grpcSrv.GracefulStop()
}
