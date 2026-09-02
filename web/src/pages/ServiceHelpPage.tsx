import ServiceDocCard from "../components/ServiceDocCard";
import EndpointList from "../components/EndpointList";
import type { Endpoint } from "../components/EndpointList";

/* ── Service Data ── */

const BASE_URL = window.location.origin;

const gatewayEndpoints: Endpoint[] = [
  { method: "GET", path: "/api/health", description: "Gateway health check" },
  { method: "GET", path: "/api/status/detailed", description: "Full platform status including all services" },
  { method: "GET", path: "/api/market/indices", description: "Market index data (NIFTY, SENSEX, DJIA, etc.)" },
  { method: "GET", path: "/api/market/stocks", description: "List all tracked stocks", example: 'curl -H "Content-Type: application/json" http://localhost:8787/api/market/stocks?market=IN&sector=IT' },
  { method: "GET", path: "/api/market/stock/:symbol", description: "Get stock detail with price, chart data, and signals", params: [{ name: "symbol", type: "string", required: true, description: "Stock symbol e.g. RELIANCE" }] },
  { method: "GET", path: "/api/market/search", description: "Search stocks by symbol or name", params: [{ name: "q", type: "string", required: true, description: "Search query" }, { name: "market", type: "IN | US", required: false, description: "Market filter" }] },
  { method: "GET", path: "/api/research/signals", description: "AI-generated trading signals" },
  { method: "GET", path: "/api/research/analysis/:symbol", description: "Technical analysis for a stock" },
  { method: "GET", path: "/api/paper/portfolio", description: "Paper trading portfolio summary" },
  { method: "POST", path: "/api/paper/trade", description: "Execute a paper trade" },
  { method: "GET", path: "/api/portfolio/positions", description: "Live portfolio positions" },
  { method: "GET", path: "/api/watchlist", description: "Get watchlist alerts" },
  { method: "GET", path: "/api/crawler/status", description: "Crawler service status" },
  { method: "SSE", path: "/api/stream/prices", description: "Server-Sent Events for real-time price updates", example: 'const evt = new EventSource("/api/stream/prices?symbols=RELIANCE,TCS");\nevt.onmessage = (e) => console.log(JSON.parse(e.data));' },
  { method: "WS", path: "/ws", description: "WebSocket connection for real-time data" },
  { method: "GET", path: "/api/research/strategies", description: "List all available trading strategies" },
  { method: "GET", path: "/api/research/screener", description: "Stock screener with filters" },
  { method: "POST", path: "/api/auth/login", description: "Authenticate user and get JWT token" },
];

const crawlerEndpoints: Endpoint[] = [
  { method: "GET", path: "/health", description: "Crawler health check" },
  { method: "GET", path: "/status", description: "Crawler status with worker count, queue depth, and source stats" },
  { method: "GET", path: "/sources", description: "List all data sources with success rates" },
  { method: "POST", path: "/crawl", description: "Trigger a manual crawl for a symbol or category", params: [{ name: "symbol", type: "string", required: false, description: "Specific symbol to crawl" }, { name: "category", type: "string", required: false, description: "Category: large_cap, mid_cap, small_cap, us_stocks" }], example: 'curl -X POST http://localhost:50051/crawl \\\n  -H "Content-Type: application/json" \\\n  -d \'{"symbol": "RELIANCE", "sources": ["yahoo", "stooq"]}\' ' },
  { method: "GET", path: "/workers", description: "Active worker status and queue depth" },
  { method: "GET", path: "/proxies", description: "Proxy pool status and health" },
  { method: "GET", path: "/rate-limits", description: "Rate limiter status per domain" },
  { method: "POST", path: "/config/proxy", description: "Add or update proxy configuration" },
  { method: "GET", path: "/logs", description: "Recent crawl logs" },
];

