import { useEffect, useState } from "react";
import { Banner, EmptyState, Skeleton, Spinner } from "../components/Ui";
import { api, cls, money, pct } from "../lib/api";

interface Portfolio {
  cash: number;
  invested: number;
  marketValue: number;
  equity: number;
  pnl: number;
  holdings: Array<{
    symbol: string;
    quantity: number;
    avgPrice: number;
    ltp: number;
    value: number;
    pnl: number;
    pnlPct: number;
  }>;
  fills: Array<{
    id: string;
    time: number;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    mode: string;
    note: string;
  }>;
}

export default function PaperPage() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Portfolio>("/api/paper/portfolio")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!data) {
    return (
      <div className="card">
        <Spinner label="Loading paper book…" />
        <Skeleton lines={5} />
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Paper book</h2>
          <p>Virtual portfolio for signal rehearsal. Use Trade desk for sizing, concentration, and alerts before live Kite.</p>
        </div>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <div className="label">Equity</div>
          <div className="value">{money(data.equity)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Cash</div>
          <div className="value">{money(data.cash)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Holdings</div>
          <div className="value">{money(data.marketValue)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Unrealised P&L</div>
          <div className={cls("value", data.pnl >= 0 ? "up" : "down")}>{money(data.pnl)}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Positions</h3>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Qty</th>
              <th>Avg</th>
              <th>LTP</th>
              <th>P&L</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState title="No paper positions" body="Buy from a stock page to start the virtual book." />
                </td>
              </tr>
            ) : (
              data.holdings.map((h) => (
                <tr key={h.symbol}>
                  <td>{h.symbol}</td>
                  <td className="mono">{h.quantity}</td>
                  <td className="mono">{money(h.avgPrice)}</td>
                  <td className="mono">{money(h.ltp)}</td>
                  <td className={cls("mono", h.pnl >= 0 ? "up" : "down")}>
                    {money(h.pnl)} ({pct(h.pnlPct)})
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Fills</h3>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {data.fills.map((f) => (
              <tr key={f.id}>
                <td className="muted">{new Date(f.time).toLocaleString("en-IN")}</td>
                <td>{f.symbol}</td>
                <td className={f.side === "BUY" ? "up" : "down"}>{f.side}</td>
                <td className="mono">{f.quantity}</td>
                <td className="mono">{money(f.price)}</td>
                <td className="muted">
                  {f.mode} · {f.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
