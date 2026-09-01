import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { marketRouter } from "./routes/market.js";
import { signalsRouter } from "./routes/signals.js";
import { paperRouter } from "./routes/paper.js";
import { kiteRouter } from "./routes/kite.js";
import { algoRouter } from "./routes/algo.js";
import { crawlerRouter } from "./routes/crawler.js";
import { deskRouter } from "./routes/desk.js";
import { startAlgoScheduler } from "./services/algo.js";
import { startCrawler, crawlerStatus } from "./services/crawler.js";
import { yahooPaused } from "./services/market.js";
import { marketSessions } from "./services/desk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "stockmafia", markets: ["IN", "US"], time: new Date().toISOString() });
});

app.get("/api/status", (_req, res) => {
  const c = crawlerStatus();
  res.json({
    ok: true,
    api: "up",
    time: new Date().toISOString(),
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
app.use("/api/kite", kiteRouter);
app.use("/api/algo", algoRouter);
app.use("/api/crawler", crawlerRouter);
app.use("/api/desk", deskRouter);

const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(port, host, () => {
  console.log(`StockMafia listening on http://${host}:${port}`);
  startAlgoScheduler();
  startCrawler();
});
