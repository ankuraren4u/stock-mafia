import { readStore, updateStore } from "../db/store.js";
import { readSnapshot } from "./crawler.js";
import { generateSignal } from "./signals.js";
import { averageSentiment } from "./news.js";
import { evaluateStrategies, type StrategyHit } from "./strategies.js";
import { lastNumber, rsi, ema, macd, atr, type Candle } from "../lib/indicators.js";
import { fetchQuote } from "./market.js";
import { resolveInstrument } from "./tickers.js";

export interface SmartAlert {
  id: string;
  yahoo: string;
  symbol: string;
  market: "IN" | "US";
  currency: string;
  direction: "above" | "below";
  targetPrice: number;
  currentPrice: number;
  note: string;
  triggered: boolean;
  analysis?: {
    action: "BUY" | "SELL" | "HOLD";
    confidence: number;
    entry: number;
    stop: number;
    target: number;
    reasons: string[];
    risks: string[];
    technicals: Record<string, number | null>;
    sentiment: number;
    strategyHits: Array<{ strategyId: string; side: string; conviction: number; thesis: string[] }>;
  };
}

export async function analyzeAlert(alert: { yahoo: string; direction: string; price: number; note?: string }): Promise<SmartAlert | null> {
  try {
    const stock = await resolveInstrument(alert.yahoo);
    const snap = readSnapshot(alert.yahoo);
    if (!snap || !snap.quote) return null;

    const price = snap.quote.price;
    const candles = snap.candles;
    const closes = candles.map((c) => c.close);

    // Compute technicals
    const rsiNow = lastNumber(rsi(closes, 14));
    const macdS = macd(closes);
    const macdNow = lastNumber(macdS.macdLine);
    const macdSig = lastNumber(macdS.signalLine);
    const e20 = lastNumber(ema(closes, 20));
    const e50 = lastNumber(ema(closes, 50));
    const a = lastNumber(atr(candles, 14)) ?? price * 0.02;

    const technicals: Record<string, number | null> = {
      RSI: rsiNow,
      MACD: macdNow,
      MACD_Signal: macdSig,
      EMA20: e20,
      EMA50: e50,
      ATR: a,
    };

    // Compute signal
    const signal = generateSignal({
      candles,
      sentiment: snap.sentiment,
      pe: typeof snap.fundamentals.pe === "number" ? snap.fundamentals.pe : null,
      roe: typeof snap.fundamentals.roe === "number" ? snap.fundamentals.roe : null,
      debtToEquity: typeof snap.fundamentals.debtToEquity === "number" ? snap.fundamentals.debtToEquity : null,
      news: snap.news,
    });

    // Evaluate strategies
    const strategyHits = evaluateStrategies({
      candles,
      sentiment: snap.sentiment,
      pe: typeof snap.fundamentals.pe === "number" ? snap.fundamentals.pe : null,
      roe: typeof snap.fundamentals.roe === "number" ? snap.fundamentals.roe : null,
      indexReturn20: null,
    });

    // Build reasoning
    const reasons: string[] = [];
    const risks: string[] = [];

    if (signal.action.includes("BUY")) {
      reasons.push(`Signal engine: ${signal.action} (score ${signal.score})`);
    }
    if (strategyHits.length) {
      for (const h of strategyHits) {
        const meta = await import("./strategies.js").then((m) => m.STRATEGY_CATALOG.find((s) => s.id === h.strategyId));
        reasons.push(`${meta?.name ?? h.strategyId}: ${h.side} (${h.conviction}%)`);
      }
    }
    if (snap.sentiment > 0.2) reasons.push(`Positive news sentiment (${(snap.sentiment * 100).toFixed(0)}%)`);
    else if (snap.sentiment < -0.2) risks.push(`Negative news sentiment (${(snap.sentiment * 100).toFixed(0)}%)`);

    if (rsiNow != null && rsiNow < 30) reasons.push(`Oversold RSI ${rsiNow.toFixed(0)}`);
    else if (rsiNow != null && rsiNow > 70) risks.push(`Overbought RSI ${rsiNow.toFixed(0)}`);

    if (macdNow != null && macdSig != null && macdNow > macdSig) reasons.push("MACD bullish crossover");
    else if (macdNow != null && macdSig != null && macdNow < macdSig) risks.push("MACD bearish crossover");

    if (e20 != null && e50 != null && e20 > e50) reasons.push("EMA 20 > 50 (uptrend)");
    else if (e20 != null && e50 != null && e20 < e50) risks.push("EMA 20 < 50 (downtrend)");

    // Compute targets
    const stopDist = a * 2;
    const stop = price - stopDist;
    const target = price + stopDist * 2;

    // Determine action
    let action: "BUY" | "SELL" | "HOLD" = "HOLD";
    const score = signal.score;
    if (score >= 60 && alert.direction === "below") action = "BUY";
    else if (score <= 40 && alert.direction === "above") action = "SELL";
    else if (strategyHits.some((h) => h.side === "BUY")) action = "BUY";
    else if (strategyHits.some((h) => h.side === "SELL")) action = "SELL";

    return {
      id: alert.yahoo,
      yahoo: alert.yahoo,
      symbol: stock.symbol,
      market: stock.market,
      currency: stock.currency,
      direction: alert.direction as "above" | "below",
      targetPrice: alert.price,
      currentPrice: price,
      note: alert.note ?? "",
      triggered: (alert.direction === "above" && price >= alert.price) || (alert.direction === "below" && price <= alert.price),
      analysis: {
        action,
        confidence: score,
        entry: price,
        stop: Number(stop.toFixed(2)),
        target: Number(target.toFixed(2)),
        reasons,
        risks,
        technicals,
        sentiment: snap.sentiment,
        strategyHits,
      },
    };
  } catch {
    return null;
  }
}
