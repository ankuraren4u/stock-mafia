import { atr, ema, lastNumber, rsi, type Candle } from "../lib/indicators.js";
import { readStore, updateStore, type JournalEntry, type PriceAlert } from "../db/store.js";
import { sizeQuantity } from "./strategies.js";
import { readSnapshot } from "./crawler.js";
import { peekQuote } from "./market.js";
import { generateSignal } from "./signals.js";
import { resolveInstrument } from "./tickers.js";
import { portfolioSnapshot } from "./paper.js";

export interface ChecklistItem {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

function inZone(now: Date, timeZone: string, startH: number, startM: number, endH: number, endM: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (["Sat", "Sun"].includes(weekday)) return false;
  const mins = hour * 60 + minute;
  return mins >= startH * 60 + startM && mins <= endH * 60 + endM;
}

export function marketSessions() {
  const now = new Date();
  const indiaOpen = inZone(now, "Asia/Kolkata", 9, 15, 15, 30);
  const usOpen = inZone(now, "America/New_York", 9, 30, 16, 0);
  const indiaLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).format(now);
  const usLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).format(now);
  return {
    india: { open: indiaOpen, clock: indiaLabel, hours: "09:15–15:30 IST" },
    us: { open: usOpen, clock: usLabel, hours: "09:30–16:00 ET" },
    advice: indiaOpen || usOpen
      ? "A cash session is open. Prefer limit-style paper entries with a stop already written down."
      : "Both cash sessions are closed. Treat prints as last sale, not a reason to chase.",
  };
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildChecklist(input: {
  candles: Candle[];
  price: number;
  score: number;
  action: string;
  sentiment: number;
  pe: number | null;
  volume: number | null;
  market: "IN" | "US";
  positionPct: number;
  sessionOpen: boolean;
}): ChecklistItem[] {
  const closes = input.candles.map((c) => c.close);
  const vols = input.candles.map((c) => c.volume).filter((v) => v > 0);
  const ema50 = lastNumber(ema(closes, 50));
  const rsiNow = lastNumber(rsi(closes, 14));
  const avgVol = vols.length >= 20 ? vols.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
  const lastVol = vols[vols.length - 1] ?? input.volume;
  const buyBias = input.action.includes("BUY");

  return [
    {
      id: "trend",
      label: "Trend",
      pass: ema50 != null && input.price >= ema50,
      detail: ema50 != null ? `Price vs 50-EMA ${ema50.toFixed(2)}` : "Need more history for 50-EMA",
    },
    {
      id: "chase",
      label: "Not chasing",
      pass: rsiNow == null || rsiNow < 72,
      detail: rsiNow != null ? `RSI ${rsiNow.toFixed(1)}` : "RSI unavailable",
    },
    {
      id: "score",
      label: "Signal quality",
      pass: buyBias ? input.score >= 58 : input.score <= 42 || !buyBias,
      detail: `Model ${input.action} · score ${input.score}`,
    },
    {
      id: "news",
      label: "News tone",
      pass: input.sentiment >= -0.15,
      detail: `Headline sentiment ${(input.sentiment * 100).toFixed(0)}`,
    },
    {
      id: "value",
      label: "Valuation guard",
      pass: input.pe == null || input.pe <= 55,
      detail: input.pe != null ? `P/E ${input.pe.toFixed(1)}` : "P/E unknown — size smaller",
    },
    {
      id: "volume",
      label: "Liquidity",
      pass: lastVol != null && (avgVol == null || lastVol >= avgVol * 0.6),
      detail: lastVol != null ? `Last volume ${Math.round(lastVol).toLocaleString()}` : "No volume print",
    },
    {
      id: "size",
      label: "Position cap",
      pass: input.positionPct <= 15,
      detail: `This name would be ${input.positionPct.toFixed(1)}% of paper equity (cap 15%)`,
    },
    {
      id: "session",
      label: "Session",
      pass: input.sessionOpen,
      detail: input.sessionOpen ? `${input.market} cash session is open` : `${input.market} cash session is closed — last sale only`,
    },
  ];
}

