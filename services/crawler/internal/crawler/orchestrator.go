package crawler

import (
	"container/heap"
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/stockmafia/trading-app/pkg/proxy"
	"github.com/stockmafia/trading-app/pkg/redis"
	"github.com/stockmafia/trading-app/services/crawler/internal/crawler/sources"
	"github.com/stockmafia/trading-app/services/crawler/internal/repository"
	"go.uber.org/zap"
)

type OrchestratorConfig struct {
	WorkerCount    int
	MaxConcurrent  int
	DomainThrottle int
	StocksRepo     *repository.StocksRepository
	CandlesRepo    *repository.CandlesRepository
	QuotesRepo     *repository.QuotesRepository
	ProxyManager   *proxy.Manager
	RedisClient    *redis.Client
	Sources        []string
	BatchSize      int
	BatchDelay     time.Duration
	CrawlInterval  time.Duration
}

type Orchestrator struct {
	config     OrchestratorConfig
	logger     *zap.Logger
	jobQueue   *priorityQueue
	results    chan Result
	workers    []*Worker
	adapters   map[string]sources.SourceAdapter
	stopCh     chan struct{}
	wg         sync.WaitGroup
	stats      *crawlStats
	mu         sync.RWMutex
}

type crawlStats struct {
	totalJobs     int64
	completedJobs int64
	failedJobs    int64
	sourceErrors  map[string]int64
}

type Job struct {
	ID       string
	Symbol   string
	Market   string
	Source   string
	Interval string
	Priority int
	Created  time.Time
}

type Result struct {
	Job          Job
	Quote        *sources.Quote
	Candles      []sources.Candle
	Fundamentals *sources.Fundamentals
	Error        error
	Source       string
}

type sourceChain struct {
	primary   string
	fallbacks []string
}

func NewOrchestrator(cfg OrchestratorConfig, logger *zap.Logger) *Orchestrator {
	if cfg.BatchSize == 0 {
		cfg.BatchSize = 8
	}
	if cfg.BatchDelay == 0 {
		cfg.BatchDelay = 3 * time.Second
	}

	adapters := make(map[string]sources.SourceAdapter)
	for _, sourceName := range cfg.Sources {
		adapter := sources.CreateAdapter(sourceName)
		if adapter != nil {
			adapters[sourceName] = adapter
		}
	}

	o := &Orchestrator{
		config:   cfg,
		logger:   logger,
		jobQueue: newPriorityQueue(5000),
		results:  make(chan Result, 2000),
		adapters: adapters,
		stopCh:   make(chan struct{}),
		stats: &crawlStats{
			sourceErrors: make(map[string]int64),
		},
	}

	return o
}

func (o *Orchestrator) Start(ctx context.Context) {
	o.logger.Info("starting orchestrator",
		zap.Int("workers", o.config.WorkerCount),
		zap.Int("batch_size", o.config.BatchSize),
		zap.Duration("batch_delay", o.config.BatchDelay),
	)

	for i := 0; i < o.config.WorkerCount; i++ {
		worker := NewWorker(i, o.config.ProxyManager, o.adapters, o.logger, o.config.DomainThrottle)
		o.workers = append(o.workers, worker)
		o.wg.Add(1)
		go func(w *Worker) {
			defer o.wg.Done()
			w.Start(ctx, o.jobQueue, o.results)
		}(worker)
	}

	go o.processResults(ctx)
	go o.scheduleJobs(ctx)
}

func (o *Orchestrator) Stop() {
	close(o.stopCh)
	for _, worker := range o.workers {
		worker.Stop()
	}
	o.wg.Wait()
	close(o.results)
}

func (o *Orchestrator) GetStats() map[string]interface{} {
	o.mu.RLock()
	defer o.mu.RUnlock()

	return map[string]interface{}{
		"total_jobs":     atomic.LoadInt64(&o.stats.totalJobs),
		"completed_jobs": atomic.LoadInt64(&o.stats.completedJobs),
		"failed_jobs":    atomic.LoadInt64(&o.stats.failedJobs),
		"queued_jobs":    o.jobQueue.Len(),
		"source_errors":  o.stats.sourceErrors,
	}
}

