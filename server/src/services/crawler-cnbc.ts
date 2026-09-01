import type { Quote } from "./market.js";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

const CNBC_SYMBOL: Record<string, string> = {
  "^GSPC": ".SPX",
  "^DJI": ".DJI",
  "^IXIC": ".IXIC",
  "^VIX": ".VIX",
  "^NSEI": ".NSEI",
  "^NSEBANK": ".NSEBANK",
};

function toQuote(yahoo: string, row: Record<string, string>, currency: string): Quote | null {
  const price = Number(row.last);
  if (!Number.isFinite(price) || !price) return null;
  const change = Number(row.change || 0);
  const changePct = Number(row.change_pct || 0);
  return {
    symbol: yahoo,
    yahoo,
    price,
    change,
    changePct,
    previousClose: price - change,
    dayHigh: Number(row.high) || null,
    dayLow: Number(row.low) || null,
    volume: Number(row.volume) || null,
    marketCap: null,
    currency,
  };
}

export async function fetchCnbcQuote(yahoo: string, currency: string): Promise<Quote | null> {
  const symbol = CNBC_SYMBOL[yahoo.toUpperCase()] ?? (yahoo.startsWith("^") ? null : yahoo.replace(".NS", "-IN"));
  if (!symbol) return null;
  try {
    const url = `https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=${encodeURIComponent(
      symbol,
    )}&requestMethod=quick&partnerId=2&output=json`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const json = (await res.json()) as { QuickQuoteResult?: { QuickQuote?: Record<string, string> | Array<Record<string, string>> } };
    let row = json.QuickQuoteResult?.QuickQuote;
    if (Array.isArray(row)) row = row[0];
    if (!row || row.code === "1") return null;
    return toQuote(yahoo, row, currency);
  } catch {
    return null;
  }
}