const priceEndpoints: Endpoint[] = [
  { method: "GET", path: "/health", description: "Price service health check" },
  { method: "GET", path: "/price/:symbol", description: "Get current price for a symbol", params: [{ name: "symbol", type: "string", required: true, description: "Stock symbol" }] },
  { method: "GET", path: "/prices", description: "Bulk price fetch for multiple symbols", params: [{ name: "symbols", type: "string", required: true, description: "Comma-separated symbols" }] },
  { method: "WS", path: "/ws", description: "WebSocket for real-time price streaming", example: 'const ws = new WebSocket("ws://localhost:8082/ws");\nws.onopen = () => ws.send(JSON.stringify({ action: "subscribe", symbols: ["RELIANCE", "TCS"] }));\nws.onmessage = (e) => console.log(JSON.parse(e.data));' },
  { method: "SSE", path: "/stream", description: "SSE endpoint for price updates" },
  { method: "GET", path: "/history/:symbol", description: "Historical OHLCV data", params: [{ name: "symbol", type: "string", required: true, description: "Stock symbol" }, { name: "interval", type: "1d | 1w | 1m", required: false, description: "Candle interval" }, { name: "period", type: "string", required: false, description: "Lookback period e.g. 1y, 6mo" }] },
  { method: "GET", path: "/quotes/:symbol", description: "Detailed quote with bid/ask spread" },
  { method: "POST", path: "/subscribe", description: "Subscribe symbols for streaming updates" },
  { method: "POST", path: "/unsubscribe", description: "Unsubscribe from symbol updates" },
];

const analyticsEndpoints: Endpoint[] = [
  { method: "GET", path: "/health", description: "Analytics service health check" },
  { method: "GET", path: "/signals", description: "Get current trading signals (BUY/SELL/HOLD)", example: 'curl http://localhost:50053/signals?market=IN&min_confidence=0.7' },
  { method: "GET", path: "/signals/:symbol", description: "Signals for a specific symbol" },
  { method: "GET", path: "/strategies", description: "List all active strategies with performance stats" },
  { method: "GET", path: "/strategy/:name", description: "Detailed strategy info with recent calls" },
  { method: "GET", path: "/analysis/:symbol", description: "Full technical analysis for a stock", params: [{ name: "symbol", type: "string", required: true, description: "Stock symbol" }], example: 'curl http://localhost:50053/analysis/RELIANCE\n\n{\n  "symbol": "RELIANCE",\n  "signal": "BUY",\n  "confidence": 0.82,\n  "indicators": {\n    "rsi": 34.2,\n    "macd": "bullish_cross",\n    "sma_20": 2450,\n    "sma_50": 2420\n  }\n}' },
  { method: "GET", path: "/indicators/:symbol", description: "Technical indicators (RSI, MACD, Bollinger, etc.)" },
  { method: "GET", path: "/backtest/:strategy", description: "Backtest results for a strategy", params: [{ name: "strategy", type: "string", required: true, description: "Strategy name" }, { name: "period", type: "string", required: false, description: "Backtest period" }] },
  { method: "POST", path: "/analyze", description: "Run ad-hoc analysis with custom parameters" },
  { method: "GET", path: "/screener", description: "Screen stocks by technical criteria" },
  { method: "GET", path: "/suggestions", description: "AI-powered stock suggestions feed" },
];

const alertEndpoints: Endpoint[] = [
  { method: "GET", path: "/health", description: "Alert service health check" },
  { method: "GET", path: "/alerts", description: "List all active alerts" },
  { method: "POST", path: "/alerts", description: "Create a new price alert", params: [{ name: "symbol", type: "string", required: true, description: "Stock symbol" }, { name: "condition", type: "above | below | cross", required: true, description: "Trigger condition" }, { name: "target", type: "number", required: true, description: "Target price" }, { name: "channel", type: "email | push | websocket", required: false, description: "Notification channel" }], example: 'curl -X POST http://localhost:50054/alerts \\\n  -H "Content-Type: application/json" \\\n  -d \'{"symbol":"RELIANCE","condition":"above","target":2600,"channel":"push"}\'' },
  { method: "DELETE", path: "/alerts/:id", description: "Delete an alert", params: [{ name: "id", type: "string", required: true, description: "Alert ID" }] },
  { method: "PUT", path: "/alerts/:id", description: "Update an alert" },
  { method: "GET", path: "/alerts/fired", description: "Recently fired alerts" },
  { method: "GET", path: "/watchlist", description: "Get watchlist with alert counts" },
  { method: "POST", path: "/watchlist", description: "Add symbol to watchlist" },
  { method: "DELETE", path: "/watchlist/:symbol", description: "Remove from watchlist" },
  { method: "SSE", path: "/stream/alerts", description: "Real-time alert notifications via SSE" },
  { method: "GET", path: "/history", description: "Alert history with timestamps" },
];