export async function tradePlan(query: string, riskPct?: number) {
  const stock = await resolveInstrument(query);
  const snap = readSnapshot(stock.yahoo);
  if (!snap?.quote || !snap.candles.length) {
    throw new Error("No snapshot yet. Open the ticker once or wait for the background crawler.");
  }
  const store = readStore();
  const prices: Record<string, number> = {};
  for (const p of store.positions) {
    prices[p.symbol] = peekQuote(p.symbol, true)?.price ?? p.avgPrice;
  }
  const book = portfolioSnapshot(prices);
  const risk = riskPct ?? store.algo.riskPct ?? 1;
  const price = snap.quote.price;
  const a = lastNumber(atr(snap.candles, 14)) ?? price * 0.02;
  const stopDist = a * 2;
  const stop = price - stopDist;
  const target = price + stopDist * 2;
  let qty = sizeQuantity(price, stopDist, book.equity, risk);
  const notional = qty * price;
  let positionPct = book.equity ? (notional / book.equity) * 100 : 0;
  if (positionPct > 15) {
    qty = Math.max(1, Math.floor((book.equity * 0.15) / price));
    positionPct = book.equity ? ((qty * price) / book.equity) * 100 : 0;
  }
  const sessions = marketSessions();
  const sessionOpen = stock.market === "IN" ? sessions.india.open : sessions.us.open;
  const pe = typeof snap.fundamentals.pe === "number" ? snap.fundamentals.pe : null;
  const signal = generateSignal({
    candles: snap.candles,
    sentiment: snap.sentiment,
    pe,
    roe: typeof snap.fundamentals.roe === "number" ? snap.fundamentals.roe : null,
    debtToEquity: typeof snap.fundamentals.debtToEquity === "number" ? snap.fundamentals.debtToEquity : null,
    news: snap.news,
  });
  const checks = buildChecklist({
    candles: snap.candles,
    price,
    score: signal.score,
    action: signal.action,
    sentiment: snap.sentiment,
    pe,
    volume: snap.quote.volume,
    market: stock.market,
    positionPct,
    sessionOpen,
  });
  const passed = checks.filter((c) => c.pass).length;
  const existing = store.positions.find((p) => p.symbol === stock.yahoo);
  const riskAmount = book.equity * (risk / 100);
  return {
    stock,
    quote: snap.quote,
    signal,
    plan: {
      side: "BUY" as const,
      entry: Number(price.toFixed(4)),
      stop: Number(stop.toFixed(4)),
      target: Number(target.toFixed(4)),
      atr: Number(a.toFixed(4)),
      riskPct: risk,
      riskAmount: Number(riskAmount.toFixed(2)),
      quantity: qty,
      notional: Number((qty * price).toFixed(2)),
      rewardRisk: 2,
      positionPct: Number(positionPct.toFixed(2)),
    },
    checks,
    passed,
    total: checks.length,
    ready: passed >= 6 && signal.score >= 58 && qty >= 1,
    alreadyHeld: existing ? existing.quantity : 0,
    equity: book.equity,
    cash: book.cash,
    sessions,
    disclaimer: "This is a risk worksheet, not a profit forecast or investment advice.",
  };
}

export function portfolioRisk() {
  const store = readStore();
  const prices: Record<string, number> = {};
  for (const p of store.positions) {
    prices[p.symbol] = peekQuote(p.symbol, true)?.price ?? readSnapshot(p.symbol)?.quote?.price ?? p.avgPrice;
  }
  const book = portfolioSnapshot(prices);
  const heat = book.holdings.map((h) => ({
    symbol: h.symbol,
    weight: book.equity ? (h.value / book.equity) * 100 : 0,
    pnlPct: h.pnlPct,
    value: h.value,
  }));
  const top = [...heat].sort((a, b) => b.weight - a.weight)[0];
  const cashPct = book.equity ? (book.cash / book.equity) * 100 : 100;
  const warnings: string[] = [];
  if (top && top.weight > 20) warnings.push(`${top.symbol} is ${top.weight.toFixed(1)}% of equity — concentration risk.`);
  if (cashPct < 10) warnings.push("Cash under 10%. New buys leave little room for error.");
  if (book.holdings.length >= 12) warnings.push("Many names open. Harder to follow news on each.");
  if (book.pnl < 0 && Math.abs(book.pnl) / Math.max(book.equity, 1) > 0.08) {
    warnings.push("Drawdown over 8% of equity. Cut size until the book stabilises.");
  }
  return {
    ...book,
    heat,
    cashPct,
    warnings,
    sessions: marketSessions(),
    alerts: evaluateAlerts(),
    journal: store.journal ?? [],
  };
}

