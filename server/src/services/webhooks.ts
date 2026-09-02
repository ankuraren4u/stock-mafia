import type { PriceAlert } from "../db/store.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

interface NotificationPayload {
  title: string;
  body: string;
  symbol?: string;
  price?: number;
  direction?: string;
  score?: number;
  action?: string;
}

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendDiscord(content: string) {
  if (!DISCORD_WEBHOOK_URL) return false;
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendWebhook(payload: NotificationPayload) {
  if (!WEBHOOK_URL) return false;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (WEBHOOK_SECRET) headers["X-Webhook-Secret"] = WEBHOOK_SECRET;
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendNotification(payload: NotificationPayload) {
  const telegramText = [
    `<b>${payload.title}</b>`,
    payload.body,
    payload.symbol ? `Symbol: ${payload.symbol}` : "",
    payload.price ? `Price: ₹$${payload.price.toFixed(2)}` : "",
    payload.action ? `Action: ${payload.action}` : "",
    payload.score != null ? `Score: ${payload.score}` : "",
  ].filter(Boolean).join("\n");

  const discordText = [
    `**${payload.title}**`,
    payload.body,
    payload.symbol ? `Symbol: ${payload.symbol}` : "",
    payload.price ? `Price: $${payload.price.toFixed(2)}` : "",
  ].filter(Boolean).join("\n");

  await Promise.allSettled([
    sendTelegram(telegramText),
    sendDiscord(discordText),
    sendWebhook(payload),
  ]);
}

export async function notifyAlertTriggered(alert: PriceAlert, currentPrice: number) {
  await sendNotification({
    title: `Price Alert: ${alert.yahoo}`,
    body: `${alert.direction === "above" ? "Above" : "Below"} ${alert.price} — now at ${currentPrice.toFixed(2)}${alert.note ? ` (${alert.note})` : ""}`,
    symbol: alert.yahoo,
    price: currentPrice,
    direction: alert.direction,
  });
}

export async function notifySignalGenerated(input: {
  symbol: string;
  action: string;
  score: number;
  reason: string;
}) {
  if (Math.abs(input.score - 50) < 15) return;
  await sendNotification({
    title: `Signal: ${input.action}`,
    body: `${input.symbol} scored ${input.score}/100 — ${input.reason}`,
    symbol: input.symbol,
    score: input.score,
    action: input.action,
  });
}

export async function notifyTicketExecuted(input: {
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  strategy: string;
  mode: string;
}) {
  await sendNotification({
    title: `Trade Executed (${input.mode})`,
    body: `${input.side} ${input.quantity} ${input.symbol} @ $${input.price.toFixed(2)} — ${input.strategy}`,
    symbol: input.symbol,
    price: input.price,
    action: input.side,
  });
}
