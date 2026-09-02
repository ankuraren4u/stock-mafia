import type { Candle } from "../lib/indicators.js";
import { rsi, ema, macd, atr, bollinger, adx, stochastic, lastNumber } from "../lib/indicators.js";

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface StressScenario {
  name: string;
  description: string;
  marketShock: number;
  volShock: number;
  estimatedImpact: number;
  impactPct: number;
  probability: string;
}

export interface RiskDashboard {
  portfolioBeta: number;
  portfolioVaR95: number;
  portfolioVaR99: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  correlationToMarket: number;
  stressTests: StressScenario[];
  regime: "low_vol_bull" | "high_vol_bull" | "low_vol_bear" | "high_vol_bear" | "transition";
  riskScore: number;
  summary: string;
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function computeVaR(returns: number[], confidence: number): number {
  if (returns.length < 5) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * (1 - confidence));
  return -sorted[Math.max(0, idx)] || 0;
}

function computeBeta(returns: number[], marketReturns: number[]): number {
  if (returns.length < 20 || marketReturns.length < 20) return 1;
  const n = Math.min(returns.length, marketReturns.length);
  const r = returns.slice(-n);
  const m = marketReturns.slice(-n);
  const meanR = r.reduce((a, b) => a + b, 0) / n;
  const meanM = m.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (r[i] - meanR) * (m[i] - meanM);
    varM += (m[i] - meanM) ** 2;
  }
  return varM > 0 ? cov / varM : 1;
}

