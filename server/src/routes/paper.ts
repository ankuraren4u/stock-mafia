import { Router } from "express";
import { fetchQuote } from "../services/market.js";
import { placePaperOrder, portfolioSnapshot } from "../services/paper.js";
import { readStore } from "../db/store.js";
import { resolveInstrument } from "../services/tickers.js";

export const paperRouter = Router();

paperRouter.get("/portfolio", async (_req, res) => {
  const store = readStore();
  const prices: Record<string, number> = {};
  await Promise.all(
    store.positions.map(async (p) => {
      try {
        const stock = await resolveInstrument(p.symbol);
        const q = await fetchQuote(stock.yahoo);
        prices[p.symbol] = q.price;
      } catch {
        /* keep avg */
      }
    }),
  );
  res.json(portfolioSnapshot(prices));
});

paperRouter.post("/order", async (req, res) => {
  try {
    const query = String(req.body?.symbol ?? "").toUpperCase();
    const side = String(req.body?.side ?? "BUY").toUpperCase() as "BUY" | "SELL";
    const quantity = Number(req.body?.quantity ?? 0);
    const stock = await resolveInstrument(query);
    const quote = await fetchQuote(stock.yahoo);
    const store = placePaperOrder({
      symbol: stock.yahoo,
      side,
      quantity,
      price: quote.price,
      note: req.body?.note ?? "manual paper",
    });
    res.json({ ok: true, cash: store.cash, positions: store.positions });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "order failed" });
  }
});
