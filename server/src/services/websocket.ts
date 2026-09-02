import type { Server } from "node:http";
import { readStore } from "../db/store.js";
import { peekQuote, rememberQuote } from "./market.js";
import { readSnapshot } from "./crawler.js";

const ws = await import("ws");
const WsDefault = (ws as any).default ?? ws;
const WebSocketServer = WsDefault.Server ?? WsDefault.WebSocketServer;
const OPEN = 1;

interface WSClient {
  ws: any;
  symbols: Set<string>;
  lastTick: number;
}

const clients = new Set<WSClient>();
let ticker: ReturnType<typeof setInterval> | null = null;
const SUB_TTL_MS = 60_000;

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket: any) => {
    const client: WSClient = { ws: socket, symbols: new Set(), lastTick: Date.now() };
    clients.add(client);

    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === "subscribe" && Array.isArray(msg.symbols)) {
          client.symbols = new Set(msg.symbols.map((s: string) => s.toUpperCase()));
          client.lastTick = Date.now();
        }
        if (msg.type === "unsubscribe" && Array.isArray(msg.symbols)) {
          for (const s of msg.symbols) client.symbols.delete(String(s).toUpperCase());
        }
        if (msg.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", time: Date.now() }));
        }
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    socket.on("close", () => clients.delete(client));
    socket.on("error", () => clients.delete(client));

    socket.send(JSON.stringify({ type: "connected", time: Date.now(), message: "Subscribe with {type:\"subscribe\",symbols:[\"RELIANCE.NS\"]}" }));
  });

  if (!ticker) {
    ticker = setInterval(broadcastPrices, 5000);
  }

  return wss;
}

async function broadcastPrices() {
  const now = Date.now();
  const allSymbols = new Set<string>();
  for (const c of clients) {
    if (now - c.lastTick > SUB_TTL_MS * 5) {
      try { c.ws.close(); } catch {}
      clients.delete(c);
      continue;
    }
    for (const s of c.symbols) allSymbols.add(s);
  }
  if (!allSymbols.size) return;

  const symbols = [...allSymbols];
  const results = new Map<string, { price: number; change: number; changePct: number; volume: number | null }>();

  // Use cached prices from crawl snapshots and quote cache (no Yahoo calls)
  for (const sym of symbols) {
    // Try memory cache first
    const cached = peekQuote(sym, true);
    if (cached?.price) {
      results.set(sym, { price: cached.price, change: cached.change, changePct: cached.changePct, volume: cached.volume });
      continue;
    }
    // Try crawl snapshot
    const snap = readSnapshot(sym);
    if (snap?.quote?.price) {
      results.set(sym, {
        price: snap.quote.price,
        change: snap.quote.change,
        changePct: snap.quote.changePct,
        volume: snap.quote.volume,
      });
    }
  }

  for (const client of clients) {
    if (client.ws.readyState !== OPEN) continue;
    const payload: Record<string, unknown> = {};
    let hasData = false;
    for (const sym of client.symbols) {
      const data = results.get(sym);
      if (data) {
        payload[sym] = data;
        hasData = true;
      }
    }
    if (hasData) {
      client.ws.send(JSON.stringify({ type: "prices", data: payload, time: now }));
    }
  }
}

export function broadcastAlert(alert: { symbol: string; direction: string; price: number; note: string }) {
  const msg = JSON.stringify({ type: "alert", ...alert, time: Date.now() });
  for (const client of clients) {
    if (client.ws.readyState === OPEN) {
      if (client.symbols.has(alert.symbol) || client.symbols.has("*")) {
        client.ws.send(msg);
      }
    }
  }
}
