package config

import (
	"os"
	"strconv"
	"time"

	"github.com/stockmafia/trading-app/pkg/proxy"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	Crawler  CrawlerConfig
	Proxies  []proxy.Proxy
}

type ServerConfig struct {
	GRPCPort int
}

type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Name     string
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type CrawlerConfig struct {
	WorkerCount int
	Sources     []string
	Interval    time.Duration
	BatchSize   int
	BatchDelay  time.Duration
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			GRPCPort: getEnvInt("CRAWLER_GRPC_PORT", 9001),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvInt("DB_PORT", 3306),
			User:     getEnv("DB_USER", "root"),
			Password: getEnv("DB_PASSWORD", ""),
			Name:     getEnv("DB_NAME", "stockmafia"),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
		Crawler: CrawlerConfig{
			WorkerCount: getEnvInt("CRAWLER_WORKER_COUNT", 10),
			Sources:     []string{"stooq", "yahoo", "finnhub", "nse", "moneycontrol"},
			Interval:    getEnvDuration("CRAWLER_INTERVAL", 5*time.Minute),
			BatchSize:   getEnvInt("CRAWLER_BATCH_SIZE", 8),
			BatchDelay:  getEnvDuration("CRAWLER_BATCH_DELAY", 3*time.Second),
		},
		Proxies: loadProxies(),
	}
}

func loadProxies() []proxy.Proxy {
	var proxies []proxy.Proxy

	for i := 0; ; i++ {
		prefix := "PROXY_" + strconv.Itoa(i)
		addr := getEnv(prefix+"_ADDR", "")
		if addr == "" {
			break
		}

		proxyType := proxy.ProxyType(getEnv(prefix+"_TYPE", "http"))
		username := getEnv(prefix+"_USERNAME", "")
		password := getEnv(prefix+"_PASSWORD", "")

		proxies = append(proxies, proxy.Proxy{
			Address:  addr,
			Type:     proxyType,
			Username: username,
			Password: password,
		})
	}

	return proxies
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
