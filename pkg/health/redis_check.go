package health

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisHealthChecker struct {
	client *redis.Client
}

type RedisHealthDetails struct {
	PINGLatency       time.Duration `json:"ping_latency_ms"`
	ConnectedClients  int64         `json:"connected_clients"`
	UsedMemory        int64         `json:"used_memory_bytes"`
	UsedMemoryHuman   string        `json:"used_memory_human"`
	MaxMemory         int64         `json:"max_memory_bytes"`
	MemoryUsagePct    float64       `json:"memory_usage_pct"`
	HitRate           float64       `json:"hit_rate_pct"`
	TotalCommands     int64         `json:"total_commands_processed"`
	RejectedConns     int64         `json:"rejected_connections"`
	EvictedKeys       int64         `json:"evicted_keys"`
	KeyspaceHits      int64         `json:"keyspace_hits"`
	KeyspaceMisses    int64         `json:"keyspace_misses"`
}

func NewRedisHealthChecker(client *redis.Client) *RedisHealthChecker {
	return &RedisHealthChecker{client: client}
}

func (r *RedisHealthChecker) CheckHealth(ctx context.Context) DependencyStatus {
	start := time.Now()

	checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	pingStart := time.Now()
	err := r.client.Ping(checkCtx).Err()
	pingLatency := time.Since(pingStart)

	if err != nil {
		return DependencyStatus{
			Name:    "redis",
			Status:  StatusDown,
			Latency: time.Since(start),
			Error:   fmt.Sprintf("ping failed: %v", err),
		}
	}

	var details RedisHealthDetails
	details.PINGLatency = pingLatency

	info, err := r.client.Info(checkCtx,
		"clients", "memory", "stats",
	).Result()
	if err == nil {
		lines := parseRedisInfo(info)
		details.ConnectedClients = getInt64(lines, "connected_clients")
		details.UsedMemory = getInt64(lines, "used_memory")
		details.UsedMemoryHuman = getString(lines, "used_memory_human")
		details.MaxMemory = getInt64(lines, "maxmemory")
		details.TotalCommands = getInt64(lines, "total_commands_processed")
		details.RejectedConns = getInt64(lines, "rejected_connections")
		details.EvictedKeys = getInt64(lines, "evicted_keys")
		details.KeyspaceHits = getInt64(lines, "keyspace_hits")
		details.KeyspaceMisses = getInt64(lines, "keyspace_misses")

		if details.MaxMemory > 0 {
			details.MemoryUsagePct = float64(details.UsedMemory) / float64(details.MaxMemory) * 100
		}

		total := details.KeyspaceHits + details.KeyspaceMisses
		if total > 0 {
			details.HitRate = float64(details.KeyspaceHits) / float64(total) * 100
		}
	}

	if details.MemoryUsagePct > 90 {
		return DependencyStatus{
			Name:    "redis",
			Status:  StatusDegraded,
			Latency: time.Since(start),
			Error:   fmt.Sprintf("memory usage critical: %.1f%%", details.MemoryUsagePct),
			Details: details,
		}
	}

	if details.RejectedConns > 0 {
		return DependencyStatus{
			Name:    "redis",
			Status:  StatusDegraded,
			Latency: time.Since(start),
			Error:   fmt.Sprintf("rejected connections: %d", details.RejectedConns),
			Details: details,
		}
	}

	return DependencyStatus{
		Name:    "redis",
		Status:  StatusUp,
		Latency: time.Since(start),
		Details: details,
	}
}

func parseRedisInfo(info string) map[string]string {
	result := make(map[string]string)
	for _, line := range splitLines(info) {
		if line == "" || line[0] == '#' {
			continue
		}
		for i := 0; i < len(line); i++ {
			if line[i] == ':' {
				result[line[:i]] = line[i+1:]
				break
			}
		}
	}
	return result
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, trimRight(s[start:i]))
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, trimRight(s[start:]))
	}
	return lines
}

func trimRight(s string) string {
	end := len(s)
	for end > 0 && (s[end-1] == '\r' || s[end-1] == ' ') {
		end--
	}
	return s[:end]
}

func getInt64(m map[string]string, key string) int64 {
	val, ok := m[key]
	if !ok {
		return 0
	}
	var n int64
	for _, c := range val {
		if c >= '0' && c <= '9' {
			n = n*10 + int64(c-'0')
		} else {
			break
		}
	}
	return n
}

func getString(m map[string]string, key string) string {
	return m[key]
}
