package proxy

import (
	"context"
	"fmt"
	"math"
	"net"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
)

type ProxyType string

const (
	ProxyTypeHTTP  ProxyType = "http"
	ProxyTypeHTTPS ProxyType = "https"
	ProxyTypeSOCKS5 ProxyType = "socks5"
)

type Proxy struct {
	Address  string
	Type     ProxyType
	Username string
	Password string
}

type ProxyConfig struct {
	Proxies                  []Proxy
	MaxConcurrent            int
	DomainThrottle           int
	CircuitBreakerThreshold  int
	CircuitBreakerTimeout    time.Duration
	RetryAttempts            int
	RetryBaseDelay           time.Duration
	HealthCheckInterval      time.Duration
	MaxConsecutiveFailures   int
}

type domainThrottle struct {
	current        int
	maxConcurrent  int
}

type circuitBreaker struct {
	state       string
	failures    int
	threshold   int
	timeout     time.Duration
	lastFailure time.Time
}

type proxyHealth struct {
 consecutiveFailures int64
 totalRequests       int64
 totalFailures       int64
 lastUsed            time.Time
 lastFailure         time.Time
 isHealthy           bool
}

type Manager struct {
	config      ProxyConfig
	proxies     []Proxy
	currentIndex int
	domains     map[string]*domainThrottle
	breakers    map[string]*circuitBreaker
	health      map[int]*proxyHealth
	mu          sync.RWMutex
	logger      *zap.Logger
	stopCh      chan struct{}
}

func NewManager(cfg ProxyConfig, logger *zap.Logger) *Manager {
	if cfg.MaxConcurrent == 0 {
		cfg.MaxConcurrent = 20
	}
	if cfg.DomainThrottle == 0 {
		cfg.DomainThrottle = 2
	}
	if cfg.CircuitBreakerThreshold == 0 {
		cfg.CircuitBreakerThreshold = 5
	}
	if cfg.CircuitBreakerTimeout == 0 {
		cfg.CircuitBreakerTimeout = 30 * time.Second
	}
	if cfg.RetryAttempts == 0 {
		cfg.RetryAttempts = 3
	}
	if cfg.RetryBaseDelay == 0 {
		cfg.RetryBaseDelay = time.Second
	}
	if cfg.HealthCheckInterval == 0 {
		cfg.HealthCheckInterval = 5 * time.Minute
	}
	if cfg.MaxConsecutiveFailures == 0 {
		cfg.MaxConsecutiveFailures = 10
	}

	m := &Manager{
		config:  cfg,
		proxies: cfg.Proxies,
		domains: make(map[string]*domainThrottle),
		breakers: make(map[string]*circuitBreaker),
		health:  make(map[int]*proxyHealth),
		logger:  logger,
		stopCh:  make(chan struct{}),
	}

	for i := range cfg.Proxies {
		m.health[i] = &proxyHealth{isHealthy: true}
		logger.Info("registered proxy",
			zap.String("address", cfg.Proxies[i].Address),
			zap.String("type", string(cfg.Proxies[i].Type)),
		)
	}

	go m.healthCheckLoop()

	return m
}

func (m *Manager) Stop() {
	close(m.stopCh)
}

func (m *Manager) GetProxy() *Proxy {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.proxies) == 0 {
		return nil
	}

	startIdx := m.currentIndex
	for {
		idx := m.currentIndex
		m.currentIndex = (m.currentIndex + 1) % len(m.proxies)

		if h, ok := m.health[idx]; ok && h.isHealthy {
			h.lastUsed = time.Now()
			atomic.AddInt64(&h.totalRequests, 1)
			return &m.proxies[idx]
		}

		if m.currentIndex == startIdx {
			break
		}
	}

	idx := m.currentIndex
	m.currentIndex = (m.currentIndex + 1) % len(m.proxies)
	if h, ok := m.health[idx]; ok {
		h.lastUsed = time.Now()
		atomic.AddInt64(&h.totalRequests, 1)
	}
	return &m.proxies[idx]
}

func (m *Manager) GetTransport(domain string) *http.Transport {
	proxy := m.GetProxy()
	if proxy == nil {
		return &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
		}
	}

	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}

	proxyURL, _ := url.Parse(fmt.Sprintf("%s://%s", proxy.Type, proxy.Address))
	if proxy.Username != "" {
		proxyURL.User = url.UserPassword(proxy.Username, proxy.Password)
	}
	transport.Proxy = http.ProxyURL(proxyURL)

	return transport
}

func (m *Manager) AcquireDomainSlot(ctx context.Context, domain string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	dt, exists := m.domains[domain]
	if !exists {
		dt = &domainThrottle{
			maxConcurrent: m.config.DomainThrottle,
		}
		m.domains[domain] = dt
	}

	if dt.current >= dt.maxConcurrent {
		return false
	}

	dt.current++
	return true
}

func (m *Manager) ReleaseDomainSlot(domain string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if dt, exists := m.domains[domain]; exists && dt.current > 0 {
		dt.current--
	}
}

func (m *Manager) CheckCircuitBreaker(source string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cb, exists := m.breakers[source]
	if !exists {
		return true
	}

	if cb.state == "open" {
		if time.Since(cb.lastFailure) > cb.timeout {
			cb.state = "half-open"
			return true
		}
		return false
	}

	return true
}

func (m *Manager) RecordCircuitBreakerSuccess(source string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cb, exists := m.breakers[source]
	if !exists {
		return
	}

	cb.failures = 0
	cb.state = "closed"
}

