import { useEffect, useState } from "react";
import { Banner, Skeleton, Spinner } from "../components/Ui";
import { api, cls, money } from "../lib/api";

interface StrategyMeta {
  id: string;
  name: string;
  horizon: string;
  whyNow: string;
  logic: string;
}

interface Ticket {
  id: string;
  strategyName: string;
  yahoo: string;
  symbol: string;
  market: string;
  side: "BUY" | "SELL";
  quantity: number;
  entry: number;
  stop: number;
  target: number;
  conviction: number;
  thesis: string[];
  liveOk: boolean;
  status: string;
  resultNote?: string;
}

interface DryReport {
  strategyId: string;
  name: string;
  trades: number;
  avgWinRate: number;
  avgReturnPct: number;
  avgDrawdownPct: number;
}

interface AlgoState {
  enabled: boolean;
  live: boolean;
  autoPaper: boolean;
  riskPct: number;
  enabledStrategies: string[];
  lastRun: number | null;
  lastSuggestions: Ticket[];
  dryRuns: DryReport[];
  catalog: StrategyMeta[];
}

interface KiteStatus {
  configured: boolean;
  connected: boolean;
  userId: string | null;
  redirectUrl: string | null;
}

export default function AlgoPage() {
  const [algo, setAlgo] = useState<AlgoState | null>(null);
  const [kite, setKite] = useState<KiteStatus | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() {
    const [a, k] = await Promise.all([
      api<AlgoState>("/api/algo"),
      api<KiteStatus>("/api/kite/status"),
    ]);
    setAlgo(a);
    setKite(k);
  }

  useEffect(() => {
    void refresh().catch((err) => setMsg(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function save(patch: Partial<AlgoState>) {
    if (!algo) return;
    const next = await api<AlgoState>("/api/algo", {
      method: "POST",
      body: JSON.stringify({ ...algo, ...patch }),
    });
    setAlgo(next);
  }

  async function toggleStrategy(id: string) {
    if (!algo) return;
    const enabled = algo.enabledStrategies.includes(id)
      ? algo.enabledStrategies.filter((x) => x !== id)
      : [...algo.enabledStrategies, id];
    await save({ enabledStrategies: enabled });
  }

  async function connectKite() {
    const { url } = await api<{ url: string }>("/api/kite/login-url");
    window.location.href = url;
  }

  async function suggest() {
    setBusy("Scanning watchlist for live setups…");
    try {
      const out = await api<{ suggestions: Ticket[] }>("/api/algo/suggest", { method: "POST" });
      setMsg(`${out.suggestions.length} suggested tickets from current signals.`);
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Suggest failed");
    } finally {
      setBusy("");
    }
  }

  async function dryRun() {
    setBusy("Dry-running enabled algos on ~1 year of daily bars…");
    try {
      await api("/api/algo/dry-run", { method: "POST" });
      setMsg("Dry run finished. Results are historical simulations, not a promise of future profit.");
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Dry run failed");
    } finally {
      setBusy("");
    }
  }

  async function execute(ids: string[], mode: "dry_run" | "paper" | "live") {
    setBusy(`Executing ${ids.length} ticket(s) as ${mode}…`);
    try {
      const out = await api<{ error?: string }>("/api/algo/execute", {
        method: "POST",
        body: JSON.stringify({ ids, mode }),
      });
      setMsg(mode === "live" ? "Live orders sent to Kite where allowed." : "Done.");
      void out;
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Execute failed");
    } finally {
      setBusy("");
    }
  }

  if (!algo || !kite) {
    return (
      <div className="card">
        <Spinner label="Loading strategies…" />
        <Skeleton lines={6} />
      </div>
    );
  }
  const openTickets = algo.lastSuggestions.filter((t) => t.status === "open");

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Strategies</h2>
          <p>
            Systematic setups used on liquid US and NSE names: trend pullbacks, breakouts, quality dips, relative
            strength, and risk-off. No strategy is a guarantee of profit.
          </p>
        </div>
      </div>
      {busy ? <Spinner label={busy} /> : null}
      {msg ? <Banner kind="info">{msg}</Banner> : null}

      <div className="grid grid-2">
        <div className="card">
          <h3>Zerodha Kite (India live)</h3>
          <p className="muted">
            {kite.configured
              ? kite.connected
                ? `Connected${kite.userId ? ` as ${kite.userId}` : ""}.`
                : "API keys set. Complete daily Kite login."
              : "Set KITE_API_KEY / KITE_API_SECRET to execute NSE live."}
          </p>
          <button className="btn primary" disabled={!kite.configured} onClick={() => void connectKite()}>
            Login with Zerodha
          </button>
        </div>
        <div className="card">
          <h3>Controls</h3>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={() => void save({ enabled: !algo.enabled })}>
              Scheduler {algo.enabled ? "on" : "off"}
            </button>
            <button className="btn" onClick={() => void save({ autoPaper: !algo.autoPaper })}>
              Auto paper {algo.autoPaper ? "on" : "off"}
            </button>
            <button className={algo.live ? "btn danger" : "btn"} onClick={() => void save({ live: !algo.live })}>
              Live gate {algo.live ? "ON" : "off"}
            </button>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => void suggest()}>
              Suggest from signals
            </button>
            <button className="btn" onClick={() => void dryRun()}>
              Dry run (1y)
            </button>
          </div>
          <p className="muted">
            Risk {algo.riskPct}% of paper cash per ticket · last run{" "}
            {algo.lastRun ? new Date(algo.lastRun).toLocaleString("en-IN") : "never"}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Playbook</h3>
        {algo.catalog.map((s) => (
          <div key={s.id} className="playbook">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{s.name}</strong>
              <button className={algo.enabledStrategies.includes(s.id) ? "btn primary" : "btn"} onClick={() => void toggleStrategy(s.id)}>
                {algo.enabledStrategies.includes(s.id) ? "Enabled" : "Off"}
              </button>
            </div>
            <p className="muted">{s.whyNow}</p>
            <p>
              {s.logic} · {s.horizon}
            </p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Dry-run scoreboard</h3>
        {algo.dryRuns.length === 0 ? (
          <p className="muted">Run Dry run (1y) to replay each enabled algo on the watchlist. Past ≠ future.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Algo</th>
                <th>Trades</th>
                <th>Win rate</th>
                <th>Avg simulated return</th>
                <th>Avg max DD</th>
              </tr>
            </thead>
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
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Suggested transactions</h3>
          <div className="row">
            <button
              className="btn"
              disabled={!openTickets.length}
              onClick={() => void execute(openTickets.map((t) => t.id), "dry_run")}
            >
              Dry-run all
            </button>
            <button
              className="btn primary"
              disabled={!openTickets.length}
              onClick={() => void execute(openTickets.map((t) => t.id), "paper")}
            >
              Paper all
            </button>
          </div>
        </div>
        {algo.lastSuggestions.length === 0 ? (
          <p className="muted">Click Suggest from signals to build tickets with size, stop, and 2R target.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Setup</th>
                <th>Ticket</th>
                <th>Qty</th>
                <th>Stop / target</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {algo.lastSuggestions.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.symbol}</strong> <span className="muted">{t.market}</span>
                    <div className="muted">{t.strategyName} · conv {t.conviction}</div>
                    <div className="muted">{t.thesis[0]}</div>
                  </td>
                  <td className={t.side === "BUY" ? "up" : "down"}>
                    {t.side} @ {money(t.entry, t.market === "US" ? "USD" : "INR")}
                    <div className="muted">{t.status}{t.resultNote ? ` · ${t.resultNote}` : ""}</div>
                  </td>
                  <td className="mono">{t.quantity}</td>
                  <td className="mono">
                    {money(t.stop, t.market === "US" ? "USD" : "INR")}
                    <br />
                    {money(t.target, t.market === "US" ? "USD" : "INR")}
                  </td>
                  <td>
                    {t.status === "open" ? (
                      <div className="row">
                        <button className="btn" onClick={() => void execute([t.id], "dry_run")}>
                          Dry
                        </button>
                        <button className="btn primary" onClick={() => void execute([t.id], "paper")}>
                          Paper
                        </button>
                        <button
                          className="btn danger"
                          disabled={!t.liveOk || !algo.live}
                          onClick={() => void execute([t.id], "live")}
                        >
                          Live
                        </button>
                      </div>
                    ) : (
                      <span className="muted">{t.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ marginTop: 12 }}>
          Live is NSE via Kite only, after the live gate is on. US names stay on dry-run / paper. Position size uses
          2×ATR stops and {algo.riskPct}% of paper cash. This is not investment advice.
        </p>
      </div>
    </>
  );
}
