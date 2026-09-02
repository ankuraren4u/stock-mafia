import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import cors from "cors";
import express from "express";
import { marketRouter } from "./routes/market.js";
import { signalsRouter } from "./routes/signals.js";
import { paperRouter } from "./routes/paper.js";
import { kiteRouter } from "./routes/kite.js";
import { algoRouter } from "./routes/algo.js";
import { crawlerRouter } from "./routes/crawler.js";
import { deskRouter } from "./routes/desk.js";
import { screenerRouter } from "./routes/screener.js";
import { advancedRouter } from "./routes/advanced.js";
import { intelRouter } from "./routes/intel.js";
import { suggestionsRouter } from "./routes/suggestions.js";
import { statusRouter } from "./routes/status.js";
import { authMiddleware, rateLimiter, securityHeaders, requestLogger } from "./middleware/auth.js";
import { startAlgoScheduler } from "./services/algo.js";
import { startCrawler, crawlerStatus } from "./services/crawler.js";
import { yahooPaused } from "./services/market.js";
import { marketSessions } from "./services/desk.js";
import { setupWebSocket } from "./services/websocket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

// Create HTTP or HTTPS server based on SSL config
const sslCert = process.env.SSL_CERT;
const sslKey = process.env.SSL_KEY;
let server;

if (sslCert && sslKey && fs.existsSync(sslCert) && fs.existsSync(sslKey)) {
  const httpsOptions = {
    key: fs.readFileSync(sslKey),
    cert: fs.readFileSync(sslCert),
  };
  server = createHttpsServer(httpsOptions, app);
  console.log(`StockMafia v2.0 starting with HTTPS on https://${host}:${port}`);
} else {
  server = createServer(app);
  console.log(`StockMafia v2.0 starting with HTTP on http://${host}:${port}`);
}

app.use(securityHeaders);
app.use(rateLimiter);
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get("/api/health", (_req, res) => {
  const c = crawlerStatus();
  const sessions = marketSessions();

  res.json({
    ok: true,
    service: "stockmafia",
    version: "2.0.0",
    uptime: process.uptime(),
    time: new Date().toISOString(),
    markets: ["IN", "US"],
    services: {
      gateway: { status: "ok", url: "http://localhost:8787", endpoints: { health: "/api/health", status: "/api/status", detailedStatus: "/api/status/detailed", metrics: "/api/status/metrics" } },
      crawler: { status: c.running ? "running" : "idle", lastRun: c.lastRun, lastError: c.lastError, snapshots: c.snapshots },
      price: { status: "ok", url: "ws://localhost:8082/ws", endpoints: { sse: "/api/events" } },
      analytics: { status: "ok" },
      alert: { status: "ok" },
      portfolio: { status: "ok" },
    },
    links: {
      dashboard: "/",
      research: "/research",
      tradeDesk: "/desk",
      paperBook: "/paper",
      crawler: "/crawler",
      status: "/status",
      health: "/api/health",
      detailedStatus: "/api/status/detailed",
      sse: "/api/events",
      websocket: "ws://localhost:8082/ws",
      jaeger: "http://localhost:16686",
      kibana: "http://localhost:5601",
    },
    sessions,
  });
});

app.get("/api/status", (_req, res) => {
  const c = crawlerStatus();
  res.json({
    ok: true,
    api: "up",
    time: new Date().toISOString(),
    version: "2.0.0",
    features: [
      "multi-source-crawling",
      "signal-engine",
      "13-trading-strategies",
      "vwap-bounce",
      "supertrend-flip",
      "ichimoku-breakout",
      "adx-trend",
      "fibonacci-retrace",
      "stochastic-snap",
      "screener",
      "portfolio-analytics",
      "walk-forward-backtest",
      "monte-carlo-simulation",
      "multi-timeframe-analysis",
      "options-chain",
      "correlation-matrix",
      "websocket-streaming",
      "webhook-alerts",
      "earnings-analysis",
      "insider-trading-tracker",
      "sector-rotation",
      "gap-analysis",
      "volume-profile",
      "market-breadth",
      "macro-dashboard",
      "pair-trading",
      "seasonality",
      "trade-ideas-engine",
      "risk-dashboard",
      "greeks-calculator",
    ],
    crawler: {
      running: c.running,
      lastRun: c.lastRun,
      snapshots: c.snapshots,
      lastError: c.lastError,
    },
    yahooPaused: yahooPaused(),
    sessions: marketSessions(),
  });
});

app.use("/api/market", marketRouter);
app.use("/api/signals", signalsRouter);
app.use("/api/paper", paperRouter);
app.use("/api/kite", authMiddleware, kiteRouter);
app.use("/api/algo", authMiddleware, algoRouter);
app.use("/api/crawler", crawlerRouter);
app.use("/api/desk", deskRouter);
app.use("/api/screener", screenerRouter);
app.use("/api/advanced", advancedRouter);
app.use("/api/intel", intelRouter);
app.use("/api/suggestions", suggestionsRouter);
app.use("/api/status", statusRouter);

const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

setupWebSocket(server);

server.listen(port, host, () => {
  console.log(`StockMafia v2.0 listening on http://${host}:${port}`);
  console.log(`WebSocket available at ws://${host}:${port}/ws`);
  startAlgoScheduler();
  startCrawler();
});
