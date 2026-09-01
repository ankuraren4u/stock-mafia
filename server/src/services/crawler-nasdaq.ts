import type { Quote } from "./market.js";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

function num(raw: string | undefined) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[$,+%]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export async function fetchNasdaqQuote(yahoo: string): Promise<Quote | null> {
  if (yahoo.startsWith("^") || yahoo.includes(".")) return null;
  try {
    const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(yahoo)}/info?assetclass=stocks`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { primaryData?: { lastSalePrice?: string; netChange?: string; percentageChange?: string } };
    };
    const p = json.data?.primaryData;
    const price = num(p?.lastSalePrice);
    if (!price) return null;
    const change = num(p?.netChange) ?? 0;
    const changePct = num(p?.percentageChange) ?? 0;
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
      currency: "USD",
    };
  } catch {
    return null;
  }
}
