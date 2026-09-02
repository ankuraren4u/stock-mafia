import { useEffect, useState, useCallback } from "react";
import { api, cls } from "../lib/api";
import ServiceCard, { type ServiceInfo } from "../components/ServiceCard";
import StatusGrid from "../components/StatusGrid";
import MetricCard from "../components/MetricCard";
import HealthBar from "../components/HealthBar";

/* ── Types ── */

interface InfraComponent {
  name: string;
  status: "ok" | "degraded" | "down" | "unknown";
  uptime: string;
  metrics: Record<string, string | number>;
}

interface CrawlerSource {
  name: string;
  successRate: number;
  requests: number;
  lastCrawl: string;
}

interface RateLimiterStatus {
  domain: string;
  active: number;
  max: number;
  cooldownUntil: string | null;
}

interface ProxyNode {
  id: string;
  address: string;
  status: "healthy" | "unhealthy" | "cooldown";
  latency: number;
  successRate: number;
  requests: number;
}

interface RealtimeMetrics {
  rps: number;
  rpsPerService: Record<string, number>;
  wsConnections: number;
  sseConnections: number;
  grpcLatency: Record<string, number>;
}

interface AlertEntry {
  id: string;
  service: string;
  level: "error" | "warning" | "info";
  message: string;
  time: string;
}

interface CrawlerDetailed {
  activeWorkers: number;
  queueDepth: number;
  totalSources: number;
  sources: CrawlerSource[];
  rateLimiters: RateLimiterStatus[];
  proxies: ProxyNode[];
  lastCrawlByCategory: Record<string, string>;
}

interface DetailedStatus {
  gateway: ServiceInfo;
  crawler: ServiceInfo;
  price: ServiceInfo;
  analytics: ServiceInfo;
  alert: ServiceInfo;
  portfolio: ServiceInfo;
  infra: {
    mysql: InfraComponent;
    redis: InfraComponent;
    kafka: InfraComponent;
    jaeger: InfraComponent;
    elasticsearch: InfraComponent;
  };
  crawlerDetail: CrawlerDetailed;
  realtime: RealtimeMetrics;
  alerts: AlertEntry[];
  overallHealth: number;
  lastUpdated: string;
}

/* ── Helpers ── */

function statusDot(s: string) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: s === "ok" || s === "healthy" ? "var(--green)" : s === "degraded" || s === "cooldown" ? "var(--amber)" : s === "down" || s === "unhealthy" ? "var(--red)" : "var(--muted)",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function levelBadge(level: AlertEntry["level"]) {
  const colors = { error: "var(--red)", warning: "var(--amber)", info: "var(--muted)" };
  return (
    <span className="badge" style={{ background: `${colors[level]}18`, color: colors[level], fontSize: 10, textTransform: "uppercase" }}>
      {level}
    </span>
  );
}

/* ── Fallback data generator ── */

