import { readStore } from "../db/store.js";
import { readSnapshot } from "./crawler.js";
import { evaluateStrategies, STRATEGY_CATALOG, type StrategyHit } from "./strategies.js";
import { generateSignal } from "./signals.js";
import { averageSentiment } from "./news.js";
import { fetchInsiderActivity, type InsiderAnalysis } from "./insider.js";
import { lastNumber, rsi, ema, macd, atr, type Candle } from "../lib/indicators.js";
import { fetchQuote } from "./market.js";
import { resolveInstrument } from "./tickers.js";

export interface StockSuggestion {
  symbol: string;
  yahoo: string;
  name: string;
  market: "IN" | "US";
  currency: string;
  price: number;
  changePct: number;
  action: "BUY" | "SELL" | "HOLD";
  conviction: number;
  sources: string[];
  reasoning: string[];
  technicalScore: number;
  sentimentScore: number;
  insiderScore: number;
  compositeScore: number;
  strategyHits: StrategyHit[];
  risks: string[];
  targets: { entry: number; stop: number; target: number; rewardRisk: number };
  timestamp: number;
}

function technicalScore(candles: Candle[], price: number): number {
  const closes = candles.map((c) => c.close);
  const rsiNow = lastNumber(rsi(closes, 14));
  const macdS = macd(closes);
  const macdNow = lastNumber(macdS.macdLine);
  const macdSig = lastNumber(macdS.signalLine);
  const e20 = lastNumber(ema(closes, 20));
  const e50 = lastNumber(ema(closes, 50));
  const a = lastNumber(atr(candles, 14)) ?? price * 0.02;

  let score = 50;
  if (rsiNow != null) {
    if (rsiNow < 30) score += 15;
    else if (rsiNow < 40) score += 8;
    else if (rsiNow > 70) score -= 15;
    else if (rsiNow > 60) score -= 5;
  }
  if (macdNow != null && macdSig != null) {
    if (macdNow > macdSig) score += 10;
    else score -= 10;
  }
  if (e20 != null && e50 != null) {
    if (price > e20 && e20 > e50) score += 12;
    else if (price < e20 && e20 < e50) score -= 12;
  }
  return Math.max(0, Math.min(100, score));
}

export async function generateWatchlistSuggestions(): Promise<StockSuggestion[]> {
  const store = readStore();
  const watchlist = store.watchlist.length ? store.watchlist : [];
  const suggestions: StockSuggestion[] = [];

  for (const yahoo of watchlist.slice(0, 20)) {
    try {
      const stock = await resolveInstrument(yahoo);
      const snap = readSnapshot(yahoo);
      if (!snap || !snap.quote || !snap.candles.length) continue;

      const price = snap.quote.price;
      const closes = snap.candles.map((c) => c.close);
      const signal = generateSignal({
        candles: snap.candles,
        sentiment: snap.sentiment,
        pe: typeof snap.fundamentals.pe === "number" ? snap.fundamentals.pe : null,
        roe: typeof snap.fundamentals.roe === "number" ? snap.fundamentals.roe : null,
        debtToEquity: typeof snap.fundamentals.debtToEquity === "number" ? snap.fundamentals.debtToEquity : null,
        news: snap.news,
      });

      const indexReturn20 = null;
      const hits = evaluateStrategies({ candles: snap.candles, sentiment: snap.sentiment, pe: typeof snap.fundamentals.pe === "number" ? snap.fundamentals.pe : null, roe: typeof snap.fundamentals.roe === "number" ? snap.fundamentals.roe : null, indexReturn20 });

      const tScore = technicalScore(snap.candles, price);
      const sScore = Math.round((snap.sentiment + 1) * 50);
      const reasoning: string[] = [];
      const sources: string[] = [];
      const risks: string[] = [];

      if (signal.action.includes("BUY")) {
        reasoning.push(`Signal engine: ${signal.action} (score ${signal.score})`);
      }
      if (hits.length) {
        for (const h of hits) {
          const meta = STRATEGY_CATALOG.find((s) => s.id === h.strategyId);
          reasoning.push(`${meta?.name ?? h.strategyId}: ${h.side} (${h.conviction}% conviction)`);
          for (const t of h.thesis) reasoning.push(`  → ${t}`);
        }
      }
      if (snap.sentiment > 0.2) {
        reasoning.push(`Positive news sentiment (${(snap.sentiment * 100).toFixed(0)}%)`);
      } else if (snap.sentiment < -0.2) {
        reasoning.push(`Negative news sentiment (${(snap.sentiment * 100).toFixed(0)}%)`);
        risks.push("News sentiment is negative");
      }

      const insider = await fetchInsiderActivity(stock.symbol).catch(() => null);
      let insiderScore = 50;
      if (insider && insider.trades.length) {
        sources.push("SEC insider filings");
        if (insider.clusterSignal === "strong_buy" || insider.clusterSignal === "buy") {
          insiderScore = 80;
          reasoning.push(`Insider buying: ${insider.recentBuys} recent purchases, cluster signal: ${insider.clusterSignal}`);
        } else if (insider.clusterSignal === "strong_sell" || insider.clusterSignal === "sell") {
          insiderScore = 20;
          reasoning.push(`Insider selling: ${insider.recentSells} recent sales, cluster signal: ${insider.clusterSignal}`);
          risks.push("Insider selling detected");
        }
      }

      if (snap.news.length) sources.push(`${snap.news.length} news articles`);
      if (snap.sources.prices.length) sources.push(`Prices: ${snap.sources.prices.join(", ")}`);
      if (snap.sources.fundamentals.length) sources.push(`Fundamentals: ${snap.sources.fundamentals.join(", ")}`);

      const pe = typeof snap.fundamentals.pe === "number" ? snap.fundamentals.pe : null;
      if (pe && pe > 40) {
        risks.push(`High P/E ratio (${pe.toFixed(1)})`);
      }
      if (pe && pe < 0) {
        risks.push("Negative earnings (P/E < 0)");
      }

      const a = lastNumber(atr(snap.candles, 14)) ?? price * 0.02;
      const stopDist = a * 2;
      const stop = price - stopDist;
      const target = price + stopDist * 2;

      const compositeScore = Math.round(tScore * 0.35 + sScore * 0.25 + insiderScore * 0.15 + signal.score * 0.25);

      let action: "BUY" | "SELL" | "HOLD" = "HOLD";
      if (compositeScore >= 65 && hits.some((h) => h.side === "BUY")) action = "BUY";
      else if (compositeScore <= 35 || hits.some((h) => h.side === "SELL")) action = "SELL";

      if (action !== "HOLD") {
        suggestions.push({
          symbol: stock.symbol,
          yahoo: stock.yahoo,
          name: stock.name,
          market: stock.market,
          currency: stock.currency,
          price,
          changePct: snap.quote.changePct,
          action,
          conviction: compositeScore,
          sources,
          reasoning,
          technicalScore: tScore,
          sentimentScore: sScore,
          insiderScore,
          compositeScore,
          strategyHits: hits,
          risks,
          targets: { entry: Number(price.toFixed(2)), stop: Number(stop.toFixed(2)), target: Number(target.toFixed(2)), rewardRisk: 2 },
          timestamp: Date.now(),
        });
      }
    } catch {}
  }

  return suggestions.sort((a, b) => b.compositeScore - a.compositeScore);
}
