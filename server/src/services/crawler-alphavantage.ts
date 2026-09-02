import type { Quote } from "./market.js";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

let alphaVantageKey = "";
try { alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY || ""; } catch {}

export function alphaVantageEnabled() {
  return Boolean(alphaVantageKey);
}

export async function fetchAlphaVantageQuote(yahoo: string, currency: string): Promise<Quote | null> {
  if (!alphaVantageKey) return null;
  const symbol = yahoo.replace(/\.NS$|\.BO$/i, "").toUpperCase();
  if (symbol.startsWith("^")) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(alphaVantageKey)}`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const json = (await res.json()) as { "Global Quote"?: Record<string, string> };
    const gq = json["Global Quote"];
    if (!gq || !gq["05. price"]) return null;
    const price = Number(gq["05. price"]);
    if (!price || !Number.isFinite(price)) return null;
    const change = Number(gq["09. change"] || 0);
    const changePct = Number((gq["10. change percent"] ?? "0").replace("%", ""));
    return {
      symbol: yahoo,
      yahoo,
      price,
      change,
      changePct,
      previousClose: Number(gq["08. previous close"]) || price - change,
      dayHigh: Number(gq["03. high"]) || null,
      dayLow: Number(gq["04. low"]) || null,
      volume: Number(gq["06. volume"]) || null,
      marketCap: Number(gq["market_cap"] ?? 0) || null,
      currency,
    };
  } catch {
    return null;
  }
}
