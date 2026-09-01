import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDIA_STOCKS, US_STOCKS, type Instrument } from "../lib/universe.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const storePath = path.join(dataDir, "store.json");

export interface PaperFill {
  id: string;
  time: number;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  mode: "paper" | "live";
  note: string;
}

export interface PriceAlert {
  id: string;
  yahoo: string;
  direction: "above" | "below";
  price: number;
  note: string;
  createdAt: number;
  triggeredAt: number | null;
}

export interface JournalEntry {
  id: string;
  time: number;
  yahoo: string;
  symbol: string;
  thesis: string;
  side: "BUY" | "SELL";
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

export interface AlgoRule {
  id: string;
  name: string;
  enabled: boolean;
  minScore: number;
  action: "BUY" | "SELL";
  quantity: number;
  product: "CNC" | "MIS";
}

export interface SuggestedTicket {
  id: string;
  time: number;
  strategyId: string;
  strategyName: string;
  yahoo: string;
  symbol: string;
  market: "IN" | "US";
  side: "BUY" | "SELL";
  quantity: number;
  entry: number;
  stop: number;
  target: number;
  riskReward: number;
  conviction: number;
  thesis: string[];
  product: "CNC" | "MIS";
  liveOk: boolean;
  status: "open" | "dry_run" | "paper" | "live" | "rejected";
  resultNote?: string;
}

export interface StoreShape {
  tracked: Instrument[];
  watchlist: string[];
  cash: number;
  positions: Position[];
  fills: PaperFill[];
  journal: JournalEntry[];
  alerts: PriceAlert[];
  signalsLog: Array<{
    time: number;
    symbol: string;
    action: string;
    score: number;
    reason: string;
  }>;
  kite: {
    accessToken: string | null;
    userId: string | null;
    loginTime: number | null;
  };
  algo: {
    enabled: boolean;
    live: boolean;
    autoPaper: boolean;
    riskPct: number;
    enabledStrategies: string[];
    lastRun: number | null;
    lastSuggestions: SuggestedTicket[];
    dryRuns: Array<Record<string, unknown>>;
    rules: AlgoRule[];
  };
}

const startingCash = Number(process.env.PAPER_STARTING_CASH || 1_000_000);

function defaultStore(): StoreShape {
  return {
    tracked: [],
    watchlist: [
      ...INDIA_STOCKS.slice(0, 6).map((s) => s.yahoo),
      ...US_STOCKS.slice(0, 6).map((s) => s.yahoo),
    ],
    cash: startingCash,
    positions: [],
    fills: [],
    journal: [],
    alerts: [],
    signalsLog: [],
    kite: { accessToken: null, userId: null, loginTime: null },
    algo: {
      enabled: process.env.ALGO_ENABLED === "true",
      live: process.env.ALGO_LIVE === "true",
      autoPaper: false,
      riskPct: 1,
      enabledStrategies: [
        "trend-pullback",
        "momentum-breakout",
        "mean-reversion",
        "quality-dip",
        "dual-momentum",
        "risk-off",
      ],
      lastRun: null,
      lastSuggestions: [],
      dryRuns: [],
      rules: [
        {
          id: "oversold-buy",
          name: "Strong buy score",
          enabled: true,
          minScore: 72,
          action: "BUY",
          quantity: 1,
          product: "CNC",
        },
        {
          id: "overbought-sell",
          name: "Strong sell score",
          enabled: true,
          minScore: 28,
          action: "SELL",
          quantity: 1,
          product: "CNC",
        },
      ],
    },
  };
}

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(defaultStore(), null, 2));
  }
}

export function readStore(): StoreShape {
  ensure();
  const raw = fs.readFileSync(storePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoreShape>;
  return {
    ...defaultStore(),
    ...parsed,
    tracked: parsed.tracked ?? [],
    journal: parsed.journal ?? [],
    alerts: parsed.alerts ?? [],
    algo: { ...defaultStore().algo, ...(parsed.algo ?? {}) },
  };
}

export function writeStore(next: StoreShape) {
  ensure();
  fs.writeFileSync(storePath, JSON.stringify(next, null, 2));
}

export function updateStore(mutator: (store: StoreShape) => void): StoreShape {
  const store = readStore();
  mutator(store);
  writeStore(store);
  return store;
}
