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
  fetchChartDirect,
  fetchFundamentals,
  fetchProfile,
  fetchQuote,
  yahooPaused,
  type ChartPayload,
  type Quote,
} from "./market.js";
import { averageSentiment, crawlNews, scoreText, type NewsItem } from "./news.js";
import { fetchStooqChart, quoteFromCandles } from "./crawler-stooq.js";
import { fetchNseQuote } from "./crawler-nse.js";
import { fetchMoneycontrolQuote } from "./crawler-moneycontrol.js";
import {
  fetchFinnhubMetrics,
  fetchFinnhubNews,
  fetchFinnhubQuote,
  finnhubEnabled,
} from "./crawler-finnhub.js";
import { canRequest, recordSourceFailure, recordSourceSuccess } from "./proxy.js";

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
  recent: Array<{ time: number; yahoo: string; ok: boolean; sources: string[]; error?: string }>;
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

  // Read existing snapshot for candle accumulation
  const existing = readSnapshot(stock.yahoo);
  let candles: ChartPayload["candles"] = existing?.candles ?? [];
  let quote: Quote | null = existing?.quote ?? null;

  // === PRICE DATA: Stooq first (works from LXC), Yahoo as bonus ===
  if (candles.length < 30 && !yahooPaused()) {
    try {
      const stooq = await fetchStooqChart(stock.yahoo, stock.market);
      if (stooq?.candles.length) {
        // Merge with existing candles (accumulate history)
        const existingTimes = new Set(candles.map((c) => c.time));
        const newCandles = stooq.candles.filter((c) => !existingTimes.has(c.time));
        candles = [...candles, ...newCandles].sort((a, b) => a.time - b.time);
        // Keep last 2 years max
        const cutoff = Date.now() - 730 * 86400000;
        candles = candles.filter((c) => c.time >= cutoff);
        sources.prices.push("Stooq");
      }
    } catch (err) {
      errors.push(`stooq: ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  // Twelve Data (US stocks only, requires API key)
  if (candles.length < 100 && stock.market === "US" && canRequest("twelvedata")) {
    try {
      const apiKey = process.env.TWELVE_DATA_API_KEY;
      if (apiKey) {
        const symbol = stock.yahoo.replace(/\.NS$/, "");
        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=120&apikey=${apiKey}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (data.values && Array.isArray(data.values)) {
            const existingTimes = new Set(candles.map((c) => c.time));
            const newCandles = data.values
              .map((v: { datetime: string; open: string; high: string; low: string; close: string; volume: string }) => ({
                time: Math.floor(new Date(v.datetime).getTime() / 1000) * 1000,
                open: parseFloat(v.open),
                high: parseFloat(v.high),
                low: parseFloat(v.low),
                close: parseFloat(v.close),
                volume: parseInt(v.volume, 10) || 0,
              }))
              .filter((c: { time: number }) => !existingTimes.has(c.time));
            candles = [...candles, ...newCandles].sort((a, b) => a.time - b.time);
            sources.prices.push("Twelve Data");
            recordSourceSuccess("twelvedata");
          }
        } else {
          recordSourceFailure("twelvedata");
        }
      }
    } catch (err) {
      errors.push(`twelvedata: ${err instanceof Error ? err.message : "fail"}`);
      recordSourceFailure("twelvedata");
    }
  }

  // Tiingo (US stocks only, requires API key - provides 10000 records)
  if (candles.length < 100 && stock.market === "US" && canRequest("tiingo")) {
    try {
      const apiKey = process.env.TIINGO_API_KEY;
      if (apiKey) {
        const symbol = stock.yahoo.replace(/\.NS$/, "");
        const url = `https://api.tiingo.com/iex/${symbol}/prices?startDate=2023-01-01&token=${apiKey}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data)) {
            const existingTimes = new Set(candles.map((c) => c.time));
            const newCandles = data
              .map((v: { date: string; open: number; high: number; low: number; close: number; volume: number }) => ({
                time: Math.floor(new Date(v.date).getTime() / 1000) * 1000,
                open: v.open,
                high: v.high,
                low: v.low,
                close: v.close,
                volume: v.volume || 0,
              }))
              .filter((c: { time: number }) => !existingTimes.has(c.time));
            candles = [...candles, ...newCandles].sort((a, b) => a.time - b.time);
            sources.prices.push("Tiingo");
            recordSourceSuccess("tiingo");
          }
        } else {
          recordSourceFailure("tiingo");
        }
      }
    } catch (err) {
      errors.push(`tiingo: ${err instanceof Error ? err.message : "fail"}`);
      recordSourceFailure("tiingo");
    }
  }

  // Alpha Vantage (US stocks only, requires API key)
  if (candles.length < 100 && stock.market === "US" && canRequest("alphavantage")) {
    try {
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      if (apiKey) {
        const symbol = stock.yahoo.replace(/\.NS$/, "");
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          const timeSeries = data["Time Series (Daily)"];
          if (timeSeries && typeof timeSeries === "object") {
            const existingTimes = new Set(candles.map((c) => c.time));
            const newCandles = (Object.entries(timeSeries) as [string, Record<string, string>][])
              .map(([date, vals]) => ({
                time: Math.floor(new Date(date).getTime() / 1000) * 1000,
                open: parseFloat(vals["1. open"]),
                high: parseFloat(vals["2. high"]),
                low: parseFloat(vals["3. low"]),
                close: parseFloat(vals["4. close"]),
                volume: parseInt(vals["5. volume"], 10) || 0,
              }))
              .filter((c: { time: number }) => !existingTimes.has(c.time));
            candles = [...candles, ...newCandles].sort((a, b) => a.time - b.time);
            sources.prices.push("Alpha Vantage");
            recordSourceSuccess("alphavantage");
          }
        } else {
          recordSourceFailure("alphavantage");
        }
      }
    } catch (err) {
      errors.push(`alphavantage: ${err instanceof Error ? err.message : "fail"}`);
      recordSourceFailure("alphavantage");
    }
  }

  // Yahoo chart as bonus (if not paused and we need more data)
  if (!yahooPaused() && candles.length < 100) {
    try {
      const chart = await fetchChart(stock.yahoo, "1y", "1d", "bg");
      if (chart.candles.length) {
        const existingTimes = new Set(candles.map((c) => c.time));
        const newCandles = chart.candles.filter((c) => !existingTimes.has(c.time));
        candles = [...candles, ...newCandles].sort((a, b) => a.time - b.time);
        if (!sources.prices.includes("Yahoo Finance")) sources.prices.push("Yahoo Finance");
      }
    } catch (err) {
      errors.push(`yahoo-chart: ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  // === QUOTE: Try multiple sources ===
  // NSE India for Indian stocks
  if (stock.market === "IN") {
    try {
      const nse = await fetchNseQuote(stock.symbol);
      if (nse?.price) {
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
    } catch (err) {
      errors.push(`nse: ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  // Moneycontrol for Indian stocks
  if (stock.market === "IN" && !quote) {
    try {
      const mc = await fetchMoneycontrolQuote(stock.yahoo);
      if (mc) {
        quote = mc;
        sources.prices.push("Moneycontrol");
      }
    } catch (err) {
      errors.push(`moneycontrol: ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  // Finnhub for US stocks
  if (stock.market === "US" && !quote) {
    try {
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
          volume: null,
          marketCap: null,
          currency: "USD",
        };
        sources.prices.push("Finnhub");
      }
    } catch (err) {
      errors.push(`finnhub: ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  // Yahoo quote as last resort (if not paused)
  if (!quote && !yahooPaused()) {
    try {
      quote = await fetchQuote(stock.yahoo);
      if (quote) sources.prices.push("Yahoo Finance");
    } catch (err) {
      errors.push(`yahoo-quote: ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  // Derive quote from candles if still no quote
  if (!quote && candles.length >= 2) {
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    quote = {
      symbol: stock.symbol,
      yahoo: stock.yahoo,
      price: last.close,
      change: last.close - prev.close,
      changePct: prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0,
      previousClose: prev.close,
      dayHigh: last.high,
      dayLow: last.low,
      volume: last.volume,
      marketCap: null,
      currency: stock.currency,
    };
    sources.prices.push("Candle derived");
  }

  // If still no quote, report clear error
  if (!quote) {
    const reason = errors.length > 0 ? errors[0] : "All data sources unavailable (rate limited or blocked)";
    errors.push(`no-quote: ${reason}`);
  }

  // === FUNDAMENTALS: Yahoo first, Finnhub fallback ===
  let fundamentals: Record<string, number | string | null> = existing?.fundamentals ?? {};
  if (Object.keys(fundamentals).length === 0 && !yahooPaused()) {
    try {
      fundamentals = await fetchFundamentals(stock.yahoo);
      sources.fundamentals.push("Yahoo Finance");
    } catch (err) {
      errors.push(`yahoo-fund: ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  // Finnhub metrics as fallback for US stocks
  if (stock.market === "US" && (!fundamentals.pe || !fundamentals.roe)) {
    try {
      const fhMetrics = await fetchFinnhubMetrics(stock.symbol);
      if (fhMetrics) {
        fundamentals = { ...fundamentals, ...Object.fromEntries(Object.entries(fhMetrics).filter(([, v]) => v != null)) };
        if (!sources.fundamentals.includes("Finnhub")) sources.fundamentals.push("Finnhub metrics");
      }
    } catch {}
  }

  // === PROFILE ===
  let profile: Record<string, string | null> = existing?.profile ?? {};
  if (!profile.summary && !yahooPaused()) {
    try {
      profile = await fetchProfile(stock.yahoo);
      sources.other.push("Yahoo profile");
    } catch {}
  }

  // === NEWS ===
  const newsPack = await crawlNews({
    query: stock.name,
    yahoo: stock.yahoo,
    symbol: stock.symbol,
    market: stock.market,
  });
  let news = newsPack.items;
  sources.news.push(...newsPack.sources);

  // Finnhub news for US stocks
  if (stock.market === "US") {
    try {
      const extra = await fetchFinnhubNews(stock.symbol);
      for (const n of extra) {
        if (!n.title) continue;
        const { sentiment, label } = scoreText(n.title);
        news.push({ ...n, sentiment, label });
      }
      if (extra.length) sources.news.push("Finnhub company news");
    } catch {}
  }

  // Deduplicate news
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
    recent: [{ time: Date.now(), yahoo: stock.yahoo, ok: Boolean(quote), sources: [...sources.prices, ...sources.news.slice(0, 3)], error: errors.length > 0 ? errors[0] : undefined }, ...log.recent].slice(0, 40),
  });
  return snap;
}

let crawling = false;
let crawlQueue: string[] = [];

async function runWatchlist() {
  writeLog({ running: true, lastError: null });
  try {
    const store = readStore();
    // Crawl watchlist first, then fill with universe stocks
    const watchlistSymbols = store.watchlist.length ? store.watchlist : [];
    const universeSymbols = catalog()
      .filter((s) => !watchlistSymbols.includes(s.yahoo))
      .map((s) => s.yahoo);
    const allSymbols = [...watchlistSymbols, ...universeSymbols];
    crawlQueue = allSymbols;

    console.log(`[crawler] crawling ${allSymbols.length} stocks (${watchlistSymbols.length} watchlist + ${universeSymbols.length} universe)`);

    // Crawl in batches of 8 with delay between batches
    const BATCH_SIZE = 8;
    const BATCH_DELAY_MS = 3000;
    for (let i = 0; i < crawlQueue.length; i += BATCH_SIZE) {
      const batch = crawlQueue.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(async (symbol) => {
        try {
          await crawlSymbol(symbol);
        } catch (err) {
          writeLog({ lastError: err instanceof Error ? err.message : "crawl failed" });
        }
      }));
      if (i + BATCH_SIZE < crawlQueue.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }
  } finally {
    crawling = false;
    crawlQueue = [];
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

// Cadence settings (in milliseconds)
const CADENCE = {
  PRICES: 5 * 60 * 1000,        // Every 5 minutes
  NEWS: 15 * 60 * 1000,         // Every 15 minutes
  FUNDAMENTALS: 60 * 60 * 1000, // Every hour
  CANDLES: 30 * 60 * 1000,      // Every 30 minutes
  FULL_CRAWL: 60 * 60 * 1000,   // Every hour for full crawl
};

let lastPriceCrawl = 0;
let lastNewsCrawl = 0;
let lastFundamentalsCrawl = 0;
let lastCandleCrawl = 0;

export function startCrawler() {
  writeLog({ running: false });
  
  // Price updates - every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    if (!crawling && Date.now() - lastPriceCrawl > CADENCE.PRICES) {
      lastPriceCrawl = Date.now();
      queueWatchlistCrawl("price-update");
    }
  });
  
  // News updates - every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    if (!crawling && Date.now() - lastNewsCrawl > CADENCE.NEWS) {
      lastNewsCrawl = Date.now();
      queueWatchlistCrawl("news-update");
    }
  });
  
  // Fundamentals - every hour
  cron.schedule("0 * * * *", () => {
    if (!crawling && Date.now() - lastFundamentalsCrawl > CADENCE.FUNDAMENTALS) {
      lastFundamentalsCrawl = Date.now();
      queueWatchlistCrawl("fundamentals-update");
    }
  });
  
  // Candle history - every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    if (!crawling && Date.now() - lastCandleCrawl > CADENCE.CANDLES) {
      lastCandleCrawl = Date.now();
      queueWatchlistCrawl("candle-update");
    }
  });
  
  // Initial crawl on startup
  setTimeout(() => {
    queueWatchlistCrawl("startup");
  }, 2500);
}

export function listInstruments(): Instrument[] {
  return catalog();
}
