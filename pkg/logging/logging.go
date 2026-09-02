package logging

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

type Config struct {
	Level       string
	Format      string
	Output      string
	FilePath    string
	MaxSize     int
	MaxBackups  int
	MaxAge      int
	Compress    bool
	ServiceName string
	Environment string
}

type Logger struct {
	*zap.Logger
	config Config
}

func NewLogger(cfg Config) (*Logger, error) {
	level, err := parseLevel(cfg.Level)
	if err != nil {
		return nil, fmt.Errorf("invalid log level: %w", err)
	}

	encoderConfig := zapcore.EncoderConfig{
		TimeKey:        "timestamp",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		MessageKey:     "message",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.LowercaseLevelEncoder,
		EncodeTime:     zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.MillisDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}

	var encoder zapcore.Encoder
	if cfg.Format == "json" {
		encoder = zapcore.NewJSONEncoder(encoderConfig)
	} else {
		encoder = zapcore.NewConsoleEncoder(encoderConfig)
	}

	var writeSyncer zapcore.WriteSyncer

	switch cfg.Output {
	case "stdout":
		writeSyncer = zapcore.AddSync(os.Stdout)
	case "file":
		if cfg.FilePath == "" {
			cfg.FilePath = "logs/app.log"
		}

		if err := os.MkdirAll(filepath.Dir(cfg.FilePath), 0755); err != nil {
			return nil, fmt.Errorf("failed to create log directory: %w", err)
		}

		fileWriter := &lumberjack.Logger{
			Filename:   cfg.FilePath,
			MaxSize:    cfg.MaxSize,
			MaxBackups: cfg.MaxBackups,
			MaxAge:     cfg.MaxAge,
			Compress:   cfg.Compress,
		}
		writeSyncer = zapcore.AddSync(fileWriter)
	case "both":
		if cfg.FilePath == "" {
			cfg.FilePath = "logs/app.log"
		}

		if err := os.MkdirAll(filepath.Dir(cfg.FilePath), 0755); err != nil {
			return nil, fmt.Errorf("failed to create log directory: %w", err)
		}

		fileWriter := &lumberjack.Logger{
			Filename:   cfg.FilePath,
			MaxSize:    cfg.MaxSize,
			MaxBackups: cfg.MaxBackups,
			MaxAge:     cfg.MaxAge,
			Compress:   cfg.Compress,
		}

		multiWriter := io.MultiWriter(os.Stdout, fileWriter)
		writeSyncer = zapcore.AddSync(multiWriter)
	default:
		writeSyncer = zapcore.AddSync(os.Stdout)
	}

	core := zapcore.NewCore(encoder, writeSyncer, level)

	logger := zap.New(core,
		zap.AddCaller(),
		zap.AddCallerSkip(0),
		zap.AddStacktrace(zapcore.ErrorLevel),
		zap.Fields(
			zap.String("service", cfg.ServiceName),
			zap.String("environment", cfg.Environment),
		),
	)

	return &Logger{
		Logger: logger,
		config: cfg,
	}, nil
}

func parseLevel(level string) (zapcore.Level, error) {
	var l zapcore.Level
	err := l.UnmarshalText([]byte(level))
	return l, err
}

func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	zapFields := make([]zap.Field, 0, len(fields))
	for k, v := range fields {
		zapFields = append(zapFields, zap.Any(k, v))
	}
	return &Logger{
		Logger: l.Logger.With(zapFields...),
		config: l.config,
	}
}

func (l *Logger) Named(name string) *Logger {
	return &Logger{
		Logger: l.Logger.Named(name),
		config: l.config,
	}
}

func (l *Logger) WithContext(service, environment string) *Logger {
	return &Logger{
		Logger: l.Logger.With(
			zap.String("service", service),
			zap.String("environment", environment),
		),
		config: l.config,
	}
}

type RequestLogger struct {
	logger *Logger
}

func NewRequestLogger(logger *Logger) *RequestLogger {
	return &RequestLogger{logger: logger}
}

func (rl *RequestLogger) LogRequest(method, path, clientIP, userAgent string, statusCode int, latency time.Duration, requestID string) {
	rl.logger.Info("request",
		zap.String("method", method),
		zap.String("path", path),
		zap.String("client_ip", clientIP),
		zap.String("user_agent", userAgent),
		zap.Int("status_code", statusCode),
		zap.Duration("latency", latency),
		zap.String("request_id", requestID),
	)
}

func (rl *RequestLogger) LogError(err error, fields map[string]interface{}) {
	zapFields := make([]zap.Field, 0, len(fields))
	for k, v := range fields {
		zapFields = append(zapFields, zap.Any(k, v))
	}
	rl.logger.Error("error", append(zapFields, zap.Error(err))...)
}

func (l *Logger) Sync() error {
	return l.Logger.Sync()
}
