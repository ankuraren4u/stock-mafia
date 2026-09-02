package kafka

import (
	"context"
	"fmt"
	"time"

	"github.com/segmentio/kafka-go"
	"github.com/segmentio/kafka-go/compress"
	"go.uber.org/zap"
)

type Config struct {
	Brokers       []string
	Topic         string
	ConsumerGroup string
	BatchSize     int
	BatchTimeout  time.Duration
	MaxAttempts   int
	RequiredAcks  int
}

type Kafka struct {
	writer *kafka.Writer
	reader *kafka.Reader
	logger *zap.Logger
	config Config
}

func NewKafka(cfg Config, logger *zap.Logger) (*Kafka, error) {
	w := &kafka.Writer{
		Addr:         kafka.TCP(cfg.Brokers...),
		Topic:        cfg.Topic,
		BatchSize:    cfg.BatchSize,
		BatchTimeout: cfg.BatchTimeout,
		MaxAttempts:  cfg.MaxAttempts,
		RequiredAcks: kafka.RequireAll,
		Async:        false,
		Compression:  compress.Snappy,
		Logger:       writerLogger(logger.Named("kafka-writer")),
		ErrorLogger:  writerErrorLogger(logger.Named("kafka-writer")),
	}

	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:       cfg.Brokers,
		Topic:         cfg.Topic,
		GroupID:       cfg.ConsumerGroup,
		MinBytes:      1,
		MaxBytes:      10e6,
		MaxWait:       500 * time.Millisecond,
		StartOffset:   kafka.LastOffset,
		CommitInterval: time.Second,
		Logger:        readerLogger(logger.Named("kafka-reader")),
		ErrorLogger:   readerErrorLogger(logger.Named("kafka-reader")),
	})

	logger.Info("kafka initialized",
		zap.Strings("brokers", cfg.Brokers),
		zap.String("topic", cfg.Topic),
		zap.String("consumer_group", cfg.ConsumerGroup),
	)

	return &Kafka{
		writer: w,
		reader: r,
		logger: logger,
		config: cfg,
	}, nil
}

func (k *Kafka) Produce(ctx context.Context, key, value []byte) error {
	msg := kafka.Message{
		Key:   key,
		Value: value,
		Time:  time.Now(),
	}

	return k.writer.WriteMessages(ctx, msg)
}

func (k *Kafka) ProduceBatch(ctx context.Context, messages []kafka.Message) error {
	return k.writer.WriteMessages(ctx, messages...)
}

func (k *Kafka) Consume(ctx context.Context) (kafka.Message, error) {
	return k.reader.ReadMessage(ctx)
}

func (k *Kafka) Close() error {
	if err := k.writer.Close(); err != nil {
		k.logger.Error("failed to close kafka writer", zap.Error(err))
	}

	if err := k.reader.Close(); err != nil {
		k.logger.Error("failed to close kafka reader", zap.Error(err))
	}

	return nil
}

func (k *Kafka) CreateTopic(ctx context.Context, topic string, partitions, replicationFactor int) error {
	conn, err := kafka.Dial("tcp", k.config.Brokers[0])
	if err != nil {
		return fmt.Errorf("failed to dial kafka: %w", err)
	}
	defer conn.Close()

	topicConfigs := []kafka.TopicConfig{
		{
			Topic:             topic,
			NumPartitions:     partitions,
			ReplicationFactor: replicationFactor,
		},
	}

	return conn.CreateTopics(topicConfigs...)
}

func writerLogger(l *zap.Logger) kafka.LoggerFunc {
	return func(msg string, args ...interface{}) {
		l.Sugar().Infow(msg, args...)
	}
}

func writerErrorLogger(l *zap.Logger) kafka.LoggerFunc {
	return func(msg string, args ...interface{}) {
		l.Sugar().Errorw(msg, args...)
	}
}

func readerLogger(l *zap.Logger) kafka.LoggerFunc {
	return func(msg string, args ...interface{}) {
		l.Sugar().Infow(msg, args...)
	}
}

func readerErrorLogger(l *zap.Logger) kafka.LoggerFunc {
	return func(msg string, args ...interface{}) {
		l.Sugar().Errorw(msg, args...)
	}
}

type MessageHandler func(ctx context.Context, key, value []byte) error

func (k *Kafka) StartConsumer(ctx context.Context, handler MessageHandler) error {
	k.logger.Info("starting kafka consumer", zap.String("topic", k.config.Topic))

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			msg, err := k.reader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				k.logger.Error("failed to read message", zap.Error(err))
				time.Sleep(time.Second)
				continue
			}

			if err := handler(ctx, msg.Key, msg.Value); err != nil {
				k.logger.Error("failed to handle message",
					zap.String("topic", msg.Topic),
					zap.Int("partition", msg.Partition),
					zap.Int64("offset", msg.Offset),
					zap.Error(err),
				)
			}
		}
	}
}
