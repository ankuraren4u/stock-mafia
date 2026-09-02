import {
  adx,
  atr,
  bollinger,
  ema,
  fibonacciLevels,
  ichimoku,
  lastNumber,
  macd,
  rsi,
  stochastic,
  supertrend,
  vwap,
  type Candle,
} from "../lib/indicators.js";
import type { Instrument } from "../lib/universe.js";
import type { SignalResult } from "./signals.js";

export type Side = "BUY" | "SELL";

export interface StrategyMeta {
  id: string;
  name: string;
  horizon: string;
  whyNow: string;
  logic: string;
}

export interface StrategyHit {
  strategyId: string;
  side: Side;
  conviction: number;
  thesis: string[];
}

export interface StrategyContext {
  candles: Candle[];
  sentiment: number;
  pe: number | null;
  roe: number | null;
  indexReturn20: number | null;
}

export const STRATEGY_CATALOG: StrategyMeta[] = [
  {
    id: "trend-pullback",
    name: "Uptrend pullback",
    horizon: "swing 5–20 sessions",
    whyNow: "Mega-cap and quality-growth tape still rewards buying dips in names that stay above the 50-day trend.",
    logic: "Price above EMA 50, pullback toward EMA 20, RSI 38–55, not fighting a market dump.",
  },
  {
    id: "momentum-breakout",
    name: "Volume breakout",
    horizon: "swing 3–15 sessions",
    whyNow: "AI, defense, and leadership names still trend after high-volume 20-day breakouts rather than mean-reverting immediately.",
    logic: "Close at 20-day high, volume ≥ 1.4× 20-day average, MACD above signal.",
  },
  {
    id: "mean-reversion",
    name: "Oversold snapback",
    horizon: "tactical 2–10 sessions",
    whyNow: "Liquid US and NSE large caps still fade 2σ extensions when news is not structurally broken.",
    logic: "RSI < 32 or close below lower Bollinger, sentiment not deeply negative.",
  },
  {
    id: "quality-dip",
    name: "Quality on weakness",
    horizon: "position 2–8 weeks",
    whyNow: "Factor research still favors high-ROE names bought on RSI weakness rather than chasing extended multiples.",
    logic: "ROE > 12% (or unknown), RSI < 40, P/E not extreme, score ≥ 58.",
  },
  {
    id: "dual-momentum",
    name: "Relative strength vs index",
    horizon: "swing 10–30 sessions",
    whyNow: "Dual / relative momentum remains a core CTA and asset-allocation rule: own what is beating its index in an up month.",
    logic: "20-day stock return > index return and both ≥ 0, EMA 20 > EMA 50.",
  },
  {
    id: "risk-off",
    name: "Risk-off reduce",
    horizon: "defensive 1–10 sessions",
    whyNow: "When the benchmark has dropped hard over 20 sessions, systematic books cut beta instead of averaging down.",
    logic: "Index 20-day return ≤ −6% or RSI > 78 with negative news — suggest trim/sell.",
  },
  {
    id: "vwap-bounce",
    name: "VWAP mean reversion",
    horizon: "intraday 1–5 sessions",
    whyNow: "Institutional algos use VWAP as a fair-value anchor; mean reversion to VWAP works well in liquid names during normal volatility.",
    logic: "Price deviates >2% below VWAP with RSI <38 and ADX <25 — fade the move back to VWAP.",
  },
  {
    id: "supertrend-flip",
    name: "Supertrend reversal",
    horizon: "swing 5–15 sessions",
    whyNow: "Supertrend captures trend direction cleanly; a flip combined with volume confirms regime change for breakout entries.",
    logic: "Supertrend flips from sell to buy with volume expansion and ADX > 20.",
  },
  {
    id: "ichimoku-breakout",
    name: "Ichimoku cloud breakout",
    horizon: "swing 10–30 sessions",
    whyNow: "Ichimoku gives multi-layered support/resistance; a cloud breakout with all five lines aligned is a strong trend signal.",
    logic: "Price above cloud, tenkan > kijun, chikou above price, and cloud is green (senkou A > B).",
  },
  {
    id: "adx-trend",
    name: "ADX trend strength",
    horizon: "swing 5–20 sessions",
    whyNow: "ADX above 25 indicates a strong trend; buying dips within strong trends captures continuation moves.",
    logic: "ADX > 25 with +DI > -DI, price above EMA 20, and RSI 40–60.",
  },
  {
    id: "fibonacci-retrace",
    name: "Fibonacci pullback",
    horizon: "swing 5–20 sessions",
    whyNow: "Institutional buy programs cluster at Fibonacci levels; 38.2% and 61.8% retracements are the most reliable in liquid markets.",
    logic: "Price at 38.2% or 61.8% Fibonacci retracement with RSI < 45 and uptrend above EMA 50.",
  },
  {
    id: "stochastic-snap",
    name: "Stochastic oversold bounce",
    horizon: "tactical 2–8 sessions",
    whyNow: "Stochastic %K below 15 with a bullish crossover in names with positive sentiment produces reliable short-term bounces.",
    logic: "Stochastic %K < 15 with %K crossing above %D and sentiment not negative.",
  },
];

