package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

type Config struct {
	Host            string
	Port            int
	User            string
	Password        string
	Database        string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

type MySQL struct {
	db     *sql.DB
	tracer trace.Tracer
}

func NewMySQL(cfg Config) (*MySQL, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Database)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.ConnMaxLifetime)
	db.SetConnMaxIdleTime(cfg.ConnMaxIdleTime)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &MySQL{
		db:     db,
		tracer: otel.Tracer("mysql"),
	}, nil
}

func (m *MySQL) DB() *sql.DB {
	return m.db
}

func (m *MySQL) Close() error {
	return m.db.Close()
}

func (m *MySQL) Ping(ctx context.Context) error {
	return m.db.PingContext(ctx)
}

func (m *MySQL) BeginTx(ctx context.Context) (*sql.Tx, error) {
	return m.db.BeginTx(ctx, nil)
}
