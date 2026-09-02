package health

import (
	"context"
	"fmt"
	"time"

	"github.com/segmentio/kafka-go"
)

type KafkaHealthChecker struct {
	brokers       []string
	topic         string
	consumerGroup string
}

type KafkaHealthDetails struct {
	BrokersReachable   int                    `json:"brokers_reachable"`
	BrokersTotal       int                    `json:"brokers_total"`
	TopicLags          map[int32]int64        `json:"topic_lags,omitempty"`
	ConsumerGroupState string                 `json:"consumer_group_state"`
	Topics             []TopicStatus          `json:"topics,omitempty"`
}

type TopicStatus struct {
	Name       string `json:"name"`
	Partitions int    `json:"partitions"`
}

func NewKafkaHealthChecker(brokers []string, topic, consumerGroup string) *KafkaHealthChecker {
	return &KafkaHealthChecker{
		brokers:       brokers,
		topic:         topic,
		consumerGroup: consumerGroup,
	}
}

func (k *KafkaHealthChecker) CheckHealth(ctx context.Context) DependencyStatus {
	start := time.Now()

	checkCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	var details KafkaHealthDetails
	details.BrokersTotal = len(k.brokers)

	reachable := 0
	for _, broker := range k.brokers {
		conn, err := kafka.Dial("tcp", broker)
		if err != nil {
			continue
		}
		conn.Close()
		reachable++
	}
	details.BrokersReachable = reachable

	if reachable == 0 {
		return DependencyStatus{
			Name:    "kafka",
			Status:  StatusDown,
			Latency: time.Since(start),
			Error:   "no brokers reachable",
			Details: details,
		}
	}

	if k.topic != "" {
		conn, err := kafka.DialLeader(checkCtx, "tcp", k.brokers[0], k.topic, 0)
		if err == nil {
			partitions, err := conn.ReadPartitions()
			if err == nil {
				details.Topics = append(details.Topics, TopicStatus{
					Name:       k.topic,
					Partitions: len(partitions),
				})

				details.TopicLags = make(map[int32]int64)
				for _, p := range partitions {
					conn, err := kafka.DialLeader(checkCtx, "tcp", k.brokers[0], k.topic, p.ID)
					if err != nil {
						continue
					}
					endOffset, _ := conn.ReadEndOffset()
					conn.Close()

					lag := endOffset
					details.TopicLags[p.ID] = lag
				}
			}
			conn.Close()
		}
	}

	if k.consumerGroup != "" {
		conn, err := kafka.Dial("tcp", k.brokers[0])
		if err == nil {
			defer conn.Close()
			details.ConsumerGroupState = "active"
		} else {
			details.ConsumerGroupState = fmt.Sprintf("error: %v", err)
		}
	}

	if reachable < len(k.brokers) {
		return DependencyStatus{
			Name:    "kafka",
			Status:  StatusDegraded,
			Latency: time.Since(start),
			Error:   fmt.Sprintf("only %d/%d brokers reachable", reachable, len(k.brokers)),
			Details: details,
		}
	}

	return DependencyStatus{
		Name:    "kafka",
		Status:  StatusUp,
		Latency: time.Since(start),
		Details: details,
	}
}
