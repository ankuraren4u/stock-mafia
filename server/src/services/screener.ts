import type { Candle } from "../lib/indicators.js";
import { ema, rsi, macd, bollinger, atr, adx, stochastic, vwap, lastNumber } from "../lib/indicators.js";

export interface ScreenerFilter {
  minMarketCap?: number;
  maxMarketCap?: number;
  minPE?: number;
  maxPE?: number;
  minROE?: number;
  maxDebtToEquity?: number;
  minRSI?: number;
  maxRSI?: number;
  minVolume?: number;
  minPrice?: number;
  maxPrice?: number;
  sector?: string;
  market?: "IN" | "US";
  minDividendYield?: number;
  minADX?: number;
  maxADX?: number;
  emaAbove?: 20 | 50;
  macdBullish?: boolean;
  rsiOversold?: boolean;
  rsiOverbought?: boolean;
  nearVWAP?: boolean;
  adxStrong?: boolean;
}

export interface ScreenerResult {
  symbol: string;
  yahoo: string;
  name: string;
  sector: string;
  market: string;
  price: number;
  changePct: number;
  volume: number | null;
  marketCap: number | null;
  pe: number | null;
  roe: number | null;
  rsi: number | null;
  adx: number | null;
  score: number;
  signals: string[];
}

export function scoreStockForScreener(input: {
  pe: number | null;
  roe: number | null;
  rsi: number | null;
  adx: number | null;
  macdBullish: boolean;
  aboveEma20: boolean;
  aboveEma50: boolean;
  nearVwap: boolean;
  sentiment: number;
  debtToEquity: number | null;
}): { score: number; signals: string[] } {
  let score = 50;
  const signals: string[] = [];

  if (input.rsi != null) {
    if (input.rsi < 30) { score += 12; signals.push("RSI oversold"); }
    else if (input.rsi < 40) { score += 6; signals.push("RSI weak"); }
    else if (input.rsi > 70) { score -= 12; signals.push("RSI overbought"); }
    else if (input.rsi > 60) { score -= 4; }
  }

  if (input.macdBullish) { score += 8; signals.push("MACD bullish"); }
  if (input.aboveEma20) score += 4;
  if (input.aboveEma50) score += 4;
  if (input.nearVwap) { score += 3; signals.push("Near VWAP"); }

  if (input.adx != null) {
    if (input.adx > 25) { score += 6; signals.push(`ADX ${input.adx.toFixed(0)} strong trend`); }
    else if (input.adx < 15) { score -= 3; }
  }

  if (input.pe != null) {
    if (input.pe < 15) { score += 6; signals.push("Low P/E value"); }
    else if (input.pe > 40) { score -= 6; signals.push("High P/E"); }
  }

  if (input.roe != null && input.roe > 0.15) { score += 5; signals.push(`ROE ${(input.roe * 100).toFixed(0)}%`); }
  if (input.debtToEquity != null && input.debtToEquity > 150) { score -= 4; }
  if (input.sentiment > 0.15) { score += 4; signals.push("Positive sentiment"); }
  else if (input.sentiment < -0.15) { score -= 4; }

  return { score: Math.max(0, Math.min(100, score)), signals };
}

export function applyScreenerFilters(candles: Candle[], filters: ScreenerFilter): boolean {
  if (candles.length < 50) return false;
  const closes = candles.map((c) => c.close);
  const rsiNow = lastNumber(rsi(closes, 14));
  const adxSeries = adx(candles, 14);
  const adxNow = lastNumber(adxSeries.adx);
  const ema20 = lastNumber(ema(closes, 20));
  const ema50 = lastNumber(ema(closes, 50));
  const macdSeries = macd(closes);
  const macdNow = lastNumber(macdSeries.macdLine);
  const macdSig = lastNumber(macdSeries.signalLine);
  const close = closes[closes.length - 1];
  const vwapSeries = vwap(candles);
  const vwapNow = lastNumber(vwapSeries);
  const vol = candles[candles.length - 1]?.volume ?? 0;

  if (filters.minRSI != null && (rsiNow == null || rsiNow < filters.minRSI)) return false;
  if (filters.maxRSI != null && (rsiNow == null || rsiNow > filters.maxRSI)) return false;
  if (filters.minADX != null && (adxNow == null || adxNow < filters.minADX)) return false;
  if (filters.maxADX != null && (adxNow == null || adxNow > filters.maxADX)) return false;
  if (filters.minVolume != null && vol < filters.minVolume) return false;
  if (filters.minPrice != null && close < filters.minPrice) return false;
  if (filters.maxPrice != null && close > filters.maxPrice) return false;
  if (filters.emaAbove === 20 && (ema20 == null || close < ema20)) return false;
  if (filters.emaAbove === 50 && (ema50 == null || close < ema50)) return false;
  if (filters.macdBullish && (macdNow == null || macdSig == null || macdNow <= macdSig)) return false;
  if (filters.rsiOversold && (rsiNow == null || rsiNow >= 35)) return false;
  if (filters.rsiOverbought && (rsiNow == null || rsiNow <= 65)) return false;
  if (filters.nearVWAP && (vwapNow == null || Math.abs(close - vwapNow) / vwapNow > 0.02)) return false;
  if (filters.adxStrong && (adxNow == null || adxNow < 25)) return false;

  return true;
}
