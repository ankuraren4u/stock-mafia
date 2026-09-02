import { Router } from "express";
import {
  addAlert,
  addJournal,
  marketSessions,
  portfolioRisk,
  removeAlert,
  snapshotIdeas,
  tradePlan,
} from "../services/desk.js";
import { readStore, updateStore } from "../db/store.js";
import { resolveInstrument } from "../services/tickers.js";
import { analyzeAlert } from "../services/smart-alert.js";

export const deskRouter = Router();

deskRouter.get("/session", (_req, res) => {
  res.json(marketSessions());
});

deskRouter.get("/risk", (_req, res) => {
  res.json(portfolioRisk());
});

deskRouter.get("/ideas", (_req, res) => {
  res.json(snapshotIdeas());
});

deskRouter.get("/plan/:symbol", async (req, res) => {
  try {
    const riskPct = req.query.risk != null ? Number(req.query.risk) : undefined;
    res.json(await tradePlan(req.params.symbol, Number.isFinite(riskPct) ? riskPct : undefined));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "plan failed" });
  }
});

deskRouter.get("/alerts", (_req, res) => {
  const store = readStore();
  res.json({ alerts: store.alerts ?? [] });
});

deskRouter.post("/alerts", (req, res) => {
  try {
    const row = addAlert({
      yahoo: String(req.body?.yahoo ?? "").toUpperCase(),
      direction: req.body?.direction === "below" ? "below" : "above",
      price: Number(req.body?.price),
      note: String(req.body?.note ?? ""),
    });
    res.json({ ok: true, alert: row });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "alert failed" });
  }
});

deskRouter.delete("/alerts/:id", (req, res) => {
  removeAlert(req.params.id);
  res.json({ ok: true });
});

deskRouter.post("/journal", (req, res) => {
  try {
    const row = addJournal({
      yahoo: String(req.body?.yahoo ?? ""),
      symbol: String(req.body?.symbol ?? ""),
      thesis: String(req.body?.thesis ?? ""),
      side: String(req.body?.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    });
    res.json({ ok: true, entry: row });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "journal failed" });
  }
});

deskRouter.get("/watchlist", (_req, res) => {
  const store = readStore();
  res.json({ watchlist: store.watchlist ?? [], tracked: store.tracked ?? [] });
});

deskRouter.post("/watchlist", async (req, res) => {
  try {
    const query = String(req.body?.symbol ?? req.body?.yahoo ?? "");
    if (!query) return res.status(400).json({ error: "symbol required" });
    const instrument = await resolveInstrument(query);
    updateStore((store) => {
      if (!store.watchlist.includes(instrument.yahoo)) store.watchlist.push(instrument.yahoo);
      const exists = store.tracked.find((t) => t.yahoo === instrument.yahoo);
      if (!exists) store.tracked.push(instrument);
    });
    res.json({ ok: true, symbol: instrument.yahoo, name: instrument.name });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "watch failed" });
  }
});

deskRouter.delete("/watchlist/:symbol", (req, res) => {
  const yahoo = decodeURIComponent(req.params.symbol).toUpperCase();
  updateStore((store) => {
    store.watchlist = store.watchlist.filter((s) => s.toUpperCase() !== yahoo);
    store.tracked = store.tracked.filter((t) => t.yahoo.toUpperCase() !== yahoo);
  });
  res.json({ ok: true });
});

deskRouter.post("/alert", (req, res) => {
  try {
    const row = addAlert({
      yahoo: String(req.body?.yahoo ?? "").toUpperCase(),
      direction: req.body?.direction === "below" ? "below" : "above",
      price: Number(req.body?.price),
      note: String(req.body?.note ?? "manual"),
    });
    res.json({ ok: true, alert: row });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "alert failed" });
  }
});

deskRouter.get("/alert/analyze/:yahoo", async (req, res) => {
  try {
    const yahoo = req.params.yahoo;
    const alert = {
      yahoo,
      direction: "below",
      price: 0,
      note: "smart analysis",
    };
    const analysis = await analyzeAlert(alert);
    if (!analysis) {
      res.status(404).json({ error: "No data available for this symbol" });
      return;
    }
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "analysis failed" });
  }
});
