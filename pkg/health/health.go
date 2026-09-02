package health

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type Status string

const (
	StatusUp      Status = "up"
	StatusDown    Status = "down"
	StatusDegraded Status = "degraded"
)

type HealthStatus struct {
	Status       Status               `json:"status"`
	Uptime       time.Duration        `json:"uptime"`
	Version      string               `json:"version"`
	ServiceName  string               `json:"service_name"`
	CheckedAt    time.Time            `json:"checked_at"`
	Dependencies []DependencyStatus   `json:"dependencies,omitempty"`
}

type DependencyStatus struct {
	Name       string        `json:"name"`
	Status     Status        `json:"status"`
	Latency    time.Duration `json:"latency_ms"`
	Error      string        `json:"error,omitempty"`
	Details    interface{}   `json:"details,omitempty"`
}

type HealthChecker interface {
	CheckHealth(ctx context.Context) DependencyStatus
}

type CompositeHealth struct {
	checkers     map[string]HealthChecker
	mu           sync.RWMutex
	startTime    time.Time
	version      string
	serviceName  string
	cache        *healthCache
}

type healthCache struct {
	result   *HealthStatus
	lastCheck time.Time
	ttl      time.Duration
	mu       sync.RWMutex
}

func NewCompositeHealth(serviceName, version string) *CompositeHealth {
	return &CompositeHealth{
		checkers:    make(map[string]HealthChecker),
		startTime:   time.Now(),
		version:     version,
		serviceName: serviceName,
		cache: &healthCache{
			ttl: 5 * time.Second,
		},
	}
}

func (ch *CompositeHealth) Register(name string, checker HealthChecker) {
	ch.mu.Lock()
	defer ch.mu.Unlock()
	ch.checkers[name] = checker
}

func (ch *CompositeHealth) CheckHealth(ctx context.Context) *HealthStatus {
	ch.cache.mu.RLock()
	if ch.cache.result != nil && time.Since(ch.cache.lastCheck) < ch.cache.ttl {
		defer ch.cache.mu.RUnlock()
		return ch.cache.result
	}
	ch.cache.mu.RUnlock()

	ch.mu.RLock()
	checkers := make(map[string]HealthChecker, len(ch.checkers))
	for k, v := range ch.checkers {
		checkers[k] = v
	}
	ch.mu.RUnlock()

	status := &HealthStatus{
		Status:      StatusUp,
		Uptime:      time.Since(ch.startTime),
		Version:     ch.version,
		ServiceName: ch.serviceName,
		CheckedAt:   time.Now(),
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	deadline, hasDeadline := ctx.Deadline()
	if !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
	}
	_ = deadline

	for name, checker := range checkers {
		wg.Add(1)
		go func(n string, c HealthChecker) {
			defer wg.Done()
			depStatus := c.CheckHealth(ctx)
			mu.Lock()
			status.Dependencies = append(status.Dependencies, depStatus)
			if depStatus.Status == StatusDown {
				status.Status = StatusDegraded
			}
			mu.Unlock()
		}(name, checker)
	}
	wg.Wait()

	ch.cache.mu.Lock()
	ch.cache.result = status
	ch.cache.lastCheck = time.Now()
	ch.cache.mu.Unlock()

	return status
}

func (ch *CompositeHealth) Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := ch.CheckHealth(r.Context())
		w.Header().Set("Content-Type", "application/json")
		if status.Status == StatusDown {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		json.NewEncoder(w).Encode(status)
	}
}

func (ch *CompositeHealth) SimpleHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"service":   ch.serviceName,
			"timestamp": time.Now().UnixMilli(),
		})
	}
}

func (ch *CompositeHealth) VersionHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":     "ok",
			"service":    ch.serviceName,
			"version":    ch.version,
			"uptime":     time.Since(ch.startTime).String(),
			"started_at": ch.startTime.UTC(),
			"timestamp":  time.Now().UnixMilli(),
		})
	}
}

func (ch *CompositeHealth) MetricsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := ch.CheckHealth(r.Context())
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")

		uptimeSeconds := status.Uptime.Seconds()
		statusValue := 1.0
		if status.Status != StatusUp {
			statusValue = 0.0
		}

		var out []byte
		out = append(out, []byte("# HELP stockmafia_health_up Health status (1=healthy, 0=unhealthy)\n")...)
		out = append(out, []byte("# TYPE stockmafia_health_up gauge\n")...)
		out = append(out, []byte("stockmafia_health_up ")...)
		out = append(out, []byte(formatFloat(statusValue))...)
		out = append(out, '\n')

		out = append(out, []byte("# HELP stockmafia_uptime_seconds Service uptime in seconds\n")...)
		out = append(out, []byte("# TYPE stockmafia_uptime_seconds gauge\n")...)
		out = append(out, []byte("stockmafia_uptime_seconds ")...)
		out = append(out, []byte(formatFloat(uptimeSeconds))...)
		out = append(out, '\n')

		for _, dep := range status.Dependencies {
			depValue := 1.0
			if dep.Status != StatusUp {
				depValue = 0.0
			}
			out = append(out, []byte("# HELP stockmafia_dependency_health Health of dependency: "+dep.Name+"\n")...)
			out = append(out, []byte("# TYPE stockmafia_dependency_health gauge\n")...)
			out = append(out, []byte(`stockmafia_dependency_health{dependency="`+dep.Name+`"} `)...)
			out = append(out, []byte(formatFloat(depValue))...)
			out = append(out, '\n')

			out = append(out, []byte("# HELP stockmafia_dependency_latency_ms Dependency latency in milliseconds\n")...)
			out = append(out, []byte("# TYPE stockmafia_dependency_latency_ms gauge\n")...)
			out = append(out, []byte(`stockmafia_dependency_latency_ms{dependency="`+dep.Name+`"} `)...)
			out = append(out, []byte(formatFloat(float64(dep.Latency.Milliseconds())))...)
			out = append(out, '\n')
		}

		w.Write(out)
	}
}

func formatFloat(f float64) string {
	b, _ := json.Marshal(f)
	return string(b)
}
