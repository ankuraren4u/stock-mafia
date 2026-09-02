module github.com/stockmafia/trading-app/services/price

go 1.21

require (
	github.com/go-sql-driver/mysql v1.8.1
	github.com/gorilla/websocket v1.5.1
	github.com/redis/go-redis/v9 v9.7.0
	github.com/stockmafia/trading-app/pkg/kafka v0.0.0
	github.com/stockmafia/trading-app/pkg/logging v0.0.0
	github.com/stockmafia/trading-app/proto/stockmafia/common v0.0.0-00010101000000-000000000000
	github.com/stockmafia/trading-app/proto/stockmafia/price v0.0.0-00010101000000-000000000000
	go.uber.org/zap v1.26.0
	google.golang.org/grpc v1.60.1
)

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/cespare/xxhash/v2 v2.2.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/golang/protobuf v1.5.3 // indirect
	github.com/google/go-cmp v0.6.0 // indirect
	github.com/klauspost/compress v1.15.9 // indirect
	github.com/pierrec/lz4/v4 v4.1.15 // indirect
	github.com/segmentio/kafka-go v0.4.47 // indirect
	go.uber.org/multierr v1.10.0 // indirect
	golang.org/x/net v0.31.0 // indirect
	golang.org/x/sys v0.27.0 // indirect
	golang.org/x/text v0.20.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20231002182017-d307bd883b97 // indirect
	google.golang.org/protobuf v1.31.0 // indirect
	gopkg.in/natefinch/lumberjack.v2 v2.2.1 // indirect
)

replace (
	github.com/stockmafia/trading-app/pkg/kafka => ../../pkg/kafka
	github.com/stockmafia/trading-app/pkg/logging => ../../pkg/logging
	github.com/stockmafia/trading-app/pkg/redis => ../../pkg/redis
	github.com/stockmafia/trading-app/proto/stockmafia/alert => ../../proto/stockmafia/alert
	github.com/stockmafia/trading-app/proto/stockmafia/analytics => ../../proto/stockmafia/analytics
	github.com/stockmafia/trading-app/proto/stockmafia/common => ../../proto/stockmafia/common
	github.com/stockmafia/trading-app/proto/stockmafia/crawler => ../../proto/stockmafia/crawler
	github.com/stockmafia/trading-app/proto/stockmafia/portfolio => ../../proto/stockmafia/portfolio
	github.com/stockmafia/trading-app/proto/stockmafia/price => ../../proto/stockmafia/price
)
