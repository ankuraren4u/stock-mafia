import type { ChartPayload, Quote } from "./market.js";

const UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Accept: "text/csv,text/plain,*/*",
};

function stooqSymbol(yahoo: string, market: "IN" | "US") {
  const index: Record<string, string> = {
    "^GSPC": "^spx",
    "^DJI": "^dji",
    "^IXIC": "^ndq",
    "^VIX": "^vix",
    "^NSEI": "^nse",
    "^BSESN": "^sensex",
    "^NSEBANK": "^nsebank",
  };
  const mapped = index[yahoo.toUpperCase()];
  if (mapped) return mapped;
  if (yahoo.startsWith("^")) return yahoo.toLowerCase();
  if (market === "US") return `${yahoo.replace("-", ".")}.us`.toLowerCase();
  const base = yahoo.replace(/\.NS$|\.BO$/i, "");
  return `${base}.in`.toLowerCase();
}

export async function fetchStooqChart(yahoo: string, market: "IN" | "US"): Promise<ChartPayload | null> {
  const s = stooqSymbol(yahoo, market);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes("Date")) return null;
    const lines = text.trim().split("\n").slice(1);
    const candles = lines
      .map((line) => {
        const [date, open, high, low, close, volume] = line.split(",");
        const t = Date.parse(date);
        return {
          time: t,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume || 0),
        };
      })
      .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.time));
    if (candles.length < 2) return null;
    return { candles, meta: { source: "stooq", symbol: s } };
  } catch {
    return null;
  }
}

export function quoteFromCandles(yahoo: string, candles: ChartPayload["candles"], currency: string): Quote {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const change = last.close - prev.close;
  return {
    symbol: yahoo,
    yahoo,
    price: last.close,
    change,
    changePct: prev.close ? (change / prev.close) * 100 : 0,
    previousClose: prev.close,
    dayHigh: last.high,
    dayLow: last.low,
    volume: last.volume,
    marketCap: null,
    currency,
  };
}

export async function fetchStooqQuote(yahoo: string, market: "IN" | "US", currency: string): Promise<Quote | null> {
  const chart = await fetchStooqChart(yahoo, market);
  if (!chart?.candles.length) return null;
  return quoteFromCandles(yahoo, chart.candles, currency);
}
