import { Router } from "express";
import {
  exchangeRequestToken,
  kiteConfigured,
  kiteHoldings,
  kiteOrders,
  kitePositions,
  kiteProfile,
  kiteStatus,
  loginUrl,
  placeLiveOrder,
} from "../services/kite.js";
import { readStore } from "../db/store.js";

export const kiteRouter = Router();

kiteRouter.get("/status", (_req, res) => {
  res.json(kiteStatus());
});

kiteRouter.get("/login-url", (_req, res) => {
  try {
    if (!kiteConfigured()) {
      res.status(400).json({ error: "Set KITE_API_KEY and KITE_API_SECRET on the server." });
      return;
    }
    res.json({ url: loginUrl() });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "login url failed" });
  }
});

kiteRouter.get("/callback", async (req, res) => {
  const requestToken = String(req.query.request_token ?? "");
  const status = String(req.query.status ?? "");
  if (!requestToken || status === "login_cancelled") {
    res.redirect("/?kite=failed");
    return;
  }
  try {
    await exchangeRequestToken(requestToken);
    res.redirect("/?kite=connected");
  } catch (err) {
    console.error(err);
    res.redirect("/?kite=failed");
  }
});

kiteRouter.get("/account", async (_req, res) => {
  try {
    const [profile, positions, holdings, orders] = await Promise.all([
      kiteProfile(),
      kitePositions(),
      kiteHoldings(),
      kiteOrders(),
    ]);
    res.json({ profile, positions, holdings, orders });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "kite account failed" });
  }
});

kiteRouter.post("/order", async (req, res) => {
  try {
    const symbol = String(req.body?.symbol ?? "").toUpperCase();
    const side = String(req.body?.side ?? "BUY").toUpperCase() as "BUY" | "SELL";
    const quantity = Number(req.body?.quantity ?? 0);
    const product = req.body?.product === "MIS" ? "MIS" : "CNC";

    if (!symbol) return res.status(400).json({ error: "Symbol is required" });
    if (quantity <= 0) return res.status(400).json({ error: "Quantity must be positive" });

    if (!kiteConfigured()) {
      return res.status(400).json({
        error: "Live trading is not configured. Set KITE_API_KEY and KITE_API_SECRET in your server .env file to enable Zerodha trading.",
        code: "KITE_NOT_CONFIGURED",
      });
    }

    const store = readStore();
    if (!store.kite.accessToken) {
      return res.status(400).json({
        error: "Kite is not connected. Please complete the daily login from the Trade Desk.",
        code: "KITE_NOT_CONNECTED",
      });
    }

    const result = await placeLiveOrder({ symbol, side, quantity, product });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "live order failed" });
  }
});
