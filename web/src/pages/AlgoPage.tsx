import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Spinner } from "../components/Ui";
import { api, cls, money } from "../lib/api";

interface StrategyMeta { id: string; name: string; horizon: string; whyNow: string; logic: string; }
interface Ticket { id: string; strategyName: string; yahoo: string; symbol: string; market: string; side: "BUY" | "SELL"; quantity: number; entry: number; stop: number; target: number; conviction: number; thesis: string[]; liveOk: boolean; status: string; resultNote?: string; }
interface DryReport { strategyId: string; name: string; trades: number; avgWinRate: number; avgReturnPct: number; avgDrawdownPct: number; }
interface AlgoState { enabled: boolean; live: boolean; autoPaper: boolean; riskPct: number; enabledStrategies: string[]; lastRun: number | null; lastSuggestions: Ticket[]; dryRuns: DryReport[]; catalog: StrategyMeta[]; }

export default function AlgoPage() {
  const [algo, setAlgo] = useState<AlgoState | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() { setAlgo(await api<AlgoState>("/api/algo")); }
  useEffect(() => { void refresh().catch((err) => setMsg(err instanceof Error ? err.message : "Failed")); }, []);

  async function save(patch: Partial<AlgoState>) {
    if (!algo) return;
    setAlgo(await api<AlgoState>("/api/algo", { method: "POST", body: JSON.stringify({ ...algo, ...patch }) }));
  }

  async function suggest() {
    setBusy("Scanning…");
    try { await api("/api/algo/suggest", { method: "POST" }); await refresh(); setMsg("Done — see suggestions below."); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    setBusy("");
  }

  async function execute(ids: string[], mode: "paper") {
    setBusy(`Paper executing ${ids.length} trade(s)…`);
    try { await api("/api/algo/execute", { method: "POST", body: JSON.stringify({ ids, mode }) }); await refresh(); setMsg("Paper trades recorded."); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    setBusy("");
  }

  if (!algo) return <div className="card"><Spinner label="Loading strategies…" /></div>;

  const open = algo.lastSuggestions.filter((t) => t.status === "open");

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Strategies</h2>
          <p>13 systematic strategies scan your watchlist and suggest trades with entry, stop, and target.</p>
        </div>
      </div>
      {busy ? <Spinner label={busy} /> : null}
      {msg ? <Banner kind="info">{msg}</Banner> : null}

      {/* Quick Actions */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <button className={cls("btn", algo.enabled ? "primary" : "")} onClick={() => void save({ enabled: !algo.enabled })}>
              {algo.enabled ? "● Scanner ON" : "○ Scanner OFF"}
            </button>
            <button className={cls("btn", algo.autoPaper ? "primary" : "")} onClick={() => void save({ autoPaper: !algo.autoPaper })}>
              Auto-paper {algo.autoPaper ? "ON" : "OFF"}
            </button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary" onClick={() => void suggest()} disabled={!!busy}>Scan Now</button>
            {open.length > 0 && (
              <button className="btn primary" onClick={() => void execute(open.map((t) => t.id), "paper")} disabled={!!busy}>
                Paper Trade All ({open.length})
              </button>
            )}
          </div>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Risk {algo.riskPct}% per trade · Last scan: {algo.lastRun ? new Date(algo.lastRun).toLocaleString("en-IN") : "never"}
        </p>
      </div>

      {/* Suggested Trades */}
      {open.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Suggested Trades ({open.length})</h3>
          <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>Click "Paper Trade" to simulate, or go to the stock page for details.</p>
          {open.map((t) => {
            const ccy = t.market === "US" ? "USD" : "INR";
            return (
              <div key={t.id} className="card" style={{ marginBottom: 8, borderLeft: t.side === "BUY" ? "3px solid var(--green)" : "3px solid var(--red)" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <Link to={`/stock/${encodeURIComponent(t.yahoo)}`} style={{ fontWeight: 700, fontSize: 15 }}>{t.symbol}</Link>
                    <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>{t.strategyName}</span>
                    <span className={cls("badge", t.side === "BUY" ? "up" : "down")} style={{ marginLeft: 6 }}>{t.side}</span>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className={cls("badge", t.conviction >= 70 ? "up" : "")}>{t.conviction}%</span>
                    <button className="btn primary" onClick={() => void execute([t.id], "paper")} disabled={!!busy}>Paper Trade</button>
                  </div>
                </div>
                <div className="row" style={{ gap: 12, fontSize: 12, marginBottom: 4 }}>
                  <span>Entry <strong className="mono">{money(t.entry, ccy)}</strong></span>
                  <span>Stop <strong className="mono down">{money(t.stop, ccy)}</strong></span>
                  <span>Target <strong className="mono up">{money(t.target, ccy)}</strong></span>
                  <span>Qty <strong className="mono">{t.quantity}</strong></span>
                </div>
                {t.thesis[0] && <p className="muted" style={{ fontSize: 12, margin: 0 }}>→ {t.thesis[0]}</p>}
              </div>
            );
          })}
        </div>
      )}

      {!open.length && algo.lastSuggestions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="muted">All suggested trades have been executed. Click "Scan Now" to find new setups.</p>
        </div>
      )}

      {/* Strategies */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Active Strategies ({algo.enabledStrategies.length}/{algo.catalog.length})</h3>
        <p className="muted" style={{ marginBottom: 12 }}>Toggle strategies on/off. Each uses different technical patterns to find trades.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
          {algo.catalog.map((s) => {
            const on = algo.enabledStrategies.includes(s.id);
            return (
              <div key={s.id} style={{ padding: "8px 10px", border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, borderRadius: 8, cursor: "pointer", background: on ? "rgba(26,111,235,0.04)" : "transparent" }} onClick={() => void save({ enabledStrategies: on ? algo.enabledStrategies.filter((x) => x !== s.id) : [...algo.enabledStrategies, s.id] })}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{s.name}</strong>
                  <span className={cls("badge", on ? "up" : "")} style={{ fontSize: 10 }}>{on ? "ON" : "OFF"}</span>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>{s.logic}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dry Run Results */}
      {algo.dryRuns.length > 0 && (
        <div className="card">
          <h3>Backtest Results</h3>
          <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>Historical simulation on 1 year of data. Past ≠ future.</p>
          <table>
            <thead><tr><th>Strategy</th><th>Trades</th><th>Win Rate</th><th>Avg Return</th><th>Max Drop</th></tr></thead>
            <tbody>
              {algo.dryRuns.map((r) => (
                <tr key={r.strategyId}>
                  <td>{r.name}</td>
                  <td className="mono">{r.trades}</td>
                  <td className="mono">{r.avgWinRate}%</td>
                  <td className={cls("mono", r.avgReturnPct >= 0 ? "up" : "down")}>{r.avgReturnPct}%</td>
                  <td className="mono">{r.avgDrawdownPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
