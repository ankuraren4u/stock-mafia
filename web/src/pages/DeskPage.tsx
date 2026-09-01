import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, EmptyState, Skeleton, Spinner } from "../components/Ui";
import { api, cls, money, pct } from "../lib/api";

interface Session {
  india: { open: boolean; clock: string; hours: string };
  us: { open: boolean; clock: string; hours: string };
  advice: string;
}

interface Idea {
  yahoo: string;
  symbol: string;
  market: string;
  price: number;
  currency: string;
  action: string;
  score: number;
  stop: number;
  target: number;
  reason: string;
}

interface Risk {
  cash: number;
  equity: number;
  pnl: number;
  cashPct: number;
  warnings: string[];
  heat: Array<{ symbol: string; weight: number; pnlPct: number; value: number }>;
  sessions: Session;
  alerts: Array<{
    id: string;
    yahoo: string;
    direction: string;
    price: number;
    note: string;
    last?: number;
    fired: boolean;
  }>;
  journal: Array<{ id: string; time: number; symbol: string; thesis: string; side: string }>;
}

export default function DeskPage() {
  const [risk, setRisk] = useState<Risk | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [error, setError] = useState("");
  const [alertYahoo, setAlertYahoo] = useState("AAPL");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDir, setAlertDir] = useState<"above" | "below">("below");

  async function refresh() {
    const [r, i] = await Promise.all([api<Risk>("/api/desk/risk"), api<{ ideas: Idea[] }>("/api/desk/ideas")]);
    setRisk(r);
    setIdeas(i.ideas);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
    const t = setInterval(() => void refresh().catch(() => undefined), 20000);
    return () => clearInterval(t);
  }, []);

  async function saveAlert() {
    await api("/api/desk/alerts", {
      method: "POST",
      body: JSON.stringify({
        yahoo: alertYahoo,
        direction: alertDir,
        price: Number(alertPrice),
        note: "desk",
      }),
    });
    setAlertPrice("");
    await refresh();
  }

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!risk) {
    return (
      <div className="card">
        <Spinner label="Loading trade desk…" />
        <Skeleton lines={6} />
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Trade desk</h2>
          <p>
            Process over prediction: size from a stop, wait for a session, write why you are wrong. Nothing here is a
            guarantee of profit.
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>India · NSE</h3>
          <div className={cls("session-pill", risk.sessions.india.open ? "open" : "closed")}>
            {risk.sessions.india.open ? "Open" : "Closed"}
          </div>
          <p className="mono">{risk.sessions.india.clock}</p>
          <p className="muted">{risk.sessions.india.hours}</p>
        </div>
        <div className="card">
          <h3>United States</h3>
          <div className={cls("session-pill", risk.sessions.us.open ? "open" : "closed")}>
            {risk.sessions.us.open ? "Open" : "Closed"}
          </div>
          <p className="mono">{risk.sessions.us.clock}</p>
          <p className="muted">{risk.sessions.us.hours}</p>
        </div>
      </div>
      <Banner kind="info">{risk.sessions.advice}</Banner>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <div className="label">Paper equity</div>
          <div className="value">{money(risk.equity)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Cash buffer</div>
          <div className="value">{risk.cashPct.toFixed(0)}%</div>
        </div>
        <div className="card kpi">
          <div className="label">Open P&L</div>
          <div className={cls("value", risk.pnl >= 0 ? "up" : "down")}>{money(risk.pnl)}</div>
        </div>
      </div>

      {risk.warnings.length ? (
        <Banner kind="error">{risk.warnings.join(" ")}</Banner>
      ) : (
        <Banner kind="ok">Book looks within basic risk rails (cash, concentration, names count).</Banner>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Buy ideas from snapshots</h3>
        <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
          Watchlist names with score ≥ 58. Open a name to size with 2×ATR stop and 2R target.
        </p>
        {ideas.length === 0 ? (
          <EmptyState title="No high-score names right now" body="Let the crawler refresh, or wait for better RSI/MACD confluence." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Score</th>
                <th>Last</th>
                <th>Invalid if</th>
                <th>Target (2R)</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((idea) => (
                <tr key={idea.yahoo}>
                  <td>
                    <Link to={`/stock/${encodeURIComponent(idea.yahoo)}`}>
                      <strong>{idea.symbol}</strong>
                    </Link>
                    <div className="muted">{idea.market} · {idea.reason}</div>
                  </td>
                  <td className="mono">{idea.score}</td>
                  <td className="mono">{money(idea.price, idea.currency)}</td>
                  <td className="mono down">{money(idea.stop, idea.currency)}</td>
                  <td className="mono up">{money(idea.target, idea.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Concentration</h3>
          {risk.heat.length === 0 ? (
            <EmptyState title="No open paper names" body="Size the first ticket from a stock page using the plan quantity." />
          ) : (
            risk.heat
              .sort((a, b) => b.weight - a.weight)
              .map((h) => (
                <div key={h.symbol} className="heat-row">
                  <span>{h.symbol}</span>
                  <span className="heat-bar">
                    <span style={{ width: `${Math.min(h.weight, 100)}%` }} />
                  </span>
                  <span className="mono">{h.weight.toFixed(1)}%</span>
                </div>
              ))
          )}
        </div>
        <div className="card">
          <h3>Price alerts</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            <input value={alertYahoo} onChange={(e) => setAlertYahoo(e.target.value.toUpperCase())} style={{ width: 110 }} />
            <select value={alertDir} onChange={(e) => setAlertDir(e.target.value as "above" | "below")}>
              <option value="below">hits stop / below</option>
              <option value="above">hits target / above</option>
            </select>
            <input
              type="number"
              value={alertPrice}
              onChange={(e) => setAlertPrice(e.target.value)}
              placeholder="Price"
              style={{ width: 100 }}
            />
            <button className="btn primary" disabled={!alertPrice} onClick={() => void saveAlert()}>
              Watch
            </button>
          </div>
          {risk.alerts.length === 0 ? <p className="muted">No alerts. Set a stop or target level you must not ignore.</p> : null}
          {risk.alerts.map((a) => (
            <div key={a.id} className={cls("alert-row", a.fired && "fired")}>
              <div>
                <strong>{a.yahoo}</strong> {a.direction} {a.price}
                <div className="muted">Last {a.last ?? "—"} {a.fired ? "· triggered" : ""}</div>
              </div>
              <button className="btn ghost" onClick={() => void api(`/api/desk/alerts/${a.id}`, { method: "DELETE" }).then(refresh)}>
                Clear
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Trade journal</h3>
        {risk.journal.length === 0 ? (
          <p className="muted">After a paper buy, write the thesis on the stock page. Review losers first.</p>
        ) : (
          <table>
            <tbody>
              {risk.journal.slice(0, 12).map((j) => (
                <tr key={j.id}>
                  <td className="muted">{new Date(j.time).toLocaleString("en-IN")}</td>
                  <td>{j.side} {j.symbol}</td>
                  <td>{j.thesis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
