import type { Candle } from "../lib/indicators.js";
import { rsi, macd, ema, bollinger, atr, adx, obv, lastNumber } from "../lib/indicators.js";
import { INDIA_STOCKS, US_STOCKS, type Instrument } from "../lib/universe.js";
import { fetchChart, fetchQuote, fetchFundamentals } from "./market.js";

export interface TradeIdea {
  symbol: string;
  yahoo: string;
  name: string;
  market: string;
  price: number;
  changePct: number;
  type: "breakout" | "breakdown" | "volume_spike" | "reversal" | "trend_continuation" | "accumulation" | "divergence" | "volatility_squeeze";
  conviction: number;
  direction: "bullish" | "bearish" | "neutral";
  thesis: string[];
  technicals: {
    rsi: number | null;
    adx: number | null;
    volumeRatio: number;
    atrPct: number;
  };
  catalyst: string;
}

function detectPattern(candles: Candle[]): TradeIdea["type"] | null {
  if (candles.length < 30) return null;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume || 0);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVol = volumes[volumes.length - 1];
  const volRatio = avgVol20 > 0 ? currentVol / avgVol20 : 1;

  const rsiVal = lastNumber(rsi(closes, 14));
  const bb = bollinger(closes, 20, 2);
  const upper = lastNumber(bb.upper);
  const lower = lastNumber(bb.lower);
  const ema50 = lastNumber(ema(closes, 50));

  const high20 = Math.max(...closes.slice(-20));
  const low20 = Math.min(...closes.slice(-20));
  const range20 = high20 - low20;
  const bbWidth = upper != null && lower != null ? (upper - lower) / ((upper + lower) / 2) : 0.1;
  const recentBbWidths = [];
  for (let i = Math.max(0, closes.length - 50); i < closes.length - 5; i++) {
    if (bb.upper?.[i] != null && bb.lower?.[i] != null) {
      recentBbWidths.push((bb.upper[i]! - bb.lower[i]!) / ((bb.upper[i]! + bb.lower[i]!) / 2));
    }
  }
  const avgBbWidth = recentBbWidths.length > 0 ? recentBbWidths.reduce((a, b) => a + b, 0) / recentBbWidths.length : 0.1;

  if (last > high20 * 0.998 && volRatio > 1.5) return "breakout";
  if (last < low20 * 1.002 && volRatio > 1.3) return "breakdown";
  if (volRatio > 3) return "volume_spike";
  if (rsiVal != null && rsiVal < 30 && last > prev) return "reversal";
  if (ema50 != null && last > ema50 && rsiVal != null && rsiVal > 40 && rsiVal < 60) return "trend_continuation";
  if (bbWidth < avgBbWidth * 0.6 && volRatio > 0.8) return "volatility_squeeze";

  const obvSeries = obv(candles);
  const obvNow = lastNumber(obvSeries);
  const obvPrev = obvSeries.length > 10 ? obvSeries[obvSeries.length - 10] : null;
  if (obvNow != null && obvPrev != null && obvNow > obvPrev * 1.05 && last < high20 * 0.97) return "accumulation";

  return null;
}

export async function scanTradeIdeas(market: "IN" | "US" | "ALL" = "ALL"): Promise<TradeIdea[]> {
  const stocks: Instrument[] = market === "US" ? US_STOCKS : market === "IN" ? INDIA_STOCKS : [...INDIA_STOCKS, ...US_STOCKS];
  const ideas: TradeIdea[] = [];

  for (const stock of stocks) {
    try {
      const { candles } = await fetchChart(stock.yahoo, "6mo", "1d");
      if (candles.length < 30) continue;

      const pattern = detectPattern(candles);
      if (!pattern) continue;

      const closes = candles.map((c) => c.close);
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      const rsiVal = lastNumber(rsi(closes, 14));
      const adxSeries = adx(candles, 14);
      const adxVal = lastNumber(adxSeries.adx);
      const volumes = candles.map((c) => c.volume || 0);
      const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const volRatio = avgVol20 > 0 ? volumes[volumes.length - 1] / avgVol20 : 1;
      const atrVal = lastNumber(atr(candles, 14));
      const atrPct = atrVal != null ? (atrVal / last) * 100 : 0;

      let direction: TradeIdea["direction"] = "neutral";
      let conviction = 55;
      const thesis: string[] = [];

      switch (pattern) {
        case "breakout":
          direction = "bullish";
          conviction = 72;
          thesis.push("Price breaking 20-day high on volume expansion");
          if (adxVal != null && adxVal > 20) thesis.push(`ADX ${adxVal.toFixed(0)} confirms trend`);
          break;
        case "breakdown":
          direction = "bearish";
          conviction = 68;
          thesis.push("Price breaking below 20-day low on elevated volume");
          break;
        case "volume_spike":
          direction = last > prev ? "bullish" : "bearish";
          conviction = 65;
          thesis.push(`Volume ${volRatio.toFixed(1)}x average — institutional interest`);
          break;
        case "reversal":
          direction = "bullish";
          conviction = 62;
          thesis.push(`RSI ${rsiVal?.toFixed(0)} oversold with price stabilizing`);
          break;
        case "trend_continuation":
          direction = "bullish";
          conviction = 60;
          thesis.push("Price maintaining trend above EMA 50 with neutral RSI");
          break;
        case "volatility_squeeze":
          direction = "neutral";
          conviction = 58;
          thesis.push("Bollinger Bands compressing — breakout imminent");
          break;
        case "accumulation":
          direction = "bullish";
          conviction = 64;
          thesis.push("OBV rising while price consolidates — smart money accumulating");
          break;
      }

      const changePct = ((last - prev) / prev) * 100;

      ideas.push({
        symbol: stock.symbol,
        yahoo: stock.yahoo,
        name: stock.name,
        market: stock.market,
        price: last,
        changePct: Number(changePct.toFixed(2)),
        type: pattern,
        conviction,
        direction,
        thesis,
        technicals: {
          rsi: rsiVal,
          adx: adxVal,
          volumeRatio: Number(volRatio.toFixed(2)),
          atrPct: Number(atrPct.toFixed(2)),
        },
        catalyst: pattern === "volume_spike" ? "Unusual volume" : pattern === "breakout" ? "Technical breakout" : "Pattern detected",
      });
    } catch {}
  }

  return ideas.sort((a, b) => b.conviction - a.conviction).slice(0, 25);
}
