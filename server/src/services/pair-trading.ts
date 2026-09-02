import type { Candle } from "../lib/indicators.js";
import { fetchChart } from "./market.js";
import { INDIA_STOCKS, US_STOCKS } from "../lib/universe.js";

export interface PairTradeSetup {
  symbolA: string;
  symbolB: string;
  spread: number;
  zScore: number;
  correlation: number;
  hedgeRatio: number;
  halfLife: number | null;
  entrySignal: "long_spread" | "short_spread" | "neutral";
  currentSpread: number;
  meanSpread: number;
  stdSpread: number;
  confidence: number;
  summary: string;
}

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { slope: 0, intercept: 0, r2: 0 };
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = y.reduce((a, yi, i) => a + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const ssTot = y.reduce((a, yi) => a + (yi - sumY / n) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2: Math.max(0, r2) };
}

function computeCointegration(p: number[], q: number[]): { cointegrated: boolean; halfLife: number | null; hedgeRatio: number; r2: number } {
  const minLen = Math.min(p.length, q.length);
  const a = p.slice(-minLen);
  const b = q.slice(-minLen);
  const { slope, intercept, r2 } = linearRegression(b, a);
  const hedgeRatio = slope;
  const spread = a.map((v, i) => v - slope * b[i] - intercept);

  let halfLife: number | null = null;
  if (spread.length > 10) {
    const lag = spread.slice(0, -1);
    const diff = spread.slice(1).map((v, i) => v - lag[i]);
    const lr = linearRegression(lag, diff);
    if (lr.slope < 0) {
      halfLife = -Math.log(2) / lr.slope;
      halfLife = Math.min(120, Math.max(1, halfLife));
    }
  }

  return { cointegrated: r2 > 0.6 && halfLife != null && halfLife < 60, halfLife, hedgeRatio, r2 };
}

function zScore(series: number[]): number {
  if (series.length < 5) return 0;
  const last = series[series.length - 1];
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const std = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);
  return std > 0 ? (last - mean) / std : 0;
}

export async function scanPairTrades(market: "IN" | "US" = "US"): Promise<PairTradeSetup[]> {
  const stocks = market === "US" ? US_STOCKS.slice(0, 12) : INDIA_STOCKS.slice(0, 12);
  const priceData = new Map<string, number[]>();

  for (const stock of stocks) {
    try {
      const { candles } = await fetchChart(stock.yahoo, "6mo", "1d");
      if (candles.length >= 50) priceData.set(stock.yahoo, candles.map((c) => c.close));
    } catch {}
  }

  const pairs: PairTradeSetup[] = [];
  const symbols = [...priceData.keys()];

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const p = priceData.get(symbols[i])!;
      const q = priceData.get(symbols[j])!;
      const minLen = Math.min(p.length, q.length);
      const a = p.slice(-minLen);
      const b = q.slice(-minLen);

      const meanA = a.reduce((x, y) => x + y, 0) / a.length;
      const meanB = b.reduce((x, y) => x + y, 0) / b.length;
      const stdA = Math.sqrt(a.reduce((x, y) => x + (y - meanA) ** 2, 0) / a.length);
      const stdB = Math.sqrt(b.reduce((x, y) => x + (y - meanB) ** 2, 0) / b.length);
      const corr = stdA > 0 && stdB > 0
        ? a.reduce((sum, v, k) => sum + ((v - meanA) / stdA) * ((b[k] - meanB) / stdB), 0) / a.length
        : 0;

      if (corr < 0.7) continue;

      const { cointegrated, halfLife, hedgeRatio, r2 } = computeCointegration(a, b);
      if (!cointegrated) continue;

      const spread = a.map((v, k) => v - hedgeRatio * b[k]);
      const meanSpread = spread.reduce((x, y) => x + y, 0) / spread.length;
      const stdSpread = Math.sqrt(spread.reduce((x, y) => x + (y - meanSpread) ** 2, 0) / spread.length);
      const zs = zScore(spread);

      let signal: PairTradeSetup["entrySignal"] = "neutral";
      let confidence = 50;
      if (zs < -2) { signal = "long_spread"; confidence = 75; }
      else if (zs > 2) { signal = "short_spread"; confidence = 75; }
      else if (Math.abs(zs) > 1.5) { confidence = 60; }

      pairs.push({
        symbolA: symbols[i],
        symbolB: symbols[j],
        spread: Number(spread[spread.length - 1].toFixed(2)),
        zScore: Number(zs.toFixed(2)),
        correlation: Number(corr.toFixed(3)),
        hedgeRatio: Number(hedgeRatio.toFixed(4)),
        halfLife: halfLife != null ? Number(halfLife.toFixed(1)) : null,
        entrySignal: signal,
        currentSpread: Number(spread[spread.length - 1].toFixed(2)),
        meanSpread: Number(meanSpread.toFixed(2)),
        stdSpread: Number(stdSpread.toFixed(2)),
        confidence,
        summary: signal === "long_spread"
          ? `Spread ${zs.toFixed(1)}σ below mean — mean reversion long opportunity`
          : signal === "short_spread"
          ? `Spread ${zs.toFixed(1)}σ above mean — mean reversion short opportunity`
          : `Spread within normal range — wait for entry`,
      });
    }
  }

  return pairs.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)).slice(0, 15);
}
