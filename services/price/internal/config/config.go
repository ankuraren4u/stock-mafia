package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Server            ServerConfig
	MySQL             MySQLConfig
	Redis             RedisConfig
	Kafka             KafkaConfig
	BroadcastInterval time.Duration
}

type ServerConfig struct {
	GRPCPort   int
	WSHTTPPort int
}

type MySQLConfig struct {
	DSN             string
	Host            string
	Port            int
	User            string
	Password        string
	Database        string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type KafkaConfig struct {
	Brokers       []string
	Topic         string
	ConsumerGroup string
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			GRPCPort:   getEnvInt("PRICE_GRPC_PORT", 50052),
			WSHTTPPort: getEnvInt("PRICE_HTTP_PORT", 8082),
		},
		MySQL: MySQLConfig{
			DSN:             getEnv("MYSQL_DSN", ""),
			Host:            getEnv("DB_HOST", "localhost"),
			Port:            getEnvInt("DB_PORT", 3306),
			User:            getEnv("DB_USER", "stockmafia"),
			Password:        getEnv("DB_PASSWORD", "stockmafia"),
			Database:        getEnv("DB_NAME", "stockmafia"),
			MaxOpenConns:    getEnvInt("MYSQL_MAX_OPEN_CONNS", 50),
			MaxIdleConns:    getEnvInt("MYSQL_MAX_IDLE_CONNS", 10),
			ConnMaxLifetime: getEnvDuration("MYSQL_CONN_MAX_LIFETIME", 5*time.Minute),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
		Kafka: KafkaConfig{
			Brokers:       strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
			Topic:         getEnv("KAFKA_TOPIC", "price.updates"),
			ConsumerGroup: getEnv("KAFKA_CONSUMER_GROUP", "price-service"),
		},
		BroadcastInterval: getEnvDuration("BROADCAST_INTERVAL", 5*time.Second),
	}
}

func (c *MySQLConfig) DSNString() string {
	if c.DSN != "" {
		return c.DSN
	}
	return c.User + ":" + c.Password + "@tcp(" + c.Host + ":" + strconv.Itoa(c.Port) + ")/" + c.Database + "?charset=utf8mb4&parseTime=True&loc=Local"
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
