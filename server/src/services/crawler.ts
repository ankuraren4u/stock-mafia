import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cron from "node-cron";
import type { Instrument } from "../lib/universe.js";
import { catalog } from "../lib/universe.js";
import { readStore } from "../db/store.js";
import { resolveInstrument } from "./tickers.js";
import {
  fetchChart,
  fetchFundamentals,
  fetchProfile,
  fetchQuote,
  yahooPaused,
  type ChartPayload,
  type Quote,
} from "./market.js";
import { averageSentiment, crawlNews, type NewsItem } from "./news.js";
import { fetchStooqChart, quoteFromCandles } from "./crawler-stooq.js";
import { fetchNseQuote } from "./crawler-nse.js";
import {
  fetchFinnhubMetrics,
  fetchFinnhubNews,
  fetchFinnhubQuote,
  finnhubEnabled,
} from "./crawler-finnhub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const crawlDir = path.resolve(__dirname, "../../data/crawl");
const logPath = path.resolve(__dirname, "../../data/crawler-log.json");

export interface CrawlSnapshot {
  yahoo: string;
  symbol: string;
  market: "IN" | "US";
  crawledAt: number;
  sources: { prices: string[]; news: string[]; fundamentals: string[]; other: string[] };
  quote: Quote | null;
  candles: ChartPayload["candles"];
  fundamentals: Record<string, number | string | null>;
  profile: Record<string, string | null>;
  news: NewsItem[];
  sentiment: number;
  errors: string[];
}

interface CrawlerLog {
  lastRun: number | null;
  running: boolean;
  lastError: string | null;
  snapshots: number;
  recent: Array<{ time: number; yahoo: string; ok: boolean; sources: string[] }>;
}

function ensureDir() {
  if (!fs.existsSync(crawlDir)) fs.mkdirSync(crawlDir, { recursive: true });
}