const portfolioEndpoints: Endpoint[] = [
  { method: "GET", path: "/health", description: "Portfolio service health check" },
  { method: "GET", path: "/portfolio", description: "Portfolio summary (total value, P&L, allocation)" },
  { method: "GET", path: "/positions", description: "All open positions with unrealized P&L" },
  { method: "GET", path: "/position/:symbol", description: "Position detail for a specific stock" },
  { method: "POST", path: "/trade", description: "Execute a trade (paper or live)", params: [{ name: "symbol", type: "string", required: true, description: "Stock symbol" }, { name: "side", type: "BUY | SELL", required: true, description: "Trade side" }, { name: "quantity", type: "number", required: true, description: "Number of shares" }, { name: "order_type", type: "MARKET | LIMIT", required: false, description: "Order type" }, { name: "limit_price", type: "number", required: false, description: "Limit price (required for LIMIT orders)" }], example: 'curl -X POST http://localhost:50055/trade \\\n  -H "Content-Type: application/json" \\\n  -d \'{"symbol":"RELIANCE","side":"BUY","quantity":10,"order_type":"LIMIT","limit_price":2480}\'' },
  { method: "GET", path: "/orders", description: "Order history" },
  { method: "GET", path: "/order/:id", description: "Order status by ID" },
  { method: "DELETE", path: "/order/:id", description: "Cancel a pending order" },
  { method: "GET", path: "/pnl", description: "Profit & loss statement" },
  { method: "GET", path: "/allocation", description: "Portfolio allocation breakdown" },
  { method: "GET", path: "/paper/portfolio", description: "Paper trading portfolio (separate from live)" },
  { method: "POST", path: "/paper/reset", description: "Reset paper trading portfolio" },
  { method: "GET", path: "/suggestions", description: "Portfolio rebalancing suggestions" },
];

/* ── Page Component ── */

