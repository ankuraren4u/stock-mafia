import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Spinner } from "../components/Ui";
import WatchlistAlerts from "../components/WatchlistAlerts";
import SuggestionsFeed from "../components/SuggestionsFeed";
import { api, cls, money } from "../lib/api";

interface Session { india: { open: boolean; clock: string; hours: string }; us: { open: boolean; clock: string; hours: string }; advice: string; }
interface Idea { yahoo: string; symbol: string; market: string; price: number; currency: string; action: string; score: number; stop: number; target: number; reason: string; }
interface Risk { cash: number; equity: number; pnl: number; cashPct: number; warnings: string[]; heat: Array<{ symbol: string; weight: number; pnlPct: number; value: number }>; sessions: Session; alerts: Array<{ id: string; yahoo: string; direction: string; price: number; note: string; last?: number; fired: boolean }>; journal: Array<{ id: string; time: number; symbol: string; thesis: string; side: string }>; }

export default function DeskPage() {
  const [risk, setRisk] = useState<Risk | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Quick trade state
  const [tradeSymbol, setTradeSymbol] = useState("");
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [tradeQty, setTradeQty] = useState(1);
  const [tradeNote, setTradeNote] = useState("");
  const [tradeBusy, setTradeBusy] = useState(false);

  async function refresh() {
    const [r, i] = await Promise.all([
      api<Risk>("/api/desk/risk"),
      api<{ ideas: Idea[] }>("/api/desk/ideas"),
    ]);
    setRisk(r); setIdeas(i.ideas);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
    const t = setInterval(() => void refresh().catch(() => undefined), 20000);
    return () => clearInterval(t);
  }, []);

  async function quickTrade() {
    if (!tradeSymbol.trim()) return;
    setTradeBusy(true);
    setMsg("");
    try {
      // Always paper trade
      await api("/api/paper/order", {
        method: "POST",
        body: JSON.stringify({
          symbol: tradeSymbol.trim(),
          side: tradeSide,
          quantity: tradeQty,
          note: tradeNote || `desk ${tradeSide.toLowerCase()}`,
        }),
      });
      if (tradeNote.trim().length >= 5) {
        await api("/api/desk/journal", {
          method: "POST",
          body: JSON.stringify({ yahoo: tradeSymbol.trim(), symbol: tradeSymbol.trim(), thesis: tradeNote, side: tradeSide }),
        });
      }
      setMsg(`Paper ${tradeSide} recorded for ${tradeSymbol.trim()}.`);
      setTradeSymbol("");
      setTradeNote("");
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Trade failed");
    }
    setTradeBusy(false);
  }

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!risk) return <div className="card"><Spinner label="Loading trade desk…" /></div>;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Trade Desk</h2>
          <p>Your daily command center — manual trade, algo suggestions, alerts, and portfolio overview.</p>
        </div>
      </div>

      {msg && <Banner kind={msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("error") ? "error" : "info"}>{msg}</Banner>}

      {/* Market Sessions */}
      <div className="grid grid-2" style={{ marginBottom: 12 }}>
        <div className="card" style={{ padding: "10px 14px" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>🇮🇳 India NSE</strong>
              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{risk.sessions.india.clock}</span>
            </div>
            <span className={cls("badge", risk.sessions.india.open ? "up" : "down")}>
              {risk.sessions.india.open ? "OPEN" : "CLOSED"}
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: "10px 14px" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>🇺🇸 US Markets</strong>
              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{risk.sessions.us.clock}</span>
            </div>
            <span className={cls("badge", risk.sessions.us.open ? "up" : "down")}>
              {risk.sessions.us.open ? "OPEN" : "CLOSED"}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Trade */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Quick Trade</h3>
        <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
          Paper trade any stock instantly. For Indian stocks with Kite connected, live orders are also available on the stock page.
        </p>
        <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={tradeSymbol}
            onChange={(e) => setTradeSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") void quickTrade(); }}
            placeholder="Stock symbol (e.g. RELIANCE.NS)"
            style={{ width: 200, padding: "6px 8px" }}
          />
          <select value={tradeSide} onChange={(e) => setTradeSide(e.target.value as "BUY" | "SELL")} style={{ padding: "6px 8px" }}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
          <input
            type="number" min={1} value={tradeQty}
            onChange={(e) => setTradeQty(Number(e.target.value))}
            style={{ width: 70, padding: "6px 8px" }}
          />
          <input
            value={tradeNote}
            onChange={(e) => setTradeNote(e.target.value)}
            placeholder="Thesis (optional)"
            style={{ flex: 1, minWidth: 150, padding: "6px 8px" }}
          />
          <button className="btn primary" disabled={tradeBusy || !tradeSymbol.trim()} onClick={() => void quickTrade()}>
            {tradeBusy ? "Trading…" : `Paper ${tradeSide}`}
          </button>
        </div>
      </div>

      {/* Portfolio Quick Stats */}
      <div className="grid grid-3" style={{ marginBottom: 12 }}>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Portfolio Value</p>
          <p className="mono" style={{ fontSize: 18 }}>{money(risk.equity)}</p>
        </div>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Cash Available</p>
          <p className="mono" style={{ fontSize: 18 }}>{money(risk.cash)}</p>
        </div>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Open P&L</p>
          <p className={cls("mono", risk.pnl >= 0 ? "up" : "down")} style={{ fontSize: 18 }}>{money(risk.pnl)}</p>
        </div>
      </div>

      {risk.warnings.length > 0 && <Banner kind="error">{risk.warnings.join(" ")}</Banner>}

      {/* Suggestions */}
      <SuggestionsFeed />

      {/* Watchlist Alerts */}
      <WatchlistAlerts />

      {/* Buy Ideas */}
      {ideas.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3>Top Setups</h3>
          <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>Watchlist stocks with strong signals — click to trade.</p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Stock</th><th>Score</th><th>Price</th><th>Stop</th><th>Target</th><th>Action</th></tr></thead>
              <tbody>
                {ideas.slice(0, 8).map((idea) => (
                  <tr key={idea.yahoo}>
                    <td>
                      <Link to={`/stock/${encodeURIComponent(idea.yahoo)}`}><strong>{idea.symbol}</strong></Link>
                      <div className="muted" style={{ fontSize: 11 }}>{idea.market}</div>
                    </td>
                    <td className="mono">{idea.score}</td>
                    <td className="mono">{money(idea.price, idea.currency)}</td>
                    <td className="mono down">{money(idea.stop, idea.currency)}</td>
                    <td className="mono up">{money(idea.target, idea.currency)}</td>
                    <td><Link to={`/stock/${encodeURIComponent(idea.yahoo)}`} className="btn primary" style={{ fontSize: 11 }}>Trade</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Concentration */}
      {risk.heat.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3>Position Sizes</h3>
          <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>How much of your portfolio is in each stock.</p>
          {risk.heat.sort((a, b) => b.weight - a.weight).map((h) => (
            <div key={h.symbol} className="heat-row">
              <Link to={`/stock/${encodeURIComponent(h.symbol)}`} style={{ fontSize: 12 }}>{h.symbol}</Link>
              <span className="heat-bar"><span style={{ width: `${Math.min(h.weight, 100)}%` }} /></span>
              <span className="mono" style={{ fontSize: 12 }}>{h.weight.toFixed(1)}%</span>
              <span className={cls("mono", h.pnlPct >= 0 ? "up" : "down")} style={{ fontSize: 11 }}>{h.pnlPct > 0 ? "+" : ""}{h.pnlPct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent Journal */}
      {risk.journal.length > 0 && (
        <div className="card">
          <h3>Recent Journal</h3>
          {risk.journal.slice(0, 5).map((j) => (
            <div key={j.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span><span className={cls("badge", j.side === "BUY" ? "up" : "down")}>{j.side}</span> <strong>{j.symbol}</strong></span>
                <span className="muted" style={{ fontSize: 11 }}>{new Date(j.time).toLocaleDateString("en-IN")}</span>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>{j.thesis}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
