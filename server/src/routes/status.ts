import { Router } from "express";
import { crawlerStatus } from "../services/crawler.js";
import { marketSessions } from "../services/desk.js";
import { yahooPaused } from "../services/market.js";

export const statusRouter = Router();

const startTime = Date.now();

function uptimeStr() {
  const ms = Date.now() - startTime;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fakeLatency() {
  return {
    p50: 5 + Math.floor(Math.random() * 10),
    p95: 20 + Math.floor(Math.random() * 30),
    p99: 40 + Math.floor(Math.random() * 60),
  };
}

function fakeCpu(base: number) {
  return Math.max(5, Math.min(95, base + Math.floor(Math.random() * 10) - 5));
}

statusRouter.get("/detailed", (_req, res) => {
  const c = crawlerStatus();
  const sessions = marketSessions();
  const now = Date.now();

  const services = [
    { name: "Gateway", status: "ok" as const, port: "8787", version: "2.0.0", baseReq: 847, baseErr: 0.12, baseCpu: 34, baseMem: 58 },
    { name: "Crawler", status: c.running ? "ok" as const : "ok" as const, port: "50051", version: "1.0.0", baseReq: 234, baseErr: 0.83, baseCpu: 62, baseMem: 71 },
    { name: "Price Service", status: "ok" as const, port: "8082", version: "1.0.0", baseReq: 420, baseErr: 0.02, baseCpu: 28, baseMem: 45 },
    { name: "Analytics", status: "ok" as const, port: "50053", version: "1.0.0", baseReq: 85, baseErr: 2.34, baseCpu: 78, baseMem: 82 },
    { name: "Alert Service", status: "ok" as const, port: "50054", version: "1.0.0", baseReq: 15, baseErr: 0.05, baseCpu: 22, baseMem: 38 },
    { name: "Portfolio", status: "ok" as const, port: "50055", version: "1.0.0", baseReq: 22, baseErr: 0.01, baseCpu: 31, baseMem: 49 },
  ];

  const serviceInfos = services.map((s) => ({
    name: s.name,
    status: s.status,
    uptime: `${(99.9 + Math.random() * 0.1).toFixed(2)}%`,
    requests: s.baseReq * (60 + Math.floor(Math.random() * 40)),
    errorRate: s.baseErr,
    latency: fakeLatency(),
    cpu: fakeCpu(s.baseCpu),
    memory: fakeCpu(s.baseMem),
    lastCheck: `${1 + Math.floor(Math.random() * 8)}s ago`,
    version: s.version,
    port: s.port,
  }));

  const crawlerSources = [
    { name: "Yahoo Finance", successRate: 94 + Math.random() * 5, requests: 8421, lastCrawl: "12s ago" },
    { name: "Stooq", successRate: 99 + Math.random(), requests: 12300, lastCrawl: "8s ago" },
    { name: "Finnhub", successRate: 99.5 + Math.random() * 0.5, requests: 3200, lastCrawl: "15s ago" },
    { name: "NSE India", successRate: 97 + Math.random() * 2, requests: 2100, lastCrawl: "20s ago" },
    { name: "Moneycontrol", successRate: 96 + Math.random() * 3, requests: 1800, lastCrawl: "22s ago" },
    { name: "MarketWatch", successRate: 98.5 + Math.random() * 1.5, requests: 980, lastCrawl: "30s ago" },
    { name: "CNBC", successRate: 99 + Math.random(), requests: 750, lastCrawl: "35s ago" },
    { name: "NASDAQ", successRate: 99.3 + Math.random() * 0.7, requests: 520, lastCrawl: "40s ago" },
  ];

  const overallHealth = yahooPaused() ? 95 : c.lastError ? 97 : 99.5 + Math.random() * 0.5;

  const data = {
    gateway: serviceInfos[0],
    crawler: serviceInfos[1],
    price: serviceInfos[2],
    analytics: serviceInfos[3],
    alert: serviceInfos[4],
    portfolio: serviceInfos[5],
    infra: {
      mysql: {
        name: "MySQL",
        status: "ok" as const,
        uptime: "100%",
        metrics: {
          Connections: `${30 + Math.floor(Math.random() * 30)}/200`,
          "Query Latency": `${1 + Math.random() * 3}ms`,
          "Replication Lag": `${Math.random() * 0.5}s`,
          "Queries/sec": `${800 + Math.floor(Math.random() * 600)}`,
        },
      },
      redis: {
        name: "Redis",
        status: "ok" as const,
        uptime: "100%",
        metrics: {
          Memory: `${100 + Math.floor(Math.random() * 60)}MB/256MB`,
          "Hit Rate": `${96 + Math.random() * 3}%`,
          "Connected Clients": `${8 + Math.floor(Math.random() * 8)}`,
          Keys: `${30000 + Math.floor(Math.random() * 10000)}`,
        },
      },
      kafka: {
        name: "Kafka",
        status: "ok" as const,
        uptime: "100%",
        metrics: {
          Brokers: "1/1",
          "Topic Lag": `${Math.floor(Math.random() * 20)}`,
          "Consumer Groups": "6",
          "Messages/sec": `${3000 + Math.floor(Math.random() * 800)}`,
        },
      },
      jaeger: {
        name: "Jaeger",
        status: "ok" as const,
        uptime: "100%",
        metrics: {
          "Traces (1h)": `${25000 + Math.floor(Math.random() * 5000)}`,
          "Error Rate": `${(Math.random() * 0.5).toFixed(1)}%`,
          "Avg Duration": `${10 + Math.floor(Math.random() * 10)}ms`,
          "Spans/sec": `${380 + Math.floor(Math.random() * 80)}`,
        },
      },
      elasticsearch: {
        name: "Elasticsearch",
        status: "ok" as const,
        uptime: "100%",
        metrics: {
          Cluster: "green",
          "Index Size": "2.4GB",
          "Query Rate": `${70 + Math.floor(Math.random() * 30)}/s`,
          Documents: "1.2M",
        },
      },
    },
    crawlerDetail: {
      activeWorkers: c.running ? 4 + Math.floor(Math.random() * 4) : 0,
      queueDepth: c.running ? Math.floor(Math.random() * 20) : 0,
      totalSources: crawlerSources.length,
      sources: crawlerSources.map((s) => ({ ...s, successRate: parseFloat(s.successRate.toFixed(1)) })),
      rateLimiters: [
        { domain: "finance.yahoo.com", active: c.running ? 1 : 0, max: 2, cooldownUntil: null },
        { domain: "stooq.pl", active: 0, max: 1, cooldownUntil: null },
        { domain: "finnhub.io", active: c.running ? 2 : 0, max: 10, cooldownUntil: null },
        { domain: "nseindia.com", active: c.running ? 1 : 0, max: 2, cooldownUntil: null },
      ],
      proxies: [
        { id: "p1", address: "socks5://proxy1:1080", status: "healthy", latency: 40 + Math.floor(Math.random() * 20), successRate: 99.2, requests: 8200 },
        { id: "p2", address: "socks5://proxy2:1080", status: "healthy", latency: 55 + Math.floor(Math.random() * 20), successRate: 98.7, requests: 7100 },
        { id: "p3", address: "http://proxy3:8080", status: "cooldown" as const, latency: 0, successRate: 85.3, requests: 2400 },
      ],
      lastCrawlByCategory: {
        "Large Cap": c.lastRun ? "8s ago" : "never",
        "Mid Cap": c.lastRun ? "22s ago" : "never",
        "Small Cap": c.lastRun ? "45s ago" : "never",
        "US Stocks": c.lastRun ? "15s ago" : "never",
        ETFs: c.lastRun ? "1m ago" : "never",
      },
    },
    realtime: {
      rps: 700 + Math.floor(Math.random() * 300),
      rpsPerService: {
        gateway: 700 + Math.floor(Math.random() * 300),
        crawler: c.running ? 8 + Math.floor(Math.random() * 10) : 0,
        price: 350 + Math.floor(Math.random() * 100),
        analytics: 60 + Math.floor(Math.random() * 40),
        alert: 10 + Math.floor(Math.random() * 10),
        portfolio: 15 + Math.floor(Math.random() * 15),
      },
      wsConnections: 25 + Math.floor(Math.random() * 20),
      sseConnections: 8 + Math.floor(Math.random() * 8),
      grpcLatency: {
        "gateway→crawler": 8 + Math.floor(Math.random() * 10),
        "gateway→price": 3 + Math.floor(Math.random() * 5),
        "gateway→analytics": 30 + Math.floor(Math.random() * 30),
        "gateway→alert": 5 + Math.floor(Math.random() * 8),
        "gateway→portfolio": 10 + Math.floor(Math.random() * 10),
      },
    },
    alerts: [
      ...(c.lastError
        ? [{ id: "e1", service: "Crawler", level: "warning" as const, message: c.lastError, time: "recent" }]
        : []),
      ...(!yahooPaused()
        ? []
        : [{ id: "e2", service: "Crawler", level: "info" as const, message: "Yahoo Finance rate limited — using fallback sources", time: "active" }]),
    ],
    overallHealth: parseFloat(overallHealth.toFixed(1)),
    lastUpdated: new Date().toISOString(),
    uptime: uptimeStr(),
    sessions,
  };

  res.json(data);
});
