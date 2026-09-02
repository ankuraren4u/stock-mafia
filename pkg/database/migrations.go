package database

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"

	"go.uber.org/zap"
)

type Migration struct {
	Version     int
	Description string
	Up          func(ctx context.Context, tx *sql.Tx) error
	Down        func(ctx context.Context, tx *sql.Tx) error
}

type Migrator struct {
	db         *sql.DB
	migrations []Migration
	logger     *zap.Logger
}

func NewMigrator(db *sql.DB, logger *zap.Logger) *Migrator {
	return &Migrator{
		db:         db,
		migrations: GetMigrations(),
		logger:     logger,
	}
}

func GetMigrations() []Migration {
	return []Migration{}
}

func (m *Migrator) EnsureMigrationsTable(ctx context.Context) error {
	query := `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INT PRIMARY KEY,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`
	_, err := m.db.ExecContext(ctx, query)
	return err
}

func (m *Migrator) GetAppliedMigrations(ctx context.Context) (map[int]bool, error) {
	applied := make(map[int]bool)
	rows, err := m.db.QueryContext(ctx, "SELECT version FROM schema_migrations ORDER BY version")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		applied[version] = true
	}
	return applied, nil
}

func (m *Migrator) MigrateUp(ctx context.Context) error {
	if err := m.EnsureMigrationsTable(ctx); err != nil {
		return fmt.Errorf("failed to ensure migrations table: %w", err)
	}

	applied, err := m.GetAppliedMigrations(ctx)
	if err != nil {
		return fmt.Errorf("failed to get applied migrations: %w", err)
	}

	sort.Slice(m.migrations, func(i, j int) bool {
		return m.migrations[i].Version < m.migrations[j].Version
	})

	for _, migration := range m.migrations {
		if applied[migration.Version] {
			continue
		}

		m.logger.Info("applying migration",
			zap.Int("version", migration.Version),
			zap.String("description", migration.Description),
		)

		tx, err := m.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("failed to begin transaction for migration %d: %w", migration.Version, err)
		}

		if err := migration.Up(ctx, tx); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to apply migration %d: %w", migration.Version, err)
		}

		if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (version) VALUES (?)", migration.Version); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to record migration %d: %w", migration.Version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %d: %w", migration.Version, err)
		}

		m.logger.Info("migration applied successfully", zap.Int("version", migration.Version))
	}

	return nil
}

func (m *Migrator) MigrateDown(ctx context.Context, steps int) error {
	if err := m.EnsureMigrationsTable(ctx); err != nil {
		return fmt.Errorf("failed to ensure migrations table: %w", err)
	}

	applied, err := m.GetAppliedMigrations(ctx)
	if err != nil {
		return fmt.Errorf("failed to get applied migrations: %w", err)
	}

	sort.Slice(m.migrations, func(i, j int) bool {
		return m.migrations[i].Version > m.migrations[j].Version
	})

	count := 0
	for _, migration := range m.migrations {
		if !applied[migration.Version] {
			continue
		}
		if steps > 0 && count >= steps {
			break
		}

		m.logger.Info("rolling back migration",
			zap.Int("version", migration.Version),
			zap.String("description", migration.Description),
		)

		tx, err := m.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("failed to begin transaction for rollback %d: %w", migration.Version, err)
		}

		if err := migration.Down(ctx, tx); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to rollback migration %d: %w", migration.Version, err)
		}

		if _, err := tx.ExecContext(ctx, "DELETE FROM schema_migrations WHERE version = ?", migration.Version); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to remove migration record %d: %w", migration.Version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit rollback %d: %w", migration.Version, err)
		}

		m.logger.Info("migration rolled back successfully", zap.Int("version", migration.Version))
		count++
	}

	return nil
}

func (m *Migrator) Status(ctx context.Context) ([]MigrationStatus, error) {
	if err := m.EnsureMigrationsTable(ctx); err != nil {
		return nil, err
	}

	applied, err := m.GetAppliedMigrations(ctx)
	if err != nil {
		return nil, err
	}

	var statuses []MigrationStatus
	for _, migration := range m.migrations {
		status := MigrationStatus{
			Version:     migration.Version,
			Description: migration.Description,
			Applied:     applied[migration.Version],
		}
		statuses = append(statuses, status)
	}

	return statuses, nil
}

type MigrationStatus struct {
	Version     int
	Description string
	Applied     bool
	AppliedAt   time.Time
}
