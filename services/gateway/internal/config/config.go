package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server ServerConfig
	GRPC   GRPCConfig
	JWT    JWTConfig
	Redis  RedisConfig
}

type ServerConfig struct {
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

type GRPCConfig struct {
	CrawlerAddr  string
	PriceAddr    string
	AnalyticsAddr string
	AlertAddr    string
	PortfolioAddr string
}

type JWTConfig struct {
	Secret     string
	Expiry     time.Duration
	Issuer     string
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Port:         getEnvInt("GATEWAY_PORT", 8080),
			ReadTimeout:  getEnvDuration("GATEWAY_READ_TIMEOUT", 15*time.Second),
			WriteTimeout: getEnvDuration("GATEWAY_WRITE_TIMEOUT", 15*time.Second),
		},
		GRPC: GRPCConfig{
			CrawlerAddr:   getEnv("CRAWLER_GRPC_ADDR", "localhost:9001"),
			PriceAddr:     getEnv("PRICE_GRPC_ADDR", "localhost:9002"),
			AnalyticsAddr: getEnv("ANALYTICS_GRPC_ADDR", "localhost:9003"),
			AlertAddr:     getEnv("ALERT_GRPC_ADDR", "localhost:9004"),
			PortfolioAddr: getEnv("PORTFOLIO_GRPC_ADDR", "localhost:9005"),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "default-secret"),
			Expiry: getEnvDuration("JWT_EXPIRY", 24*time.Hour),
			Issuer: getEnv("JWT_ISSUER", "stockmafia"),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value, exists := os.LookupEnv(key); exists {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}
