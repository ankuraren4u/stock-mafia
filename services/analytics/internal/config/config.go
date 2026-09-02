package config

import (
	"os"
	"strconv"
)

type Config struct {
	Server ServerConfig
	Redis  RedisConfig
}

type ServerConfig struct {
	GRPCPort int
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			GRPCPort: getEnvInt("ANALYTICS_GRPC_PORT", 9003),
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
