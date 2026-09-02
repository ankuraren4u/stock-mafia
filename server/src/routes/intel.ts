import { Router } from "express";
import { resolveInstrument } from "../services/tickers.js";
import { fetchChart } from "../services/market.js";
import { analyzeEarnings } from "../services/earnings.js";
import { fetchInsiderActivity } from "../services/insider.js";
import { analyzeSectorRotation } from "../services/sector-rotation.js";
import { analyzeGaps, buildVolumeProfile } from "../services/gap-volume.js";
import { computeMarketBreadth } from "../services/market-breadth.js";
import { fetchMacroDashboard } from "../services/macro.js";
import { scanPairTrades } from "../services/pair-trading.js";
import { analyzeSeasonality } from "../services/seasonality.js";
import { scanTradeIdeas } from "../services/trade-ideas.js";
import { computeRiskDashboard, computeGreeks } from "../services/risk-dashboard.js";
import { readStore } from "../db/store.js";

export const intelRouter = Router();

intelRouter.get("/earnings/:symbol", async (req, res) => {
  try {
    const stock = await resolveInstrument(req.params.symbol);
    const analysis = await analyzeEarnings(stock.yahoo);
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "earnings failed" });
  }
});

intelRouter.get("/insider/:symbol", async (req, res) => {
  try {
    const stock = await resolveInstrument(req.params.symbol);
    const analysis = await fetchInsiderActivity(stock.yahoo);
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "insider failed" });
  }
});

intelRouter.get("/sector-rotation", async (req, res) => {
  try {
    const market = String(req.query.market ?? "US") as "IN" | "US";
    const rotation = await analyzeSectorRotation(market);
    res.json({ rotation, market });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "sector rotation failed" });
  }
});

intelRouter.get("/gaps/:symbol", async (req, res) => {
  try {
    const stock = await resolveInstrument(req.params.symbol);
    const { candles } = await fetchChart(stock.yahoo, "6mo", "1d");
    const gaps = analyzeGaps(candles);
    const volumeProfile = buildVolumeProfile(candles);
    res.json({ ...gaps, volumeProfile, symbol: stock.yahoo });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "gaps failed" });
  }
});

intelRouter.get("/breadth", async (req, res) => {
  try {
    const market = String(req.query.market ?? "US") as "IN" | "US";
    const breadth = await computeMarketBreadth(market);
    res.json(breadth);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "breadth failed" });
  }
});

intelRouter.get("/macro", async (_req, res) => {
  try {
    const dashboard = await fetchMacroDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "macro failed" });
  }
});

intelRouter.get("/pairs", async (req, res) => {
  try {
    const market = String(req.query.market ?? "US") as "IN" | "US";
    const pairs = await scanPairTrades(market);
    res.json({ pairs, market });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "pairs failed" });
  }
});

intelRouter.get("/seasonality/:symbol", async (req, res) => {
  try {
    const stock = await resolveInstrument(req.params.symbol);
    const analysis = await analyzeSeasonality(stock.yahoo);
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "seasonality failed" });
  }
});

intelRouter.get("/ideas", async (req, res) => {
  try {
    const market = String(req.query.market ?? "ALL") as "IN" | "US" | "ALL";
    const ideas = await scanTradeIdeas(market);
    res.json({ ideas, market, count: ideas.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "ideas failed" });
  }
});

intelRouter.get("/risk", async (_req, res) => {
  try {
    const store = readStore();
    const equityCurve = [store.cash];
    let cash = store.cash;
    for (const fill of store.fills.slice().reverse()) {
      if (fill.side === "BUY") cash -= fill.price * fill.quantity;
      else cash += fill.price * fill.quantity;
      equityCurve.push(cash);
    }
    const risk = computeRiskDashboard({ equityCurve });
    res.json(risk);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "risk failed" });
  }
});

intelRouter.post("/greeks", async (req, res) => {
  try {
    const { spot, strike, timeToExpiry, riskFreeRate, volatility, type } = req.body;
    if (!spot || !strike) return res.status(400).json({ error: "spot and strike required" });
    const greeks = computeGreeks({
      spot,
      strike,
      timeToExpiry: timeToExpiry ?? 30 / 365,
      riskFreeRate: riskFreeRate ?? 0.06,
      volatility: volatility ?? 0.25,
      type: type ?? "call",
    });
    res.json(greeks);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "greeks failed" });
  }
});
