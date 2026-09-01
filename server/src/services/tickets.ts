import { readStore, updateStore, type SuggestedTicket } from "../db/store.js";
import type { Instrument } from "../lib/universe.js";
import type { Candle } from "../lib/indicators.js";
import { placePaperOrder } from "./paper.js";
import { placeLiveOrder } from "./kite.js";
import { lastAtr, sizeQuantity, STRATEGY_CATALOG, type StrategyHit } from "./strategies.js";

function id() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function buildTickets(input: {
  stock: Instrument;
  candles: Candle[];
  hits: StrategyHit[];
  enabled: string[];
  equity: number;
  riskPct: number;
}): SuggestedTicket[] {
  const price = input.candles[input.candles.length - 1]?.close;
  if (!price) return [];
  const a = lastAtr(input.candles) ?? price * 0.02;
  const stopDist = a * 2;
  return input.hits
    .filter((h) => input.enabled.includes(h.strategyId))
    .map((h) => {
      const meta = STRATEGY_CATALOG.find((s) => s.id === h.strategyId);
      const stop = h.side === "BUY" ? price - stopDist : price + stopDist;
      const target = h.side === "BUY" ? price + stopDist * 2 : price - stopDist * 2;
      return {
        id: id(),
        time: Date.now(),
        strategyId: h.strategyId,
        strategyName: meta?.name ?? h.strategyId,
        yahoo: input.stock.yahoo,
        symbol: input.stock.symbol,
        market: input.stock.market,
        side: h.side,
        quantity: sizeQuantity(price, stopDist, input.equity, input.riskPct),
        entry: Number(price.toFixed(4)),
        stop: Number(stop.toFixed(4)),
        target: Number(target.toFixed(4)),
        riskReward: 2,
        conviction: h.conviction,
        thesis: h.thesis,
        product: "CNC" as const,
        liveOk: input.stock.market === "IN",
        status: "open" as const,
      };
    });
}

export function saveSuggestions(tickets: SuggestedTicket[]) {
  return updateStore((s) => {
    s.algo.lastSuggestions = tickets.sort((a, b) => b.conviction - a.conviction).slice(0, 40);
    s.algo.lastRun = Date.now();
  }).algo.lastSuggestions;
}

export async function executeTicket(ticketId: string, mode: "dry_run" | "paper" | "live") {
  const store = readStore();
  const ticket = store.algo.lastSuggestions.find((t) => t.id === ticketId);
  if (!ticket) throw new Error("Ticket expired. Refresh suggestions first.");

  if (mode === "dry_run") {
    updateStore((s) => {
      const t = s.algo.lastSuggestions.find((x) => x.id === ticketId);
      if (t) {
        t.status = "dry_run";
        t.resultNote = `Would ${t.side} ${t.quantity} ${t.symbol} @ ${t.entry}, stop ${t.stop}, target ${t.target}. No cash moved.`;
      }
    });
    return { ticket: readStore().algo.lastSuggestions.find((t) => t.id === ticketId), live: null };
  }

  if (mode === "paper") {
    placePaperOrder({
      symbol: ticket.yahoo,
      side: ticket.side,
      quantity: ticket.quantity,
      price: ticket.entry,
      note: `algo ${ticket.strategyId} stop=${ticket.stop} tgt=${ticket.target}`,
      mode: "paper",
    });
    updateStore((s) => {
      const t = s.algo.lastSuggestions.find((x) => x.id === ticketId);
      if (t) {
        t.status = "paper";
        t.resultNote = "Filled in paper book";
      }
    });
    return { ticket: readStore().algo.lastSuggestions.find((t) => t.id === ticketId), live: null };
  }

  if (!ticket.liveOk) {
    throw new Error("Live execution via Kite is only for NSE names. Use paper for US tickers.");
  }
  const live = await placeLiveOrder({
    symbol: ticket.symbol,
    side: ticket.side,
    quantity: ticket.quantity,
    product: ticket.product,
  });
  placePaperOrder({
    symbol: ticket.yahoo,
    side: ticket.side,
    quantity: ticket.quantity,
    price: ticket.entry,
    note: `live kite ${ticket.strategyId}`,
    mode: "live",
  });
  updateStore((s) => {
    const t = s.algo.lastSuggestions.find((x) => x.id === ticketId);
    if (t) {
      t.status = "live";
      t.resultNote = "Submitted to Kite";
    }
  });
  return { ticket: readStore().algo.lastSuggestions.find((t) => t.id === ticketId), live };
}
