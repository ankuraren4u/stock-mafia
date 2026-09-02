package health

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials/insecure"
)

type GRPCHealthChecker struct {
	services map[string]string
}

type GRPCHealthDetails struct {
	Services []GRPCServiceStatus `json:"services"`
}

type GRPCServiceStatus struct {
	Name        string        `json:"name"`
	Address     string        `json:"address"`
	Connected   bool          `json:"connected"`
	Ready       bool          `json:"ready"`
	ResponseTime time.Duration `json:"response_time_ms"`
	Error       string        `json:"error,omitempty"`
}

func NewGRPCHealthChecker(services map[string]string) *GRPCHealthChecker {
	return &GRPCHealthChecker{services: services}
}

func (g *GRPCHealthChecker) CheckHealth(ctx context.Context) DependencyStatus {
	start := time.Now()

	var details GRPCHealthDetails
	allHealthy := true
	anyConnected := false

	for name, addr := range g.services {
		status := g.checkService(ctx, name, addr)
		details.Services = append(details.Services, status)

		if !status.Connected {
			allHealthy = false
		}
		if status.Connected {
			anyConnected = true
		}
	}

	resultStatus := StatusUp
	if !allHealthy && anyConnected {
		resultStatus = StatusDegraded
	} else if !anyConnected {
		resultStatus = StatusDown
	}

	return DependencyStatus{
		Name:    "grpc_services",
		Status:  resultStatus,
		Latency: time.Since(start),
		Error:   g.buildError(details),
		Details: details,
	}
}

func (g *GRPCHealthChecker) checkService(ctx context.Context, name, addr string) GRPCServiceStatus {
	status := GRPCServiceStatus{
		Name:    name,
		Address: addr,
	}

	checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(checkCtx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		status.Error = fmt.Sprintf("connection failed: %v", err)
		return status
	}
	defer conn.Close()

	status.Connected = true
	status.Ready = conn.GetState() == connectivity.Ready

	if !status.Ready {
		waitCtx, waitCancel := context.WithTimeout(checkCtx, 1*time.Second)
		defer waitCancel()
		conn.WaitForStateChange(waitCtx, connectivity.Idle)
		status.Ready = conn.GetState() == connectivity.Ready
	}

	return status
}

func (g *GRPCHealthChecker) buildError(details GRPCHealthDetails) string {
	var failed []string
	for _, svc := range details.Services {
		if !svc.Connected {
			failed = append(failed, svc.Name)
		}
	}
	if len(failed) > 0 {
		return fmt.Sprintf("unavailable services: %v", failed)
	}
	return ""
}

func NewGRPCHealthCheckerFromAddrs(addrs map[string]string) *GRPCHealthChecker {
	return NewGRPCHealthChecker(addrs)
}