func (o *Orchestrator) processResults(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-o.stopCh:
			return
		case result, ok := <-o.results:
			if !ok {
				return
			}
			o.handleResult(ctx, result)
		}
	}
}

func (o *Orchestrator) handleResult(ctx context.Context, result Result) {
	if result.Error != nil {
		o.logger.Error("job failed",
			zap.String("job_id", result.Job.ID),
			zap.String("symbol", result.Job.Symbol),
			zap.String("source", result.Job.Source),
			zap.Error(result.Error),
		)
		atomic.AddInt64(&o.stats.failedJobs, 1)
		o.mu.Lock()
		o.stats.sourceErrors[result.Job.Source]++
		o.mu.Unlock()
		return
	}

	if result.Quote != nil {
		err := o.config.QuotesRepo.SaveQuote(ctx, &repository.Quote{
			Symbol:    result.Job.Symbol,
			Last:      result.Quote.Last,
			Bid:       result.Quote.Bid,
			Ask:       result.Quote.Ask,
			Volume:    result.Quote.Volume,
			Timestamp: result.Quote.Timestamp,
			Source:    result.Job.Source,
		})
		if err != nil {
			o.logger.Error("failed to save quote", zap.Error(err))
		}
	}

	if len(result.Candles) > 0 {
		batch := make([]repository.Candle, 0, len(result.Candles))
		for _, c := range result.Candles {
			batch = append(batch, repository.Candle{
				Symbol:    result.Job.Symbol,
				Interval:  result.Job.Interval,
				Open:      c.Open,
				High:      c.High,
				Low:       c.Low,
				Close:     c.Close,
				Volume:    c.Volume,
				Timestamp: c.Timestamp,
			})
		}
		if err := o.config.CandlesRepo.SaveBatch(ctx, batch); err != nil {
			o.logger.Error("failed to save candles batch", zap.Error(err))
		}
	}

	atomic.AddInt64(&o.stats.completedJobs, 1)
	o.logger.Debug("job completed",
		zap.String("job_id", result.Job.ID),
		zap.String("symbol", result.Job.Symbol),
		zap.Int("candles", len(result.Candles)),
	)
}

func (o *Orchestrator) scheduleJobs(ctx context.Context) {
	interval := o.config.CrawlInterval
	if interval == 0 {
		interval = 5 * time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	o.enqueueAllSymbols(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-o.stopCh:
			return
		case <-ticker.C:
			o.enqueueAllSymbols(ctx)
		}
	}
}

func (o *Orchestrator) enqueueAllSymbols(ctx context.Context) {
	stocks, err := o.config.StocksRepo.GetAllActive(ctx)
	if err != nil {
		o.logger.Error("failed to get stocks", zap.Error(err))
		return
	}

	o.logger.Info("enqueuing stocks for crawl", zap.Int("count", len(stocks)))

	chains := o.buildSourceChains()

	for _, stock := range stocks {
		for _, chain := range chains {
			priority := 1
			if stock.Priority > 0 {
				priority = 0
			}

			job := Job{
				ID:       generateJobID(),
				Symbol:   stock.Symbol,
				Market:   stock.Exchange,
				Source:   chain.primary,
				Interval: "1d",
				Priority: priority,
				Created:  time.Now(),
			}

			o.jobQueue.Send(job)
			atomic.AddInt64(&o.stats.totalJobs, 1)
			o.logger.Debug("job enqueued",
				zap.String("symbol", stock.Symbol),
				zap.String("source", chain.primary),
				zap.Int("priority", priority),
			)
		}
	}
}

