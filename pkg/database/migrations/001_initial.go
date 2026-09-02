package migrations

import (
	"context"
	"database/sql"

	"github.com/stockmafia/trading-app/pkg/database"
)

func GetMigrations() []database.Migration {
	return []database.Migration{
		{
			Version:     1,
			Description: "Initial schema",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				queries := []string{
					`CREATE TABLE IF NOT EXISTS stocks (
						id BIGINT AUTO_INCREMENT PRIMARY KEY,
						symbol VARCHAR(50) NOT NULL,
						name VARCHAR(255) NOT NULL,
						exchange VARCHAR(20) NOT NULL,
						sector VARCHAR(100),
						industry VARCHAR(200),
						is_active BOOLEAN DEFAULT TRUE,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
						UNIQUE KEY uk_symbol_exchange (symbol, exchange),
						INDEX idx_exchange (exchange),
						INDEX idx_sector (sector),
						INDEX idx_active (is_active)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

					`CREATE TABLE IF NOT EXISTS quotes (
						id BIGINT AUTO_INCREMENT PRIMARY KEY,
						symbol VARCHAR(50) NOT NULL,
						exchange VARCHAR(20) NOT NULL,
						open DECIMAL(20,4),
						high DECIMAL(20,4),
						low DECIMAL(20,4),
						close DECIMAL(20,4),
						last_price DECIMAL(20,4),
						change_val DECIMAL(20,4),
						change_percent DECIMAL(10,4),
						volume BIGINT DEFAULT 0,
						bid DECIMAL(20,4),
						ask DECIMAL(20,4),
						source VARCHAR(50),
						timestamp BIGINT NOT NULL,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						INDEX idx_symbol (symbol),
						INDEX idx_symbol_timestamp (symbol, timestamp),
						INDEX idx_source (source)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

					`CREATE TABLE IF NOT EXISTS candles (
						id BIGINT AUTO_INCREMENT PRIMARY KEY,
						symbol VARCHAR(50) NOT NULL,
						exchange VARCHAR(20) NOT NULL,
						interval VARCHAR(10) NOT NULL,
						open DECIMAL(20,4) NOT NULL,
						high DECIMAL(20,4) NOT NULL,
						low DECIMAL(20,4) NOT NULL,
						close DECIMAL(20,4) NOT NULL,
						volume BIGINT DEFAULT 0,
						timestamp BIGINT NOT NULL,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						UNIQUE KEY uk_symbol_interval_timestamp (symbol, interval, timestamp),
						INDEX idx_symbol_interval (symbol, interval),
						INDEX idx_timestamp (timestamp)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

					`CREATE TABLE IF NOT EXISTS alerts (
						id VARCHAR(36) PRIMARY KEY,
						user_id VARCHAR(36) NOT NULL,
						symbol VARCHAR(50) NOT NULL,
						alert_type VARCHAR(50) NOT NULL,
						condition VARCHAR(50) NOT NULL,
						target_value DECIMAL(20,4) NOT NULL,
						current_value DECIMAL(20,4),
						is_active BOOLEAN DEFAULT TRUE,
						channel VARCHAR(50) DEFAULT 'in_app',
						triggered_at TIMESTAMP NULL,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
						INDEX idx_user_id (user_id),
						INDEX idx_symbol (symbol),
						INDEX idx_active (is_active),
						INDEX idx_user_active (user_id, is_active)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

					`CREATE TABLE IF NOT EXISTS positions (
						id VARCHAR(36) PRIMARY KEY,
						user_id VARCHAR(36) NOT NULL,
						symbol VARCHAR(50) NOT NULL,
						exchange VARCHAR(20) NOT NULL,
						side VARCHAR(10) NOT NULL,
						quantity DECIMAL(20,4) NOT NULL,
						entry_price DECIMAL(20,4) NOT NULL,
						current_price DECIMAL(20,4),
						pnl DECIMAL(20,4) DEFAULT 0,
						pnl_percent DECIMAL(10,4) DEFAULT 0,
						status VARCHAR(20) DEFAULT 'open',
						is_paper BOOLEAN DEFAULT FALSE,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
						INDEX idx_user_id (user_id),
						INDEX idx_symbol (symbol),
						INDEX idx_status (status),
						INDEX idx_user_paper (user_id, is_paper)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

					`CREATE TABLE IF NOT EXISTS orders (
						id VARCHAR(36) PRIMARY KEY,
						user_id VARCHAR(36) NOT NULL,
						symbol VARCHAR(50) NOT NULL,
						exchange VARCHAR(20) NOT NULL,
						side VARCHAR(10) NOT NULL,
						order_type VARCHAR(20) NOT NULL,
						quantity DECIMAL(20,4) NOT NULL,
						price DECIMAL(20,4),
						trigger_price DECIMAL(20,4),
						status VARCHAR(20) DEFAULT 'pending',
						exchange_order_id VARCHAR(100),
						is_paper BOOLEAN DEFAULT FALSE,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
						INDEX idx_user_id (user_id),
						INDEX idx_symbol (symbol),
						INDEX idx_status (status),
						INDEX idx_user_status (user_id, status)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

					`CREATE TABLE IF NOT EXISTS trade_journal (
						id VARCHAR(36) PRIMARY KEY,
						user_id VARCHAR(36) NOT NULL,
						symbol VARCHAR(50) NOT NULL,
						side VARCHAR(10) NOT NULL,
						quantity DECIMAL(20,4) NOT NULL,
						entry_price DECIMAL(20,4) NOT NULL,
						exit_price DECIMAL(20,4),
						pnl DECIMAL(20,4) DEFAULT 0,
						strategy VARCHAR(100),
						notes TEXT,
						entry_time TIMESTAMP NOT NULL,
						exit_time TIMESTAMP NULL,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						INDEX idx_user_id (user_id),
						INDEX idx_symbol (symbol),
						INDEX idx_strategy (strategy),
						INDEX idx_entry_time (entry_time)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

					`CREATE TABLE IF NOT EXISTS signals (
						id BIGINT AUTO_INCREMENT PRIMARY KEY,
						symbol VARCHAR(50) NOT NULL,
						strategy VARCHAR(100) NOT NULL,
						direction VARCHAR(10) NOT NULL,
						strength DECIMAL(5,4),
						confidence DECIMAL(5,4),
						indicators JSON,
						message TEXT,
						timestamp BIGINT NOT NULL,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						INDEX idx_symbol (symbol),
						INDEX idx_strategy (strategy),
						INDEX idx_timestamp (timestamp),
						INDEX idx_symbol_timestamp (symbol, timestamp)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

					`CREATE TABLE IF NOT EXISTS crawl_jobs (
						id VARCHAR(36) PRIMARY KEY,
						symbol VARCHAR(50),
						source VARCHAR(50) NOT NULL,
						interval VARCHAR(10) NOT NULL,
						status VARCHAR(20) DEFAULT 'pending',
						retries INT DEFAULT 0,
						max_retries INT DEFAULT 3,
						error_message TEXT,
						scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						started_at TIMESTAMP NULL,
						completed_at TIMESTAMP NULL,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						INDEX idx_status (status),
						INDEX idx_scheduled (scheduled_at),
						INDEX idx_source (source)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
				}

				for _, query := range queries {
					if _, err := tx.ExecContext(ctx, query); err != nil {
						return err
					}
				}
				return nil
			},
			Down: func(ctx context.Context, tx *sql.Tx) error {
				queries := []string{
					"DROP TABLE IF EXISTS crawl_jobs",
					"DROP TABLE IF EXISTS signals",
					"DROP TABLE IF EXISTS trade_journal",
					"DROP TABLE IF EXISTS orders",
					"DROP TABLE IF EXISTS positions",
					"DROP TABLE IF EXISTS alerts",
					"DROP TABLE IF EXISTS candles",
					"DROP TABLE IF EXISTS quotes",
					"DROP TABLE IF EXISTS stocks",
				}
				for _, query := range queries {
					if _, err := tx.ExecContext(ctx, query); err != nil {
						return err
					}
				}
				return nil
			},
		},
	}
}