export function computeRiskDashboard(input: {
  equityCurve: number[];
  benchmarkReturns?: number[];
}): RiskDashboard {
  const { equityCurve, benchmarkReturns } = input;
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }

  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1 ? Math.sqrt(returns.reduce((a, r) => a + (r - meanReturn) ** 2, 0) / (returns.length - 1)) : 0;

  const var95 = computeVaR(returns, 0.95);
  const var99 = computeVaR(returns, 0.99);

  let peak = equityCurve[0] || 1;
  let maxDd = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDd) maxDd = dd;
  }

  const beta = benchmarkReturns ? computeBeta(returns, benchmarkReturns) : 1;
  const excessReturns = returns.map((r) => r - 0.06 / 252);
  const sharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;
  const downside = excessReturns.filter((r) => r < 0);
  const downsideDev = downside.length > 0 ? Math.sqrt(downside.reduce((a, r) => a + r ** 2, 0) / downside.length) : 0;
  const sortino = downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(252) : 0;

  let correlation = 0;
  if (benchmarkReturns && benchmarkReturns.length >= 20) {
    const n = Math.min(returns.length, benchmarkReturns.length);
    const r = returns.slice(-n);
    const m = benchmarkReturns.slice(-n);
    const meanR = r.reduce((a, b) => a + b, 0) / n;
    const meanM = m.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let denA = 0;
    let denB = 0;
    for (let i = 0; i < n; i++) {
      num += (r[i] - meanR) * (m[i] - meanM);
      denA += (r[i] - meanR) ** 2;
      denB += (m[i] - meanM) ** 2;
    }
    correlation = denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;
  }

  const vol = stdDev * Math.sqrt(252);
  let regime: RiskDashboard["regime"] = "transition";
  if (vol < 0.15 && meanReturn > 0) regime = "low_vol_bull";
  else if (vol >= 0.15 && meanReturn > 0) regime = "high_vol_bull";
  else if (vol < 0.15 && meanReturn <= 0) regime = "low_vol_bear";
  else if (vol >= 0.15 && meanReturn <= 0) regime = "high_vol_bear";

  const stressTests: StressScenario[] = [
    { name: "Market Crash (-20%)", description: "S&P 500 drops 20% over 1 month", marketShock: -0.20, volShock: 0.5, estimatedImpact: -0.20 * beta, impactPct: Number((-0.20 * beta * 100).toFixed(1)), probability: "5-10% per year" },
    { name: "Flash Crash (-10%)", description: "Sharp 1-day selloff", marketShock: -0.10, volShock: 0.3, estimatedImpact: -0.10 * beta, impactPct: Number((-0.10 * beta * 100).toFixed(1)), probability: "2-3 per year" },
    { name: "Vol Spike (+50% VIX)", description: "VIX jumps 50% from current level", marketShock: -0.05, volShock: 0.5, estimatedImpact: -0.05 * beta, impactPct: Number((-0.05 * beta * 100).toFixed(1)), probability: "5-8 per year" },
    { name: "Rate Hike (+100bp)", description: "Fed raises rates by 100bp", marketShock: -0.08, volShock: 0.2, estimatedImpact: -0.08 * beta, impactPct: Number((-0.08 * beta * 100).toFixed(1)), probability: "1-2 per year" },
    { name: "Bull Rally (+15%)", description: "Strong market rally over 3 months", marketShock: 0.15, volShock: -0.2, estimatedImpact: 0.15 * beta, impactPct: Number((0.15 * beta * 100).toFixed(1)), probability: "2-4 per year" },
  ];

  let riskScore = 50;
  if (var95 > 0.03) riskScore += 15;
  if (maxDd > 0.2) riskScore += 15;
  if (beta > 1.3) riskScore += 10;
  if (regime === "high_vol_bear") riskScore += 20;
  if (regime === "low_vol_bull") riskScore -= 15;
  riskScore = Math.max(0, Math.min(100, riskScore));

  const summary = [
    `Beta: ${beta.toFixed(2)} · VaR 95%: ${(var95 * 100).toFixed(1)}% daily`,
    `Sharpe: ${sharpe.toFixed(2)} · Sortino: ${sortino.toFixed(2)}`,
    `Max DD: ${(maxDd * 100).toFixed(1)}% · Regime: ${regime.replace(/_/g, " ")}`,
    `Risk score: ${riskScore}/100`,
  ].join(" · ");

  return {
    portfolioBeta: Number(beta.toFixed(2)),
    portfolioVaR95: Number((var95 * 100).toFixed(2)),
    portfolioVaR99: Number((var99 * 100).toFixed(2)),
    maxDrawdown: Number((maxDd * 100).toFixed(2)),
    sharpeRatio: Number(sharpe.toFixed(2)),
    sortinoRatio: Number(sortino.toFixed(2)),
    correlationToMarket: Number(correlation.toFixed(3)),
    stressTests,
    regime,
    riskScore,
    summary,
  };
}

export function computeGreeks(input: {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  volatility: number;
  type: "call" | "put";
}): Greeks {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility, type } = input;
  const sqrtT = Math.sqrt(timeToExpiry);
  const d1 = (Math.log(spot / strike) + (riskFreeRate + (volatility ** 2) / 2) * timeToExpiry) / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  const nd1 = normalCDF(d1);
  const nd2 = normalCDF(d2);
  const npd1 = Math.exp(-(d1 ** 2) / 2) / Math.sqrt(2 * Math.PI);

  let delta: number;
  if (type === "call") {
    delta = nd1;
  } else {
    delta = nd1 - 1;
  }

  const gamma = npd1 / (spot * volatility * sqrtT);
  const theta = type === "call"
    ? (-(spot * npd1 * volatility) / (2 * sqrtT) - riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * nd2) / 365
    : (-(spot * npd1 * volatility) / (2 * sqrtT) + riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(-d2)) / 365;
  const vega = (spot * npd1 * sqrtT) / 100;
  const rho = type === "call"
    ? (strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * nd2) / 100
    : (-strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(-d2)) / 100;

  return {
    delta: Number(delta.toFixed(4)),
    gamma: Number(gamma.toFixed(6)),
    theta: Number(theta.toFixed(4)),
    vega: Number(vega.toFixed(4)),
    rho: Number(rho.toFixed(4)),
  };
}
