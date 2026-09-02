import { Router } from "express";
import { INDIA_STOCKS, US_STOCKS, INDICES } from "../lib/universe.js";
import { fetchChart, fetchQuote, fetchFundamentals } from "../services/market.js";
import { scoreStockForScreener, applyScreenerFilters, type ScreenerFilter } from "../services/screener.js";
import { rsi, adx, ema, macd, vwap, lastNumber } from "../lib/indicators.js";
import { readSnapshot } from "../services/crawler.js";

export const screenerRouter = Router();

screenerRouter.post("/run", async (req, res) => {
  try {
    const filters: ScreenerFilter = req.body || {};
    const market = filters.market || "ALL";
    const stocks = market === "US" ? US_STOCKS : market === "IN" ? INDIA_STOCKS : [...INDIA_STOCKS, ...US_STOCKS];
    const results = [];

    for (const stock of stocks.slice(0, 40)) {
      try {
        const { candles } = await fetchChart(stock.yahoo, "6mo", "1d");
        if (!applyScreenerFilters(candles, filters)) continue;

        const closes = candles.map((c) => c.close);
        const rsiNow = lastNumber(rsi(closes, 14));
        const adxSeries = adx(candles, 14);
        const adxNow = lastNumber(adxSeries.adx);
        const ema20 = lastNumber(ema(closes, 20));
        const ema50 = lastNumber(ema(closes, 50));
        const macdSeries = macd(closes);
        const macdNow = lastNumber(macdSeries.macdLine);
        const macdSig = lastNumber(macdSeries.signalLine);
        const vwapSeries = vwap(candles);
        const vwapNow = lastNumber(vwapSeries);
        const close = closes[closes.length - 1];

        let fundamentals = { pe: null as number | null, roe: null as number | null, debtToEquity: null as number | null, dividendYield: null as number | null, marketCap: null as number | null };
        try { fundamentals = await fetchFundamentals(stock.yahoo); } catch {}

        const snap = readSnapshot(stock.yahoo);
        const sentiment = snap?.sentiment ?? 0;

        const { score, signals } = scoreStockForScreener({
          pe: fundamentals.pe,
          roe: fundamentals.roe,
          rsi: rsiNow,
          adx: adxNow,
          macdBullish: macdNow != null && macdSig != null && macdNow > macdSig,
          aboveEma20: ema20 != null && close > ema20,
          aboveEma50: ema50 != null && close > ema50,
          nearVwap: vwapNow != null && Math.abs(close - vwapNow) / vwapNow < 0.02,
          sentiment,
          debtToEquity: fundamentals.debtToEquity,
        });

        let quote = { price: close, changePct: 0, volume: candles[candles.length - 1]?.volume ?? 0 };
        try { const q = await fetchQuote(stock.yahoo); quote = { price: q.price, changePct: q.changePct, volume: q.volume ?? 0 }; } catch {}

        results.push({
          symbol: stock.symbol,
          yahoo: stock.yahoo,
          name: stock.name,
          sector: stock.sector || "",
          market: stock.market,
          price: quote.price,
          changePct: quote.changePct,
          volume: quote.volume,
          marketCap: fundamentals.marketCap,
          pe: fundamentals.pe,
          roe: fundamentals.roe,
          rsi: rsiNow,
          adx: adxNow,
          score,
          signals,
        });
      } catch {
        // skip failed tickers
      }
    }

    results.sort((a, b) => b.score - a.score);
    res.json({ results: results.slice(0, 30), filters, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "screener failed" });
  }
});

screenerRouter.get("/presets", (_req, res) => {
  res.json({
    presets: [
      { name: "Oversold Bounce", filters: { maxRSI: 35, adxStrong: false } },
      { name: "Strong Trend", filters: { minADX: 25, emaAbove: 20, macdBullish: true } },
      { name: "Value Plays", filters: { maxPE: 18, minROE: 0.12 } },
      { name: "Breakout Watch", filters: { macdBullish: true, nearVWAP: false, minVolume: 1000000 } },
      { name: "Income Stocks", filters: { minDividendYield: 0.03, maxDebtToEquity: 100 } },
    ],
  });
});

