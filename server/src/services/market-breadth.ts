import { INDIA_STOCKS, US_STOCKS } from "../lib/universe.js";
import { fetchChart, fetchQuote } from "./market.js";

export interface MarketBreadthData {
  advances: number;
  declines: number;
  unchanged: number;
  advanceDeclineRatio: number;
  advanceDeclineLine: number;
  newHighs: number;
  newLows: number;
  percentAboveSMA20: number;
  percentAboveSMA50: number;
  percentAboveSMA200: number;
  mcclellanOscillator: number;
  goldenCrossCount: number;
  deathCrossCount: number;
  breadthMomentum: "expanding" | "contracting" | "neutral";
  marketPhase: "accumulation" | "markup" | "distribution" | "markdown" | "unknown";
  summary: string;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export async function computeMarketBreadth(market: "IN" | "US" = "US"): Promise<MarketBreadthData> {
  const stocks = market === "US" ? US_STOCKS : INDIA_STOCKS;
  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  let newHighs = 0;
  let newLows = 0;
  let aboveSMA20 = 0;
  let aboveSMA50 = 0;
  let aboveSMA200 = 0;
  let goldenCross = 0;
  let deathCross = 0;
  let adLine = 0;

  const dailyChanges: number[] = [];
  const prevDailyChanges: number[] = [];

  for (const stock of stocks) {
    try {
      const { candles } = await fetchChart(stock.yahoo, "1y", "1d");
      if (candles.length < 50) continue;

      const last = candles[candles.length - 1].close;
      const prev = candles[candles.length - 2]?.close ?? last;
      const change = last - prev;
      dailyChanges.push(change);
      if (candles.length > 3) prevDailyChanges.push(candles[candles.length - 2].close - candles[candles.length - 3].close);

      if (change > 0) { advances++; adLine++; }
      else if (change < 0) { declines++; adLine--; }
      else unchanged++;

      const high52w = Math.max(...candles.slice(-252).map((c) => c.high));
      const low52w = Math.min(...candles.slice(-252).map((c) => c.low));
      if (last >= high52w * 0.98) newHighs++;
      if (last <= low52w * 1.02) newLows++;

      const sma20 = sma(candles.map((c) => c.close), 20);
      const sma50val = sma(candles.map((c) => c.close), 50);
      const sma200 = sma(candles.map((c) => c.close), 200);
      if (sma20 != null && last > sma20) aboveSMA20++;
      if (sma50val != null && last > sma50val) aboveSMA50++;
      if (sma200 != null && last > sma200) aboveSMA200++;

      if (candles.length >= 55) {
        const sma50prev = sma(candles.map((c) => c.close).slice(0, -5), 50);
        const sma200prev = sma(candles.map((c) => c.close).slice(0, -5), 200);
        if (sma50val != null && sma200 != null && sma50prev != null && sma200prev != null) {
          if (sma50prev <= sma200prev && sma50val > sma200) goldenCross++;
          if (sma50prev >= sma200prev && sma50val < sma200) deathCross++;
        }
      }
    } catch {}
  }

  const total = advances + declines + unchanged;
  const adRatio = declines > 0 ? advances / declines : advances;
  const prevAdv = prevDailyChanges.filter((c) => c > 0).length;
  const prevDec = prevDailyChanges.filter((c) => c < 0).length;
  const ema19 = prevAdv > 0 || prevDec > 0
    ? dailyChanges.reduce((a, c) => a + (c > 0 ? 1 : c < 0 ? -1 : 0), 0) * (2 / 20) +
      (prevAdv - prevDec) * (1 - 2 / 20)
    : 0;
  const ema39 = ema19 * 0.5;
  const mcclellan = Number(((ema19 - ema39) * 100).toFixed(1));

  const pctAbove20 = total > 0 ? (aboveSMA20 / total) * 100 : 0;
  const pctAbove50 = total > 0 ? (aboveSMA50 / total) * 100 : 0;
  const pctAbove200 = total > 0 ? (aboveSMA200 / total) * 100 : 0;

  let breadthMomentum: MarketBreadthData["breadthMomentum"] = "neutral";
  if (advances > declines * 1.5) breadthMomentum = "expanding";
  else if (declines > advances * 1.5) breadthMomentum = "contracting";

  let marketPhase: MarketBreadthData["marketPhase"] = "unknown";
  if (pctAbove50 > 60 && breadthMomentum === "expanding") marketPhase = "markup";
  else if (pctAbove50 > 40 && breadthMomentum === "contracting") marketPhase = "distribution";
  else if (pctAbove50 < 30 && breadthMomentum === "contracting") marketPhase = "markdown";
  else if (pctAbove50 < 40 && breadthMomentum === "expanding") marketPhase = "accumulation";

  const totalStocks = total || 1;
  const summary = [
    `A/D ratio: ${adRatio.toFixed(1)} (${advances}↑ ${declines}↓)`,
    breadthMomentum === "expanding" ? "Breadth expanding — broad participation" : breadthMomentum === "contracting" ? "Breadth contracting — narrow leadership" : "Breadth mixed",
    `${pctAbove50.toFixed(0)}% above 50-day MA · ${pctAbove200.toFixed(0)}% above 200-day MA`,
    newHighs > newLows ? `${newHighs} new highs vs ${newLows} new lows — bullish` : `${newLows} new lows vs ${newHighs} new highs — bearish`,
    goldenCross > 0 ? `${goldenCross} golden cross(es)` : deathCross > 0 ? `${deathCross} death cross(es)` : "",
  ].filter(Boolean).join(" · ");

  return {
    advances,
    declines,
    unchanged,
    advanceDeclineRatio: Number(adRatio.toFixed(2)),
    advanceDeclineLine: adLine,
    newHighs,
    newLows,
    percentAboveSMA20: Number(pctAbove20.toFixed(1)),
    percentAboveSMA50: Number(pctAbove50.toFixed(1)),
    percentAboveSMA200: Number(pctAbove200.toFixed(1)),
    mcclellanOscillator: mcclellan,
    goldenCrossCount: goldenCross,
    deathCrossCount: deathCross,
    breadthMomentum,
    marketPhase,
    summary,
  };
}