export default function ServiceHelpPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h2>Service Help & API Reference</h2>
          <p>Endpoints, configuration, and troubleshooting for each microservice.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            Base: {BASE_URL}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {/* Gateway */}
        <ServiceDocCard
          name="Gateway"
          description="Central HTTP API gateway. Handles authentication, routing, SSE streaming, and aggregates responses from all backend services."
          ports={[
            { label: "HTTP", port: 8787 },
            { label: "WebSocket", port: 8787, protocol: "ws" },
          ]}
          healthEndpoint="http://localhost:8787/api/health"
          kibanaLink="http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-gateway-*',interval:auto,query:(language:kuery,query:'service:gateway'))"
          jaegerLink="http://localhost:16686/search?service=gateway"
          configOptions={[
            { key: "PORT", default: "8787", description: "HTTP server port" },
            { key: "JWT_SECRET", default: "dev-secret", description: "Secret for JWT token signing" },
            { key: "CORS_ORIGIN", default: "http://localhost:5173", description: "Allowed CORS origins" },
            { key: "RATE_LIMIT", default: "100", description: "Max requests per minute per IP" },
            { key: "GRPC_TIMEOUT", default: "5000", description: "gRPC call timeout in ms" },
          ]}
          commonIssues={[
            { problem: "401 Unauthorized on all endpoints", solution: "Ensure JWT token is valid and not expired. Re-login via POST /api/auth/login." },
            { problem: "504 Gateway Timeout", solution: "Backend service may be down. Check individual service health endpoints. Increase GRPC_TIMEOUT if calls are slow." },
            { problem: "CORS errors in browser", solution: "Add frontend origin to CORS_ORIGIN env var. Restart gateway after config change." },
          ]}
        >
          <EndpointList basePath="/api" endpoints={gatewayEndpoints} />
        </ServiceDocCard>

        {/* Crawler */}
        <ServiceDocCard
          name="Crawler"
          description="Data collection service. Scrapes prices, fundamentals, and news from 80+ sources. Manages proxy rotation, rate limiting, and deduplication."
          ports={[
            { label: "gRPC", port: 50051 },
            { label: "HTTP", port: 50052, protocol: "REST debug" },
          ]}
          healthEndpoint="http://localhost:50052/health"
          kibanaLink="http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-crawler-*',interval:auto,query:(language:kuery,query:'service:crawler'))"
          jaegerLink="http://localhost:16686/search?service=crawler"
          configOptions={[
            { key: "GRPC_PORT", default: "50051", description: "gRPC server port" },
            { key: "HTTP_PORT", default: "50052", description: "REST debug API port" },
            { key: "WORKER_COUNT", default: "4", description: "Number of concurrent crawl workers" },
            { key: "QUEUE_MAX", default: "1000", description: "Max items in crawl queue" },
            { key: "PROXY_ENABLED", default: "true", description: "Enable proxy rotation" },
            { key: "RATE_LIMIT_ENABLED", default: "true", description: "Enable per-domain rate limiting" },
            { key: "RETRY_ATTEMPTS", default: "3", description: "Max retries per crawl request" },
          ]}
          commonIssues={[
            { problem: "High queue depth (>100)", solution: "Increase WORKER_COUNT or reduce crawl frequency. Check proxy health and rate limiter cooldowns." },
            { problem: "Source success rate < 90%", solution: "Check if the source website has changed structure. May need adapter update. Check Kibana logs for HTTP status codes." },
            { problem: "All proxies in cooldown", solution: "Reduce request frequency or add new proxies. Check proxy configuration in /config/proxy." },
          ]}
        >
          <EndpointList endpoints={crawlerEndpoints} />
        </ServiceDocCard>

        {/* Price Service */}
        <ServiceDocCard
          name="Price Service"
          description="Real-time and historical price streaming. Provides WebSocket and SSE endpoints for live market data. Aggregates prices from multiple sources with failover."
          ports={[
            { label: "HTTP", port: 8082 },
            { label: "WebSocket", port: 8082, protocol: "ws" },
            { label: "gRPC", port: 50052 },
          ]}
          healthEndpoint="http://localhost:8082/health"
          kibanaLink="http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-price-*',interval:auto,query:(language:kuery,query:'service:price'))"
          jaegerLink="http://localhost:16686/search?service=price-service"
          configOptions={[
            { key: "HTTP_PORT", default: "8082", description: "HTTP/WS server port" },
            { key: "GRPC_PORT", default: "50052", description: "gRPC port for internal communication" },
            { key: "UPDATE_INTERVAL", default: "1000", description: "Price update interval in ms" },
            { key: "MAX_SUBSCRIPTIONS", default: "500", description: "Max concurrent WS/SSE subscriptions" },
            { key: "SOURCE_FAILOVER", default: "true", description: "Enable automatic source failover" },
            { key: "CACHE_TTL", default: "5", description: "Price cache TTL in seconds" },
          ]}
          commonIssues={[
            { problem: "WebSocket disconnects frequently", solution: "Check MAX_SUBSCRIPTIONS limit. Implement reconnection with exponential backoff on the client." },
            { problem: "Stale prices", solution: "Verify crawler is feeding price service. Check UPDATE_INTERVAL and source connectivity." },
            { problem: "High memory usage", solution: "Reduce MAX_SUBSCRIPTIONS or increase instance memory. Check for leaked subscriptions." },
          ]}
        >
          <EndpointList endpoints={priceEndpoints} />
        </ServiceDocCard>

        {/* Analytics */}
        <ServiceDocCard
          name="Analytics"
          description="Signal generation, technical analysis, and strategy execution. Processes 13+ strategies including RSI, MACD, Bollinger Bands, VWAP, and custom ML-based signals."
          ports={[
            { label: "gRPC", port: 50053 },
            { label: "HTTP", port: 50054, protocol: "debug" },
          ]}
          healthEndpoint="http://localhost:50054/health"
          kibanaLink="http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-analytics-*',interval:auto,query:(language:kuery,query:'service:analytics'))"
          jaegerLink="http://localhost:16686/search?service=analytics"
          configOptions={[
            { key: "GRPC_PORT", default: "50053", description: "gRPC server port" },
            { key: "HTTP_PORT", default: "50054", description: "Debug REST port" },
            { key: "STRATEGIES_ENABLED", default: "all", description: "Comma-separated list of strategies to enable" },
            { key: "MIN_SIGNAL_CONFIDENCE", default: "0.6", description: "Minimum confidence threshold for signals" },
            { key: "ANALYSIS_CACHE_TTL", default: "300", description: "Analysis cache TTL in seconds" },
            { key: "BACKTEST_WORKERS", default: "2", description: "Concurrent backtest workers" },
          ]}
          commonIssues={[
            { problem: "No signals returned", solution: "Check MIN_SIGNAL_CONFIDENCE threshold. Verify price data is flowing from Price Service. Check strategy logs in Kibana." },
            { problem: "High CPU/memory usage", solution: "Reduce number of enabled strategies or increase ML model cache TTL. Check backtest worker count." },
            { problem: "Stale analysis results", solution: "Clear analysis cache or reduce ANALYSIS_CACHE_TTL. Verify upstream price freshness." },
          ]}
        >
          <EndpointList basePath="" endpoints={analyticsEndpoints} />
        </ServiceDocCard>

        {/* Alert Service */}
        <ServiceDocCard
          name="Alert Service"
          description="Manages price alerts, watchlists, and notification delivery. Supports email, push, and WebSocket notification channels."
          ports={[
            { label: "gRPC", port: 50054 },
            { label: "HTTP", port: 50055, protocol: "debug" },
          ]}
          healthEndpoint="http://localhost:50055/health"
          kibanaLink="http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-alert-*',interval:auto,query:(language:kuery,query:'service:alert'))"
          jaegerLink="http://localhost:16686/search?service=alert"
          configOptions={[
            { key: "GRPC_PORT", default: "50054", description: "gRPC server port" },
            { key: "HTTP_PORT", default: "50055", description: "Debug REST port" },
            { key: "MAX_ALERTS_PER_USER", default: "50", description: "Maximum alerts per user" },
            { key: "NOTIFICATION_CHANNELS", default: "push,websocket", description: "Enabled notification channels" },
            { key: "ALERT_CHECK_INTERVAL", default: "5", description: "Seconds between alert condition checks" },
            { key: "EMAIL_SMTP_HOST", default: "smtp.gmail.com", description: "SMTP server for email alerts" },
          ]}
          commonIssues={[
            { problem: "Alerts not firing", solution: "Check ALERT_CHECK_INTERVAL. Verify price data is flowing. Check alert condition syntax." },
            { problem: "Notifications not delivered", solution: "Check NOTIFICATION_CHANNELS config. Verify push notification credentials. Check email SMTP settings." },
            { problem: "Alert limit reached", solution: "Delete unused alerts via DELETE /alerts/:id. Increase MAX_ALERTS_PER_USER if needed." },
          ]}
        >
          <EndpointList basePath="" endpoints={alertEndpoints} />
        </ServiceDocCard>

        {/* Portfolio */}
        <ServiceDocCard
          name="Portfolio"
          description="Portfolio management for paper and live trading. Tracks positions, orders, P&L, and provides rebalancing suggestions."
          ports={[
            { label: "gRPC", port: 50055 },
            { label: "HTTP", port: 50056, protocol: "debug" },
          ]}
          healthEndpoint="http://localhost:50056/health"
          kibanaLink="http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-portfolio-*',interval:auto,query:(language:kuery,query:'service:portfolio'))"
          jaegerLink="http://localhost:16686/search?service=portfolio"
          configOptions={[
            { key: "GRPC_PORT", default: "50055", description: "gRPC server port" },
            { key: "HTTP_PORT", default: "50056", description: "Debug REST port" },
            { key: "TRADING_MODE", default: "paper", description: "paper or live" },
            { key: "INITIAL_BALANCE", default: "1000000", description: "Initial paper trading balance" },
            { key: "MAX_POSITION_PCT", default: "20", description: "Max % of portfolio per position" },
            { key: "BROKER_API_KEY", default: "", description: "Broker API key for live trading" },
          ]}
          commonIssues={[
            { problem: "Trade execution fails", solution: "Check TRADING_MODE setting. Verify sufficient balance. Check broker API credentials for live mode." },
            { problem: "P&L not updating", solution: "Verify Price Service is running. Check if positions are correctly linked to symbols." },
            { problem: "Paper balance incorrect", solution: "Use POST /paper/reset to reset paper portfolio. Check INITIAL_BALANCE config." },
          ]}
        >
          <EndpointList basePath="" endpoints={portfolioEndpoints} />
        </ServiceDocCard>
      </div>
    </>
  );
}
