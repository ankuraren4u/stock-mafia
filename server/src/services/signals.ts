import {
  bollinger,
  ema,
  lastNumber,
  macd,
  rsi,
  type Candle,
} from "../lib/indicators.js";
import type { NewsItem } from "./news.js";

export interface SignalResult {
  action: "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
  score: number;
  confidence: number;
  horizon: string;
  reasons: string[];
  technicals: {
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
    ema20: number | null;
    ema50: number | null;
    bbUpper: number | null;
    bbLower: number | null;
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function generateSignal(input: {
  candles: Candle[];
  sentiment: number;
  pe: number | null;
  roe: number | null;
  debtToEquity: number | null;
  news: NewsItem[];
}): SignalResult {
  const closes = input.candles.map((c) => c.close);
  const rsiSeries = rsi(closes, 14);
  const macdSeries = macd(closes);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const bb = bollinger(closes, 20, 2);
  const lastClose = closes[closes.length - 1];

  const rsiNow = lastNumber(rsiSeries);
  const macdNow = lastNumber(macdSeries.macdLine);
  const macdSig = lastNumber(macdSeries.signalLine);
  const ema20Now = lastNumber(ema20);
  const ema50Now = lastNumber(ema50);
  const bbUpper = lastNumber(bb.upper);
  const bbLower = lastNumber(bb.lower);

  let score = 50;
  const reasons: string[] = [];

  if (rsiNow != null) {
    if (rsiNow < 30) {
      score += 16;
      reasons.push(`RSI ${rsiNow.toFixed(1)} is oversold`);
    } else if (rsiNow < 40) {
      score += 8;
      reasons.push(`RSI ${rsiNow.toFixed(1)} is weakly oversold`);
    } else if (rsiNow > 70) {
      score -= 16;
      reasons.push(`RSI ${rsiNow.toFixed(1)} is overbought`);
    } else if (rsiNow > 60) {
      score -= 8;
      reasons.push(`RSI ${rsiNow.toFixed(1)} is elevated`);
    } else {
      reasons.push(`RSI ${rsiNow.toFixed(1)} is neutral`);
    }
  }

  if (macdNow != null && macdSig != null) {
    if (macdNow > macdSig) {
      score += 10;
      reasons.push("MACD is above signal (bullish momentum)");
    } else {
      score -= 10;
      reasons.push("MACD is below signal (bearish momentum)");
    }
  }

  if (ema20Now != null && ema50Now != null) {
    if (ema20Now > ema50Now) {
      score += 10;
      reasons.push("EMA 20 above EMA 50 (uptrend)");
    } else {
      score -= 10;
      reasons.push("EMA 20 below EMA 50 (downtrend)");
    }
  }

  if (bbLower != null && lastClose < bbLower) {
    score += 6;
    reasons.push("Price is below lower Bollinger Band");
  }
  if (bbUpper != null && lastClose > bbUpper) {
    score -= 6;
    reasons.push("Price is above upper Bollinger Band");
  }

  if (input.sentiment > 0.15) {
    score += 8;
    reasons.push("News sentiment is positive");
  } else if (input.sentiment < -0.15) {
    score -= 8;
    reasons.push("News sentiment is negative");
  }

  if (input.pe != null) {
    if (input.pe < 18) {
      score += 6;
      reasons.push(`Trailing P/E ${input.pe.toFixed(1)} looks inexpensive`);
    } else if (input.pe > 40) {
      score -= 6;
      reasons.push(`Trailing P/E ${input.pe.toFixed(1)} is expensive`);
    }
  }

  if (input.roe != null && input.roe > 0.15) {
    score += 5;
    reasons.push(`ROE ${(input.roe * 100).toFixed(1)}% is healthy`);
  }
  if (input.debtToEquity != null && input.debtToEquity > 150) {
    score -= 5;
    reasons.push("Debt-to-equity is elevated");
  }

  score = clamp(Math.round(score), 0, 100);
  const action: SignalResult["action"] =
    score >= 78
      ? "STRONG BUY"
      : score >= 62
        ? "BUY"
        : score <= 22
          ? "STRONG SELL"
          : score <= 38
            ? "SELL"
            : "HOLD";

  const confidence = clamp(Math.abs(score - 50) * 2, 20, 92);

  return {
    action,
    score,
    confidence,
    horizon: "next 5 trading sessions (direction, not exact price)",
    reasons,
    technicals: {
      rsi: rsiNow,
      macd: macdNow,
      macdSignal: macdSig,
      ema20: ema20Now,
      ema50: ema50Now,
      bbUpper,
      bbLower,
    },
  };
}
