import type { Quote } from "./market.js";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

function nseSymbol(yahoo: string) {
  return yahoo.replace(/\.NS$|\.BO$/i, "").toUpperCase();
}

export async function fetchMoneycontrolQuote(yahoo: string): Promise<Quote | null> {
  if (!yahoo.endsWith(".NS")) return null;
  const symbol = nseSymbol(yahoo);
  try {
    const url = `https://priceapi.moneycontrol.com/pricefeed/nse/equitycash/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { lastPrice: number; change: number; pChange: number; high: number; low: number; volume: number; prevClose: number } };
    const d = json?.data;
    if (!d?.lastPrice) return null;
    return {
      symbol: yahoo,
      yahoo,
      price: d.lastPrice,
      change: d.change,
      changePct: d.pChange,
      previousClose: d.prevClose,
      dayHigh: d.high || null,
      dayLow: d.low || null,
      volume: d.volume || null,
      marketCap: null,
      currency: "INR",
    };
  } catch {
    return null;
  }
}
