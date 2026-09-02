import { Router } from "express";
import { resolveInstrument } from "../services/tickers.js";
import { crawlSymbol, readSnapshot } from "../services/crawler.js";
import { walkForwardBacktest, monteCarloSimulation } from "../services/backtest-advanced.js";
import { multiTimeframeAnalysis, getConfluence } from "../services/multi-timeframe.js";
import { fetchChart } from "../services/market.js";
import { fetchOptionChain } from "../services/options.js";
import { readStore } from "../db/store.js";
import { computeCorrelation, buildCorrelationMatrix } from "../services/correlation.js";
import { sendNotification } from "../services/webhooks.js";
import { computePortfolioAnalytics } from "../services/portfolio-analytics.js";

export const advancedRouter = Router();

advancedRouter.get("/multi-timeframe/:symbol", async (req, res) => {
  try {
    const stock = await resolveInstrument(req.params.symbol);
    const [daily, weekly] = await Promise.all([
      fetchChart(stock.yahoo, "6mo", "1d"),
      fetchChart(stock.yahoo, "2y", "1wk"),
    ]);
    const mtf = multiTimeframeAnalysis(daily.candles, daily.candles, weekly.candles);
    const confluence = getConfluence(mtf);
    res.json({ symbol: stock.yahoo, timeframes: mtf, confluence });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "mtf failed" });
  }
});

advancedRouter.get("/options/:symbol", async (req, res) => {
  try {
    const stock = await resolveInstrument(req.params.symbol);
    const chain = await fetchOptionChain(stock.yahoo);
    if (!chain) return res.status(404).json({ error: "No option chain data available" });
    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "options failed" });
  }
});

advancedRouter.post("/backtest/walk-forward", async (req, res) => {
  try {
    const { symbol, strategyId } = req.body;
    if (!symbol || !strategyId) return res.status(400).json({ error: "symbol and strategyId required" });
    const stock = await resolveInstrument(symbol);
    const { candles } = await fetchChart(stock.yahoo, "2y", "1d");
    const result = walkForwardBacktest(candles, strategyId, null);
    res.json({ symbol: stock.yahoo, strategyId, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "backtest failed" });
  }
});

advancedRouter.post("/backtest/monte-carlo", async (req, res) => {
  try {
    const { trades, simulations } = req.body;
    if (!Array.isArray(trades)) return res.status(400).json({ error: "trades array required" });
    const result = monteCarloSimulation(trades, simulations || 1000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "monte carlo failed" });
  }
});

advancedRouter.get("/correlation", async (_req, res) => {
  try {
    const store = readStore();
    const symbols = store.watchlist.slice(0, 10);
    const priceData = new Map<string, number[]>();

    for (const sym of symbols) {
      try {
        const { candles } = await fetchChart(sym, "6mo", "1d");
        priceData.set(sym, candles.map((c) => c.close));
      } catch {}
    }

    const matrix = buildCorrelationMatrix(priceData);
    res.json(matrix);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "correlation failed" });
  }
});

advancedRouter.post("/notify", async (req, res) => {
  try {
    const { title, body, symbol } = req.body;
    if (!title || !body) return res.status(400).json({ error: "title and body required" });
    await sendNotification({ title, body, symbol });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "notify failed" });
  }
});

advancedRouter.get("/portfolio-analytics", (_req, res) => {
  try {
    const store = readStore();
    const equityCurve = [store.cash];
    let cash = store.cash;

    for (const fill of store.fills.slice().reverse()) {
      if (fill.side === "BUY") cash -= fill.price * fill.quantity;
      else cash += fill.price * fill.quantity;
      equityCurve.push(cash);
    }

    const trades = store.fills.length > 1
      ? Array.from({ length: Math.floor(store.fills.length / 2) }, (_, i) => {
          const buy = store.fills[i * 2];
          const sell = store.fills[i * 2 + 1];
          if (!buy || !sell) return null;
          const pnl = sell.side === "SELL"
            ? (sell.price - buy.price) * sell.quantity
            : (buy.price - sell.price) * buy.quantity;
          return { pnl, pnlPct: buy.price > 0 ? pnl / (buy.price * buy.quantity) : 0 };
        }).filter((t): t is { pnl: number; pnlPct: number } => t !== null)
      : [];

    const analytics = computePortfolioAnalytics({ equityCurve, trades });
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "analytics failed" });
  }
});
