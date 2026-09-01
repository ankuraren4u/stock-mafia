import { updateStore, type PaperFill } from "../db/store.js";

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function placePaperOrder(input: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  note?: string;
  mode?: "paper" | "live";
}) {
  if (input.quantity <= 0) throw new Error("Quantity must be positive");
  const notional = input.quantity * input.price;

  return updateStore((store) => {
    if (input.side === "BUY") {
      if (store.cash < notional) throw new Error("Insufficient paper cash");
      store.cash -= notional;
      const existing = store.positions.find((p) => p.symbol === input.symbol);
      if (existing) {
        const totalQty = existing.quantity + input.quantity;
        existing.avgPrice =
          (existing.avgPrice * existing.quantity + notional) / totalQty;
        existing.quantity = totalQty;
      } else {
        store.positions.push({
          symbol: input.symbol,
          quantity: input.quantity,
          avgPrice: input.price,
        });
      }
    } else {
      const existing = store.positions.find((p) => p.symbol === input.symbol);
      if (!existing || existing.quantity < input.quantity) {
        throw new Error("Not enough quantity to sell");
      }
      store.cash += notional;
      existing.quantity -= input.quantity;
      if (existing.quantity === 0) {
        store.positions = store.positions.filter((p) => p.symbol !== input.symbol);
      }
    }

    const fill: PaperFill = {
      id: id(),
      time: Date.now(),
      symbol: input.symbol,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      mode: input.mode ?? "paper",
      note: input.note ?? "manual",
    };
    store.fills.unshift(fill);
    store.fills = store.fills.slice(0, 200);
  });
}

export function portfolioSnapshot(prices: Record<string, number>) {
  const store = updateStore(() => undefined);
  const holdings = store.positions.map((p) => {
    const ltp = prices[p.symbol] ?? p.avgPrice;
    const value = ltp * p.quantity;
    const pnl = (ltp - p.avgPrice) * p.quantity;
    return { ...p, ltp, value, pnl, pnlPct: p.avgPrice ? (pnl / (p.avgPrice * p.quantity)) * 100 : 0 };
  });
  const invested = holdings.reduce((a, b) => a + b.avgPrice * b.quantity, 0);
  const marketValue = holdings.reduce((a, b) => a + b.value, 0);
  return {
    cash: store.cash,
    invested,
    marketValue,
    equity: store.cash + marketValue,
    pnl: marketValue - invested,
    holdings,
    fills: store.fills.slice(0, 40),
  };
}