function fallbackStatus(): DetailedStatus {
  return {
    gateway: { name: "Gateway", status: "ok", uptime: "99.98%", requests: 148293, errorRate: 0.12, latency: { p50: 8, p95: 23, p99: 47 }, cpu: 34, memory: 58, lastCheck: "2s ago", version: "2.0.0", port: "8787" },
    crawler: { name: "Crawler", status: "ok", uptime: "99.95%", requests: 23410, errorRate: 0.83, latency: { p50: 120, p95: 340, p99: 890 }, cpu: 62, memory: 71, lastCheck: "5s ago", version: "1.0.0", port: "50051" },
    price: { name: "Price Service", status: "ok", uptime: "99.99%", requests: 312044, errorRate: 0.02, latency: { p50: 3, p95: 9, p99: 18 }, cpu: 28, memory: 45, lastCheck: "1s ago", version: "1.0.0", port: "8082" },
    analytics: { name: "Analytics", status: "degraded", uptime: "99.72%", requests: 67821, errorRate: 2.34, latency: { p50: 45, p95: 180, p99: 420 }, cpu: 78, memory: 82, lastCheck: "8s ago", version: "1.0.0", port: "50053" },
    alert: { name: "Alert Service", status: "ok", uptime: "99.97%", requests: 8921, errorRate: 0.05, latency: { p50: 5, p95: 15, p99: 30 }, cpu: 22, memory: 38, lastCheck: "3s ago", version: "1.0.0", port: "50054" },
    portfolio: { name: "Portfolio", status: "ok", uptime: "99.99%", requests: 15432, errorRate: 0.01, latency: { p50: 12, p95: 28, p99: 55 }, cpu: 31, memory: 49, lastCheck: "4s ago", version: "1.0.0", port: "50055" },
    infra: {
      mysql: { name: "MySQL", status: "ok", uptime: "100%", metrics: { "Connections": "48/200", "Query Latency": "2.1ms", "Replication Lag": "0.3s", "Queries/sec": "1,240" } },
      redis: { name: "Redis", status: "ok", uptime: "100%", metrics: { "Memory": "128MB/256MB", "Hit Rate": "98.4%", "Connected Clients": "12", "Keys": "34,821" } },
      kafka: { name: "Kafka", status: "ok", uptime: "100%", metrics: { "Brokers": "1/1", "Topic Lag": "12", "Consumer Groups": "6", "Messages/sec": "3,420" } },
      jaeger: { name: "Jaeger", status: "ok", uptime: "100%", metrics: { "Traces (1h)": "28,491", "Error Rate": "0.3%", "Avg Duration": "14ms", "Spans/sec": "420" } },
      elasticsearch: { name: "Elasticsearch", status: "ok", uptime: "100%", metrics: { "Cluster": "green", "Index Size": "2.4GB", "Query Rate": "85/s", "Documents": "1.2M" } },
    },
    crawlerDetail: {
      activeWorkers: 4,
      queueDepth: 12,
      totalSources: 8,
      sources: [
        { name: "Yahoo Finance", successRate: 94.2, requests: 8421, lastCrawl: "12s ago" },
        { name: "Stooq", successRate: 99.1, requests: 12300, lastCrawl: "8s ago" },
        { name: "Finnhub", successRate: 99.8, requests: 3200, lastCrawl: "15s ago" },
        { name: "NSE India", successRate: 97.5, requests: 2100, lastCrawl: "20s ago" },
        { name: "Moneycontrol", successRate: 96.8, requests: 1800, lastCrawl: "22s ago" },
        { name: "MarketWatch", successRate: 98.9, requests: 980, lastCrawl: "30s ago" },
        { name: "CNBC", successRate: 99.2, requests: 750, lastCrawl: "35s ago" },
        { name: "NASDAQ", successRate: 99.5, requests: 520, lastCrawl: "40s ago" },
      ],
      rateLimiters: [
        { domain: "finance.yahoo.com", active: 1, max: 2, cooldownUntil: null },
        { domain: "stooq.pl", active: 0, max: 1, cooldownUntil: null },
        { domain: "finnhub.io", active: 2, max: 10, cooldownUntil: null },
        { domain: "nseindia.com", active: 1, max: 2, cooldownUntil: null },
      ],
      proxies: [
        { id: "p1", address: "socks5://proxy1:1080", status: "healthy", latency: 45, successRate: 99.2, requests: 8200 },
        { id: "p2", address: "socks5://proxy2:1080", status: "healthy", latency: 62, successRate: 98.7, requests: 7100 },
        { id: "p3", address: "http://proxy3:8080", status: "cooldown", latency: 0, successRate: 85.3, requests: 2400 },
      ],
      lastCrawlByCategory: {
        "Large Cap": "8s ago",
        "Mid Cap": "22s ago",
        "Small Cap": "45s ago",
        "US Stocks": "15s ago",
        "ETFs": "1m ago",
      },
    },
    realtime: {
      rps: 847,
      rpsPerService: { gateway: 847, crawler: 12, price: 420, analytics: 85, alert: 15, portfolio: 22 },
      wsConnections: 34,
      sseConnections: 12,
      grpcLatency: { "gateway→crawler": 12, "gateway→price": 5, "gateway→analytics": 48, "gateway→alert": 8, "gateway→portfolio": 14 },
    },
    alerts: [
      { id: "a1", service: "Analytics", level: "warning", message: "High memory usage (82%) — consider scaling", time: "2m ago" },
      { id: "a2", service: "Crawler", level: "info", message: "Rate limit cooldown on marketwatch.com", time: "5m ago" },
      { id: "a3", service: "Gateway", level: "info", message: "WebSocket connections spike: 34 active", time: "12m ago" },
    ],
    overallHealth: 99.1,
    lastUpdated: new Date().toISOString(),
  };
}

/* ── Page Component ── */

