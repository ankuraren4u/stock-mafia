package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/stockmafia/trading-app/services/gateway/internal/grpc"
	"go.uber.org/zap"
)

type StatusHandler struct {
	clients *grpc.Clients
	logger  *zap.Logger
	version string
}

func NewStatusHandler(clients *grpc.Clients, logger *zap.Logger, version string) *StatusHandler {
	return &StatusHandler{
		clients: clients,
		logger:  logger,
		version: version,
	}
}

func (h *StatusHandler) SimpleHealth(w http.ResponseWriter, r *http.Request) {
	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"service":   "stockmafia-gateway",
		"timestamp": time.Now().UnixMilli(),
	})
}

func (h *StatusHandler) BasicStatus(w http.ResponseWriter, r *http.Request) {
	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"service":   "stockmafia-gateway",
		"version":   h.version,
		"uptime":    time.Since(startTime).String(),
		"timestamp": time.Now().UnixMilli(),
	})
}

func (h *StatusHandler) DetailedStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	services := map[string]ServiceStatus{}

	services["crawler"] = h.checkGRPCService(ctx, "crawler")
	services["price"] = h.checkGRPCService(ctx, "price")
	services["analytics"] = h.checkGRPCService(ctx, "analytics")
	services["alert"] = h.checkGRPCService(ctx, "alert")
	services["portfolio"] = h.checkGRPCService(ctx, "portfolio")

	overallStatus := "ok"
	for _, svc := range services {
		if svc.Status != "up" {
			overallStatus = "degraded"
			break
		}
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    overallStatus,
		"service":   "stockmafia-gateway",
		"version":   h.version,
		"uptime":    time.Since(startTime).String(),
		"services":  services,
		"timestamp": time.Now().UnixMilli(),
	})
}

func (h *StatusHandler) MetricsStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	services := map[string]ServiceStatus{}
	services["crawler"] = h.checkGRPCService(ctx, "crawler")
	services["price"] = h.checkGRPCService(ctx, "price")
	services["analytics"] = h.checkGRPCService(ctx, "analytics")
	services["alert"] = h.checkGRPCService(ctx, "alert")
	services["portfolio"] = h.checkGRPCService(ctx, "portfolio")

	w.Header().Set("Content-Type", "text/plain; version=0.0.4")

	var out []byte
	out = append(out, []byte("# HELP stockmafia_gateway_up Gateway health status\n")...)
	out = append(out, []byte("# TYPE stockmafia_gateway_up gauge\n")...)

	gatewayUp := 1.0
	for _, svc := range services {
		if svc.Status != "up" {
			gatewayUp = 0.0
			break
		}
	}
	out = append(out, []byte("stockmafia_gateway_up ")...)
	out = append(out, []byte(formatFloat(gatewayUp))...)
	out = append(out, '\n')

	out = append(out, []byte("# HELP stockmafia_uptime_seconds Service uptime\n")...)
	out = append(out, []byte("# TYPE stockmafia_uptime_seconds gauge\n")...)
	out = append(out, []byte("stockmafia_uptime_seconds ")...)
	out = append(out, []byte(formatFloat(time.Since(startTime).Seconds()))...)
	out = append(out, '\n')

	out = append(out, []byte("# HELP stockmafia_service_health Service dependency health\n")...)
	out = append(out, []byte("# TYPE stockmafia_service_health gauge\n")...)
	for name, svc := range services {
		val := 1.0
		if svc.Status != "up" {
			val = 0.0
		}
		out = append(out, []byte(`stockmafia_service_health{service="`+name+`"} `)...)
		out = append(out, []byte(formatFloat(val))...)
		out = append(out, '\n')
	}

	out = append(out, []byte("# HELP stockmafia_service_latency_ms Service response time\n")...)
	out = append(out, []byte("# TYPE stockmafia_service_latency_ms gauge\n")...)
	for name, svc := range services {
		out = append(out, []byte(`stockmafia_service_latency_ms{service="`+name+`"} `)...)
		out = append(out, []byte(formatFloat(float64(svc.Latency.Milliseconds())))...)
		out = append(out, '\n')
	}

	w.Write(out)
}

func (h *StatusHandler) checkGRPCService(ctx context.Context, name string) ServiceStatus {
	start := time.Now()
	status := ServiceStatus{
		Name:   name,
		Status: "up",
	}

	switch name {
	case "crawler":
		if h.clients.Crawler == nil {
			status.Status = "down"
			status.Error = "client not initialized"
			status.Latency = time.Since(start)
			return status
		}
	case "price":
		if h.clients.Price == nil {
			status.Status = "down"
			status.Error = "client not initialized"
			status.Latency = time.Since(start)
			return status
		}
	case "analytics":
		if h.clients.Analytics == nil {
			status.Status = "down"
			status.Error = "client not initialized"
			status.Latency = time.Since(start)
			return status
		}
	case "alert":
		if h.clients.Alert == nil {
			status.Status = "down"
			status.Error = "client not initialized"
			status.Latency = time.Since(start)
			return status
		}
	case "portfolio":
		if h.clients.Portfolio == nil {
			status.Status = "down"
			status.Error = "client not initialized"
			status.Latency = time.Since(start)
			return status
		}
	}

	status.Latency = time.Since(start)
	return status
}

func (h *StatusHandler) writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

var startTime = time.Now()

type ServiceStatus struct {
	Name    string        `json:"name"`
	Status  string        `json:"status"`
	Latency time.Duration `json:"latency_ms"`
	Error   string        `json:"error,omitempty"`
}

func formatFloat(f float64) string {
	return fmt.Sprintf("%g", f)
}
