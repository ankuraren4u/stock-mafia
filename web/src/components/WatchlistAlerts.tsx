import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Spinner } from "./Ui";
import { api, cls, money, pct } from "../lib/api";

interface Alert {
  id: string;
  yahoo: string;
  direction: "above" | "below";
  price: number;
  note: string;
  createdAt: number;
}

interface SmartAlert extends Alert {
  symbol: string;
  name: string;
  market: "IN" | "US";
  currency: string;
  currentPrice: number;
  changePct: number;
  triggered: boolean;
  suggestion?: {
    action: "BUY" | "SELL" | "HOLD";
    confidence: number;
    entry: number;
    stop: number;
    target: number;
    reasons: string[];
    risks: string[];
  };
}

export default function WatchlistAlerts() {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setBusy(true);
    try {
      const store = await api<{ alerts: Alert[] }>("/api/desk/alerts");
      const resolved = await Promise.all(
        (store.alerts || []).map(async (a) => {
          try {
            const q = await api<{ quote: { price: number; changePct: number; currency: string }; stock: { symbol: string; name: string; market: string } }>(
              `/api/market/stocks/${encodeURIComponent(a.yahoo)}`,
            );
            const triggered =
              (a.direction === "above" && q.quote.price >= a.price) ||
              (a.direction === "below" && q.quote.price <= a.price);
            return {
              ...a,
              symbol: q.stock.symbol,
              name: q.stock.name,
              market: q.stock.market as "IN" | "US",
              currency: q.quote.currency,
              currentPrice: q.quote.price,
              changePct: q.quote.changePct,
              triggered,
            };
          } catch {
            return { ...a, symbol: a.yahoo, name: "", market: "US" as const, currency: "USD", currentPrice: 0, changePct: 0, triggered: false };
          }
        }),
      );
      setAlerts(resolved.sort((a, b) => (a.triggered === b.triggered ? 0 : a.triggered ? -1 : 1)));
    } catch {}
    setBusy(false);
  }

  async function analyzeAlert(alert: SmartAlert) {
    setAnalyzing(alert.yahoo);
    try {
      const plan = await api<{ plan: { entry: number; stop: number; target: number }; checks: Array<{ pass: boolean; label: string; detail: string }>; passed: number; total: number }>(
        `/api/desk/plan/${encodeURIComponent(alert.yahoo)}`,
      );
      const reasons = plan.checks.filter((c) => c.pass).map((c) => c.label);
      const risks = plan.checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.detail}`);
      const score = (plan.passed / plan.total) * 100;

      setAlerts((prev) => prev.map((a) =>
        a.id === alert.id ? {
          ...a,
          suggestion: {
            action: score >= 60 ? (alert.direction === "below" ? "BUY" : "SELL") : "HOLD",
            confidence: Math.round(score),
            entry: plan.plan.entry,
            stop: plan.plan.stop,
            target: plan.plan.target,
            reasons,
            risks,
          },
        } : a,
      ));
    } catch {}
    setAnalyzing(null);
  }

  async function remove(id: string) {
    try { await api(`/api/desk/alerts/${id}`, { method: "DELETE" }); setAlerts((prev) => prev.filter((a) => a.id !== id)); } catch {}
  }

  if (alerts.length === 0 && !busy) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Smart Alerts ({alerts.length})</h3>
        <button className="btn" onClick={() => void load()} disabled={busy} style={{ fontSize: 12 }}>Refresh</button>
      </div>
      <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>When price hits your target, click "Analyze" for a buy/sell recommendation with data backing.</p>

      {busy && <Spinner label="Loading alerts…" />}

      {alerts.map((a) => (
        <div key={a.id} style={{
          padding: 10, marginBottom: 8, borderRadius: 8,
          border: `1px solid ${a.triggered ? "var(--green)" : "var(--line)"}`,
          background: a.triggered ? "rgba(34,197,94,0.04)" : "transparent",
        }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <Link to={`/stock/${encodeURIComponent(a.yahoo)}`} style={{ fontWeight: 700, fontSize: 14 }}>{a.symbol}</Link>
              <span className="muted" style={{ fontSize: 12 }}>{a.name}</span>
              <span className={cls("badge", a.direction === "above" ? "up" : "down")} style={{ fontSize: 11 }}>
                {a.direction === "above" ? "↑" : "↓"} {money(a.price, a.currency)}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>now {money(a.currentPrice, a.currency)}</span>
              {a.changePct !== 0 && <span className={cls("mono", a.changePct >= 0 ? "up" : "down")} style={{ fontSize: 11 }}>{pct(a.changePct)}</span>}
              {a.triggered && <span className="badge up" style={{ fontSize: 10 }}>TRIGGERED</span>}
            </div>
            <div className="row" style={{ gap: 4 }}>
              {a.triggered && !a.suggestion && (
                <button className="btn primary" style={{ fontSize: 11 }} disabled={analyzing === a.yahoo} onClick={() => void analyzeAlert(a)}>
                  {analyzing === a.yahoo ? "Analyzing…" : "Analyze"}
                </button>
              )}
              <button className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void remove(a.id)}>✕</button>
            </div>
          </div>

          {a.suggestion && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--panel-2)", borderRadius: 6 }}>
              <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span className={cls("badge", a.suggestion.action === "BUY" ? "up" : a.suggestion.action === "SELL" ? "down" : "")} style={{ fontSize: 12, fontWeight: 700 }}>
                  {a.suggestion.action}
                </span>
                <span className="mono" style={{ fontSize: 12 }}>{a.suggestion.confidence}% confidence</span>
              </div>
              <div className="row" style={{ gap: 12, fontSize: 12, marginBottom: 4 }}>
                <span>Entry <strong className="mono">{money(a.suggestion.entry, a.currency)}</strong></span>
                <span>Stop <strong className="mono down">{money(a.suggestion.stop, a.currency)}</strong></span>
                <span>Target <strong className="mono up">{money(a.suggestion.target, a.currency)}</strong></span>
              </div>
              {a.suggestion.reasons.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <span className="muted" style={{ fontSize: 11 }}>Reasons: </span>
                  {a.suggestion.reasons.slice(0, 3).map((r, i) => (
                    <span key={i} style={{ fontSize: 11, color: "var(--green)" }}>✓ {r}{i < Math.min(a.suggestion!.reasons.length, 3) - 1 ? " · " : ""}</span>
                  ))}
                </div>
              )}
              {a.suggestion.risks.length > 0 && (
                <div style={{ marginTop: 2 }}>
                  <span className="muted" style={{ fontSize: 11 }}>Risks: </span>
                  {a.suggestion.risks.slice(0, 2).map((r, i) => (
                    <span key={i} style={{ fontSize: 11, color: "var(--red)" }}>⚠ {r}{i < Math.min(a.suggestion!.risks.length, 2) - 1 ? " · " : ""}</span>
                  ))}
                </div>
              )}
              <Link to={`/stock/${encodeURIComponent(a.yahoo)}`} className="btn primary" style={{ fontSize: 11, marginTop: 6, display: "inline-block" }}>
                Trade →
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