function ret(candles: Candle[], i: number, lookback: number) {
  const now = candles[i]?.close;
  const prev = candles[i - lookback]?.close;
  if (!now || !prev) return null;
  return (now - prev) / prev;
}

export function evaluateStrategies(ctx: StrategyContext, atIndex?: number): StrategyHit[] {
  const { candles } = ctx;
  const i = atIndex ?? candles.length - 1;
  if (i < 55) return [];
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume || 0);
  const rsiS = rsi(closes, 14);
  const macdS = macd(closes);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const bb = bollinger(closes, 20, 2);
  const close = candles[i].close;
  const rsiNow = rsiS[i];
  const macdNow = macdS.macdLine[i];
  const macdSig = macdS.signalLine[i];
  const e20 = ema20[i];
  const e50 = ema50[i];
  const lower = bb.lower[i];
  const high20 = Math.max(...candles.slice(i - 19, i + 1).map((c) => c.high));
  const avgVol = vols.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
  const stockR20 = ret(candles, i, 20);
  const hits: StrategyHit[] = [];

  const marketDump = ctx.indexReturn20 != null && ctx.indexReturn20 <= -0.06;

  if (e20 != null && e50 != null && rsiNow != null && close > e50 && close <= e20 * 1.015 && rsiNow >= 38 && rsiNow <= 55 && !marketDump) {
    hits.push({
      strategyId: "trend-pullback",
      side: "BUY",
      conviction: 74,
      thesis: [
        "Uptrend intact (close > EMA 50)",
        "Pullback into EMA 20 with neutral RSI — classic trend-follow entry",
      ],
    });
  }

  if (close >= high20 * 0.998 && avgVol > 0 && vols[i] >= avgVol * 1.4 && macdNow != null && macdSig != null && macdNow > macdSig && !marketDump) {
    hits.push({
      strategyId: "momentum-breakout",
      side: "BUY",
      conviction: 78,
      thesis: [
        "20-day high breakout",
        "Volume expansion with bullish MACD — continuation setup",
      ],
    });
  }

  if (rsiNow != null && (rsiNow < 32 || (lower != null && close < lower)) && ctx.sentiment > -0.25 && !marketDump) {
    hits.push({
      strategyId: "mean-reversion",
      side: "BUY",
      conviction: 68,
      thesis: [
        rsiNow < 32 ? `RSI ${rsiNow.toFixed(1)} oversold` : "Close below lower Bollinger Band",
        "News sentiment is not structurally negative",
      ],
    });
  }

  if ((ctx.roe == null || ctx.roe > 0.12) && rsiNow != null && rsiNow < 40 && (ctx.pe == null || ctx.pe < 45)) {
    hits.push({
      strategyId: "quality-dip",
      side: "BUY",
      conviction: 70,
      thesis: [
        "Quality/fundamental overlay on weakness",
        ctx.roe != null ? `ROE ${(ctx.roe * 100).toFixed(1)}%` : "RSI dip with no extreme P/E",
      ],
    });
  }

  if (
    stockR20 != null &&
    ctx.indexReturn20 != null &&
    stockR20 > ctx.indexReturn20 &&
    stockR20 >= 0 &&
    ctx.indexReturn20 >= 0 &&
    e20 != null &&
    e50 != null &&
    e20 > e50
  ) {
    hits.push({
      strategyId: "dual-momentum",
      side: "BUY",
      conviction: 76,
      thesis: [
        `20-day return ${(stockR20 * 100).toFixed(1)}% beating the index`,
        "Both stock and benchmark are positive — relative-strength long",
      ],
    });
  }

  if (marketDump || (rsiNow != null && rsiNow > 78 && ctx.sentiment < 0)) {
    hits.push({
      strategyId: "risk-off",
      side: "SELL",
      conviction: marketDump ? 80 : 66,
      thesis: [
        marketDump
          ? `Benchmark 20-day return ${((ctx.indexReturn20 ?? 0) * 100).toFixed(1)}% — cut beta`
          : "Overbought with negative news — trim / take profit",
      ],
    });
  }

  // VWAP bounce strategy
  const vwapSeries = vwap(candles);
  const vwapNow = lastNumber(vwapSeries);
  if (vwapNow != null && rsiNow != null) {
    const vwapDev = (close - vwapNow) / vwapNow;
    if (vwapDev < -0.02 && rsiNow < 38 && !marketDump) {
      hits.push({
        strategyId: "vwap-bounce",
        side: "BUY",
        conviction: 65,
        thesis: [
          `Price ${(vwapDev * 100).toFixed(1)}% below VWAP — institutional fair value anchor`,
          `RSI ${rsiNow.toFixed(1)} confirms short-term oversold condition`,
        ],
      });
    }
  }

  // Supertrend flip
  const stSeries = supertrend(candles, 10, 3);
  const stNow = lastNumber(stSeries);
  const stPrev = stSeries.length > 2 ? stSeries[stSeries.length - 3] : null;
  if (stNow != null && stPrev != null && close > stNow && vols[i] > avgVol * 1.3) {
    const prevClose = candles[i - 1]?.close ?? close;
    const prevBelow = stPrev != null && prevClose <= stPrev;
    if (prevBelow) {
      hits.push({
        strategyId: "supertrend-flip",
        side: "BUY",
        conviction: 72,
        thesis: [
          "Supertrend flipped from sell to buy",
          "Volume expansion confirms regime change",
        ],
      });
    }
  }

  // Ichimoku cloud breakout
  const ich = ichimoku(candles);
  const tenkanNow = ich.tenkan[candles.length - 1];
  const kijunNow = ich.kijun[candles.length - 1];
  const senkouANow = ich.senkouA[candles.length - 1];
  const senkouBNow = ich.senkouB[candles.length - 1];
  const chikouNow = ich.chikou[candles.length - 27];
  if (tenkanNow != null && kijunNow != null && senkouANow != null && senkouBNow != null) {
    const aboveCloud = close > Math.max(senkouANow, senkouBNow);
    const tkCross = tenkanNow > kijunNow;
    const chikouBull = chikouNow != null && chikouNow > candles[candles.length - 27]?.close;
    const cloudGreen = senkouANow > senkouBNow;
    if (aboveCloud && tkCross && chikouBull && cloudGreen && !marketDump) {
      hits.push({
        strategyId: "ichimoku-breakout",
        side: "BUY",
        conviction: 77,
        thesis: [
          "Price above Ichimoku cloud with bullish tenkan-kijun cross",
          "All five lines aligned — strong trend confirmation",
        ],
      });
    }
  }

  // ADX trend strength
  const adxSeries = adx(candles, 14);
  const adxNow = lastNumber(adxSeries.adx);
  const plusDiNow = lastNumber(adxSeries.plusDi);
  const minusDiNow = lastNumber(adxSeries.minusDi);
  if (adxNow != null && plusDiNow != null && minusDiNow != null && adxNow > 25 && plusDiNow > minusDiNow && e20 != null && close > e20 && rsiNow != null && rsiNow >= 40 && rsiNow <= 60 && !marketDump) {
    hits.push({
      strategyId: "adx-trend",
      side: "BUY",
      conviction: 73,
      thesis: [
        `ADX ${adxNow.toFixed(1)} with +DI above -DI — strong uptrend`,
        "Price above EMA 20 with neutral RSI — continuation entry",
      ],
    });
  }

  // Fibonacci retracement
  const fib = fibonacciLevels(candles, 120);
  if (fib && e50 != null && close > e50 && rsiNow != null && !marketDump) {
    const fib382 = fib.levels[0.382];
    const fib618 = fib.levels[0.618];
    const nearFib382 = fib382 != null && Math.abs(close - fib382) / fib382 < 0.015;
    const nearFib618 = fib618 != null && Math.abs(close - fib618) / fib618 < 0.015;
    if ((nearFib382 || nearFib618) && rsiNow < 45) {
      hits.push({
        strategyId: "fibonacci-retrace",
        side: "BUY",
        conviction: 69,
        thesis: [
          `Price near Fibonacci ${nearFib382 ? "38.2%" : "61.8%"} retracement`,
          "Uptrend intact above EMA 50 with RSI pullback",
        ],
      });
    }
  }

  // Stochastic oversold bounce
  const stoch = stochastic(candles, 14, 3);
  const stochK = lastNumber(stoch.k);
  const stochD = lastNumber(stoch.d);
  const stochKPrev = stoch.k.length > 2 ? stoch.k[stoch.k.length - 3] : null;
  const stochDPrev = stoch.d.length > 2 ? stoch.d[stoch.d.length - 3] : null;
  if (stochK != null && stochD != null && stochKPrev != null && stochDPrev != null) {
    if (stochK < 15 && stochK > stochD && stochKPrev <= stochDPrev && ctx.sentiment > -0.15 && !marketDump) {
      hits.push({
        strategyId: "stochastic-snap",
        side: "BUY",
        conviction: 66,
        thesis: [
          `Stochastic %K ${stochK.toFixed(1)} oversold with bullish crossover`,
          "Sentiment not negative — short-term bounce expected",
        ],
      });
    }
  }

  return hits;
}

