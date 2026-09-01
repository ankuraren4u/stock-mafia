import { KiteConnect } from "kiteconnect";
import { readStore, updateStore } from "../db/store.js";

export function kiteConfigured() {
  return Boolean(process.env.KITE_API_KEY && process.env.KITE_API_SECRET);
}

export function createKite(accessToken?: string | null) {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) throw new Error("KITE_API_KEY is not set");
  const kc = new KiteConnect({ api_key: apiKey });
  if (accessToken) kc.setAccessToken(accessToken);
  return kc;
}

export function loginUrl() {
  const kc = createKite();
  return kc.getLoginURL();
}

export async function exchangeRequestToken(requestToken: string) {
  const secret = process.env.KITE_API_SECRET;
  if (!secret) throw new Error("KITE_API_SECRET is not set");
  const kc = createKite();
  const session = (await kc.generateSession(requestToken, secret)) as {
    access_token: string;
    user_id?: string;
    userId?: string;
  };
  updateStore((store) => {
    store.kite.accessToken = session.access_token;
    store.kite.userId = session.user_id ?? session.userId ?? null;
    store.kite.loginTime = Date.now();
  });
  return session;
}

export function kiteStatus() {
  const store = readStore();
  return {
    configured: kiteConfigured(),
    connected: Boolean(store.kite.accessToken),
    userId: store.kite.userId,
    loginTime: store.kite.loginTime,
    redirectUrl: process.env.KITE_REDIRECT_URL ?? null,
  };
}

export async function placeLiveOrder(input: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  product: "CNC" | "MIS";
  orderType?: "MARKET" | "LIMIT";
  price?: number;
}) {
  const store = readStore();
  if (!store.kite.accessToken) throw new Error("Kite is not connected for today");
  const kc = createKite(store.kite.accessToken);
  return kc.placeOrder("regular", {
    exchange: "NSE",
    tradingsymbol: input.symbol,
    transaction_type: input.side,
    quantity: input.quantity,
    product: input.product,
    order_type: input.orderType ?? "MARKET",
    price: input.price,
    validity: "DAY",
    tag: "StockMafia",
  });
}

export async function kiteProfile() {
  const store = readStore();
  if (!store.kite.accessToken) return null;
  const kc = createKite(store.kite.accessToken);
  return kc.getProfile();
}

export async function kitePositions() {
  const store = readStore();
  if (!store.kite.accessToken) return null;
  const kc = createKite(store.kite.accessToken);
  return kc.getPositions();
}

export async function kiteHoldings() {
  const store = readStore();
  if (!store.kite.accessToken) return null;
  const kc = createKite(store.kite.accessToken);
  return kc.getHoldings();
}

export async function kiteOrders() {
  const store = readStore();
  if (!store.kite.accessToken) return null;
  const kc = createKite(store.kite.accessToken);
  return kc.getOrders();
}
