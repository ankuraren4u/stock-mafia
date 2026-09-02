import type { Candle } from "../lib/indicators.js";
import { atr, lastNumber } from "../lib/indicators.js";
import { evaluateStrategies, type StrategyContext, type StrategyHit } from "./strategies.js";

export interface BacktestTrade {
  entry: number;
  exit: number;
  pnlPct: number;
  bars: number;
  side: "BUY" | "SELL";
  entryDate: string;
  exitDate: string;
}

export interface WalkForwardResult {
  inSample: {
    trades: number;
    winRate: number;
    totalReturnPct: number;
    sharpe: number;
    maxDrawdownPct: number;
  };
  outOfSample: {
    trades: number;
    winRate: number;
    totalReturnPct: number;
    sharpe: number;
    maxDrawdownPct: number;
  };
  stability: number;
}

export interface MonteCarloResult {
  median: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  mean: number;
  stdDev: number;
  simulations: number;
  positivePct: number;
}

export function walkForwardBacktest(
  candles: Candle[],
  strategyId: string,
  indexReturn20: number | null,
  splitPct = 0.7,
  inSampleBars = 150,
): WalkForwardResult {
  const splitIdx = Math.floor(candles.length * splitPct);
  const inSample = candles.slice(0, splitIdx);
  const outOfSample = candles.slice(splitIdx);

  function runOnSlice(slice: Candle[]) {
    const trades: BacktestTrade[] = [];
    let open: { i: number; price: number; stop: number; target: number; side: "BUY" | "SELL" } | null = null;

    for (let i = 60; i < slice.length; i++) {
      const subSlice = slice.slice(0, i + 1);
      const hits = evaluateStrategies(
        { candles: subSlice, sentiment: 0, pe: null, roe: null, indexReturn20 },
        subSlice.length - 1,
      ).filter((h) => h.strategyId === strategyId);

      if (open) {
        const bar = slice[i];
        const hold = i - open.i;
        let exit: number | null = null;
        if (open.side === "BUY") {
          if (bar.low <= open.stop) exit = open.stop;
          else if (bar.high >= open.target) exit = open.target;
        } else if (bar.high >= open.stop) exit = open.stop;
        else if (bar.low <= open.target) exit = open.target;
        if (hold >= 12 && exit == null) exit = bar.close;
        if (exit != null) {
          const pnlPct = open.side === "BUY" ? (exit - open.price) / open.price : (open.price - exit) / open.price;
          trades.push({
            entry: open.price,
            exit,
            pnlPct,
            bars: hold,
            side: open.side,
            entryDate: new Date(slice[open.i].time).toISOString(),
            exitDate: new Date(slice[i].time).toISOString(),
          });
          open = null;
        }
      }

      if (!open && hits[0]) {
        const price = slice[i].close;
        const a = lastNumber(atr(subSlice, 14)) ?? price * 0.02;
        const stopDist = a * 2;
        open = {
          i,
          price,
          side: hits[0].side,
          stop: hits[0].side === "BUY" ? price - stopDist : price + stopDist,
          target: hits[0].side === "BUY" ? price + stopDist * 2 : price - stopDist * 2,
        };
      }
    }
    return trades;
  }

  const inTrades = runOnSlice(inSample.slice(-inSampleBars));
  const outTrades = runOnSlice(outOfSample);

  function calcMetrics(trades: BacktestTrade[]) {
    const wins = trades.filter((t) => t.pnlPct > 0).length;
    let equity = 1;
    let peak = 1;
    let maxDd = 0;
    const returns = trades.map((t) => t.pnlPct);
    for (const t of trades) {
      equity *= 1 + t.pnlPct;
      peak = Math.max(peak, equity);
      maxDd = Math.max(maxDd, (peak - equity) / peak);
    }
    const meanR = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const sdR = returns.length > 1 ? Math.sqrt(returns.reduce((a, r) => a + (r - meanR) ** 2, 0) / (returns.length - 1)) : 0;
    const sharpe = sdR === 0 ? 0 : (meanR / sdR) * Math.sqrt(252);
    return {
      trades: trades.length,
      winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0,
      totalReturnPct: Number(((equity - 1) * 100).toFixed(2)),
      sharpe: Number(sharpe.toFixed(2)),
      maxDrawdownPct: Number((maxDd * 100).toFixed(2)),
    };
  }

  const is = calcMetrics(inTrades);
  const oos = calcMetrics(outTrades);

  const stability = is.trades > 0 && oos.trades > 0
    ? Math.max(0, 1 - Math.abs(is.totalReturnPct - oos.totalReturnPct) / Math.max(Math.abs(is.totalReturnPct), 1))
    : 0;

  return { inSample: is, outOfSample: oos, stability: Number(stability.toFixed(2)) };
}

export function monteCarloSimulation(
  trades: BacktestTrade[],
  simulations = 1000,
  sampleSize?: number,
): MonteCarloResult {
  if (!trades.length) {
    return { median: 0, p5: 0, p25: 0, p75: 0, p95: 0, mean: 0, stdDev: 0, simulations: 0, positivePct: 0 };
  }

  const size = sampleSize ?? trades.length;
  const results: number[] = [];

  for (let s = 0; s < simulations; s++) {
    let equity = 1;
    for (let i = 0; i < size; i++) {
      const trade = trades[Math.floor(Math.random() * trades.length)];
      equity *= 1 + trade.pnlPct;
    }
    results.push((equity - 1) * 100);
  }

  results.sort((a, b) => a - b);
  const median = results[Math.floor(results.length / 2)];
  const p5 = results[Math.floor(results.length * 0.05)];
  const p25 = results[Math.floor(results.length * 0.25)];
  const p75 = results[Math.floor(results.length * 0.75)];
  const p95 = results[Math.floor(results.length * 0.95)];
  const m = results.reduce((a, b) => a + b, 0) / results.length;
  const sd = Math.sqrt(results.reduce((a, r) => a + (r - m) ** 2, 0) / results.length);
  const positivePct = results.filter((r) => r > 0).length / results.length;

  return {
    median: Number(median.toFixed(2)),
    p5: Number(p5.toFixed(2)),
    p25: Number(p25.toFixed(2)),
    p75: Number(p75.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    mean: Number(m.toFixed(2)),
    stdDev: Number(sd.toFixed(2)),
    simulations,
    positivePct: Number((positivePct * 100).toFixed(1)),
  };
}