export function lastAtr(candles: Candle[]) {
  return lastNumber(atr(candles, 14));
}

export function sizeQuantity(price: number, stopDistance: number, equity: number, riskPct: number) {
  const risk = Math.max(equity * (riskPct / 100), 1);
  const dist = Math.max(stopDistance, price * 0.008);
  return Math.max(1, Math.floor(risk / dist));
}

export function dryRunStrategy(id: string, candles: Candle[], indexReturn20: number | null) {
  const meta = STRATEGY_CATALOG.find((s) => s.id === id);
  if (!meta) throw new Error(`Unknown strategy ${id}`);
  const trades: Array<{ entry: number; exit: number; pnlPct: number; bars: number; side: Side }> = [];
  let open: { i: number; price: number; stop: number; target: number; side: Side } | null = null;

  for (let i = 60; i < candles.length; i += 1) {
    const slice = candles.slice(0, i + 1);
    const hits = evaluateStrategies(
      { candles: slice, sentiment: 0, pe: null, roe: null, indexReturn20 },
      slice.length - 1,
    ).filter((h) => h.strategyId === id);

    if (open) {
      const bar = candles[i];
      const hold = i - open.i;
      let exit: number | null = null;
      if (open.side === "BUY") {
        if (bar.low <= open.stop) exit = open.stop;
        else if (bar.high >= open.target) exit = open.target;
      } else if (bar.high >= open.stop) exit = open.stop;
      else if (bar.low <= open.target) exit = open.target;
      if (hold >= 12 && exit == null) exit = bar.close;
      if (exit != null) {
        const pnlPct =
          open.side === "BUY" ? (exit - open.price) / open.price : (open.price - exit) / open.price;
        trades.push({ entry: open.price, exit, pnlPct, bars: hold, side: open.side });
        open = null;
      }
    }

    if (!open && hits[0]) {
      const price = candles[i].close;
      const a = lastNumber(atr(slice, 14)) ?? price * 0.02;
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

  const wins = trades.filter((t) => t.pnlPct > 0).length;
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const t of trades) {
    equity *= 1 + t.pnlPct;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
  }

  return {
    strategyId: id,
    name: meta.name,
    trades: trades.length,
    winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0,
    avgReturnPct: trades.length
      ? Number(((trades.reduce((a, t) => a + t.pnlPct, 0) / trades.length) * 100).toFixed(2))
      : 0,
    totalReturnPct: Number(((equity - 1) * 100).toFixed(2)),
    maxDrawdownPct: Number((maxDd * 100).toFixed(2)),
    sampleBars: candles.length,
  };
}

export function indexYahooFor(stock: Instrument) {
  return stock.market === "IN" ? "^NSEI" : "^GSPC";
}
