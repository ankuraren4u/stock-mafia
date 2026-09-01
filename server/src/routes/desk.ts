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