screenerRouter.get("/radar", async (req, res) => {
  try {
    const market = String(req.query.market ?? "ALL");
    const stocks = market === "US" ? US_STOCKS : market === "IN" ? INDIA_STOCKS : [...INDIA_STOCKS, ...US_STOCKS];
    const radar: Array<{
      symbol: string; yahoo: string; name: string; market: string; currency: string;
      price: number; changePct: number; volume: number | null;
      trend: "strong_up" | "up" | "neutral" | "down" | "strong_down";
      momentum: number; volatility: number; volumeSpike: number;
      signals: string[]; score: number; reason: string;
    }> = [];

    for (const stock of stocks.slice(0, 50)) {
      try {
        // Use crawl snapshot data instead of fetching from Yahoo
        const snap = readSnapshot(stock.yahoo);
        const candles = snap?.candles ?? [];
        if (candles.length < 30) continue;

        const closes = candles.map((c) => c.close);
        const vols = candles.map((c) => c.volume || 0);
        const close = closes[closes.length - 1];
        const close30 = closes[0];
        const ret30 = (close - close30) / close30;
        const rsiNow = lastNumber(rsi(closes, 14));
        const adxSeries = adx(candles, 14);
        const adxNow = lastNumber(adxSeries.adx);
        const ema20 = lastNumber(ema(closes, 20));
        const ema50 = lastNumber(ema(closes, 50));
        const macdSeries = macd(closes);
        const macdNow = lastNumber(macdSeries.macdLine);
        const macdSig = lastNumber(macdSeries.signalLine);
        const avgVol = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const lastVol = vols[vols.length - 1];
        const volSpike = avgVol > 0 ? lastVol / avgVol : 1;

        let trend: "strong_up" | "up" | "neutral" | "down" | "strong_down" = "neutral";
        if (ret30 > 0.15 && adxNow != null && adxNow > 25) trend = "strong_up";
        else if (ret30 > 0.05) trend = "up";
        else if (ret30 < -0.15 && adxNow != null && adxNow > 25) trend = "strong_down";
        else if (ret30 < -0.05) trend = "down";

        const signals: string[] = [];
        let score = 50;

        if (trend === "strong_up") { signals.push("Strong uptrend (30d > 15%)"); score += 20; }
        else if (trend === "up") { signals.push("Uptrend (30d > 5%)"); score += 10; }
        else if (trend === "strong_down") { signals.push("Strong downtrend (30d < -15%)"); score -= 20; }
        else if (trend === "down") { signals.push("Downtrend (30d < -5%)"); score -= 10; }

        if (adxNow != null && adxNow > 30) { signals.push(`Strong trend (ADX ${adxNow.toFixed(0)})`); score += 10; }
        if (volSpike > 2) { signals.push(`Volume surge (${volSpike.toFixed(1)}x avg)`); score += 8; }
        if (macdNow != null && macdSig != null && macdNow > macdSig) { signals.push("MACD bullish"); score += 5; }
        if (rsiNow != null && rsiNow > 70) { signals.push(`Overbought RSI ${rsiNow.toFixed(0)}`); score -= 5; }
        if (rsiNow != null && rsiNow < 30) { signals.push(`Oversold RSI ${rsiNow.toFixed(0)}`); score += 5; }
        if (ema20 != null && ema50 != null && ema20 > ema50) { signals.push("EMA 20 > 50"); score += 5; }

        const momentum = ret30 * 100;
        const volatility = adxNow ?? 20;
        let reason = "";
        if (trend === "strong_up") reason = "Breaking out with momentum — worth watching for continuation";
        else if (trend === "up") reason = "Steady uptrend — good for trend-following entries";
        else if (trend === "strong_down") reason = "Heavy selling — potential short or bounce play";
        else if (trend === "down") reason = "Weakening — watch for support levels";
        else reason = "Consolidating — wait for a breakout";

        const price = snap?.quote?.price ?? close;
        const changePct = snap?.quote?.changePct ?? ret30 * 100;

        radar.push({
          symbol: stock.symbol, yahoo: stock.yahoo, name: stock.name, market: stock.market, currency: stock.currency,
          price, changePct, volume: snap?.quote?.volume ?? lastVol,
          trend, momentum: Number(momentum.toFixed(1)), volatility: Number(volatility.toFixed(1)),
          volumeSpike: Number(volSpike.toFixed(1)), signals, score: Math.max(0, Math.min(100, score)), reason,
        });
      } catch {}
    }

    radar.sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum));
    res.json({ radar: radar.slice(0, 20), count: radar.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "radar failed" });
  }
});
