import type { Candle } from "../lib/indicators.js";
import { rsi, macd, ema, bollinger, atr, adx, lastNumber } from "../lib/indicators.js";

export interface TimeframeAnalysis {
  timeframe: string;
  trend: "bullish" | "bearish" | "neutral";
  strength: number;
  rsi: number | null;
  macd: "bullish" | "bearish" | "neutral";
  emaAlignment: string;
  atrPct: number | null;
  adx: number | null;
  summary: string;
}

export function analyzeTimeframe(candles: Candle[], label: string): TimeframeAnalysis | null {
  if (candles.length < 55) return null;
  const closes = candles.map((c) => c.close);
  const close = closes[closes.length - 1];
  const rsiNow = lastNumber(rsi(closes, 14));
  const macdSeries = macd(closes);
  const macdNow = lastNumber(macdSeries.macdLine);
  const macdSig = lastNumber(macdSeries.signalLine);
  const ema20Now = lastNumber(ema(closes, 20));
  const ema50Now = lastNumber(ema(closes, 50));
  const adxSeries = adx(candles, 14);
  const adxNow = lastNumber(adxSeries.adx);
  const atrVals = atr(candles, 14);
  const atrNow = lastNumber(atrVals);

  const macdBullish = macdNow != null && macdSig != null && macdNow > macdSig;
  const macdBearish = macdNow != null && macdSig != null && macdNow < macdSig;
  const emaUp = ema20Now != null && ema50Now != null && ema20Now > ema50Now;
  const emaDown = ema20Now != null && ema50Now != null && ema20Now < ema50Now;
  const aboveEma20 = ema20Now != null && close > ema20Now;
  const aboveEma50 = ema50Now != null && close > ema50Now;

  let trendScore = 0;
  if (macdBullish) trendScore += 2;
  if (macdBearish) trendScore -= 2;
  if (emaUp) trendScore += 2;
  if (emaDown) trendScore -= 2;
  if (aboveEma20) trendScore += 1;
  if (aboveEma50) trendScore += 1;
  if (rsiNow != null && rsiNow > 55) trendScore += 1;
  if (rsiNow != null && rsiNow < 45) trendScore -= 1;

  const trend = trendScore >= 2 ? "bullish" : trendScore <= -2 ? "bearish" : "neutral";
  const strength = Math.min(100, Math.abs(trendScore) * 16);
  const atrPct = atrNow != null ? (atrNow / close) * 100 : null;

  let emaAlignment = "mixed";
  if (aboveEma20 && aboveEma50 && emaUp) emaAlignment = "all bullish";
  else if (!aboveEma20 && !aboveEma50 && emaDown) emaAlignment = "all bearish";
  else if (aboveEma20 && !aboveEma50) emaAlignment = "recovering";
  else if (!aboveEma20 && aboveEma50) emaAlignment = "weakening";

  const parts = [`${trend} trend`];
  if (adxNow != null) parts.push(`ADX ${adxNow.toFixed(0)}`);
  if (rsiNow != null) parts.push(`RSI ${rsiNow.toFixed(0)}`);
  parts.push(emaAlignment);

  return {
    timeframe: label,
    trend,
    strength,
    rsi: rsiNow,
    macd: macdBullish ? "bullish" : macdBearish ? "bearish" : "neutral",
    emaAlignment,
    atrPct: atrPct != null ? Number(atrPct.toFixed(2)) : null,
    adx: adxNow,
    summary: parts.join(" · "),
  };
}

export function multiTimeframeAnalysis(candles5m: Candle[], candles1d: Candle[], candles1w: Candle[]): TimeframeAnalysis[] {
  const results: TimeframeAnalysis[] = [];
  const weekly = analyzeTimeframe(candles1w, "Weekly");
  const daily = analyzeTimeframe(candles1d, "Daily");
  const intraday = analyzeTimeframe(candles5m, "Intraday");
  if (weekly) results.push(weekly);
  if (daily) results.push(daily);
  if (intraday) results.push(intraday);
  return results;
}

export function getConfluence(timeframes: TimeframeAnalysis[]): { direction: string; confidence: number; notes: string[] } {
  const notes: string[] = [];
  let bullCount = 0;
  let bearCount = 0;

  for (const tf of timeframes) {
    if (tf.trend === "bullish") bullCount++;
    if (tf.trend === "bearish") bearCount++;
    notes.push(`${tf.timeframe}: ${tf.summary}`);
  }

  const total = timeframes.length;
  const direction = bullCount > bearCount ? "BUY" : bearCount > bullCount ? "SELL" : "HOLD";
  const confidence = total > 0 ? Math.round((Math.max(bullCount, bearCount) / total) * 100) : 0;

  if (bullCount === total) notes.push("All timeframes aligned bullish — high conviction");
  else if (bearCount === total) notes.push("All timeframes aligned bearish — consider reducing");
  else notes.push("Mixed signals across timeframes — wait for alignment");

  return { direction, confidence, notes };
}
