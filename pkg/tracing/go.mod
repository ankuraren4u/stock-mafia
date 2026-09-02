module github.com/stockmafia/trading-app/pkg/tracing

go 1.21

require (
	go.opentelemetry.io/otel v1.21.0
	go.opentelemetry.io/otel/exporters/jaeger v1.21.0
	go.opentelemetry.io/otel/sdk v1.21.0
	go.opentelemetry.io/otel/trace v1.21.0
	go.uber.org/zap v1.26.0
)
