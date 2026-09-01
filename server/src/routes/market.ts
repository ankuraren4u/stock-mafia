import { Router } from "express";
import { INDICES, INDIA_STOCKS, US_STOCKS, type Market } from "../lib/universe.js";
import { fetchChart } from "../services/market.js";
import { loadBoardQuotes } from "../services/quotes-board.js";
import { analyzeSymbol } from "../services/algo.js";
import { resolveInstrument, searchInstruments, trackInstrument, untrack } from "../services/tickers.js";

export const marketRouter = Router();

function marketOf(raw: unknown): Market {
  return String(raw).toUpperCase() === "US" ? "US" : "IN";
}

marketRouter.get("/universe", (req, res) => {
  const market = marketOf(req.query.market ?? "IN");
  res.json({
    stocks: market === "US" ? US_STOCKS : INDIA_STOCKS,
    indices: INDICES[market],
    market,
  });
});

marketRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 1) {
    res.json({ results: [] });
    return;
  }
  try {
    res.json({ results: await searchInstruments(q) });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "search failed" });
  }
});

marketRouter.post("/track", async (req, res) => {
  try {
    const query = String(req.body?.yahoo ?? req.body?.symbol ?? "");
    const instrument = await resolveInstrument(query);
    const store = trackInstrument(instrument);
    res.json({ instrument, watchlist: store.watchlist, tracked: store.tracked });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "track failed" });
  }
});

marketRouter.delete("/track/:symbol", (req, res) => {
  const store = untrack(req.params.symbol);
  res.json({ watchlist: store.watchlist, tracked: store.tracked });
});

marketRouter.get("/indices", async (req, res) => {
  const market = marketOf(req.query.market ?? "IN");
  try {
    const { quotes: priced, sources, yahooPaused } = await loadBoardQuotes(
      INDICES[market].map((idx) => idx.yahoo),
      market,
    );
    const byYahoo = new Map(priced.map((q) => [q.yahoo, q]));
    const quotes = INDICES[market].map((idx) => ({
      ...idx,
      ...(byYahoo.get(idx.yahoo) ?? {}),
      symbol: idx.symbol,
      yahoo: idx.yahoo,
    }));
    res.json({ quotes, market, sources, yahooPaused });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "indices failed" });
  }
});

marketRouter.get("/quotes", async (req, res) => {
  const market = marketOf(req.query.market ?? "IN");
  const list = market === "US" ? US_STOCKS : INDIA_STOCKS;
  try {
    const { quotes: priced, sources, yahooPaused } = await loadBoardQuotes(
      list.map((s) => s.yahoo),
      market,
    );
    const byYahoo = new Map(priced.map((q) => [q.yahoo, q]));
    const quotes = list.map((stock) => ({
      ...stock,
      ...(byYahoo.get(stock.yahoo) ?? {}),
      symbol: stock.symbol,
      yahoo: stock.yahoo,
    }));
    res.json({ quotes, market, sources, yahooPaused });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "quotes failed" });
  }
});

marketRouter.get("/stocks/:symbol", async (req, res) => {
  try {
    const range = String(req.query.range ?? "6mo");
    const analysis = await analyzeSymbol(req.params.symbol);
    let candles = analysis.chart.candles;
    if (range === "1d") {
      candles = (await fetchChart(analysis.stock.yahoo, "1d", "5m")).candles;
    } else if (range !== "1y") {
      const cutoff = Date.now() - (range === "1mo" ? 30 : range === "3mo" ? 90 : 180) * 86400000;
      candles = analysis.chart.candles.filter((c) => c.time >= cutoff);
    }
    const fundamentals = analysis.fundamentals;
    res.json({
      stock: analysis.stock,
      quote: analysis.quote,
      signal: analysis.signal,
      sentiment: analysis.sentiment,
      news: analysis.news,
      fundamentals,
      profile: analysis.profile,
      candles,
      sources: analysis.sources,
      crawledAt: analysis.crawledAt,
      crawlErrors: analysis.crawlErrors,
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "stock fetch failed" });
  }
});
