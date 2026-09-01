import { Router } from "express";
import { readStore, updateStore } from "../db/store.js";
import { dryRunEnabledStrategies, runAlgoOnce } from "../services/algo.js";
import { executeTicket } from "../services/tickets.js";
import { STRATEGY_CATALOG } from "../services/strategies.js";

export const algoRouter = Router();

algoRouter.get("/", (_req, res) => {
  const algo = readStore().algo;
  res.json({ ...algo, catalog: STRATEGY_CATALOG });
});

algoRouter.post("/", (req, res) => {
  const store = updateStore((s) => {
    if (typeof req.body?.enabled === "boolean") s.algo.enabled = req.body.enabled;
    if (typeof req.body?.live === "boolean") s.algo.live = req.body.live;
    if (typeof req.body?.autoPaper === "boolean") s.algo.autoPaper = req.body.autoPaper;
    if (typeof req.body?.riskPct === "number") s.algo.riskPct = req.body.riskPct;
    if (Array.isArray(req.body?.enabledStrategies)) s.algo.enabledStrategies = req.body.enabledStrategies;
    if (Array.isArray(req.body?.rules)) s.algo.rules = req.body.rules;
  });
  res.json({ ...store.algo, catalog: STRATEGY_CATALOG });
});

algoRouter.post("/suggest", async (_req, res) => {
  try {
    const out = await runAlgoOnce();
    res.json({ ok: true, ...out, algo: readStore().algo, catalog: STRATEGY_CATALOG });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "suggest failed" });
  }
});

algoRouter.post("/run", async (_req, res) => {
  try {
    const out = await runAlgoOnce();
    res.json({ ok: true, ...out, algo: readStore().algo });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "algo run failed" });
  }
});

algoRouter.post("/dry-run", async (_req, res) => {
  try {
    const reports = await dryRunEnabledStrategies();
    res.json({ ok: true, reports });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "dry run failed" });
  }
});

algoRouter.post("/execute", async (req, res) => {
  try {
    const mode = req.body?.mode as "dry_run" | "paper" | "live";
    if (!["dry_run", "paper", "live"].includes(mode)) {
      res.status(400).json({ error: "mode must be dry_run, paper, or live" });
      return;
    }
    if (mode === "live" && !readStore().algo.live) {
      res.status(400).json({ error: "Turn on live orders in Algo settings, then confirm execute." });
      return;
    }
    const ids: string[] = Array.isArray(req.body?.ids)
      ? req.body.ids
      : req.body?.id
        ? [req.body.id]
        : [];
    if (!ids.length) {
      res.status(400).json({ error: "Provide ticket id or ids" });
      return;
    }
    const results = [];
    for (const ticketId of ids) {
      try {
        results.push(await executeTicket(ticketId, mode));
      } catch (err) {
        results.push({ ticketId, error: err instanceof Error ? err.message : "failed" });
      }
    }
    res.json({ ok: true, results, suggestions: readStore().algo.lastSuggestions });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "execute failed" });
  }
});
