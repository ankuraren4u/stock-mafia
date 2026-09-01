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
    const result = await placeLiveOrder({
      symbol: String(req.body?.symbol ?? "").toUpperCase(),
      side: String(req.body?.side ?? "BUY").toUpperCase() as "BUY" | "SELL",
      quantity: Number(req.body?.quantity ?? 0),
      product: req.body?.product === "MIS" ? "MIS" : "CNC",
    });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "live order failed" });
  }
});
