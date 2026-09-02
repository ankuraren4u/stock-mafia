package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server   ServerConfig
	Redis    RedisConfig
	Kafka    KafkaConfig
	Checker  CheckerConfig
	Telegram TelegramConfig
	Discord  DiscordConfig
}

type ServerConfig struct {
	GRPCPort int
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

type CheckerConfig struct {
	Interval time.Duration
}

type TelegramConfig struct {
	BotToken string
	ChatID   string
}

type DiscordConfig struct {
	WebhookURL string
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			GRPCPort: getEnvInt("ALERT_GRPC_PORT", 9004),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
		Kafka: KafkaConfig{
			Brokers:       getEnvSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
			Topic:         getEnv("KAFKA_TOPIC", "stockmafia-events"),
			ConsumerGroup: getEnv("KAFKA_CONSUMER_GROUP", "alert-service"),
		},
		Checker: CheckerConfig{
			Interval: getEnvDuration("ALERT_CHECK_INTERVAL", 5*time.Second),
		},
		Telegram: TelegramConfig{
			BotToken: getEnv("TELEGRAM_BOT_TOKEN", ""),
			ChatID:   getEnv("TELEGRAM_CHAT_ID", ""),
		},
		Discord: DiscordConfig{
			WebhookURL: getEnv("DISCORD_WEBHOOK_URL", ""),
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

func getEnvSlice(key string, defaultValue []string) []string {
	if value, exists := os.LookupEnv(key); exists {
		result := []string{}
		for _, v := range splitComma(value) {
			if v != "" {
				result = append(result, v)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return defaultValue
}

func splitComma(s string) []string {
	var result []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	return result
}
