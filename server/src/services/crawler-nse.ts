import type { Quote } from "./market.js";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  Referer: "https://www.nseindia.com/",
};

let nseCookie = "";
let nseAt = 0;

async function nseSession() {
  if (nseCookie && Date.now() - nseAt < 10 * 60_000) return;
  const res = await fetch("https://www.nseindia.com/market-data/live-equity-market", { headers: UA });
  const parts = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  nseCookie = parts.map((c) => c.split(";")[0]).join("; ");
  nseAt = Date.now();
}

export async function fetchNseIndices(): Promise<Map<string, Partial<Quote>>> {
  const out = new Map<string, Partial<Quote>>();
  try {
    await nseSession();
    const res = await fetch("https://www.nseindia.com/api/allIndices", { headers: { ...UA, Cookie: nseCookie } });
    if (!res.ok) return out;
    const json = (await res.json()) as {
      data?: Array<{ index?: string; last?: number; variation?: number; percentChange?: number; previousClose?: number }>;
    };
    for (const row of json.data ?? []) {
      const name = String(row.index ?? "").toUpperCase();
      let yahoo: string | null = null;
      if (name === "NIFTY 50" || (name.includes("NIFTY 50") && !name.includes("NEXT") && !name.includes("FUT"))) {
        yahoo = "^NSEI";
      } else if (name === "NIFTY BANK" || name.includes("NIFTY BANK")) {
        yahoo = "^NSEBANK";
      }
      if (!yahoo || !row.last) continue;
      out.set(yahoo, {
        price: row.last,
        change: row.variation ?? 0,
        changePct: row.percentChange ?? 0,
        previousClose: row.previousClose ?? row.last,
        currency: "INR",
      });
    }
  } catch {
    /* ignore */
  }
  return out;
}

export async function fetchNseQuote(symbol: string): Promise<Partial<Quote> | null> {
  try {
    await nseSession();
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
    const res = await fetch(url, { headers: { ...UA, Cookie: nseCookie } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      priceInfo?: {
        lastPrice?: number;
        change?: number;
        pChange?: number;
        previousClose?: number;
        intraDayHighLow?: { min?: number; max?: number };
      };
    };
    const p = json.priceInfo;
    if (!p?.lastPrice) return null;
    return {
      symbol,
      price: p.lastPrice,
      change: p.change ?? 0,
      changePct: p.pChange ?? 0,
      previousClose: p.previousClose ?? p.lastPrice,
      dayHigh: p.intraDayHighLow?.max ?? null,
      dayLow: p.intraDayHighLow?.min ?? null,
      currency: "INR",
    };
  } catch {
    return null;
  }
}
