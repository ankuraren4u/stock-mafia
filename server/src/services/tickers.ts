import { catalog, classifyMarket, findInCatalog, type Instrument, type Market } from "../lib/universe.js";
import { readStore, updateStore } from "../db/store.js";
import {
  bumpTickerHit,
  getTicker,
  searchTickerIndex,
  upsertTickers,
} from "../db/ticker-index.js";
import { fetchChart, fetchProfile, searchYahoo, yahooPaused } from "./market.js";

function fromSearchHit(hit: {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  sector?: string;
  quoteType?: string;
}): Instrument {
  const market = classifyMarket(hit.symbol, hit.exchDisp ?? "");
  return {
    symbol: hit.symbol.replace(/\.NS$|\.BO$/i, ""),
    yahoo: hit.symbol,
    name: hit.longname || hit.shortname || hit.symbol,
    sector: hit.sector || (hit.quoteType === "ETF" ? "ETF" : "—"),
    market,
    exchange: hit.exchDisp || (market === "IN" ? "NSE" : "US"),
    currency: market === "IN" ? "INR" : "USD",
  };
}

export function trackedInstruments(): Instrument[] {
  return readStore().tracked;
}

export function allKnown(): Instrument[] {
  const seen = new Set<string>();
  const out: Instrument[] = [];
  for (const item of [...searchTickerIndex("", 200), ...trackedInstruments(), ...catalog()]) {
    const key = item.yahoo.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function findKnown(query: string): Instrument | null {
  const indexed = getTicker(query);
  if (indexed) return indexed;
  const q = decodeURIComponent(query).trim().toUpperCase();
  const tracked = trackedInstruments();
  return (
    tracked.find((s) => s.yahoo.toUpperCase() === q) ??
    tracked.find((s) => s.symbol.toUpperCase() === q) ??
    findInCatalog(q)
  );
}

export async function resolveInstrument(query: string): Promise<Instrument> {
  const known = findKnown(query);
  if (known) return known;

  const raw = decodeURIComponent(query).trim();
  const hits = await searchYahoo(raw);
  const equity = hits.find(
    (h) => h.symbol.toUpperCase() === raw.toUpperCase() && ["EQUITY", "ETF"].includes(h.quoteType ?? "EQUITY"),
  ) ?? hits.find((h) => ["EQUITY", "ETF", "INDEX"].includes(h.quoteType ?? ""));

  if (equity) {
    const instrument = fromSearchHit(equity);
    try {
      const profile = await fetchProfile(instrument.yahoo);
      if (profile.name) instrument.name = profile.name;
      if (profile.sector) instrument.sector = profile.sector;
      if (profile.currency === "INR" || profile.currency === "USD") instrument.currency = profile.currency;
    } catch {
      /* keep search metadata */
    }
    return instrument;
  }

  const { meta } = await fetchChart(raw, "5d", "1d");
  const yahoo = String(meta.symbol ?? raw);
  const market: Market = classifyMarket(yahoo, String(meta.exchangeName ?? ""));
  return {
    symbol: yahoo.replace(/\.NS$|\.BO$/i, ""),
    yahoo,
    name: String(meta.shortName ?? meta.longName ?? yahoo),
    sector: "—",
    market,
    exchange: String(meta.fullExchangeName ?? meta.exchangeName ?? ""),
    currency: market === "IN" ? "INR" : "USD",
  };
}

function indexUniverse(): Instrument[] {
  return [
    ...INDICES.IN.map((i) => ({
      symbol: i.symbol,
      yahoo: i.yahoo,
      name: i.name,
      sector: "Index",
      market: "IN" as const,
      exchange: "NSE",
      currency: "INR" as const,
    })),
    ...INDICES.US.map((i) => ({
      symbol: i.symbol,
      yahoo: i.yahoo,
      name: i.name,
      sector: "Index",
      market: "US" as const,
      exchange: "US",
      currency: "USD" as const,
    })),
  ];
}

function rankSuggest(query: string, pool: Instrument[]): Instrument[] {
  const q = query.trim().toLowerCase();
  if (!q) return pool.slice(0, 8);
  const scored = pool
    .map((s) => {
      const symbol = s.symbol.toLowerCase();
      const yahoo = s.yahoo.toLowerCase();
      const name = s.name.toLowerCase();
      let score = -1;
      if (symbol === q || yahoo === q) score = 100;
      else if (symbol.startsWith(q) || yahoo.startsWith(q)) score = 90;
      else if (name.startsWith(q)) score = 80;
      else if (symbol.includes(q) || yahoo.includes(q)) score = 60;
      else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 50;
      else if (name.includes(q)) score = 35;
      return { s, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.s.symbol.localeCompare(b.s.symbol));
  return scored.map((x) => x.s);
}

export async function searchInstruments(query: string): Promise<Instrument[]> {
  const q = query.trim();
  if (!q) return [];
  const pool = [...allKnown(), ...indexUniverse()];
  const local = rankSuggest(q, pool);
  const seen = new Set(local.map((i) => i.yahoo.toUpperCase()));
  const out = [...local];

  if (!yahooPaused() && q.length >= 2) {
    try {
      const remote = await Promise.race([
        searchYahoo(q),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("suggest timeout")), 1800)),
      ]);
      for (const h of remote.filter((r) => ["EQUITY", "ETF", "INDEX"].includes(r.quoteType ?? "EQUITY"))) {
        const item = fromSearchHit(h);
        const key = item.yahoo.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    } catch {
      /* local suggestions are enough */
    }
  }
  return out.slice(0, 12);
}

export function trackInstrument(instrument: Instrument) {
  return updateStore((store) => {
    const i = store.tracked.findIndex((t) => t.yahoo.toUpperCase() === instrument.yahoo.toUpperCase());
    if (i >= 0) store.tracked[i] = instrument;
    else store.tracked.push(instrument);
    if (!store.watchlist.includes(instrument.yahoo)) store.watchlist.push(instrument.yahoo);
  });
}

export function untrack(yahoo: string) {
  const key = decodeURIComponent(yahoo).toUpperCase();
  return updateStore((store) => {
    store.tracked = store.tracked.filter((t) => t.yahoo.toUpperCase() !== key);
    store.watchlist = store.watchlist.filter((t) => t.toUpperCase() !== key);
  });
}
