import { Router } from "express";
import { crawlSymbol, crawlerStatus, queueWatchlistCrawl } from "../services/crawler.js";

export const crawlerRouter = Router();

crawlerRouter.get("/status", (_req, res) => {
  res.json(crawlerStatus());
});

crawlerRouter.post("/run", (_req, res) => {
  const result = queueWatchlistCrawl("manual");
  res.status(202).json({ ok: true, background: true, ...result });
});

crawlerRouter.post("/symbol/:symbol", (req, res) => {
  const symbol = req.params.symbol;
  void crawlSymbol(symbol).catch((err) => {
    console.error("[crawler] symbol", symbol, err instanceof Error ? err.message : err);
  });
  res.status(202).json({ ok: true, background: true, yahoo: symbol });
});