func (o *Orchestrator) buildSourceChains() []sourceChain {
	chains := []sourceChain{
		{primary: "stooq", fallbacks: []string{"nse", "moneycontrol", "finnhub", "yahoo"}},
		{primary: "finnhub", fallbacks: []string{"yahoo"}},
	}

	knownSources := make(map[string]bool)
	for name := range o.adapters {
		knownSources[name] = true
	}

	var valid []sourceChain
	for _, c := range chains {
		if knownSources[c.primary] {
			valid = append(valid, c)
		}
	}

	if len(valid) == 0 {
		for name := range o.adapters {
			valid = append(valid, sourceChain{primary: name})
		}
	}

	return valid
}

func (o *Orchestrator) TriggerCrawl(ctx context.Context, symbols []string, source string) string {
	runID := generateJobID()

	go func() {
		for _, symbol := range symbols {
			job := Job{
				ID:       generateJobID(),
				Symbol:   symbol,
				Market:   "US",
				Source:   source,
				Interval: "1d",
				Priority: 0,
				Created:  time.Now(),
			}
			o.jobQueue.Send(job)
			atomic.AddInt64(&o.stats.totalJobs, 1)
		}
	}()

	return runID
}

func (o *Orchestrator) TriggerBatchCrawl(ctx context.Context, symbols []string, source string) string {
	runID := generateJobID()

	go func() {
		for i := 0; i < len(symbols); i += o.config.BatchSize {
			end := i + o.config.BatchSize
			if end > len(symbols) {
				end = len(symbols)
			}
			batch := symbols[i:end]

			for _, symbol := range batch {
				job := Job{
					ID:       generateJobID(),
					Symbol:   symbol,
					Market:   "US",
					Source:   source,
					Interval: "1d",
					Priority: 0,
					Created:  time.Now(),
				}
				o.jobQueue.Send(job)
				atomic.AddInt64(&o.stats.totalJobs, 1)
			}

			if end < len(symbols) {
				select {
				case <-ctx.Done():
					return
				case <-o.stopCh:
					return
				case <-time.After(o.config.BatchDelay):
				}
			}
		}
	}()

	return runID
}

// priorityQueue implements heap.Interface
type priorityQueue struct {
	mu    sync.Mutex
	items jobItems
	limit int
}

type jobItem struct {
	job      Job
	priority int
	index    int
}

type jobItems []jobItem

func newPriorityQueue(limit int) *priorityQueue {
	pq := &priorityQueue{
		items: make(jobItems, 0),
		limit: limit,
	}
	heap.Init(pq)
	return pq
}

func (pq *priorityQueue) Len() int {
	pq.mu.Lock()
	defer pq.mu.Unlock()
	return len(pq.items)
}

func (pq *priorityQueue) Less(i, j int) bool {
	return pq.items[i].priority < pq.items[j].priority
}

func (pq *priorityQueue) Swap(i, j int) {
	pq.items[i], pq.items[j] = pq.items[j], pq.items[i]
	pq.items[i].index = i
	pq.items[j].index = j
}

func (pq *priorityQueue) Push(x interface{}) {
	item := x.(jobItem)
	item.index = len(pq.items)
	pq.items = append(pq.items, item)
}

func (pq *priorityQueue) Pop() interface{} {
	old := pq.items
	n := len(old)
	item := old[n-1]
	old[n-1] = jobItem{}
	pq.items = old[:n-1]
	return item
}

func (pq *priorityQueue) Send(j Job) {
	pq.mu.Lock()
	defer pq.mu.Unlock()

	if len(pq.items) >= pq.limit {
		return
	}

	heap.Push(pq, jobItem{
		job:      j,
		priority: j.Priority,
	})
}

func (pq *priorityQueue) Receive() (Job, bool) {
	pq.mu.Lock()
	defer pq.mu.Unlock()

	if len(pq.items) == 0 {
		return Job{}, false
	}

	item := heap.Pop(pq).(jobItem)
	return item.job, true
}

func generateJobID() string {
	return fmt.Sprintf("%d-%s", time.Now().UnixNano(), randomHex(6))
}

func randomHex(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = "0123456789abcdef"[time.Now().UnixNano()%16]
		time.Sleep(time.Nanosecond)
	}
	return string(b)
}
