import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Spinner } from "./Ui";
import { WatchButton } from "./WatchAlert";
import { api, cls, money, pct } from "../lib/api";

interface Target {
  entry: number;
  stop: number;
  target: number;
  rewardRisk: number;
}

interface Suggestion {
  symbol: string;
  yahoo: string;
  name: string;
  market: "IN" | "US";
  currency: string;
  price: number;
  changePct: number;
  action: "BUY" | "SELL" | "HOLD";
  conviction: number;
  sources: string[];
  reasoning: string[];
  technicalScore: number;
  sentimentScore: number;
  insiderScore: number;
  compositeScore: number;
  strategyHits: Array<{ strategyId: string; side: string; conviction: number; thesis: string[] }>;
  risks: string[];
  targets: Target;
  timestamp: number;
}

export default function SuggestionsFeed() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      const r = await api<{ suggestions: Suggestion[] }>("/api/suggestions");
      setSuggestions(r.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }

  if (loading && !suggestions.length) {
    return (
      <div className="card">
        <Spinner label="Analyzing watchlist with algo signals + intel data…" />
      </div>
    );
  }

  if (error && !suggestions.length) {
    return <Banner kind="error">{error}</Banner>;
  }

  if (!suggestions.length) {
    return (
      <div className="card">
        <h3>Trade Suggestions</h3>
        <p className="muted">No actionable signals right now. Add stocks to your watchlist and run the crawler.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Trade Suggestions ({suggestions.length})</h3>
        <button className="btn" onClick={() => void load()} disabled={loading} style={{ fontSize: 12 }}>Refresh</button>
      </div>
      <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
        Generated from technical signals, news sentiment, insider activity, and strategy engine
      </p>
      {suggestions.map((s) => (
        <div
          key={s.yahoo}
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            padding: 12,
            marginBottom: 10,
            background: s.action === "BUY" ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <Link to={`/stock/${encodeURIComponent(s.yahoo)}`} style={{ fontWeight: 700, fontSize: 15 }}>
                {s.symbol}
              </Link>
              <WatchButton yahoo={s.yahoo} name={s.name} />
              <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>{s.name}</span>
              <span className={cls("badge", s.market === "IN" ? "hold" : "")} style={{ marginLeft: 6, fontSize: 10 }}>
                {s.market}
              </span>
            </div>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="mono">{money(s.price, s.currency)}</span>
              <span className={cls("mono", s.changePct >= 0 ? "up" : "down")}>{pct(s.changePct)}</span>
              <span className={cls("badge", s.action === "BUY" ? "up" : "down")} style={{ fontSize: 13, fontWeight: 700 }}>
                {s.action}
              </span>
              <span className={cls("badge", s.conviction >= 70 ? "up" : s.conviction <= 40 ? "down" : "")} style={{ fontSize: 12 }}>
                {s.conviction}%
              </span>
            </div>
          </div>

          {/* Score bars */}
          <div className="row" style={{ gap: 12, marginBottom: 8, fontSize: 11 }}>
            <span className="muted">Technical: {s.technicalScore}</span>
            <span className="muted">Sentiment: {s.sentimentScore}</span>
            <span className="muted">Insider: {s.insiderScore}</span>
            <span className="muted">Composite: <strong>{s.compositeScore}</strong></span>
          </div>

          {/* Targets */}
          <div className="row" style={{ gap: 12, marginBottom: 8, fontSize: 12 }}>
            <span>Entry <strong className="mono">{money(s.targets.entry, s.currency)}</strong></span>
            <span>Stop <strong className="mono down">{money(s.targets.stop, s.currency)}</strong></span>
            <span>Target <strong className="mono up">{money(s.targets.target, s.currency)}</strong></span>
            <span>RR <strong className="mono">1:{s.targets.rewardRisk}</strong></span>
          </div>

          {/* Expand/collapse reasoning */}
          <button
            className="btn"
            style={{ fontSize: 11, padding: "2px 8px", marginBottom: 6 }}
            onClick={() => setExpanded(expanded === s.yahoo ? null : s.yahoo)}
          >
            {expanded === s.yahoo ? "Hide details" : `${s.reasoning.length} reasons · ${s.risks.length} risks`}
          </button>

          {expanded === s.yahoo && (
            <div style={{ marginTop: 6 }}>
              {s.reasoning.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 12 }}>Why</strong>
                  {s.reasoning.map((r, i) => (
                    <div key={i} className="muted" style={{ fontSize: 12, paddingLeft: 8 }}>• {r}</div>
                  ))}
                </div>
              )}
              {s.risks.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 12, color: "var(--red)" }}>Risks</strong>
                  {s.risks.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, paddingLeft: 8, color: "var(--red)" }}>• {r}</div>
                  ))}
                </div>
              )}
              {s.strategyHits.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 12 }}>Strategies triggered</strong>
                  {s.strategyHits.map((h, i) => (
                    <div key={i} className="muted" style={{ fontSize: 12, paddingLeft: 8 }}>
                      • {h.strategyId} ({h.side}, {h.conviction}%)
                    </div>
                  ))}
                </div>
              )}
              <div className="muted" style={{ fontSize: 10 }}>
                Sources: {s.sources.join(" · ")}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
