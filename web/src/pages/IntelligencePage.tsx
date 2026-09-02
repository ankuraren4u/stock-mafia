import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banner, Spinner } from "../components/Ui";
import { api, cls } from "../lib/api";

interface EarningsAnalysis {
  symbol: string;
  nextEarnings: { date: string; epsEstimate: number | null } | null;
  beatRate: number;
  avgSurprisePercent: number;
  tendency: string;
  upcomingInDays: number | null;
  history: { date: string; epsEstimate: number; epsActual: number; surprisePercent: number }[];
}

interface SectorData {
  sector: string;
  etf: string;
  week1Return: number;
  week4Return: number;
  week12Return: number;
  ytdReturn: number;
  relativeStrength: number;
  momentum: string;
  rotationSignal: string;
}

interface TradeIdea {
  symbol: string;
  yahoo: string;
  name: string;
  market: string;
  price: number;
  changePct: number;
  type: string;
  conviction: number;
  direction: string;
  thesis: string[];
  technicals: { rsi: number | null; adx: number | null; volumeRatio: number; atrPct: number };
}

interface MacroIndicator {
  name: string;
  value: number;
  changePct: number;
  trend: string;
  regime: string;
}

interface BreadthData {
  advances: number;
  declines: number;
  advanceDeclineRatio: number;
  newHighs: number;
  newLows: number;
  percentAboveSMA50: number;
  percentAboveSMA200: number;
  marketPhase: string;
  breadthMomentum: string;
  summary: string;
}

interface PairTrade {
  symbolA: string;
  symbolB: string;
  zScore: number;
  correlation: number;
  halfLife: number | null;
  entrySignal: string;
  confidence: number;
  summary: string;
}

interface GapAnalysis {
  gaps: { date: string; type: string; gapPercent: number; filled: boolean; fillPercent: number; volumeRatio: number }[];
  openGaps: any[];
  fillRate: number;
  currentPrice: number;
  nearestGapAbove: { price: number; percent: number } | null;
  nearestGapBelow: { price: number; percent: number } | null;
}

interface RiskDashboard {
  portfolioBeta: number;
  portfolioVaR95: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  riskScore: number;
  regime: string;
  stressTests: { name: string; impactPct: number; probability: string }[];
  summary: string;
}

interface Seasonality {
  bestMonths: string[];
  worstMonths: string[];
  currentMonthSignal: string;
  summary: string;
  monthlyPatterns: { monthName: string; avgReturn: number; winRate: number }[];
}