export function evaluateAlerts(): Array<PriceAlert & { last?: number; fired: boolean }> {
  const store = readStore();
  const alerts = store.alerts ?? [];
  const out = [];
  for (const alert of alerts) {
    const last = peekQuote(alert.yahoo, true)?.price ?? readSnapshot(alert.yahoo)?.quote?.price ?? null;
    let triggeredAt = alert.triggeredAt;
    if (last != null && !triggeredAt) {
      const hit = alert.direction === "above" ? last >= alert.price : last <= alert.price;
      if (hit) {
        triggeredAt = Date.now();
        updateStore((s) => {
          const row = (s.alerts ?? []).find((a) => a.id === alert.id);
          if (row) row.triggeredAt = triggeredAt;
        });
      }
    }
    out.push({ ...alert, triggeredAt, last: last ?? undefined, fired: Boolean(triggeredAt) });
  }
  return out.sort((a, b) => Number(b.fired) - Number(a.fired) || b.createdAt - a.createdAt);
}

export function addAlert(input: { yahoo: string; direction: "above" | "below"; price: number; note?: string }) {
  if (!input.price || input.price <= 0) throw new Error("Alert price must be positive");
  const row: PriceAlert = {
    id: id(),
    yahoo: input.yahoo,
    direction: input.direction,
    price: input.price,
    note: input.note ?? "",
    createdAt: Date.now(),
    triggeredAt: null,
  };
  updateStore((s) => {
    s.alerts = [row, ...(s.alerts ?? [])].slice(0, 50);
  });
  return row;
}

export function removeAlert(alertId: string) {
  updateStore((s) => {
    s.alerts = (s.alerts ?? []).filter((a) => a.id !== alertId);
  });
}

export function addJournal(input: { yahoo: string; symbol: string; thesis: string; side: "BUY" | "SELL" }) {
  const thesis = input.thesis.trim();
  if (thesis.length < 8) throw new Error("Write a short thesis (why this trade, where you are wrong).");
  const row: JournalEntry = {
    id: id(),
    time: Date.now(),
    yahoo: input.yahoo,
    symbol: input.symbol,
    thesis,
    side: input.side,
  };
  updateStore((s) => {
    s.journal = [row, ...(s.journal ?? [])].slice(0, 80);
  });
  return row;
}

export function snapshotIdeas() {
  const store = readStore();
  const sessions = marketSessions();
  const ideas = [];
  for (const yahoo of store.watchlist.slice(0, 16)) {
    const snap = readSnapshot(yahoo);
    if (!snap?.quote || !snap.candles.length) continue;
    const pe = typeof snap.fundamentals.pe === "number" ? snap.fundamentals.pe : null;
    const signal = generateSignal({
      candles: snap.candles,
      sentiment: snap.sentiment,
      pe,
      roe: typeof snap.fundamentals.roe === "number" ? snap.fundamentals.roe : null,
      debtToEquity: typeof snap.fundamentals.debtToEquity === "number" ? snap.fundamentals.debtToEquity : null,
      news: snap.news,
    });
    if (signal.score < 58) continue;
    const a = lastNumber(atr(snap.candles, 14)) ?? snap.quote.price * 0.02;
    ideas.push({
      yahoo,
      symbol: snap.symbol,
      market: snap.market,
      price: snap.quote.price,
      currency: snap.quote.currency,
      action: signal.action,
      score: signal.score,
      stop: snap.quote.price - a * 2,
      target: snap.quote.price + a * 4,
      reason: signal.reasons[0],
    });
  }
  ideas.sort((a, b) => b.score - a.score);
  return { ideas: ideas.slice(0, 8), sessions };
}
