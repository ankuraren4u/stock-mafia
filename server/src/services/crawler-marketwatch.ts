import type { Quote } from "./market.js";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function toMwSymbol(yahoo: string): string | null {
  const y = yahoo.toUpperCase().replace(".NS", "").replace(".BO", "");
  return y.startsWith("^") ? null : y;
}

export async function fetchMarketWatchQuote(yahoo: string, currency: string): Promise<Quote | null> {
  const symbol = toMwSymbol(yahoo);
  if (!symbol) return null;
  try {
    const url = `https://www.marketwatch.com/investing/stock/${encodeURIComponent(symbol.toLowerCase())}`;
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    if (!res.ok) return null;
    const html = await res.text();
    const priceMatch = html.match(/class="intraday__price[^"]*"[^>]*>\s*<bg-quote[^>]*>([^<]+)/);
    const price = priceMatch ? Number(priceMatch[1].replace(/,/g, "").trim()) : 0;
    if (!price || !Number.isFinite(price)) return null;
    const changeMatch = html.match(/class="change--point[^"]*"[^>]*>([^<]+)/);
    const change = changeMatch ? Number(changeMatch[1].replace(/,/g, "").trim()) : 0;
    const pctMatch = html.match(/class="change--percent[^"]*"[^>]*>([^<]+)/);
    const changePct = pctMatch ? Number(pctMatch[1].replace(/[%+]/g, "").trim()) : 0;
    return {
      symbol: yahoo,
      yahoo,
      price,
      change,
      changePct,
      previousClose: price - change,
      dayHigh: null,
      dayLow: null,
      volume: null,
      marketCap: null,
      currency,
    };
  } catch {
    return null;
  }
}
