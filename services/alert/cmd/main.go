package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/stockmafia/trading-app/pkg/kafka"
	"github.com/stockmafia/trading-app/pkg/logging"
	"github.com/stockmafia/trading-app/pkg/redis"
	"github.com/stockmafia/trading-app/services/alert/internal/config"
	grpcserver "github.com/stockmafia/trading-app/services/alert/internal/grpc"
	"github.com/stockmafia/trading-app/services/alert/internal/service"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	logger, _ := logging.NewLogger(logging.Config{
		Level:       "info",
		Format:      "json",
		Output:      "stdout",
		ServiceName: "alert-service",
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

	var eventPublisher *kafka.EventPublisher
	if len(cfg.Kafka.Brokers) > 0 {
		kafkaClient, err := kafka.NewKafka(kafka.Config{
			Brokers:       cfg.Kafka.Brokers,
			Topic:         cfg.Kafka.Topic,
			ConsumerGroup: cfg.Kafka.ConsumerGroup,
			BatchSize:     100,
			BatchTimeout:  100,
			MaxAttempts:   3,
			RequiredAcks:  -1,
		}, logger.Logger)
		if err != nil {
			logger.Warn("failed to connect to Kafka, alert events will not be published", zap.Error(err))
		} else {
			defer kafkaClient.Close()
			eventPublisher = kafka.NewEventPublisher(kafkaClient, logger.Logger)
		}
	}

	checker := service.NewChecker(service.CheckerConfig{
		Interval: cfg.Checker.Interval,
	}, redisClient, eventPublisher, logger.Logger)

	dispatcher := service.NewDispatcher(logger.Logger)
	telegramBot := service.NewTelegramBot(service.TelegramConfig{
		BotToken: cfg.Telegram.BotToken,
		ChatID:   cfg.Telegram.ChatID,
	}, logger.Logger)
	discordWebhook := service.NewDiscordWebhook(service.DiscordConfig{
		WebhookURL: cfg.Discord.WebhookURL,
	}, logger.Logger)

	dispatcher.RegisterChannel("telegram", telegramBot)
	dispatcher.RegisterChannel("discord", discordWebhook)

	go checker.Start(context.Background())

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.Server.GRPCPort))
	if err != nil {
		logger.Fatal("failed to listen", zap.Error(err))
	}

	grpcSrv := grpc.NewServer()
	grpcserver.RegisterServer(grpcSrv, checker, dispatcher, logger.Logger)

	go func() {
		logger.Info("alert gRPC server starting", zap.Int("port", cfg.Server.GRPCPort))
		if err := grpcSrv.Serve(lis); err != nil {
			logger.Fatal("failed to serve", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down alert service...")
	grpcSrv.GracefulStop()
	checker.Stop()
}
