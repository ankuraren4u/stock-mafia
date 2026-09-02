package health

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type MySQLHealthChecker struct {
	db            *sql.DB
	replicaDB     *sql.DB
	checkInterval time.Duration
}

type MySQLHealthDetails struct {
	ConnectionsOpen    int           `json:"connections_open"`
	ConnectionsInUse   int           `json:"connections_in_use"`
	ConnectionsIdle    int           `json:"connections_idle"`
	MaxOpenConnections int           `json:"max_open_connections"`
	MaxIdleConnections int           `json:"max_idle_connections"`
	QueryLatency       time.Duration `json:"query_latency_ms"`
	ReplicationLag     time.Duration `json:"replication_lag_ms"`
	ReplicationStatus  string        `json:"replication_status"`
}

func NewMySQLHealthChecker(db *sql.DB, replicaDB *sql.DB) *MySQLHealthChecker {
	return &MySQLHealthChecker{
		db:            db,
		replicaDB:     replicaDB,
		checkInterval: 5 * time.Second,
	}
}

func (m *MySQLHealthChecker) CheckHealth(ctx context.Context) DependencyStatus {
	start := time.Now()

	checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	var details MySQLHealthDetails
	stats := m.db.Stats()
	details.ConnectionsOpen = stats.OpenConnections
	details.ConnectionsInUse = stats.InUse
	details.ConnectionsIdle = stats.Idle
	details.MaxOpenConnections = stats.MaxOpenConnections
	details.MaxIdleConnections = stats.MaxIdleConns

	queryStart := time.Now()
	err := m.db.PingContext(checkCtx)
	details.QueryLatency = time.Since(queryStart)

	if err != nil {
		return DependencyStatus{
			Name:    "mysql",
			Status:  StatusDown,
			Latency: time.Since(start),
			Error:   fmt.Sprintf("ping failed: %v", err),
			Details: details,
		}
	}

	if m.replicaDB != nil {
		replicaCtx, replicaCancel := context.WithTimeout(ctx, 1*time.Second)
		defer replicaCancel()

		var lag time.Duration
		var replStatus string
		replicaStart := time.Now()

		var maxLag int64
		err = m.replicaDB.QueryRowContext(replicaCtx,
			"SELECT MAX(TIMESTAMPDIFF(SECOND, ts, NOW())) FROM information_schema.slave_status",
		).Scan(&maxLag)
		lag = time.Duration(maxLag) * time.Second

		if err != nil {
			replStatus = "unknown"
		} else {
			replStatus = "ok"
		}
		details.ReplicationLag = time.Since(replicaStart)
		if lag > 0 {
			details.ReplicationLag = lag
		}
		details.ReplicationStatus = replStatus

		if lag > 30*time.Second {
			return DependencyStatus{
				Name:    "mysql",
				Status:  StatusDegraded,
				Latency: time.Since(start),
				Error:   fmt.Sprintf("replication lag: %v", lag),
				Details: details,
			}
		}
	}

	return DependencyStatus{
		Name:    "mysql",
		Status:  StatusUp,
		Latency: time.Since(start),
		Details: details,
	}
}
