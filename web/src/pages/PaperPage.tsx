import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Spinner } from "../components/Ui";
import SuggestionsFeed from "../components/SuggestionsFeed";
import { api, cls, money, pct } from "../lib/api";

interface Portfolio {
  cash: number;
  invested: number;
  marketValue: number;
  equity: number;
  pnl: number;
  holdings: Array<{ symbol: string; quantity: number; avgPrice: number; ltp: number; value: number; pnl: number; pnlPct: number; }>;
  fills: Array<{ id: string; time: number; symbol: string; side: string; quantity: number; price: number; mode: string; note: string; }>;
}

export default function PaperPage() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  // Quick trade state
  const [tradeSymbol, setTradeSymbol] = useState("");
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [tradeQty, setTradeQty] = useState(1);
  const [tradeNote, setTradeNote] = useState("");

  async function refresh() { try { setData(await api<Portfolio>("/api/paper/portfolio")); } catch (err) { setError(err instanceof Error ? err.message : "Failed"); } }
  useEffect(() => { void refresh(); }, []);

  async function quickTrade() {
    if (!tradeSymbol.trim()) return;
    setBusy("Submitting trade…"); setMsg("");
    try {
      await api("/api/paper/order", { method: "POST", body: JSON.stringify({ symbol: tradeSymbol.trim(), side: tradeSide, quantity: tradeQty, note: tradeNote || `manual ${tradeSide.toLowerCase()}` }) });
      setMsg(`Paper ${tradeSide} recorded for ${tradeSymbol.trim()}.`);
      setTradeSymbol(""); setTradeNote("");
      await refresh();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Trade failed"); }
    setBusy("");
  }

  async function sellAll(symbol: string, qty: number) {
    setBusy(`Selling ${qty} ${symbol}…`);
    try { await api("/api/paper/order", { method: "POST", body: JSON.stringify({ symbol, side: "SELL", quantity: qty, note: "manual sell" }) }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Sell failed"); }
    setBusy("");
  }

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!data) return <div className="card"><Spinner label="Loading paper book…" /></div>;

  const totalPnlPct = data.invested > 0 ? (data.pnl / data.invested) * 100 : 0;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Paper Book</h2>
          <p>Simulated portfolio — practice trading without risking real money.</p>
        </div>
      </div>

      {busy && <Spinner label={busy} />}
      {msg && <Banner kind="info">{msg}</Banner>}

      {/* Quick Trade */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Quick Paper Trade</h3>
        <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>Buy or sell any stock instantly in your simulated portfolio.</p>
        <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input value={tradeSymbol} onChange={(e) => setTradeSymbol(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") void quickTrade(); }} placeholder="Stock symbol" style={{ width: 180, padding: "6px 8px" }} />
          <select value={tradeSide} onChange={(e) => setTradeSide(e.target.value as "BUY" | "SELL")} style={{ padding: "6px 8px" }}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
          <input type="number" min={1} value={tradeQty} onChange={(e) => setTradeQty(Number(e.target.value))} style={{ width: 70, padding: "6px 8px" }} />
          <input value={tradeNote} onChange={(e) => setTradeNote(e.target.value)} placeholder="Note (optional)" style={{ flex: 1, minWidth: 120, padding: "6px 8px" }} />
          <button className="btn primary" disabled={!tradeSymbol.trim()} onClick={() => void quickTrade()}>Paper {tradeSide}</button>
        </div>
      </div>

      {/* Algo Suggestions */}
      <SuggestionsFeed />

      {/* Portfolio Summary */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Total Value</p>
          <p className="mono" style={{ fontSize: 18 }}>{money(data.equity)}</p>
        </div>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Cash</p>
          <p className="mono" style={{ fontSize: 18 }}>{money(data.cash)}</p>
        </div>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Holdings</p>
          <p className="mono" style={{ fontSize: 18 }}>{money(data.marketValue)}</p>
        </div>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>P&L</p>
          <p className={cls("mono", data.pnl >= 0 ? "up" : "down")} style={{ fontSize: 18 }}>
            {money(data.pnl)} <span style={{ fontSize: 12 }}>({pct(totalPnlPct)})</span>
          </p>
        </div>
      </div>

      {/* Positions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Open Positions ({data.holdings.length})</h3>
        {data.holdings.length === 0 ? (
          <p className="muted">No positions yet. Use Quick Trade or Algo Suggestions to buy your first stock.</p>
        ) : (
          <table>
            <thead><tr><th>Stock</th><th>Qty</th><th>Avg</th><th>Current</th><th>Value</th><th>P&L</th><th></th></tr></thead>
            <tbody>
              {data.holdings.sort((a, b) => b.pnl - a.pnl).map((h) => (
                <tr key={h.symbol}>
                  <td><Link to={`/stock/${encodeURIComponent(h.symbol)}`}><strong>{h.symbol.replace(".NS", "")}</strong></Link></td>
                  <td className="mono">{h.quantity}</td>
                  <td className="mono">{money(h.avgPrice)}</td>
                  <td className="mono">{money(h.ltp)}</td>
                  <td className="mono">{money(h.value)}</td>
                  <td className={cls("mono", h.pnl >= 0 ? "up" : "down")}>{money(h.pnl)} ({pct(h.pnlPct)})</td>
                  <td><button className="btn danger" style={{ fontSize: 11, padding: "2px 8px" }} disabled={!!busy} onClick={() => void sellAll(h.symbol, h.quantity)}>Sell All</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Trades */}
      <div className="card">
        <h3>Recent Trades ({data.fills.length})</h3>
        {data.fills.length === 0 ? (
          <p className="muted">No trades yet.</p>
        ) : (
          <table>
            <thead><tr><th>Time</th><th>Stock</th><th>Side</th><th>Qty</th><th>Price</th><th>Note</th></tr></thead>
            <tbody>
              {data.fills.slice(0, 20).map((f) => (
                <tr key={f.id}>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(f.time).toLocaleString("en-IN")}</td>
                  <td><Link to={`/stock/${encodeURIComponent(f.symbol)}`}>{f.symbol.replace(".NS", "")}</Link></td>
                  <td><span className={cls("badge", f.side === "BUY" ? "up" : "down")}>{f.side}</span></td>
                  <td className="mono">{f.quantity}</td>
                  <td className="mono">{money(f.price)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