func (m *Manager) RecordCircuitBreakerFailure(source string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cb, exists := m.breakers[source]
	if !exists {
		cb = &circuitBreaker{
			threshold: m.config.CircuitBreakerThreshold,
			timeout:   m.config.CircuitBreakerTimeout,
		}
		m.breakers[source] = cb
	}

	cb.failures++
	cb.lastFailure = time.Now()

	if cb.failures >= cb.threshold {
		cb.state = "open"
		m.logger.Warn("circuit breaker opened",
			zap.String("source", source),
			zap.Int("failures", cb.failures),
		)
	}
}

func (m *Manager) ExecuteWithRetry(ctx context.Context, source string, fn func() error) error {
	var lastErr error

	for attempt := 0; attempt < m.config.RetryAttempts; attempt++ {
		if !m.CheckCircuitBreaker(source) {
			return fmt.Errorf("circuit breaker is open for source: %s", source)
		}

		if err := fn(); err != nil {
			lastErr = err
			m.RecordCircuitBreakerFailure(source)

			delay := m.config.RetryBaseDelay * time.Duration(math.Pow(2, float64(attempt)))
			m.logger.Warn("request failed, retrying",
				zap.String("source", source),
				zap.Int("attempt", attempt+1),
				zap.Duration("delay", delay),
				zap.Error(err),
			)

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
				continue
			}
		} else {
			m.RecordCircuitBreakerSuccess(source)
			return nil
		}
	}

	return fmt.Errorf("max retries exceeded for source %s: %w", source, lastErr)
}

func (m *Manager) RecordProxyFailure(proxyAddr string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, p := range m.proxies {
		if p.Address == proxyAddr {
			if h, ok := m.health[i]; ok {
				atomic.AddInt64(&h.consecutiveFailures, 1)
				atomic.AddInt64(&h.totalFailures, 1)
				h.lastFailure = time.Now()

				if atomic.LoadInt64(&h.consecutiveFailures) >= int64(m.config.MaxConsecutiveFailures) {
					h.isHealthy = false
					m.logger.Warn("proxy marked unhealthy",
						zap.String("address", proxyAddr),
						zap.Int64("consecutive_failures", atomic.LoadInt64(&h.consecutiveFailures)),
					)
				}
			}
			break
		}
	}
}

func (m *Manager) RecordProxySuccess(proxyAddr string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, p := range m.proxies {
		if p.Address == proxyAddr {
			if h, ok := m.health[i]; ok {
				atomic.StoreInt64(&h.consecutiveFailures, 0)
				if !h.isHealthy {
					h.isHealthy = true
					m.logger.Info("proxy marked healthy again",
						zap.String("address", proxyAddr),
					)
				}
			}
			break
		}
	}
}

func (m *Manager) healthCheckLoop() {
	ticker := time.NewTicker(m.config.HealthCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.performHealthChecks()
		}
	}
}

func (m *Manager) performHealthChecks() {
	m.mu.RLock()
	proxies := make([]Proxy, len(m.proxies))
	copy(proxies, m.proxies)
	m.mu.RUnlock()

	for i, proxy := range proxies {
		healthy := m.checkProxyHealth(proxy)

		m.mu.Lock()
		if h, ok := m.health[i]; ok {
			if healthy {
				atomic.StoreInt64(&h.consecutiveFailures, 0)
				if !h.isHealthy {
					h.isHealthy = true
					m.logger.Info("proxy recovered", zap.String("address", proxy.Address))
				}
			} else {
				atomic.AddInt64(&h.consecutiveFailures, 1)
				if atomic.LoadInt64(&h.consecutiveFailures) >= int64(m.config.MaxConsecutiveFailures) {
					h.isHealthy = false
					m.logger.Warn("proxy failed health check",
						zap.String("address", proxy.Address),
						zap.Int64("failures", atomic.LoadInt64(&h.consecutiveFailures)),
					)
				}
			}
		}
		m.mu.Unlock()
	}
}

func (m *Manager) checkProxyHealth(proxy Proxy) bool {
	transport := &http.Transport{
		MaxIdleConns: 1,
		DialContext: (&net.Dialer{
			Timeout: 5 * time.Second,
		}).DialContext,
	}

	proxyURL, _ := url.Parse(fmt.Sprintf("%s://%s", proxy.Type, proxy.Address))
	if proxy.Username != "" {
		proxyURL.User = url.UserPassword(proxy.Username, proxy.Password)
	}
	transport.Proxy = http.ProxyURL(proxyURL)

	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: transport,
	}

	req, err := http.NewRequest("GET", "http://httpbin.org/ip", nil)
	if err != nil {
		return false
	}

	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

func (m *Manager) GetStats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := map[string]interface{}{
		"total_proxies":     len(m.proxies),
		"healthy_proxies":   0,
		"domains":           make(map[string]int),
		"circuit_breakers":  make(map[string]string),
		"proxy_health":      make(map[string]map[string]interface{}),
	}

	healthy := 0
	proxyHealth := make(map[string]map[string]interface{})
	for i, p := range m.proxies {
		h, ok := m.health[i]
		if ok && h.isHealthy {
			healthy++
		}
		status := "healthy"
		if ok && !h.isHealthy {
			status = "unhealthy"
		}
		proxyHealth[p.Address] = map[string]interface{}{
			"status":              status,
			"consecutive_failures": atomic.LoadInt64(&h.consecutiveFailures),
			"total_requests":      atomic.LoadInt64(&h.totalRequests),
			"total_failures":      atomic.LoadInt64(&h.totalFailures),
		}
	}
	stats["healthy_proxies"] = healthy
	stats["proxy_health"] = proxyHealth

	for domain, dt := range m.domains {
		stats["domains"].(map[string]int)[domain] = dt.current
	}

	for source, cb := range m.breakers {
		stats["circuit_breakers"].(map[string]string)[source] = cb.state
	}

	return stats
}
