import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalog, INDICES, type Instrument } from "../lib/universe.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const filePath = path.join(dataDir, "tickers.json");

export interface TickerRecord extends Instrument {
  id: string;
  aliases: string[];
  hits: number;
  updatedAt: number;
}

interface FileShape {
  tickers: TickerRecord[];
}

const byId = new Map<string, TickerRecord>();
const prefix = new Map<string, Set<string>>();
let loaded = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function tokenise(row: Instrument) {
  const parts = [row.symbol, row.yahoo, row.name, row.exchange, row.sector]
    .join(" ")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 1);
  return [...new Set(parts)];
}

function tickerId(yahoo: string) {
  return yahoo.trim().toUpperCase();
}

function addPrefixes(id: string, tokens: string[]) {
  for (const token of tokens) {
    const max = Math.min(token.length, 8);
    for (let i = 1; i <= max; i += 1) {
      const key = token.slice(0, i);
      let set = prefix.get(key);
      if (!set) {
        set = new Set();
        prefix.set(key, set);
      }
      set.add(id);
    }
  }
}

function rebuildPrefix() {
  prefix.clear();
  for (const row of byId.values()) addPrefixes(row.id, row.aliases);
}

function seedRows(): Instrument[] {
  const indices: Instrument[] = [
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
  return [...catalog(), ...indices];
}

function persistSoon() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const payload: FileShape = { tickers: [...byId.values()] };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  }, 250);
}

export function upsertTickers(items: Instrument | Instrument[]) {
  loadTickerIndex();
  const list = Array.isArray(items) ? items : [items];
  const now = Date.now();
  for (const item of list) {
    if (!item.yahoo) continue;
    const id = tickerId(item.yahoo);
    const aliases = tokenise(item);
    const prev = byId.get(id);
    const row: TickerRecord = {
      id,
      symbol: item.symbol || prev?.symbol || id,
      yahoo: item.yahoo,
      name: item.name || prev?.name || item.symbol,
      sector: item.sector && item.sector !== "—" ? item.sector : prev?.sector ?? "—",
      market: item.market || prev?.market || "US",
      exchange: item.exchange || prev?.exchange || "",
      currency: item.currency || prev?.currency || (item.market === "IN" ? "INR" : "USD"),
      aliases: [...new Set([...(prev?.aliases ?? []), ...aliases])],
      hits: prev?.hits ?? 0,
      updatedAt: now,
    };
    byId.set(id, row);
    addPrefixes(id, row.aliases);
  }
  persistSoon();
}

export function bumpTickerHit(yahoo: string) {
  loadTickerIndex();
  const row = byId.get(tickerId(yahoo));
  if (!row) return;
  row.hits += 1;
  row.updatedAt = Date.now();
  persistSoon();
}

export function getTicker(idOrSymbol: string): TickerRecord | null {
  loadTickerIndex();
  const q = decodeURIComponent(idOrSymbol).trim().toUpperCase();
  if (byId.has(q)) return byId.get(q) ?? null;
  for (const row of byId.values()) {
    if (row.symbol.toUpperCase() === q || row.aliases.includes(q)) return row;
  }
  return null;
}

export function searchTickerIndex(query: string, limit = 12): TickerRecord[] {
  loadTickerIndex();
  const q = query.trim().toUpperCase().replace(/[^A-Z0-9.]+/g, " ").trim();
  if (!q) {
    return [...byId.values()].sort((a, b) => b.hits - a.hits).slice(0, limit);
  }
  const compact = q.replace(/[^A-Z0-9]/g, "");
  const keys = compact ? [compact.slice(0, Math.min(compact.length, 8))] : [];
  const first = q.split(/\s+/)[0]?.replace(/[^A-Z0-9]/g, "") ?? "";
  if (first && !keys.includes(first.slice(0, 8))) keys.push(first.slice(0, Math.min(first.length, 8)));

  const ids = new Set<string>();
  for (const key of keys) {
    const set = prefix.get(key);
    if (set) for (const id of set) ids.add(id);
  }
  if (ids.size === 0) {
    for (const row of byId.values()) {
      const blob = `${row.symbol} ${row.yahoo} ${row.name} ${row.aliases.join(" ")}`.toUpperCase();
      if (blob.includes(q)) ids.add(row.id);
    }
  }

  const needle = q.toLowerCase();
  const scored = [...ids]
    .map((id) => byId.get(id))
    .filter((row): row is TickerRecord => Boolean(row))
    .map((row) => {
      const symbol = row.symbol.toLowerCase();
      const yahoo = row.yahoo.toLowerCase();
      const name = row.name.toLowerCase();
      let score = row.hits;
      if (symbol === needle || yahoo === needle || row.id === q) score += 1000;
      else if (symbol.startsWith(needle) || yahoo.startsWith(needle)) score += 800;
      else if (name.startsWith(needle)) score += 600;
      else if (symbol.includes(needle) || yahoo.includes(needle)) score += 400;
      else if (name.includes(needle)) score += 200;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score || a.row.symbol.localeCompare(b.row.symbol));
  return scored.slice(0, limit).map((x) => x.row);
}

export function tickerIndexStats() {
  loadTickerIndex();
  return { count: byId.size, file: "server/data/tickers.json" };
}

export function loadTickerIndex() {
  if (loaded) return;
  loaded = true;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as FileShape;
      for (const row of parsed.tickers ?? []) {
        const id = row.id || tickerId(row.yahoo);
        byId.set(id, { ...row, id, aliases: row.aliases?.length ? row.aliases : tokenise(row) });
      }
    } catch {
      /* rebuild from seed */
    }
  }
  upsertTickers(seedRows());
  rebuildPrefix();
}
