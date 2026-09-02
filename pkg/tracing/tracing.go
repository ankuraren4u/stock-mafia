package tracing

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/jaeger"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

type Config struct {
	JaegerURL   string
	ServiceName string
	Environment string
	Version     string
	SampleRate  float64
}

type Tracing struct {
	tp     *sdktrace.TracerProvider
	logger *zap.Logger
}

func NewTracing(cfg Config, logger *zap.Logger) (*Tracing, error) {
	ctx := context.Background()

	exp, err := jaeger.New(jaeger.WithCollectorEndpoint(jaeger.WithEndpoint(cfg.JaegerURL)))
	if err != nil {
		return nil, fmt.Errorf("failed to create jaeger exporter: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(cfg.ServiceName),
			semconv.ServiceVersionKey.String(cfg.Version),
			attribute.String("environment", cfg.Environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.TraceIDRatioBased(cfg.SampleRate)),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	logger.Info("tracing initialized",
		zap.String("jaeger_url", cfg.JaegerURL),
		zap.String("service", cfg.ServiceName),
		zap.Float64("sample_rate", cfg.SampleRate),
	)

	return &Tracing{
		tp:     tp,
		logger: logger,
	}, nil
}

func (t *Tracing) Tracer(name string) trace.Tracer {
	return t.tp.Tracer(name)
}

func (t *Tracing) Shutdown(ctx context.Context) error {
	t.logger.Info("shutting down tracing")
	return t.tp.Shutdown(ctx)
}

func (t *Tracing) StartSpan(ctx context.Context, name string) (context.Context, trace.Span) {
	tracer := t.tp.Tracer("")
	return tracer.Start(ctx, name)
}

func (t *Tracing) WithAttributes(ctx context.Context, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(attrs...)
}

func (t *Tracing) RecordError(ctx context.Context, err error, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.RecordError(err, trace.WithAttributes(attrs...))
}

func (t *Tracing) AddEvent(ctx context.Context, name string, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.AddEvent(name, trace.WithAttributes(attrs...))
}

type spanKey struct{}

func ContextWithSpan(ctx context.Context, span trace.Span) context.Context {
	return context.WithValue(ctx, spanKey{}, span)
}

func SpanFromContext(ctx context.Context) trace.Span {
	if span, ok := ctx.Value(spanKey{}).(trace.Span); ok {
		return span
	}
	return trace.SpanFromContext(ctx)
}

func InitTracing(cfg Config, logger *zap.Logger) (func(context.Context) error, error) {
	t, err := NewTracing(cfg, logger)
	if err != nil {
		return nil, err
	}

	return t.Shutdown, nil
}

func NewResource(serviceName, version, environment string) (*resource.Resource, error) {
	return resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceNameKey.String(serviceName),
			semconv.ServiceVersionKey.String(version),
			attribute.String("environment", environment),
		),
	)
}

func StartTimer(ctx context.Context, name string) func() {
	_, span := otel.Tracer("").Start(ctx, name)
	start := time.Now()
	return func() {
		span.SetAttributes(attribute.Float64("duration_ms", float64(time.Since(start).Milliseconds())))
		span.End()
	}
}
