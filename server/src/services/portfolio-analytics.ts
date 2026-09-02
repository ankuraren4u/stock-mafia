export interface PortfolioAnalytics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  kellyCriterion: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  expectancy: number;
  valueAtRisk95: number;
  trackingError: number | null;
  informationRatio: number | null;
}

export function computeReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

export function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function sharpeRatio(returns: number[], riskFreeRate = 0.06 / 252): number {
  if (returns.length < 2) return 0;
  const excessReturns = returns.map((r) => r - riskFreeRate);
  const meanExcess = mean(excessReturns);
  const sd = stdDev(excessReturns);
  return sd === 0 ? 0 : (meanExcess / sd) * Math.sqrt(252);
}

export function sortinoRatio(returns: number[], riskFreeRate = 0.06 / 252): number {
  if (returns.length < 2) return 0;
  const excessReturns = returns.map((r) => r - riskFreeRate);
  const meanExcess = mean(excessReturns);
  const downsideReturns = excessReturns.filter((r) => r < 0);
  const downsideDev = downsideReturns.length > 0 ? stdDev(downsideReturns) : 0;
  return downsideDev === 0 ? 0 : (meanExcess / downsideDev) * Math.sqrt(252);
}

export function maxDrawdown(prices: number[]): number {
  if (prices.length < 2) return 0;
  let peak = prices[0];
  let maxDd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (peak - p) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export function calmarRatio(returns: number[], prices: number[]): number {
  const annReturn = mean(returns) * 252;
  const mdd = maxDrawdown(prices);
  return mdd === 0 ? 0 : annReturn / mdd;
}

export function winRate(trades: { pnl: number }[]): number {
  if (!trades.length) return 0;
  return trades.filter((t) => t.pnl > 0).length / trades.length;
}

export function profitFactor(trades: { pnl: number }[]): number {
  const gains = trades.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
  const losses = Math.abs(trades.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0));
  return losses === 0 ? gains > 0 ? Infinity : 0 : gains / losses;
}

export function kellyCriterion(winRateVal: number, avgWinVal: number, avgLossVal: number): number {
  if (avgLossVal === 0) return 0;
  const w = winRateVal;
  const r = Math.abs(avgWinVal / avgLossVal);
  const kelly = w - (1 - w) / r;
  return Math.max(0, Math.min(0.25, kelly));
}

export function valueAtRisk95(returns: number[]): number {
  if (returns.length < 10) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.05);
  return -sorted[idx];
}

export function computePortfolioAnalytics(input: {
  equityCurve: number[];
  trades: { pnl: number; pnlPct: number }[];
  benchmarkReturns?: number[];
}): PortfolioAnalytics {
  const { equityCurve, trades, benchmarkReturns } = input;
  const returns = computeReturns(equityCurve);

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0;

  const wr = winRate(trades);
  const pf = profitFactor(trades);
  const kc = kellyCriterion(wr, avgWin, avgLoss);
  const totalReturn = equityCurve.length > 1 ? (equityCurve[equityCurve.length - 1] - equityCurve[0]) / equityCurve[0] : 0;

  let trackingError: number | null = null;
  let informationRatio: number | null = null;
  if (benchmarkReturns && benchmarkReturns.length === returns.length) {
    const activeReturns = returns.map((r, i) => r - benchmarkReturns[i]);
    trackingError = stdDev(activeReturns) * Math.sqrt(252);
    const avgActive = mean(activeReturns);
    informationRatio = trackingError === 0 ? 0 : (avgActive * 252) / trackingError;
  }

  return {
    totalReturn,
    annualizedReturn: mean(returns) * 252,
    sharpeRatio: sharpeRatio(returns),
    sortinoRatio: sortinoRatio(returns),
    maxDrawdown: maxDrawdown(equityCurve),
    calmarRatio: calmarRatio(returns, equityCurve),
    winRate: wr,
    profitFactor: pf,
    kellyCriterion: kc,
    avgWin,
    avgLoss,
    totalTrades: trades.length,
    expectancy: wr * avgWin + (1 - wr) * avgLoss,
    valueAtRisk95: valueAtRisk95(returns),
    trackingError,
    informationRatio,
  };
}
