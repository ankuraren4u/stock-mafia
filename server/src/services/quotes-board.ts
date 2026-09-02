import type { Market } from "../lib/universe.js";
import { fetchQuoteFromChartDirect, fetchQuotes, peekQuote, rememberQuote, yahooPaused, type Quote } from "./market.js";
import { readSnapshot } from "./crawler.js";
import { fetchNseIndices, fetchNseQuote } from "./crawler-nse.js";
import { fetchFinnhubQuote } from "./crawler-finnhub.js";
import { fetchNasdaqQuote } from "./crawler-nasdaq.js";
import { fetchCnbcQuote } from "./crawler-cnbc.js";
import { fetchMarketWatchQuote } from "./crawler-marketwatch.js";
import { fetchAlphaVantageQuote, alphaVantageEnabled } from "./crawler-alphavantage.js";
import { fetchMoneycontrolQuote } from "./crawler-moneycontrol.js";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

async function mapPool(items: string[], limit: number, fn: (item: string) => Promise<void>) {
  if (!items.length) return;
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i];
      i += 1;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

function asQuote(yahoo: string, market: Market, partial: Partial<Quote>): Quote | null {
  if (!partial.price) return null;
  return {
    symbol: yahoo,
    yahoo,
    price: partial.price,
    change: partial.change ?? 0,
    changePct: partial.changePct ?? 0,
    previousClose: partial.previousClose ?? partial.price,
    dayHigh: partial.dayHigh ?? null,
    dayLow: partial.dayLow ?? null,
    volume: partial.volume ?? null,
    marketCap: partial.marketCap ?? null,
    currency: partial.currency ?? (market === "IN" ? "INR" : "USD"),
  };
}

function nseTicker(yahoo: string) {
  return yahoo.replace(/\.NS$|\.BO$/i, "");
}

export async function loadBoardQuotes(yahooSymbols: string[], market: Market) {
  const sources = new Set<string>();
  const got = new Map<string, Quote>();

  for (const yahoo of yahooSymbols) {
    const cached = peekQuote(yahoo, true);
    if (cached) {
      got.set(yahoo, cached);
      sources.add("Memory cache");
    }
    const snap = readSnapshot(yahoo);
    if (snap?.quote?.price && !got.has(yahoo)) {
      got.set(yahoo, { ...snap.quote, yahoo });
      sources.add("Local snapshot");
    }
  }

  const missing = () => yahooSymbols.filter((s) => !got.has(s));

  if (missing().length && !yahooPaused()) {
    const batch = await withTimeout(fetchQuotes(missing()), 5000, []);
    for (const q of batch) {
      if (q.price) {
        got.set(q.yahoo, q);
        sources.add("Yahoo Finance");
      }
    }
  }

  const fillers: Array<Promise<void>> = [
    mapPool(missing(), 5, async (yahoo) => {
      if (got.has(yahoo)) return;
      const q = await withTimeout(fetchCnbcQuote(yahoo, market === "IN" ? "INR" : "USD"), 4000, null);
      if (q) {
        got.set(yahoo, q);
        rememberQuote(q);
        sources.add("CNBC");
      }
    }),
    mapPool(
      missing().filter((s) => market === "US" && !s.startsWith("^")),
      5,
      async (yahoo) => {
        if (got.has(yahoo)) return;
        const q = await withTimeout(fetchNasdaqQuote(yahoo), 4000, null);
        if (q) {
          got.set(yahoo, q);
          rememberQuote(q);
          sources.add("Nasdaq");
        }
      },
    ),
    mapPool(missing(), 4, async (yahoo) => {
      if (got.has(yahoo)) return;
      const q = await withTimeout(fetchQuoteFromChartDirect(yahoo), 5000, null);
      if (q) {
        got.set(yahoo, q);
        sources.add("Yahoo chart");
      }
    }),
  ];

  if (market === "IN") {
    fillers.push(
      (async () => {
        const idx = await withTimeout(fetchNseIndices(), 5000, new Map());
        for (const [yahoo, partial] of idx) {
          const q = asQuote(yahoo, market, partial);
          if (q && yahooSymbols.includes(yahoo) && !got.has(yahoo)) {
            got.set(yahoo, q);
            rememberQuote(q);
            sources.add("NSE India");
          }
        }
      })(),
      mapPool(
        missing().filter((s) => s.endsWith(".NS")),
        3,
        async (yahoo) => {
          if (got.has(yahoo)) return;
          const nse = await withTimeout(fetchNseQuote(nseTicker(yahoo)), 4000, null);
          const q = nse ? asQuote(yahoo, market, nse) : null;
          if (q) {
            got.set(yahoo, q);
            rememberQuote(q);
            sources.add("NSE India");
          }
        },
      ),
      mapPool(
        missing().filter((s) => s.endsWith(".NS")),
        3,
        async (yahoo) => {
          if (got.has(yahoo)) return;
          const mc = await withTimeout(fetchMoneycontrolQuote(yahoo), 4000, null);
          if (mc) {
            got.set(yahoo, mc);
            rememberQuote(mc);
            sources.add("Moneycontrol");
          }
        },
      ),
    );
  }

  if (market === "US") {
    fillers.push(
      mapPool(
        missing().filter((s) => !s.startsWith("^")),
        4,
        async (yahoo) => {
          if (got.has(yahoo)) return;
          const fh = await withTimeout(fetchFinnhubQuote(yahoo), 3500, null);
          const q = fh ? asQuote(yahoo, market, fh) : null;
          if (q) {
            got.set(yahoo, q);
            rememberQuote(q);
            sources.add("Finnhub");
          }
        },
      ),
      mapPool(
        missing().filter((s) => !s.startsWith("^")),
        3,
        async (yahoo) => {
          if (got.has(yahoo)) return;
          const mw = await withTimeout(fetchMarketWatchQuote(yahoo, "USD"), 4000, null);
          if (mw) {
            got.set(yahoo, mw);
            rememberQuote(mw);
            sources.add("MarketWatch");
          }
        },
      ),
    );
  }

  if (alphaVantageEnabled()) {
    fillers.push(
      mapPool(
        missing().filter((s) => !s.startsWith("^")),
        2,
        async (yahoo) => {
          if (got.has(yahoo)) return;
          const av = await withTimeout(fetchAlphaVantageQuote(yahoo, market === "IN" ? "INR" : "USD"), 5000, null);
          if (av) {
            got.set(yahoo, av);
            rememberQuote(av);
            sources.add("Alpha Vantage");
          }
        },
      ),
    );
  }

  await withTimeout(Promise.all(fillers).then(() => undefined), 9000, undefined);

  const quotes = yahooSymbols.map((yahoo) => got.get(yahoo)).filter((q): q is Quote => Boolean(q?.price));
  return { quotes, sources: [...sources], yahooPaused: yahooPaused() };
}
