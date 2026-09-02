import cron from "node-cron";
import { US_STOCKS } from "../lib/universe.js";
import { readStore, updateStore } from "../db/store.js";
import { fetchChart, fetchChartDirect, fetchQuote, fetchFundamentals, fetchProfile } from "./market.js";
import { averageSentiment } from "./news.js";
import { generateSignal } from "./signals.js";
import { resolveInstrument } from "./tickers.js";
import { crawlSymbol, readSnapshot } from "./crawler.js";
import {
  dryRunStrategy,
  evaluateStrategies,
  indexYahooFor,
  STRATEGY_CATALOG,
} from "./strategies.js";
import { buildTickets, executeTicket, saveSuggestions } from "./tickets.js";

export async function analyzeSymbol(query: string) {
  const stock = await resolveInstrument(query);
  let snap = readSnapshot(stock.yahoo);
  const stale = !snap || Date.now() - (snap.crawledAt || 0) > 25 * 60_000 || !snap.candles.length;
  if (stale) {
    try { snap = await crawlSymbol(stock.yahoo); } catch {}
  }

  // If still no quote, try direct fetch
  let quote = snap?.quote ?? null;
  if (!quote) {
    try { quote = await fetchQuote(stock.yahoo); } catch {}
  }

  // If still no candles, try direct chart
  let candles = snap?.candles ?? [];
  if (!candles.length) {
    try {
      const direct = await fetchChartDirect(stock.yahoo, "6mo", "1d");
      candles = direct.candles;
    } catch {}
  }

  if (!quote) throw new Error(`No price data available for ${stock.yahoo}`);
  if (snap?.profile?.name) stock.name = snap.profile.name;
  if (snap?.profile?.sector) stock.sector = snap.profile.sector;

  const news = snap?.news ?? [];
  const sentiment = snap?.sentiment || averageSentiment(news);
  const fundamentals = snap?.fundamentals ?? {};
  const profile = snap?.profile ?? {};

  const signal = generateSignal({
    candles,
    sentiment,
    pe: typeof fundamentals.pe === "number" ? fundamentals.pe : null,
    roe: typeof fundamentals.roe === "number" ? fundamentals.roe : null,
    debtToEquity: typeof fundamentals.debtToEquity === "number" ? fundamentals.debtToEquity : null,
    news,
  });

  return {
    stock,
    quote,
    chart: { candles, meta: {} },
    fundamentals,
    news,
    sentiment,
    signal,
    profile,
    sources: snap?.sources ?? { prices: [], news: [], fundamentals: [], other: [] },
    crawledAt: snap?.crawledAt ?? 0,
    crawlErrors: snap?.errors ?? [],
  };
}

async function indexReturn20(yahoo: string) {
  try {
    const { candles } = await fetchChart(yahoo, "3mo", "1d");
    if (candles.length < 21) return null;
    const a = candles[candles.length - 21].close;
    const b = candles[candles.length - 1].close;
    return (b - a) / a;
  } catch {
    return null;
  }
}

export async function runAlgoOnce() {
  const store = readStore();
  const symbols = store.watchlist.length
    ? store.watchlist
    : US_STOCKS.slice(0, 6).map((s) => s.yahoo);
  const enabled = store.algo.enabledStrategies?.length
    ? store.algo.enabledStrategies
    : STRATEGY_CATALOG.map((s) => s.id);
  const indexCache = new Map<string, number | null>();
  const tickets = [];
  const results = [];

  for (const symbol of symbols) {
    try {
      const analysis = await analyzeSymbol(symbol);
      const { signal, stock, chart, fundamentals, sentiment } = analysis;
      const idxKey = indexYahooFor(stock);
      if (!indexCache.has(idxKey)) indexCache.set(idxKey, await indexReturn20(idxKey));
      const hits = evaluateStrategies({
        candles: chart.candles,
        sentiment,
        pe: typeof fundamentals.pe === "number" ? fundamentals.pe : null,
        roe: typeof fundamentals.roe === "number" ? fundamentals.roe : null,
        indexReturn20: indexCache.get(idxKey) ?? null,
      });
      const built = buildTickets({
        stock,
        candles: chart.candles,
        hits,
        enabled,
        equity: store.cash,
        riskPct: store.algo.riskPct ?? 1,
      });
      tickets.push(...built);
      updateStore((s) => {
        s.signalsLog.unshift({
          time: Date.now(),
          symbol: stock.yahoo,
          action: signal.action,
          score: signal.score,
          reason: hits[0]?.thesis[0] ?? signal.reasons[0] ?? "",
        });
        s.signalsLog = s.signalsLog.slice(0, 200);
      });
      results.push({
        symbol: stock.yahoo,
        market: stock.market,
        price: analysis.quote.price,
        signal: analysis.signal,
        strategies: hits,
        tickets: built.length,
      });
    } catch (err) {
      results.push({
        symbol,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }

  const saved = saveSuggestions(tickets);

  if (store.algo.autoPaper) {
    for (const t of saved.filter((x) => x.status === "open")) {
      try {
        await executeTicket(t.id, "paper");
      } catch (err) {
        console.error("[algo] auto paper failed", err);
      }
    }
  }

  return { results, suggestions: readStore().algo.lastSuggestions };
}

export async function dryRunEnabledStrategies() {
  const store = readStore();
  const symbols = (store.watchlist.length ? store.watchlist : US_STOCKS.slice(0, 4).map((s) => s.yahoo)).slice(0, 8);
  const enabled = store.algo.enabledStrategies?.length
    ? store.algo.enabledStrategies
    : STRATEGY_CATALOG.map((s) => s.id);
  const reports: Array<Record<string, unknown>> = [];

  for (const id of enabled) {
    const perSymbol = [];
    for (const symbol of symbols) {
      try {
        const stock = await resolveInstrument(symbol);
        const { candles } = await fetchChart(stock.yahoo, "1y", "1d");
        const idx = await indexReturn20(indexYahooFor(stock));
        perSymbol.push({ symbol: stock.yahoo, ...dryRunStrategy(id, candles, idx) });
      } catch (err) {
        perSymbol.push({
          symbol,
          strategyId: id,
          error: err instanceof Error ? err.message : "failed",
        });
      }
    }
    const ok = perSymbol.filter((r) => "trades" in r && typeof r.trades === "number") as Array<{
      trades: number;
      winRate: number;
      totalReturnPct: number;
      maxDrawdownPct: number;
      name?: string;
    }>;
    const trades = ok.reduce((a, r) => a + r.trades, 0);
    reports.push({
      strategyId: id,
      name: STRATEGY_CATALOG.find((s) => s.id === id)?.name ?? id,
      symbols: perSymbol,
      trades,
      avgWinRate: ok.length ? Math.round(ok.reduce((a, r) => a + r.winRate, 0) / ok.length) : 0,
      avgReturnPct: ok.length
        ? Number((ok.reduce((a, r) => a + r.totalReturnPct, 0) / ok.length).toFixed(2))
        : 0,
      avgDrawdownPct: ok.length
        ? Number((ok.reduce((a, r) => a + r.maxDrawdownPct, 0) / ok.length).toFixed(2))
        : 0,
      ranAt: Date.now(),
    });
  }

  updateStore((s) => {
    s.algo.dryRuns = reports;
    s.algo.lastRun = Date.now();
  });
  return reports;
}

export function startAlgoScheduler() {
  cron.schedule("*/15 * * * 1-5", () => {
    const store = readStore();
    if (!store.algo.enabled) return;
    console.log("[algo] scheduled suggestion run");
    void runAlgoOnce();
  });
}
