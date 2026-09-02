import { useEffect, useState } from "react";
import { Banner, Spinner } from "../components/Ui";
import { api, cls } from "../lib/api";

interface PortfolioAnalytics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  kellyCriterion: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  expectancy: number;
  valueAtRisk95: number;
}

interface MTFResult {
  timeframe: string;
  trend: string;
  strength: number;
  rsi: number | null;
  macd: string;
  emaAlignment: string;
  summary: string;
}

interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
}

interface WalkForwardResult {
  inSample: { trades: number; winRate: number; totalReturnPct: number; sharpe: number; maxDrawdownPct: number };
  outOfSample: { trades: number; winRate: number; totalReturnPct: number; sharpe: number; maxDrawdownPct: number };
  stability: number;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [mtf, setMtf] = useState<MTFResult[] | null>(null);
  const [corr, setCorr] = useState<CorrelationMatrix | null>(null);
  const [wf, setWf] = useState<WalkForwardResult | null>(null);
  const [mtfSymbol, setMtfSymbol] = useState("RELIANCE.NS");
  const [wfSymbol, setWfSymbol] = useState("RELIANCE.NS");
  const [wfStrategy, setWfStrategy] = useState("trend-pullback");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void api<PortfolioAnalytics>("/api/advanced/portfolio-analytics").then(setAnalytics).catch(() => {});
    void api<CorrelationMatrix>("/api/advanced/correlation").then(setCorr).catch(() => {});
  }, []);

  async function loadMTF() {
    setBusy("Loading multi-timeframe analysis…");
    try {
      const r = await api<{ timeframes: MTFResult[] }>(`/api/advanced/multi-timeframe/${encodeURIComponent(mtfSymbol)}`);
      setMtf(r.timeframes);
    } catch (err) { setMsg(err instanceof Error ? err.message : "MTF failed"); }
    setBusy("");
  }

  async function loadWF() {
    setBusy("Running walk-forward backtest…");
    try {
      const r = await api<WalkForwardResult & { symbol: string }>("/api/advanced/backtest/walk-forward", {
        method: "POST",
        body: JSON.stringify({ symbol: wfSymbol, strategyId: wfStrategy }),
      });
      setWf(r);
    } catch (err) { setMsg(err instanceof Error ? err.message : "WF failed"); }
    setBusy("");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Analytics & Research</h2>
          <p>Portfolio analytics, multi-timeframe analysis, correlation matrix, and walk-forward backtesting.</p>
        </div>
      </div>
      {msg ? <Banner kind="info">{msg}</Banner> : null}
      {busy ? <Spinner label={busy} /> : null}

      {analytics && (
        <div className="card">
          <h3>Portfolio Analytics</h3>
          <div className="grid grid-4" style={{ gap: 12 }}>
            {[
              { label: "Total Return", value: `${(analytics.totalReturn * 100).toFixed(2)}%`, good: analytics.totalReturn > 0 },
              { label: "Sharpe Ratio", value: analytics.sharpeRatio.toFixed(2), good: analytics.sharpeRatio > 1 },
              { label: "Sortino Ratio", value: analytics.sortinoRatio.toFixed(2), good: analytics.sortinoRatio > 1.5 },
              { label: "Max Drawdown", value: `${(analytics.maxDrawdown * 100).toFixed(2)}%`, good: analytics.maxDrawdown < 0.15 },
              { label: "Win Rate", value: `${(analytics.winRate * 100).toFixed(1)}%`, good: analytics.winRate > 0.5 },
              { label: "Profit Factor", value: analytics.profitFactor.toFixed(2), good: analytics.profitFactor > 1.5 },
              { label: "Kelly %", value: `${(analytics.kellyCriterion * 100).toFixed(1)}%`, good: analytics.kellyCriterion > 0.1 },
              { label: "VaR 95%", value: `${(analytics.valueAtRisk95 * 100).toFixed(2)}%`, good: analytics.valueAtRisk95 < 0.03 },
              { label: "Expectancy", value: `${(analytics.expectancy * 100).toFixed(2)}%`, good: analytics.expectancy > 0 },
              { label: "Total Trades", value: String(analytics.totalTrades), good: analytics.totalTrades > 10 },
              { label: "Avg Win", value: `${(analytics.avgWin * 100).toFixed(2)}%`, good: true },
              { label: "Avg Loss", value: `${(analytics.avgLoss * 100).toFixed(2)}%`, good: analytics.avgLoss > -0.05 },
            ].map((kpi) => (
              <div key={kpi.label} className="kpi">
                <p className="muted">{kpi.label}</p>
                <p className={cls("mono", kpi.good ? "up" : "down")}>{kpi.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Multi-Timeframe Analysis</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            <input value={mtfSymbol} onChange={(e) => setMtfSymbol(e.target.value)} style={{ flex: 1, padding: "6px 8px" }} placeholder="Symbol (e.g. RELIANCE.NS)" />
            <button className="btn primary" onClick={() => void loadMTF()} disabled={!!busy}>Analyze</button>
          </div>
          {mtf && mtf.map((tf) => (
            <div key={tf.timeframe} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{tf.timeframe}</strong>
                <span className={cls("badge", tf.trend === "bullish" ? "up" : tf.trend === "bearish" ? "down" : "")}>
                  {tf.trend}
                </span>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>{tf.summary}</p>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Walk-Forward Backtest</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            <input value={wfSymbol} onChange={(e) => setWfSymbol(e.target.value)} style={{ flex: 1, padding: "6px 8px" }} placeholder="Symbol" />
            <select value={wfStrategy} onChange={(e) => setWfStrategy(e.target.value)} style={{ padding: "6px 8px" }}>
              <option value="trend-pullback">Trend Pullback</option>
              <option value="momentum-breakout">Momentum Breakout</option>
              <option value="mean-reversion">Mean Reversion</option>
              <option value="quality-dip">Quality Dip</option>
              <option value="dual-momentum">Dual Momentum</option>
              <option value="risk-off">Risk Off</option>
              <option value="vwap-bounce">VWAP Bounce</option>
              <option value="supertrend-flip">Supertrend Flip</option>
              <option value="ichimoku-breakout">Ichimoku Breakout</option>
              <option value="adx-trend">ADX Trend</option>
              <option value="fibonacci-retrace">Fibonacci Retrace</option>
              <option value="stochastic-snap">Stochastic Snap</option>
            </select>
            <button className="btn primary" onClick={() => void loadWF()} disabled={!!busy}>Run</button>
          </div>
          {wf && (
            <div>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <div>
                  <h4>In-Sample (Training)</h4>
                  <p className="muted">Trades: {wf.inSample.trades} · Win: {wf.inSample.winRate}% · Return: {wf.inSample.totalReturnPct}% · Sharpe: {wf.inSample.sharpe} · DD: {wf.inSample.maxDrawdownPct}%</p>
                </div>
                <div>
                  <h4>Out-of-Sample (Validation)</h4>
                  <p className="muted">Trades: {wf.outOfSample.trades} · Win: {wf.outOfSample.winRate}% · Return: {wf.outOfSample.totalReturnPct}% · Sharpe: {wf.outOfSample.sharpe} · DD: {wf.outOfSample.maxDrawdownPct}%</p>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>Stability: {(wf.stability * 100).toFixed(0)}% — {wf.stability > 0.7 ? "Strategy is robust" : "Strategy may be overfit"}</p>
            </div>
          )}
        </div>
      </div>

      {corr && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Correlation Matrix</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th></th>
                  {corr.symbols.map((s) => <th key={s} style={{ fontSize: 11 }}>{s.replace(".NS", "")}</th>)}
                </tr>
              </thead>
              <tbody>
                {corr.matrix.map((row, i) => (
                  <tr key={i}>
                    <td><strong style={{ fontSize: 11 }}>{corr.symbols[i].replace(".NS", "")}</strong></td>
                    {row.map((v, j) => (
                      <td key={j} style={{
                        background: i === j ? "var(--bg)" : v > 0.7 ? "rgba(34,197,94,0.2)" : v < -0.3 ? "rgba(239,68,68,0.2)" : "transparent",
                        textAlign: "center",
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                      }}>
                        {v.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