export default function IntelligencePage() {
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [earnings, setEarnings] = useState<EarningsAnalysis | null>(null);
  const [gaps, setGaps] = useState<GapAnalysis | null>(null);
  const [seasonality, setSeasonality] = useState<Seasonality | null>(null);
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [ideas, setIdeas] = useState<TradeIdea[]>([]);
  const [macro, setMacro] = useState<MacroIndicator[]>([]);
  const [breadth, setBreadth] = useState<BreadthData | null>(null);
  const [pairs, setPairs] = useState<PairTrade[]>([]);
  const [risk, setRisk] = useState<RiskDashboard | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "earnings" | "sectors" | "ideas" | "macro" | "risk">("overview");

  useEffect(() => {
    void loadMacro();
    void loadBreadth();
    void loadIdeas();
    void loadRisk();
    void loadSectors();
  }, []);

  async function loadStockIntel() {
    setBusy(`Loading intelligence for ${symbol}…`);
    try {
      const [e, g, s] = await Promise.all([
        api<EarningsAnalysis>(`/api/intel/earnings/${encodeURIComponent(symbol)}`),
        api<GapAnalysis>(`/api/intel/gaps/${encodeURIComponent(symbol)}`),
        api<Seasonality>(`/api/intel/seasonality/${encodeURIComponent(symbol)}`),
      ]);
      setEarnings(e);
      setGaps(g);
      setSeasonality(s);
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    setBusy("");
  }

  async function loadMacro() {
    try {
      const r = await api<{ indicators: MacroIndicator[] }>("/api/intel/macro");
      setMacro(r.indicators);
    } catch {}
  }

  async function loadBreadth() {
    try { setBreadth(await api<BreadthData>("/api/intel/breadth?market=US")); } catch {}
  }

  async function loadIdeas() {
    try {
      const r = await api<{ ideas: TradeIdea[] }>("/api/intel/ideas?market=ALL");
      setIdeas(r.ideas);
    } catch {}
  }

  async function loadRisk() {
    try { setRisk(await api<RiskDashboard>("/api/intel/risk")); } catch {}
  }

  async function loadSectors() {
    try {
      const r = await api<{ rotation: SectorData[] }>("/api/intel/sector-rotation?market=US");
      setSectors(r.rotation);
    } catch {}
  }

  async function loadPairs() {
    try {
      const r = await api<{ pairs: PairTrade[] }>("/api/intel/pairs?market=US");
      setPairs(r.pairs);
    } catch {}
  }

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "earnings" as const, label: "Earnings" },
    { id: "sectors" as const, label: "Sectors" },
    { id: "ideas" as const, label: "Trade Ideas" },
    { id: "macro" as const, label: "Macro" },
    { id: "risk" as const, label: "Risk" },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Market Intelligence</h2>
          <p>Earnings, insider activity, sector rotation, macro dashboard, trade ideas, risk analytics, and more.</p>
        </div>
      </div>

      {msg ? <Banner kind="info">{msg}</Banner> : null}
      {busy ? <Spinner label={busy} /> : null}

      <div className="row" style={{ gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} className={cls("btn", activeTab === t.id && "primary")} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <div className="card">
            <h3>Stock Intelligence Lookup</h3>
            <div className="row" style={{ marginBottom: 12 }}>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ flex: 1, padding: "6px 8px" }} placeholder="Symbol (e.g. RELIANCE.NS, AAPL)" />
              <button className="btn primary" onClick={() => void loadStockIntel()} disabled={!!busy}>Analyze</button>
            </div>
            {earnings && (
              <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Earnings</strong>
                  <span className={cls("badge", earnings.tendency === "beats" ? "up" : earnings.tendency === "misses" ? "down" : "")}>
                    {earnings.tendency}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  Beat rate: {earnings.beatRate}% · Avg surprise: {earnings.avgSurprisePercent}% ·
                  {earnings.upcomingInDays != null ? ` Next in ${earnings.upcomingInDays} days` : " No upcoming date"}
                </p>
              </div>
            )}
            {gaps && (
              <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Gap Analysis</strong>
                  <span className="muted">{gaps.fillRate}% fill rate</span>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  {gaps.openGaps.length} open gaps ·
                  {gaps.nearestGapAbove ? ` Nearest above: $${gaps.nearestGapAbove.price.toFixed(2)} (+${gaps.nearestGapAbove.percent}%)` : ""} ·
                  {gaps.nearestGapBelow ? ` Nearest below: $${gaps.nearestGapBelow.price.toFixed(2)} (${gaps.nearestGapBelow.percent}%)` : ""}
                </p>
              </div>
            )}
            {seasonality && (
              <div style={{ padding: "8px 0" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Seasonality</strong>
                  <span className={cls("badge", seasonality.currentMonthSignal === "bullish" ? "up" : seasonality.currentMonthSignal === "bearish" ? "down" : "")}>
                    {seasonality.currentMonthSignal}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  Best: {seasonality.bestMonths.join(", ")} · Worst: {seasonality.worstMonths.join(", ")}
                </p>
              </div>
            )}
          </div>

          {risk && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Risk Dashboard</h3>
              <div className="grid grid-4" style={{ gap: 12 }}>
                {[
                  { label: "Risk Score", value: `${risk.riskScore}/100`, good: risk.riskScore < 50 },
                  { label: "VaR 95%", value: `${risk.portfolioVaR95}%`, good: risk.portfolioVaR95 < 3 },
                  { label: "Sharpe", value: risk.sharpeRatio.toFixed(2), good: risk.sharpeRatio > 1 },
                  { label: "Max DD", value: `${risk.maxDrawdown}%`, good: risk.maxDrawdown < 15 },
                  { label: "Beta", value: risk.portfolioBeta.toFixed(2), good: risk.portfolioBeta < 1.3 },
                  { label: "Sortino", value: risk.sortinoRatio.toFixed(2), good: risk.sortinoRatio > 1.5 },
                  { label: "Regime", value: risk.regime.replace(/_/g, " "), good: risk.regime.includes("bull") },
                ].map((k) => (
                  <div key={k.label} className="kpi">
                    <p className="muted">{k.label}</p>
                    <p className={cls("mono", k.good ? "up" : "down")}>{k.value}</p>
                  </div>
                ))}
              </div>
              {risk.stressTests.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h4>Stress Tests</h4>
                  {risk.stressTests.map((s) => (
                    <div key={s.name} style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                        <span>{s.name}</span>
                        <span className={cls("mono", s.impactPct >= 0 ? "up" : "down")}>{s.impactPct > 0 ? "+" : ""}{s.impactPct}%</span>
                        <span className="muted">{s.probability}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "earnings" && (
        <div className="card">
          <h3>Earnings Intelligence</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ flex: 1, padding: "6px 8px" }} placeholder="Symbol" />
            <button className="btn primary" onClick={() => void loadStockIntel()} disabled={!!busy}>Load Earnings</button>
          </div>
          {earnings && (
            <>
              <div className="grid grid-3" style={{ gap: 12, marginBottom: 16 }}>
                <div className="kpi"><p className="muted">Beat Rate</p><p className={cls("mono", earnings.beatRate > 50 ? "up" : "down")}>{earnings.beatRate}%</p></div>
                <div className="kpi"><p className="muted">Avg Surprise</p><p className="mono">{earnings.avgSurprisePercent}%</p></div>
                <div className="kpi"><p className="muted">Tendency</p><p className="mono">{earnings.tendency}</p></div>
              </div>
              {earnings.history.length > 0 && (
                <table>
                  <thead><tr><th>Date</th><th>Estimate</th><th>Actual</th><th>Surprise</th></tr></thead>
                  <tbody>
                    {earnings.history.map((h) => (
                      <tr key={h.date}>
                        <td>{h.date}</td>
                        <td className="mono">${h.epsEstimate.toFixed(2)}</td>
                        <td className="mono">${h.epsActual.toFixed(2)}</td>
                        <td className={cls("mono", h.surprisePercent > 0 ? "up" : "down")}>{h.surprisePercent > 0 ? "+" : ""}{h.surprisePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "sectors" && (
        <div className="card">
          <h3>Sector Rotation Map</h3>
          <p className="muted" style={{ marginBottom: 12 }}>Relative strength ranking — sectors rotate through leading → weakening → lagging → improving phases</p>
          {sectors.length > 0 ? (
            <table>
              <thead>
                <tr><th>Sector</th><th>1W</th><th>4W</th><th>12W</th><th>YTD</th><th>RS</th><th>Momentum</th><th>Signal</th></tr>
              </thead>
              <tbody>
                {sectors.map((s) => (
                  <tr key={s.sector}>
                    <td><strong>{s.sector}</strong> <span className="muted">{s.etf}</span></td>
                    <td className={cls("mono", s.week1Return >= 0 ? "up" : "down")}>{s.week1Return}%</td>
                    <td className={cls("mono", s.week4Return >= 0 ? "up" : "down")}>{s.week4Return}%</td>
                    <td className={cls("mono", s.week12Return >= 0 ? "up" : "down")}>{s.week12Return}%</td>
                    <td className={cls("mono", s.ytdReturn >= 0 ? "up" : "down")}>{s.ytdReturn}%</td>
                    <td className="mono">{s.relativeStrength}</td>
                    <td><span className={cls("badge", s.momentum === "leading" ? "up" : s.momentum === "lagging" ? "down" : "")}>{s.momentum}</span></td>
                    <td><span className={cls("badge", s.rotationSignal === "rotate_in" ? "up" : s.rotationSignal === "rotate_out" ? "down" : "")}>{s.rotationSignal}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Loading sector data…</p>}
        </div>
      )}

      {activeTab === "ideas" && (
        <div className="card">
          <h3>Trade Ideas ({ideas.length})</h3>
          <p className="muted" style={{ marginBottom: 12 }}>Scanned from pattern detection — breakouts, volume spikes, reversals, accumulation, and volatility squeezes</p>
          {ideas.length > 0 ? (
            <table>
              <thead>
                <tr><th>Stock</th><th>Price</th><th>Type</th><th>Direction</th><th>Conviction</th><th>RSI</th><th>Vol Ratio</th><th>Thesis</th></tr>
              </thead>
              <tbody>
                {ideas.map((idea) => (
                  <tr key={idea.yahoo} style={{ cursor: "pointer" }} onClick={() => navigate(`/stock/${idea.yahoo}`)}>
                    <td><strong>{idea.symbol}</strong><div className="muted" style={{ fontSize: 11 }}>{idea.name} · {idea.market}</div></td>
                    <td className="mono">{idea.price.toFixed(2)}</td>
                    <td><span className="badge">{idea.type.replace(/_/g, " ")}</span></td>
                    <td><span className={cls("badge", idea.direction === "bullish" ? "up" : idea.direction === "bearish" ? "down" : "")}>{idea.direction}</span></td>
                    <td><span className={cls("badge", idea.conviction >= 70 ? "up" : "")}>{idea.conviction}</span></td>
                    <td className="mono">{idea.technicals.rsi?.toFixed(0) ?? "—"}</td>
                    <td className="mono">{idea.technicals.volumeRatio}x</td>
                    <td className="muted" style={{ fontSize: 11, maxWidth: 200 }}>{idea.thesis[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Scanning for setups…</p>}
        </div>
      )}

      {activeTab === "macro" && (
        <>
          <div className="card">
            <h3>Macro Dashboard</h3>
            <div className="grid grid-4" style={{ gap: 12 }}>
              {macro.map((m) => (
                <div key={m.name} className="kpi">
                  <p className="muted">{m.name}</p>
                  <p className="mono">{m.value}</p>
                  <p className={cls("mono", m.changePct >= 0 ? "up" : "down")} style={{ fontSize: 12 }}>{m.changePct > 0 ? "+" : ""}{m.changePct}%</p>
                  <p className="muted" style={{ fontSize: 11 }}>{m.regime}</p>
                </div>
              ))}
            </div>
          </div>
          {breadth && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Market Breadth</h3>
              <div className="grid grid-4" style={{ gap: 12 }}>
                {[
                  { label: "Advances", value: String(breadth.advances), good: true },
                  { label: "Declines", value: String(breadth.declines), good: false },
                  { label: "A/D Ratio", value: breadth.advanceDeclineRatio.toFixed(2), good: breadth.advanceDeclineRatio > 1 },
                  { label: "New Highs", value: String(breadth.newHighs), good: breadth.newHighs > breadth.newLows },
                  { label: "New Lows", value: String(breadth.newLows), good: false },
                  { label: "Above 50MA", value: `${breadth.percentAboveSMA50}%`, good: breadth.percentAboveSMA50 > 50 },
                  { label: "Above 200MA", value: `${breadth.percentAboveSMA200}%`, good: breadth.percentAboveSMA200 > 50 },
                  { label: "Market Phase", value: breadth.marketPhase, good: breadth.marketPhase === "markup" },
                  { label: "Breadth", value: breadth.breadthMomentum, good: breadth.breadthMomentum === "expanding" },
                ].map((k) => (
                  <div key={k.label} className="kpi">
                    <p className="muted">{k.label}</p>
                    <p className={cls("mono", k.good ? "up" : "down")}>{k.value}</p>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ marginTop: 8 }}>{breadth.summary}</p>
            </div>
          )}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Pair Trading Scanner</h3>
              <button className="btn" onClick={() => void loadPairs()}>Scan Pairs</button>
            </div>
            {pairs.length > 0 ? (
              <table>
                <thead><tr><th>Pair</th><th>Z-Score</th><th>Correlation</th><th>Half-Life</th><th>Signal</th><th>Confidence</th></tr></thead>
                <tbody>
                  {pairs.map((p) => (
                    <tr key={`${p.symbolA}-${p.symbolB}`}>
                      <td><strong>{p.symbolA.replace(".NS", "")}</strong> / <strong>{p.symbolB.replace(".NS", "")}</strong></td>
                      <td className={cls("mono", Math.abs(p.zScore) > 2 ? "up" : "")}>{p.zScore.toFixed(2)}</td>
                      <td className="mono">{p.correlation.toFixed(3)}</td>
                      <td className="mono">{p.halfLife?.toFixed(1) ?? "—"}d</td>
                      <td><span className={cls("badge", p.entrySignal !== "neutral" ? "up" : "")}>{p.entrySignal.replace(/_/g, " ")}</span></td>
                      <td className="mono">{p.confidence}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">Click "Scan Pairs" to find cointegrated pairs</p>}
          </div>
        </>
      )}

      {activeTab === "risk" && risk && (
        <div className="card">
          <h3>Portfolio Risk Analytics</h3>
          <div className="grid grid-4" style={{ gap: 12, marginBottom: 16 }}>
            {[
              { label: "Risk Score", value: `${risk.riskScore}/100`, good: risk.riskScore < 50 },
              { label: "Beta", value: risk.portfolioBeta.toFixed(2), good: risk.portfolioBeta < 1.3 },
              { label: "VaR 95% Daily", value: `${risk.portfolioVaR95}%`, good: risk.portfolioVaR95 < 3 },
              { label: "Max Drawdown", value: `${risk.maxDrawdown}%`, good: risk.maxDrawdown < 15 },
              { label: "Sharpe Ratio", value: risk.sharpeRatio.toFixed(2), good: risk.sharpeRatio > 1 },
              { label: "Sortino Ratio", value: risk.sortinoRatio.toFixed(2), good: risk.sortinoRatio > 1.5 },
              { label: "Market Regime", value: risk.regime.replace(/_/g, " "), good: risk.regime.includes("bull") },
            ].map((k) => (
              <div key={k.label} className="kpi">
                <p className="muted">{k.label}</p>
                <p className={cls("mono", k.good ? "up" : "down")}>{k.value}</p>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginBottom: 12 }}>{risk.summary}</p>
          <h4>Stress Test Scenarios</h4>
          <table>
            <thead><tr><th>Scenario</th><th>Market Shock</th><th>Estimated Impact</th><th>Probability</th></tr></thead>
            <tbody>
              {risk.stressTests.map((s) => (
                <tr key={s.name}>
                  <td><strong>{s.name}</strong></td>
                  <td className="mono">{s.impactPct > 0 ? "+" : ""}{s.impactPct}%</td>
                  <td className={cls("mono", s.impactPct >= 0 ? "up" : "down")}>{s.impactPct > 0 ? "+" : ""}{s.impactPct}%</td>
                  <td className="muted">{s.probability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
