import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import TickerSearch from "../components/TickerSearch";
import { Banner, Spinner } from "../components/Ui";
import { api, cls, money, pct } from "../lib/api";

interface SignalRow {
  symbol: string;
  yahoo?: string;
  market?: string;
  currency?: string;
  name?: string;
  sector?: string;
  price?: number;
  changePct?: number;
  action?: string;
  score?: number;
  confidence?: number;
  reasons?: string[];
  error?: string;
}

interface EarningsAnalysis {
  symbol: string;
  nextEarnings: { date: string; epsEstimate: number | null } | null;
  beatRate: number;
  avgSurprisePercent: number;
  tendency: string;
  upcomingInDays: number | null;
  history: { date: string; epsEstimate: number; epsActual: number; surprisePercent: number }[];
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

interface GapAnalysis {
  gaps: { date: string; type: string; gapPercent: number; filled: boolean; fillPercent: number; volumeRatio: number }[];
  openGaps: any[];
  fillRate: number;
  currentPrice: number;
  nearestGapAbove: { price: number; percent: number } | null;
  nearestGapBelow: { price: number; percent: number } | null;
}

interface Seasonality {
  bestMonths: string[];
  worstMonths: string[];
  currentMonthSignal: string;
  summary: string;
  monthlyPatterns: { monthName: string; avgReturn: number; winRate: number }[];
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

type Tab = "signals" | "stock" | "sectors" | "ideas" | "macro";

export default function AnalysisPage() {
  const navigate = useNavigate();
  const [market, setMarket] = useState<"ALL" | "US" | "IN">("ALL");
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [signalLoading, setSignalLoading] = useState(true);
  const [signalError, setSignalError] = useState("");

  const [stockSymbol, setStockSymbol] = useState("");
  const [earnings, setEarnings] = useState<EarningsAnalysis | null>(null);
  const [gaps, setGaps] = useState<GapAnalysis | null>(null);
  const [seasonality, setSeasonality] = useState<Seasonality | null>(null);
  const [stockBusy, setStockBusy] = useState("");
  const [stockMsg, setStockMsg] = useState("");

  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [ideas, setIdeas] = useState<TradeIdea[]>([]);
  const [macro, setMacro] = useState<MacroIndicator[]>([]);
  const [breadth, setBreadth] = useState<BreadthData | null>(null);

  const [tab, setTab] = useState<Tab>("signals");

  useEffect(() => {
    setSignalLoading(true);
    const q = market === "ALL" ? "" : `?market=${market}`;
    api<{ signals: SignalRow[] }>(`/api/signals${q}`)
      .then((d) => setSignals(d.signals))
      .catch((err) => setSignalError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setSignalLoading(false));
    void loadMacro();
    void loadBreadth();
    void loadIdeas();
    void loadSectors();
  }, [market]);

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

  async function loadSectors() {
    try {
      const r = await api<{ rotation: SectorData[] }>("/api/intel/sector-rotation?market=US");
      setSectors(r.rotation);
    } catch {}
  }

  async function loadStockIntel() {
    if (!stockSymbol.trim()) return;
    setStockBusy(`Analyzing ${stockSymbol}…`);
    setStockMsg("");
    try {
      const [e, g, s] = await Promise.all([
        api<EarningsAnalysis>(`/api/intel/earnings/${encodeURIComponent(stockSymbol)}`),
        api<GapAnalysis>(`/api/intel/gaps/${encodeURIComponent(stockSymbol)}`),
        api<Seasonality>(`/api/intel/seasonality/${encodeURIComponent(stockSymbol)}`),
      ]);
      setEarnings(e);
      setGaps(g);
      setSeasonality(s);
      setStockMsg(`${stockSymbol} analysis loaded`);
    } catch (err) {
      setStockMsg(err instanceof Error ? err.message : "Failed to load");
    }
    setStockBusy("");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "signals", label: "Signals" },
    { id: "stock", label: "Stock Intel" },
    { id: "sectors", label: "Sectors" },
    { id: "ideas", label: "Trade Ideas" },
    { id: "macro", label: "Macro & Breadth" },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Analysis</h2>
          <p>Signals, stock intelligence, sector rotation, trade ideas, and macro data — all in one place.</p>
        </div>
        <div className="row">
          {(["ALL", "US", "IN"] as const).map((m) => (
            <button key={m} className={market === m ? "btn primary" : "btn"} onClick={() => setMarket(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <TickerSearch />

      <div className="row" style={{ gap: 4, margin: "12px 0", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} className={cls("btn", tab === t.id && "primary")} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "signals" && (
        <>
          {signalLoading ? <Spinner label="Scoring watchlist from prices and news…" /> : null}
          {signalError ? <Banner kind="error">{signalError}</Banner> : null}
          {!signalLoading && !signalError && signals.length === 0 ? (
            <Banner kind="info">No signals yet. Run the data crawler first.</Banner>
          ) : null}
          {signals.length > 0 && (
            <div className="card" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Market</th>
                    <th>Price</th>
                    <th>Action</th>
                    <th>Score</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((r) => (
                    <tr key={r.yahoo || r.symbol}>
                      <td>
                        <Link to={`/stock/${encodeURIComponent(r.yahoo || r.symbol)}`}>
                          <strong>{r.symbol}</strong>
                        </Link>
                        <div className="muted">{r.name}</div>
                      </td>
                      <td className="muted">{r.market ?? "—"}</td>
                      <td className="mono">
                        {r.price != null ? money(r.price, r.currency || "USD") : "—"}
                        <div className={cls(r.changePct != null && r.changePct >= 0 ? "up" : "down")}>
                          {r.changePct != null ? pct(r.changePct) : ""}
                        </div>
                      </td>
                      <td>
                        {r.action ? (
                          <span className={cls("badge", r.action.toLowerCase().replace(" ", "-"))}>{r.action}</span>
                        ) : (
                          <span className="error">{r.error}</span>
                        )}
                      </td>
                      <td className="mono">{r.score ?? "—"}</td>
                      <td className="muted">{r.reasons?.[0] ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "stock" && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>Stock Intelligence Lookup</h3>
            <div className="row" style={{ marginBottom: 12 }}>
              <input
                value={stockSymbol}
                onChange={(e) => setStockSymbol(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void loadStockIntel(); }}
                style={{ flex: 1, padding: "6px 8px" }}
                placeholder="Symbol (e.g. RELIANCE.NS, AAPL, UBER)"
              />
              <button className="btn primary" onClick={() => void loadStockIntel()} disabled={!!stockBusy}>
                Analyze
              </button>
            </div>
            {stockBusy ? <Spinner label={stockBusy} /> : null}
            {stockMsg ? <Banner kind="info">{stockMsg}</Banner> : null}
          </div>

          {earnings && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3>Earnings</h3>
              <div className="grid grid-3" style={{ gap: 12, marginBottom: 12 }}>
                <div className="kpi"><p className="muted">Beat Rate</p><p className={cls("mono", earnings.beatRate > 50 ? "up" : "down")}>{earnings.beatRate}%</p></div>
                <div className="kpi"><p className="muted">Avg Surprise</p><p className="mono">{earnings.avgSurprisePercent}%</p></div>
                <div className="kpi"><p className="muted">Tendency</p><p className={cls("mono", earnings.tendency === "beats" ? "up" : earnings.tendency === "misses" ? "down" : "")}>{earnings.tendency}</p></div>
              </div>
              {earnings.upcomingInDays != null && (
                <p className="muted" style={{ fontSize: 13 }}>Next earnings in {earnings.upcomingInDays} days</p>
              )}
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
            </div>
          )}

          {gaps && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3>Gap Analysis</h3>
              <div className="grid grid-3" style={{ gap: 12, marginBottom: 8 }}>
                <div className="kpi"><p className="muted">Fill Rate</p><p className="mono">{gaps.fillRate}%</p></div>
                <div className="kpi"><p className="muted">Open Gaps</p><p className="mono">{gaps.openGaps.length}</p></div>
                <div className="kpi">
                  <p className="muted">Nearest Gap</p>
                  <p className="mono">
                    {gaps.nearestGapAbove ? `↑ $${gaps.nearestGapAbove.price.toFixed(2)} (+${gaps.nearestGapAbove.percent}%)` : ""}
                    {gaps.nearestGapBelow ? ` ↓ $${gaps.nearestGapBelow.price.toFixed(2)} (${gaps.nearestGapBelow.percent}%)` : " —"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {seasonality && (
            <div className="card">
              <h3>Seasonality</h3>
              <div className="row" style={{ gap: 12, marginBottom: 8 }}>
                <span className={cls("badge", seasonality.currentMonthSignal === "bullish" ? "up" : seasonality.currentMonthSignal === "bearish" ? "down" : "")}>
                  Current: {seasonality.currentMonthSignal}
                </span>
                <span className="muted">Best: {seasonality.bestMonths.join(", ")}</span>
                <span className="muted">Worst: {seasonality.worstMonths.join(", ")}</span>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>{seasonality.summary}</p>
            </div>
          )}
        </>
      )}

      {tab === "sectors" && (
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

      {tab === "ideas" && (
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

      {tab === "macro" && (
        <>
          <div className="card">
            <h3>Macro Dashboard</h3>
            {macro.length > 0 ? (
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
            ) : <p className="muted">Loading macro data…</p>}
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
        </>
      )}
    </>
  );
}
