package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/redis/go-redis/v9"
	"github.com/stockmafia/trading-app/pkg/kafka"
	"github.com/stockmafia/trading-app/pkg/logging"
	"github.com/stockmafia/trading-app/services/price/internal/config"
	"github.com/stockmafia/trading-app/services/price/internal/handler"
	grpcserver "github.com/stockmafia/trading-app/services/price/internal/grpc"
	"github.com/stockmafia/trading-app/services/price/internal/repository"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	logger, _ := logging.NewLogger(logging.Config{
		Level:       "info",
		Format:      "json",
		Output:      "stdout",
		ServiceName: "price-service",
		Environment: os.Getenv("ENVIRONMENT"),
	})
	defer logger.Sync()

	cfg := config.Load()

	db, err := sql.Open("mysql", cfg.MySQL.DSNString())
	if err != nil {
		logger.Fatal("failed to open MySQL", zap.Error(err))
	}
	defer db.Close()

	db.SetMaxOpenConns(cfg.MySQL.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MySQL.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.MySQL.ConnMaxLifetime)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		logger.Fatal("failed to ping MySQL", zap.Error(err))
	}
	logger.Info("connected to MySQL")

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	defer rdb.Close()

	rdbCtx, rdbCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer rdbCancel()
	if err := rdb.Ping(rdbCtx).Err(); err != nil {
		logger.Fatal("failed to connect to Redis", zap.Error(err))
	}
	logger.Info("connected to Redis", zap.String("addr", cfg.Redis.Addr))

	quotesRepo := repository.NewQuotesRepository(db, rdb, logger.Logger)

	wsHub := handler.NewHub(logger.Logger, rdb, cfg.BroadcastInterval)
	go wsHub.Run(context.Background())

	sseBroadcaster := handler.NewSSEBroadcaster(logger.Logger)
	go sseBroadcaster.Start()

	grpcLis, err := net.Listen("tcp", fmt.Sprintf(":%d", cfg.Server.GRPCPort))
	if err != nil {
		logger.Fatal("failed to listen gRPC", zap.Error(err))
	}

	grpcSrv := grpc.NewServer()
	grpcserver.RegisterServer(grpcSrv, quotesRepo, wsHub, sseBroadcaster, logger.Logger)

	go func() {
		logger.Info("price gRPC server starting", zap.Int("port", cfg.Server.GRPCPort))
		if err := grpcSrv.Serve(grpcLis); err != nil {
			logger.Fatal("failed to serve gRPC", zap.Error(err))
		}
	}()

	go startKafkaConsumer(cfg, logger.Logger, quotesRepo, wsHub, sseBroadcaster)

	httpMux := http.NewServeMux()
	httpMux.HandleFunc("/ws", wsHub.HandleWebSocket)
	httpMux.HandleFunc("/api/events", sseBroadcaster.HandleEvents)
	httpMux.HandleFunc("/health", healthHandler(db, rdb))

	httpSrv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.WSHTTPPort),
		Handler:      httpMux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("price HTTP/WS server starting", zap.Int("port", cfg.Server.WSHTTPPort))
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("HTTP server failed", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down price service...")

	grpcSrv.GracefulStop()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()
	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		logger.Error("HTTP server shutdown error", zap.Error(err))
	}

	wsHub.Stop()
	sseBroadcaster.Stop()

	logger.Info("price service stopped")
}

func healthHandler(db *sql.DB, rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := map[string]string{"status": "ok"}

		if err := db.PingContext(r.Context()); err != nil {
			status["mysql"] = "error"
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			status["mysql"] = "ok"
		}

		if err := rdb.Ping(r.Context()).Err(); err != nil {
			status["redis"] = "error"
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			status["redis"] = "ok"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	}
}

func startKafkaConsumer(cfg *config.Config, logger *zap.Logger, quotesRepo *repository.QuotesRepository, wsHub *handler.Hub, sseBroadcaster *handler.SSEBroadcaster) {
	if len(cfg.Kafka.Brokers) == 0 || cfg.Kafka.Brokers[0] == "" {
		logger.Info("kafka not configured, skipping consumer")
		return
	}

	k, err := kafka.NewKafka(kafka.Config{
		Brokers:       cfg.Kafka.Brokers,
		Topic:         cfg.Kafka.Topic,
		ConsumerGroup: cfg.Kafka.ConsumerGroup,
	}, logger)
	if err != nil {
		logger.Warn("failed to initialize kafka, skipping consumer", zap.Error(err))
		return
	}
	defer k.Close()

	logger.Info("starting kafka price consumer", zap.String("topic", cfg.Kafka.Topic))

	consumerCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	err = k.StartConsumer(consumerCtx, func(ctx context.Context, key, value []byte) error {
		var event kafka.Event
		if err := json.Unmarshal(value, &event); err != nil {
			logger.Error("failed to unmarshal kafka event", zap.Error(err))
			return nil
		}

		if event.Type == kafka.EventTypePriceUpdate {
			symbol, _ := event.Payload["symbol"].(string)
			price, _ := event.Payload["price"].(float64)
			volume, _ := event.Payload["volume"].(float64)

			update := handler.PriceUpdate{
				Symbol:    symbol,
				Price:     price,
				Volume:    int64(volume),
				Timestamp: time.Now().Unix(),
			}

			wsHub.BroadcastToSubscribers(symbol, mustMarshal(map[string]interface{}{
				"type": "price",
				"data": update,
			}))

			sseBroadcaster.BroadcastPrice(update)
		}

		return nil
	})

	if err != nil && err != context.Canceled {
		logger.Error("kafka consumer error", zap.Error(err))
	}
}

func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}
