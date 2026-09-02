package crawler

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/stockmafia/trading-app/pkg/proxy"
	"github.com/stockmafia/trading-app/services/crawler/internal/crawler/sources"
	"go.uber.org/zap"
)

type Worker struct {
	id             int
	proxyManager   *proxy.Manager
	adapters       map[string]sources.SourceAdapter
	logger         *zap.Logger
	stopCh         chan struct{}
	domainThrottle int
}

func NewWorker(id int, proxyManager *proxy.Manager, adapters map[string]sources.SourceAdapter, logger *zap.Logger, domainThrottle int) *Worker {
	if domainThrottle == 0 {
		domainThrottle = 2
	}
	return &Worker{
		id:             id,
		proxyManager:   proxyManager,
		adapters:       adapters,
		logger:         logger,
		stopCh:         make(chan struct{}),
		domainThrottle: domainThrottle,
	}
}

func (w *Worker) Start(ctx context.Context, jobs *priorityQueue, results chan<- Result) {
	w.logger.Info("worker started", zap.Int("id", w.id))

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		default:
			job, ok := jobs.Receive()
			if !ok {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			w.processJob(ctx, job, results)
		}
	}
}

func (w *Worker) Stop() {
	close(w.stopCh)
}

func (w *Worker) processJob(ctx context.Context, job Job, results chan<- Result) {
	w.logger.Debug("processing job",
		zap.Int("worker_id", w.id),
		zap.String("symbol", job.Symbol),
		zap.String("source", job.Source),
		zap.Int("priority", job.Priority),
	)

	adapter, ok := w.adapters[job.Source]
	if !ok {
		results <- Result{
			Job:   job,
			Error: ErrSourceNotFound,
		}
		return
	}

	if !w.proxyManager.CheckCircuitBreaker(job.Source) {
		results <- Result{
			Job:   job,
			Error: ErrCircuitBreakerOpen,
		}
		return
	}

	domain := adapter.Name()
	if !w.proxyManager.AcquireDomainSlot(ctx, domain) {
		time.Sleep(500 * time.Millisecond)
		if !w.proxyManager.AcquireDomainSlot(ctx, domain) {
			results <- Result{
				Job:   job,
				Error: ErrDomainThrottled,
			}
			return
		}
	}
	defer w.proxyManager.ReleaseDomainSlot(domain)

	var quote *sources.Quote
	var candles []sources.Candle
	var err error

	maxRetries := 3
	baseDelay := time.Second

	for attempt := 0; attempt < maxRetries; attempt++ {
		if !w.proxyManager.CheckCircuitBreaker(job.Source) {
			err = ErrCircuitBreakerOpen
			break
		}

		quote, err = adapter.FetchQuote(ctx, job.Symbol, job.Market)
		if err != nil {
			w.logger.Warn("quote fetch failed",
				zap.Int("attempt", attempt+1),
				zap.String("source", job.Source),
				zap.String("symbol", job.Symbol),
				zap.Error(err),
			)
			delay := baseDelay * time.Duration(1<<uint(attempt))
			select {
			case <-ctx.Done():
				results <- Result{Job: job, Error: ctx.Err()}
				return
			case <-time.After(delay):
			}
			continue
		}

		candles, err = adapter.FetchCandles(ctx, job.Symbol, job.Market)
		if err != nil {
			w.logger.Warn("candle fetch failed",
				zap.Int("attempt", attempt+1),
				zap.String("source", job.Source),
				zap.String("symbol", job.Symbol),
				zap.Error(err),
			)
			delay := baseDelay * time.Duration(1<<uint(attempt))
			select {
			case <-ctx.Done():
				results <- Result{Job: job, Error: ctx.Err()}
				return
			case <-time.After(delay):
			}
			continue
		}

		break
	}

	if err != nil {
		w.proxyManager.RecordCircuitBreakerFailure(job.Source)
		results <- Result{
			Job:   job,
			Error: fmt.Errorf("failed after retries: %w", err),
		}
		return
	}

	w.proxyManager.RecordCircuitBreakerSuccess(job.Source)

	results <- Result{
		Job:     job,
		Quote:   quote,
		Candles: candles,
		Source:  job.Source,
	}
}

var (
	ErrSourceNotFound    = &CrawlerError{Code: "SOURCE_NOT_FOUND", Message: "source adapter not found"}
	ErrCircuitBreakerOpen = &CrawlerError{Code: "CIRCUIT_BREAKER_OPEN", Message: "circuit breaker is open for source"}
	ErrDomainThrottled   = &CrawlerError{Code: "DOMAIN_THROTTLED", Message: "domain throttled, too many concurrent requests"}
)

type CrawlerError struct {
	Code    string
	Message string
}

func (e *CrawlerError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

type WorkerPool struct {
	workers  []*Worker
	jobQueue *priorityQueue
	results  chan Result
	wg       sync.WaitGroup
}

func NewWorkerPool(workerCount int, proxyManager *proxy.Manager, adapters map[string]sources.SourceAdapter, logger *zap.Logger) *WorkerPool {
	pool := &WorkerPool{
		workers:  make([]*Worker, workerCount),
		jobQueue: newPriorityQueue(5000),
		results:  make(chan Result, 2000),
	}

	for i := 0; i < workerCount; i++ {
		pool.workers[i] = NewWorker(i, proxyManager, adapters, logger, 2)
	}

	return pool
}

func (p *WorkerPool) Start(ctx context.Context) {
	for _, worker := range p.workers {
		p.wg.Add(1)
		go func(w *Worker) {
			defer p.wg.Done()
			w.Start(ctx, p.jobQueue, p.results)
		}(worker)
	}
}

func (p *WorkerPool) Stop() {
	for _, worker := range p.workers {
		worker.Stop()
	}
	p.wg.Wait()
}

func (p *WorkerPool) Submit(job Job) {
	p.jobQueue.Send(job)
}

func (p *WorkerPool) Results() <-chan Result {
	return p.results
}
