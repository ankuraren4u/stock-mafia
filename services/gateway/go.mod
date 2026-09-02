module github.com/stockmafia/trading-app/services/gateway

go 1.21

require (
	github.com/golang-jwt/jwt/v5 v5.2.0
	github.com/google/uuid v1.6.0
	github.com/stockmafia/trading-app/proto/stockmafia/alert v0.0.0-00010101000000-000000000000
	github.com/stockmafia/trading-app/proto/stockmafia/analytics v0.0.0-00010101000000-000000000000
	github.com/stockmafia/trading-app/proto/stockmafia/crawler v0.0.0-00010101000000-000000000000
	github.com/stockmafia/trading-app/proto/stockmafia/portfolio v0.0.0-00010101000000-000000000000
	github.com/stockmafia/trading-app/proto/stockmafia/price v0.0.0-00010101000000-000000000000
	go.opentelemetry.io/otel v1.21.0
	go.opentelemetry.io/otel/trace v1.21.0
	go.uber.org/zap v1.26.0
	google.golang.org/grpc v1.60.1
)

require (
	github.com/go-logr/logr v1.3.0 // indirect
	github.com/go-logr/stdr v1.2.2 // indirect
	github.com/golang/protobuf v1.5.3 // indirect
	go.opentelemetry.io/otel/metric v1.21.0 // indirect
	go.uber.org/multierr v1.10.0 // indirect
	golang.org/x/net v0.31.0 // indirect
	golang.org/x/sys v0.27.0 // indirect
	golang.org/x/text v0.20.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20231002182017-d307bd883b97 // indirect
	google.golang.org/protobuf v1.31.0 // indirect
)

replace (
	github.com/stockmafia/trading-app/proto/stockmafia/alert => ../../proto/stockmafia/alert
	github.com/stockmafia/trading-app/proto/stockmafia/analytics => ../../proto/stockmafia/analytics
	github.com/stockmafia/trading-app/proto/stockmafia/common => ../../proto/stockmafia/common
	github.com/stockmafia/trading-app/proto/stockmafia/crawler => ../../proto/stockmafia/crawler
	github.com/stockmafia/trading-app/proto/stockmafia/portfolio => ../../proto/stockmafia/portfolio
	github.com/stockmafia/trading-app/proto/stockmafia/price => ../../proto/stockmafia/price
)