function fileFor(yahoo: string) {
  ensureDir();
  return path.join(crawlDir, `${yahoo.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
}

export function readSnapshot(yahoo: string): CrawlSnapshot | null {
  const p = fileFor(yahoo);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CrawlSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshot(snap: CrawlSnapshot) {
  fs.writeFileSync(fileFor(snap.yahoo), JSON.stringify(snap, null, 2));
}

export function crawlerStatus(): CrawlerLog & { finnhub: boolean; symbols: string[] } {
  ensureDir();
  const files = fs.readdirSync(crawlDir).filter((f) => f.endsWith(".json"));
  let log: CrawlerLog = { lastRun: null, running: false, lastError: null, snapshots: files.length, recent: [] };
  if (fs.existsSync(logPath)) {
    try {
      log = { ...log, ...(JSON.parse(fs.readFileSync(logPath, "utf8")) as CrawlerLog) };
    } catch {
      /* ignore */
    }
  }
  log.snapshots = files.length;
  return { ...log, finnhub: finnhubEnabled(), symbols: files.map((f) => f.replace(/\.json$/, "")) };
}

function writeLog(patch: Partial<CrawlerLog>) {
  const cur = crawlerStatus();
  const next: CrawlerLog = {
    lastRun: patch.lastRun ?? cur.lastRun,
    running: patch.running ?? cur.running,
    lastError: patch.lastError === undefined ? cur.lastError : patch.lastError,
    snapshots: cur.snapshots,
    recent: patch.recent ?? cur.recent,
  };
  fs.writeFileSync(logPath, JSON.stringify(next, null, 2));
}

export async function crawlSymbol(query: string): Promise<CrawlSnapshot> {
  const stock = await resolveInstrument(query);
  const errors: string[] = [];
  const sources = { prices: [] as string[], news: [] as string[], fundamentals: [] as string[], other: [] as string[] };

  let candles: ChartPayload["candles"] = [];
  let quote: Quote | null = null;

  if (!yahooPaused()) {
    try {
      const chart = await fetchChart(stock.yahoo, "1y", "1d", "bg");
      candles = chart.candles;
      if (candles.length) sources.prices.push("Yahoo Finance");
    } catch (err) {
      errors.push(`yahoo-chart: ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  if (candles.length < 20) {
    const stooq = await fetchStooqChart(stock.yahoo, stock.market);
    if (stooq?.candles.length) {
      candles = stooq.candles;
      sources.prices.push("Stooq");
    }
  }

  try {
    quote = await fetchQuote(stock.yahoo);
    if (!sources.prices.includes("Yahoo Finance")) sources.prices.push("Yahoo Finance");
  } catch (err) {
    errors.push(`yahoo-quote: ${err instanceof Error ? err.message : "fail"}`);
  }

  if (stock.market === "IN") {
    const nse = await fetchNseQuote(stock.symbol);
    if (nse?.price && quote) {
      quote = { ...quote, ...nse, yahoo: stock.yahoo, currency: "INR" };
      sources.prices.push("NSE India");
    } else if (nse?.price) {
      quote = {
        symbol: stock.symbol,
        yahoo: stock.yahoo,
        price: nse.price,
        change: nse.change ?? 0,
        changePct: nse.changePct ?? 0,
        previousClose: nse.previousClose ?? nse.price,
        dayHigh: nse.dayHigh ?? null,
        dayLow: nse.dayLow ?? null,
        volume: null,
        marketCap: null,
        currency: "INR",
      };
      sources.prices.push("NSE India");
    }
  }

  if (stock.market === "US") {
    const fh = await fetchFinnhubQuote(stock.symbol);
    if (fh?.price) {
      quote = {
        symbol: stock.symbol,
        yahoo: stock.yahoo,
        price: fh.price,
        change: fh.change,
        changePct: fh.changePct,
        previousClose: fh.previousClose,
        dayHigh: fh.dayHigh,
        dayLow: fh.dayLow,
        volume: quote?.volume ?? null,
        marketCap: quote?.marketCap ?? null,
        currency: "USD",
      };
      sources.prices.push("Finnhub");
    }
  }

  if (!quote && candles.length) {
    quote = quoteFromCandles(stock.yahoo, candles, stock.currency);
    if (!sources.prices.length) sources.prices.push("OHLC fallback");
  }

  let fundamentals: Record<string, number | string | null> = {};
  try {
    fundamentals = await fetchFundamentals(stock.yahoo);
    sources.fundamentals.push("Yahoo quoteSummary");
  } catch (err) {
    errors.push(`yahoo-fund: ${err instanceof Error ? err.message : "fail"}`);
  }

  const fhMetrics = stock.market === "US" ? await fetchFinnhubMetrics(stock.symbol) : null;
  if (fhMetrics) {
    fundamentals = { ...fundamentals, ...Object.fromEntries(Object.entries(fhMetrics).filter(([, v]) => v != null)) };
    sources.fundamentals.push("Finnhub metrics");
  }

  let profile: Record<string, string | null> = {};
  try {
    profile = await fetchProfile(stock.yahoo);
    sources.other.push("Yahoo profile");
  } catch {
    profile = {};
  }

  const newsPack = await crawlNews({
    query: stock.name,
    yahoo: stock.yahoo,
    symbol: stock.symbol,
    market: stock.market,
  });
  let news = newsPack.items;
  sources.news.push(...newsPack.sources);

  if (stock.market === "US") {
    const extra = await fetchFinnhubNews(stock.symbol);
    for (const n of extra) {
      if (!n.title) continue;
      news.push({
        ...n,
        sentiment: 0,
        label: "neutral",
      });
    }
    if (extra.length) sources.news.push("Finnhub company news");
  }

  const seen = new Set<string>();
  news = news.filter((n) => {
    const k = n.title.toLowerCase().slice(0, 80);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const snap: CrawlSnapshot = {
    yahoo: stock.yahoo,
    symbol: stock.symbol,
    market: stock.market,
    crawledAt: Date.now(),
    sources,
    quote,
    candles,
    fundamentals,
    profile,
    news: news.slice(0, 18),
    sentiment: averageSentiment(news),
    errors,
  };
  writeSnapshot(snap);
  const log = crawlerStatus();
  writeLog({
    lastRun: Date.now(),
    lastError: errors[0] ?? null,
    recent: [{ time: Date.now(), yahoo: stock.yahoo, ok: Boolean(quote), sources: [...sources.prices, ...sources.news.slice(0, 3)] }, ...log.recent].slice(0, 40),
  });
  return snap;
}

let crawling = false;

async function runWatchlist() {
  writeLog({ running: true, lastError: null });
  try {
    const store = readStore();
    const symbols = (store.watchlist.length ? store.watchlist : catalog().slice(0, 8).map((s) => s.yahoo)).slice(0, 14);
    for (const symbol of symbols) {
      try {
        await crawlSymbol(symbol);
      } catch (err) {
        writeLog({ lastError: err instanceof Error ? err.message : "crawl failed" });
      }
    }
  } finally {
    crawling = false;
    writeLog({ running: false, lastRun: Date.now() });
  }
}

export function queueWatchlistCrawl(reason: string) {
  if (crawling) {
    return { queued: false, reason: "already-running", status: crawlerStatus() };
  }
  crawling = true;
  console.log(`[crawler] background watchlist crawl (${reason})`);
  void runWatchlist().catch((err) => {
    crawling = false;
    writeLog({ running: false, lastError: err instanceof Error ? err.message : "crawl failed" });
  });
  return { queued: true, reason, status: { ...crawlerStatus(), running: true } };
}

export async function crawlWatchlist() {
  queueWatchlistCrawl("sync");
  return crawlerStatus();
}

const STALE_MS = 15 * 60 * 1000;

export function startCrawler() {
  writeLog({ running: false });
  cron.schedule("*/15 * * * *", () => {
    const status = crawlerStatus();
    if (status.lastRun && Date.now() - status.lastRun < STALE_MS) {
      return;
    }
    queueWatchlistCrawl("schedule");
  });
  setTimeout(() => {
    const status = crawlerStatus();
    if (!status.lastRun || Date.now() - status.lastRun > STALE_MS) {
      queueWatchlistCrawl("startup");
    }
  }, 2500);
}

export function listInstruments(): Instrument[] {
  return catalog();
}
