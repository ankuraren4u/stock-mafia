package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/stockmafia/trading-app/pkg/database"
	"github.com/stockmafia/trading-app/pkg/logging"
	"github.com/stockmafia/trading-app/pkg/proxy"
	"github.com/stockmafia/trading-app/pkg/redis"
	"github.com/stockmafia/trading-app/services/crawler/internal/config"
	"github.com/stockmafia/trading-app/services/crawler/internal/crawler"
	grpcserver "github.com/stockmafia/trading-app/services/crawler/internal/grpc"
	"github.com/stockmafia/trading-app/services/crawler/internal/repository"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	logger, _ := logging.NewLogger(logging.Config{
		Level:       "info",
		Format:      "json",
		Output:      "stdout",
		ServiceName: "crawler-service",
		Environment: os.Getenv("ENVIRONMENT"),
	})
	defer logger.Sync()

	cfg := config.Load()

	mysql, err := database.NewMySQL(database.Config{
		Host:            cfg.Database.Host,
		Port:            cfg.Database.Port,
		User:            cfg.Database.User,
		Password:        cfg.Database.Password,
		Database:        cfg.Database.Name,
		MaxOpenConns:    25,
		MaxIdleConns:    10,
		ConnMaxLifetime: 5 * 60,
	})
	if err != nil {
		logger.Fatal("failed to connect to MySQL", zap.Error(err))
	}
	defer mysql.Close()

	migrator := database.NewMigrator(mysql.DB(), logger.Logger)
	if err := migrator.MigrateUp(context.Background()); err != nil {
		logger.Fatal("failed to run migrations", zap.Error(err))
	}

	redisClient, err := redis.NewClient(redis.Config{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	}, logger.Logger)
	if err != nil {
		logger.Fatal("failed to connect to Redis", zap.Error(err))
	}
	defer redisClient.Close()

	proxyManager := proxy.NewManager(proxy.ProxyConfig{
		Proxies:                  cfg.Proxies,
		MaxConcurrent:            20,
		DomainThrottle:           2,
		CircuitBreakerThreshold:  5,
		CircuitBreakerTimeout:    30 * time.Second,
		RetryAttempts:            3,
		RetryBaseDelay:           time.Second,
		HealthCheckInterval:      5 * time.Minute,
		MaxConsecutiveFailures:   10,
	}, logger.Logger)
	defer proxyManager.Stop()

	stocksRepo := repository.NewStocksRepository(mysql.DB())
	candlesRepo := repository.NewCandlesRepository(mysql.DB())
	quotesRepo := repository.NewQuotesRepository(mysql.DB())

	orchestrator := crawler.NewOrchestrator(crawler.OrchestratorConfig{
		WorkerCount:      cfg.Crawler.WorkerCount,
		MaxConcurrent:    20,
		DomainThrottle:   2,
		StocksRepo:       stocksRepo,
		CandlesRepo:      candlesRepo,
		QuotesRepo:       quotesRepo,
		ProxyManager:     proxyManager,
		RedisClient:      redisClient,
		Sources:          cfg.Crawler.Sources,
		BatchSize:        cfg.Crawler.BatchSize,
		BatchDelay:       cfg.Crawler.BatchDelay,
		CrawlInterval:    cfg.Crawler.Interval,
	}, logger.Logger)

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.Server.GRPCPort))
	if err != nil {
		logger.Fatal("failed to listen", zap.Error(err))
	}

	grpcSrv := grpc.NewServer()
	grpcserver.RegisterServer(grpcSrv, orchestrator, logger.Logger)

	go func() {
		logger.Info("crawler gRPC server starting", zap.Int("port", cfg.Server.GRPCPort))
		if err := grpcSrv.Serve(lis); err != nil {
			logger.Fatal("failed to serve", zap.Error(err))
		}
	}()

	go orchestrator.Start(context.Background())

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down crawler service...")
	grpcSrv.GracefulStop()
	orchestrator.Stop()
}
