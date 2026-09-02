package middleware

import (
	"net/http"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type TracingMiddleware struct {
	serviceName string
	tracer      trace.Tracer
}

func NewTracingMiddleware(serviceName string) *TracingMiddleware {
	return &TracingMiddleware{
		serviceName: serviceName,
		tracer:      otel.Tracer(serviceName),
	}
}

func (m *TracingMiddleware) Handle(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, span := m.tracer.Start(r.Context(), m.serviceName+"-request",
			trace.WithAttributes(
				attribute.String("http.method", r.Method),
				attribute.String("http.url", r.URL.String()),
				attribute.String("http.host", r.Host),
				attribute.String("http.user_agent", r.UserAgent()),
				attribute.String("http.remote_addr", r.RemoteAddr),
			),
		)
		defer span.End()

		wrapped := &tracingResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r.WithContext(ctx))

		span.SetAttributes(
			attribute.Int("http.status_code", wrapped.statusCode),
		)

		if wrapped.statusCode >= 400 {
			span.SetAttributes(attribute.Bool("error", true))
		}
	})
}

type tracingResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (tw *tracingResponseWriter) WriteHeader(code int) {
	tw.statusCode = code
	tw.ResponseWriter.WriteHeader(code)
}
