import { Router } from "express";
import { US_STOCKS } from "../lib/universe.js";
import { readStore } from "../db/store.js";
import { analyzeSymbol } from "../services/algo.js";
import { resolveInstrument, trackInstrument, untrack } from "../services/tickers.js";

export const signalsRouter = Router();

signalsRouter.get("/", async (req, res) => {
  const store = readStore();
  const market = String(req.query.market ?? "").toUpperCase();
  let symbols = store.watchlist.length
    ? store.watchlist
    : US_STOCKS.slice(0, 6).map((s) => s.yahoo);
  if (market === "IN" || market === "US") {
    const rowsPrep = [];
    for (const symbol of symbols) {
      try {
        const inst = await resolveInstrument(symbol);
        if (inst.market === market) rowsPrep.push(inst.yahoo);
      } catch {
        /* skip */
      }
    }
    symbols = rowsPrep;
  }
  const rows = [];
  for (const symbol of symbols) {
    try {
      const analysis = await analyzeSymbol(symbol);
      rows.push({
        symbol: analysis.stock.symbol,
        yahoo: analysis.stock.yahoo,
        market: analysis.stock.market,
        currency: analysis.stock.currency,
        name: analysis.stock.name,
        sector: analysis.stock.sector,
        price: analysis.quote.price,
        changePct: analysis.quote.changePct,
        ...analysis.signal,
        sentiment: analysis.sentiment,
      });
    } catch (err) {
      rows.push({
        symbol,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }
  rows.sort((a, b) => (("score" in b ? b.score : 0) as number) - (("score" in a ? a.score : 0) as number));
  res.json({ signals: rows, log: store.signalsLog.slice(0, 30) });
});

signalsRouter.get("/watchlist", (_req, res) => {
  res.json({ watchlist: readStore().watchlist, tracked: readStore().tracked });
});

signalsRouter.post("/watchlist", async (req, res) => {
  try {
    const instrument = await resolveInstrument(String(req.body?.yahoo ?? req.body?.symbol ?? ""));
    const store = trackInstrument(instrument);
    res.json({ watchlist: store.watchlist, tracked: store.tracked, instrument });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "watchlist add failed" });
  }
});

signalsRouter.delete("/watchlist/:symbol", (req, res) => {
  const store = untrack(req.params.symbol);
  res.json({ watchlist: store.watchlist, tracked: store.tracked });
});