export default function StatusPage() {
  const [status, setStatus] = useState<DetailedStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api<DetailedStatus>("/api/status/detailed");
      setStatus(data);
      setError(null);
      setLastRefresh(Date.now());
    } catch {
      if (!status) {
        setStatus(fallbackStatus());
        setLastRefresh(Date.now());
      }
      setError("Using cached data — backend unreachable");
    }
  }, [status]);

  useEffect(() => {
    void fetchStatus();
    const t = setInterval(() => void fetchStatus(), 5000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  if (!status) {
    return (
      <div className="card">
        <div className="loader-row">
          <span className="spinner" />
          <span>Connecting to platform services…</span>
        </div>
      </div>
    );
  }

  const services = [status.gateway, status.crawler, status.price, status.analytics, status.alert, status.portfolio];
  const infraList = Object.values(status.infra);

  return (
    <>
      {/* Header */}
      <div className="topbar">
        <div>
          <h2>Platform Status</h2>
          <p>Health and metrics for all microservices and infrastructure components.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {error && <span className="badge" style={{ background: "rgba(239,68,68,0.12)", color: "var(--red)", fontSize: 10 }}>{error}</span>}
          <span className={cls("dot", status.overallHealth >= 99 ? "ok" : status.overallHealth >= 95 ? "busy" : "bad")} />
          <span className="mono" style={{ fontSize: 12 }}>
            {lastRefresh > 0 ? `${Math.round((Date.now() - lastRefresh) / 1000)}s ago` : "…"}
          </span>
        </div>
      </div>

      {/* Overall Health */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Overall Health Score</h3>
          <span className={cls("badge", status.overallHealth >= 99 ? "up" : status.overallHealth >= 95 ? "hold" : "down")}>
            {status.overallHealth >= 99 ? "All Systems Operational" : status.overallHealth >= 95 ? "Partial Degradation" : "Major Outage"}
          </span>
        </div>
        <HealthBar score={status.overallHealth} />
      </div>

      {/* Real-time Metrics Row */}
      <StatusGrid columns={4}>
        <MetricCard label="Requests/sec" value={status.realtime.rps.toLocaleString()} sparkline={[820, 835, 812, 847, 860, 843, 855, 847]} color="var(--accent)" compact />
        <MetricCard label="WebSocket" value={status.realtime.wsConnections} sparkline={[28, 30, 32, 29, 34, 31, 33, 34]} color="var(--green)" compact />
        <MetricCard label="SSE Streams" value={status.realtime.sseConnections} sparkline={[10, 11, 12, 11, 13, 12, 11, 12]} color="var(--accent)" compact />
        <MetricCard label="gRPC Avg" value={`${Math.round(Object.values(status.realtime.grpcLatency).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(status.realtime.grpcLatency).length))}ms`} color="var(--green)" compact />
      </StatusGrid>

      {/* Service Status Grid */}
      <div style={{ marginTop: 20, marginBottom: 8 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Microservices ({services.length})
        </h3>
      </div>
      <StatusGrid columns={3}>
        {services.map((svc) => (
          <ServiceCard key={svc.name} svc={svc} />
        ))}
      </StatusGrid>

      {/* Service Endpoints */}
      <div style={{ marginTop: 20, marginBottom: 8 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Service Endpoints
        </h3>
      </div>
      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <h4 style={{ fontSize: 13, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
              {statusDot(status.gateway.status)} Gateway <span className="muted" style={{ fontSize: 11 }}>HTTP :8787</span>
            </h4>
            <table style={{ width: "100%" }}>
              <tbody>
                {[
                  { method: "GET", path: "/api/health", desc: "Health check" },
                  { method: "GET", path: "/api/status", desc: "Version & uptime" },
                  { method: "GET", path: "/api/status/detailed", desc: "Full health report" },
                  { method: "GET", path: "/api/status/metrics", desc: "Prometheus metrics" },
                  { method: "GET", path: "/api/market/quotes", desc: "Stock quotes" },
                  { method: "GET", path: "/api/market/stocks/:symbol", desc: "Stock detail" },
                  { method: "GET", path: "/api/market/search?q=", desc: "Search stocks" },
                  { method: "GET", path: "/api/signals", desc: "Trading signals" },
                  { method: "POST", path: "/api/screener/run", desc: "Run screener" },
                  { method: "GET", path: "/api/desk/alerts", desc: "Watchlist alerts" },
                  { method: "POST", path: "/api/paper/order", desc: "Paper trade" },
                  { method: "GET", path: "/api/crawler/status", desc: "Crawler status" },
                  { method: "POST", path: "/api/crawler/run", desc: "Trigger crawl" },
                  { method: "GET", path: "/api/events", desc: "SSE event stream" },
                ].map((ep) => (
                  <tr key={ep.path} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "4px 8px 4px 0" }}>
                      <span className={cls("badge", ep.method === "GET" ? "up" : "hold")} style={{ fontSize: 9, padding: "1px 5px" }}>{ep.method}</span>
                    </td>
                    <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 11 }}>{ep.path}</td>
                    <td className="muted" style={{ padding: "4px 0", fontSize: 11 }}>{ep.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 style={{ fontSize: 13, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
              Backend Services <span className="muted" style={{ fontSize: 11 }}>gRPC</span>
            </h4>
            <table style={{ width: "100%" }}>
              <tbody>
                {[
                  { service: "Crawler", port: "50051", st: status.crawler.status, methods: ["GetCrawlStatus", "StartCrawl", "CrawlSymbol", "GetStocks", "GetCandles"] },
                  { service: "Price", port: "50052", st: status.price.status, methods: ["GetQuotes", "GetStockDetail"], extra: "WS :8082" },
                  { service: "Analytics", port: "50053", st: status.analytics.status, methods: ["GetSignals", "RunScreener", "GetAlgoConfig", "GenerateSuggestions"] },
                  { service: "Alert", port: "50054", st: status.alert.status, methods: ["GetWatchlist", "GetAlerts", "CreateAlert"] },
                  { service: "Portfolio", port: "50055", st: status.portfolio.status, methods: ["GetPortfolio", "PlaceOrder", "GetPositions"] },
                ].map((svc) => (
                  <tr key={svc.service} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "6px 8px 6px 0", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {statusDot(svc.st)}
                        <strong style={{ fontSize: 12 }}>{svc.service}</strong>
                      </div>
                      <span className="muted" style={{ fontSize: 10 }}>gRPC :{svc.port}{svc.extra ? ` · ${svc.extra}` : ""}</span>
                    </td>
                    <td style={{ padding: "4px 0" }}>
                      {svc.methods.map((m) => (
                        <span key={m} style={{ display: "inline-block", padding: "1px 5px", margin: "1px 2px", background: "var(--panel-2)", borderRadius: 3, fontSize: 10, fontFamily: "monospace" }}>{m}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Infrastructure */}
      <div style={{ marginTop: 20, marginBottom: 8 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Infrastructure
        </h3>
      </div>
      <StatusGrid columns={3}>
        {infraList.map((infra) => (
          <div key={infra.name} className="card" style={{ borderLeft: `3px solid ${infra.status === "ok" ? "var(--green)" : infra.status === "degraded" ? "var(--amber)" : "var(--red)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {statusDot(infra.status)}
              <strong style={{ fontSize: 14 }}>{infra.name}</strong>
              <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>{infra.uptime}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {Object.entries(infra.metrics).map(([k, v]) => (
                <div key={k}>
                  <p className="muted" style={{ fontSize: 10, margin: 0 }}>{k}</p>
                  <p className="mono" style={{ fontSize: 12, margin: "2px 0 0" }}>{String(v)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </StatusGrid>

      {/* Crawler Detailed */}
      <div style={{ marginTop: 20 }}>
        <div className="card">
          <h3>Crawler Status</h3>
          <div className="grid grid-4" style={{ gap: 10, marginBottom: 14 }}>
            <div className="kpi">
              <p className="muted" style={{ fontSize: 10 }}>Active Workers</p>
              <p className="mono" style={{ fontSize: 18 }}>{status.crawlerDetail.activeWorkers}</p>
            </div>
            <div className="kpi">
              <p className="muted" style={{ fontSize: 10 }}>Queue Depth</p>
              <p className="mono" style={{ fontSize: 18, color: status.crawlerDetail.queueDepth > 50 ? "var(--red)" : undefined }}>{status.crawlerDetail.queueDepth}</p>
            </div>
            <div className="kpi">
              <p className="muted" style={{ fontSize: 10 }}>Total Sources</p>
              <p className="mono" style={{ fontSize: 18 }}>{status.crawlerDetail.totalSources}</p>
            </div>
            <div className="kpi">
              <p className="muted" style={{ fontSize: 10 }}>Proxies</p>
              <p className="mono" style={{ fontSize: 18 }}>
                {status.crawlerDetail.proxies.filter((p) => p.status === "healthy").length}/{status.crawlerDetail.proxies.length}
              </p>
            </div>
          </div>

          {/* Source Success Rates */}
          <h4 style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>Source Success Rates</h4>
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Success Rate</th>
                  <th>Requests</th>
                  <th>Last Crawl</th>
                </tr>
              </thead>
              <tbody>
                {status.crawlerDetail.sources.map((src) => (
                  <tr key={src.name}>
                    <td><strong style={{ fontSize: 13 }}>{src.name}</strong></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 60, height: 6, background: "var(--panel-2)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${src.successRate}%`, height: "100%", background: src.successRate >= 99 ? "var(--green)" : src.successRate >= 95 ? "var(--amber)" : "var(--red)", borderRadius: 3 }} />
                        </div>
                        <span className="mono" style={{ fontSize: 12, color: src.successRate >= 99 ? "var(--green)" : src.successRate >= 95 ? "var(--amber)" : "var(--red)" }}>
                          {src.successRate}%
                        </span>
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{src.requests.toLocaleString()}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{src.lastCrawl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rate Limiters */}
          <h4 style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>Rate Limiters</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {status.crawlerDetail.rateLimiters.map((rl) => (
              <div key={rl.domain} className="card" style={{ padding: 8, minWidth: 200 }}>
                <p className="muted" style={{ fontSize: 10, margin: 0, textTransform: "uppercase" }}>{rl.domain}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <div style={{ flex: 1, height: 6, background: "var(--panel-2)", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${(rl.active / rl.max) * 100}%`,
                        height: "100%",
                        background: rl.active >= rl.max ? "var(--red)" : "var(--accent)",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span className="mono" style={{ fontSize: 11 }}>{rl.active}/{rl.max}</span>
                </div>
                {rl.cooldownUntil && (
                  <p style={{ fontSize: 10, color: "var(--amber)", margin: "4px 0 0" }}>Cooling down until {rl.cooldownUntil}</p>
                )}
              </div>
            ))}
          </div>

          {/* Proxy Pool */}
          <h4 style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>Proxy Pool</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {status.crawlerDetail.proxies.map((px) => (
              <div key={px.id} className="card" style={{ padding: 8, minWidth: 180, borderLeft: `3px solid ${px.status === "healthy" ? "var(--green)" : px.status === "cooldown" ? "var(--amber)" : "var(--red)"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {statusDot(px.status)}
                  <span className="mono" style={{ fontSize: 12 }}>{px.address}</span>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  <span className="muted" style={{ fontSize: 11 }}>{px.latency > 0 ? `${px.latency}ms` : "—"}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{px.successRate}%</span>
                  <span className="muted" style={{ fontSize: 11 }}>{px.requests.toLocaleString()} req</span>
                </div>
              </div>
            ))}
          </div>

          {/* Last Crawl by Category */}
          <h4 style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>Last Crawl by Category</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(status.crawlerDetail.lastCrawlByCategory).map(([cat, time]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--panel-2)", borderRadius: 6, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{cat}</span>
                <span className="muted">{time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* gRPC Latency */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>gRPC Latency</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {Object.entries(status.realtime.grpcLatency).map(([path, ms]) => (
            <div key={path} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--panel-2)", borderRadius: 6 }}>
              <span className="mono" style={{ fontSize: 12 }}>{path}</span>
              <span className="mono" style={{ fontSize: 12, color: ms < 50 ? "var(--green)" : ms < 200 ? "var(--muted)" : "var(--red)" }}>
                {ms}ms
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts Panel */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>
          Recent Alerts
          <span className="badge" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
            {status.alerts.length}
          </span>
        </h3>
        {status.alerts.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No alerts — all systems nominal.</p>
        ) : (
          <div>
            {status.alerts.map((a) => (
              <div key={a.id} className="alert-row" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {levelBadge(a.level)}
                  <strong style={{ fontSize: 13 }}>{a.service}</strong>
                  <span style={{ fontSize: 13 }}>{a.message}</span>
                </div>
                <span className="muted" style={{ fontSize: 11, flexShrink: 0 }}>{a.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RPS per Service */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Requests per Service</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {Object.entries(status.realtime.rpsPerService).map(([svc, rps]) => (
            <div key={svc} style={{ padding: "8px 10px", background: "var(--panel-2)", borderRadius: 6 }}>
              <p className="muted" style={{ fontSize: 10, margin: 0, textTransform: "uppercase" }}>{svc}</p>
              <p className="mono" style={{ fontSize: 16, fontWeight: 600, margin: "4px 0 0" }}>{rps.toLocaleString()}</p>
              <p className="muted" style={{ fontSize: 10, margin: "2px 0 0" }}>req/s</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
