import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import TickerSearch from "../components/TickerSearch";
import { Banner, Spinner } from "../components/Ui";
import { WatchButton, AlertButton } from "../components/WatchAlert";
import { useMarket } from "../hooks/useMarket";
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

interface MacroIndicator { name: string; value: number; changePct: number; trend: string; regime: string; }
interface BreadthData { advances: number; declines: number; advanceDeclineRatio: number; newHighs: number; newLows: number; percentAboveSMA50: number; percentAboveSMA200: number; marketPhase: string; breadthMomentum: string; summary: string; }
interface EarningsAnalysis { symbol: string; nextEarnings: { date: string; epsEstimate: number | null } | null; beatRate: number; avgSurprisePercent: number; tendency: string; upcomingInDays: number | null; history: { date: string; epsEstimate: number; epsActual: number; surprisePercent: number }[]; }
interface GapAnalysis { gaps: any[]; openGaps: any[]; fillRate: number; currentPrice: number; nearestGapAbove: { price: number; percent: number } | null; nearestGapBelow: { price: number; percent: number } | null; }
interface Seasonality { bestMonths: string[]; worstMonths: string[]; currentMonthSignal: string; summary: string; monthlyPatterns: { monthName: string; avgReturn: number; winRate: number }[]; }
interface TradeIdea { symbol: string; yahoo: string; name: string; market: string; price: number; changePct: number; type: string; conviction: number; direction: string; thesis: string[]; technicals: { rsi: number | null; adx: number | null; volumeRatio: number; atrPct: number }; }
interface SectorData { sector: string; etf: string; week1Return: number; week4Return: number; week12Return: number; ytdReturn: number; relativeStrength: number; momentum: string; rotationSignal: string; }
interface PortfolioAnalytics { totalReturn: number; annualizedReturn: number; sharpeRatio: number; sortinoRatio: number; maxDrawdown: number; winRate: number; profitFactor: number; totalTrades: number; expectancy: number; valueAtRisk95: number; }
interface MTFResult { timeframe: string; trend: string; strength: number; rsi: number | null; macd: string; emaAlignment: string; summary: string; }
interface WalkForwardResult { inSample: { trades: number; winRate: number; totalReturnPct: number; sharpe: number; maxDrawdownPct: number }; outOfSample: { trades: number; winRate: number; totalReturnPct: number; sharpe: number; maxDrawdownPct: number }; stability: number; }
interface CorrelationMatrix { symbols: string[]; matrix: number[][]; }

interface RadarStock {
  symbol: string; yahoo: string; name: string; market: string; currency: string;
  price: number; changePct: number; volume: number | null;
  trend: "strong_up" | "up" | "neutral" | "down" | "strong_down";
  momentum: number; volatility: number; volumeSpike: number;
  signals: string[]; score: number; reason: string;
}

type Tab = "dashboard" | "radar" | "intel" | "find" | "portfolio" | "backtest" | "markets";

export default function ResearchPage() {
  const navigate = useNavigate();
  const { market } = useMarket();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [macro, setMacro] = useState<MacroIndicator[]>([]);
  const [breadth, setBreadth] = useState<BreadthData | null>(null);
  const [ideas, setIdeas] = useState<TradeIdea[]>([]);

  const [stockSymbol, setStockSymbol] = useState("");
  const [earnings, setEarnings] = useState<EarningsAnalysis | null>(null);
  const [gaps, setGaps] = useState<GapAnalysis | null>(null);
  const [seasonality, setSeasonality] = useState<Seasonality | null>(null);

  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [corr, setCorr] = useState<CorrelationMatrix | null>(null);
  const [radar, setRadar] = useState<RadarStock[]>([]);
  const [mtfSymbol, setMtfSymbol] = useState("RELIANCE.NS");
  const [mtf, setMtf] = useState<MTFResult[] | null>(null);
  const [wfSymbol, setWfSymbol] = useState("RELIANCE.NS");
  const [wfStrategy, setWfStrategy] = useState("trend-pullback");
  const [wf, setWf] = useState<WalkForwardResult | null>(null);

  useEffect(() => {
    setBusy("Loading market data…");
    Promise.allSettled([
      api<{ signals: SignalRow[] }>(`/api/signals?market=${market}`).then((d) => setSignals(d.signals)),
      api<{ indicators: MacroIndicator[] }>("/api/intel/macro").then((d) => setMacro(d.indicators)),
      api<BreadthData>("/api/intel/breadth?market=US").then(setBreadth),
      api<{ ideas: TradeIdea[] }>("/api/intel/ideas?market=ALL").then((d) => setIdeas(d.ideas)),
      api<PortfolioAnalytics>("/api/advanced/portfolio-analytics").then(setAnalytics),
      api<{ rotation: SectorData[] }>("/api/intel/sector-rotation?market=US").then((d) => setSectors(d.rotation)),
      api<CorrelationMatrix>("/api/advanced/correlation").then(setCorr),
    ]).finally(() => setBusy(""));
  }, [market]);

  async function loadStockIntel() {
    if (!stockSymbol.trim()) return;
    setBusy(`Analyzing ${stockSymbol}…`);
    try {
      const [e, g, s] = await Promise.all([
        api<EarningsAnalysis>(`/api/intel/earnings/${encodeURIComponent(stockSymbol)}`),
        api<GapAnalysis>(`/api/intel/gaps/${encodeURIComponent(stockSymbol)}`),
        api<Seasonality>(`/api/intel/seasonality/${encodeURIComponent(stockSymbol)}`),
      ]);
      setEarnings(e); setGaps(g); setSeasonality(s);
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    setBusy("");
  }

  async function loadMTF() {
    setBusy("Analyzing timeframes…");
    try { setMtf((await api<{ timeframes: MTFResult[] }>(`/api/advanced/multi-timeframe/${encodeURIComponent(mtfSymbol)}`)).timeframes); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    setBusy("");
  }

  async function loadWF() {
    setBusy("Running backtest…");
    try { setWf(await api<WalkForwardResult & { symbol: string }>("/api/advanced/backtest/walk-forward", { method: "POST", body: JSON.stringify({ symbol: wfSymbol, strategyId: wfStrategy }) })); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    setBusy("");
  }

  async function loadRadar() {
    setBusy("Scanning for interesting stocks…");
    try {
      const r = await api<{ radar: RadarStock[] }>(`/api/screener/radar?market=${market}`);
      setRadar(r.radar);
    } catch (err) { setMsg(err instanceof Error ? err.message : "Radar failed"); }
    setBusy("");
  }

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: "dashboard", label: "Market Pulse", desc: "Quick overview" },
    { id: "radar", label: "Stock Radar", desc: "Find interesting stocks" },
    { id: "intel", label: "Stock Intel", desc: "Deep dive" },
    { id: "find", label: "Find Stocks", desc: "Screener" },
    { id: "portfolio", label: "My Portfolio", desc: "Paper book stats" },
    { id: "backtest", label: "Strategy Test", desc: "Backtest" },
    { id: "markets", label: "Market Map", desc: "Sectors & rotation" },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Research Hub</h2>
          <p>Everything you need to make smarter trades — in plain English.</p>
        </div>
      </div>
      <TickerSearch />

      <div className="row" style={{ gap: 6, margin: "12px 0", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} className={cls("btn", tab === t.id && "primary")} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {busy && !signals.length && <Spinner label={busy} />}
      {msg && <Banner kind="info">{msg}</Banner>}

      {/* ── Dashboard ── */}
      {tab === "dashboard" && (
        <>
          {signals.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3>What's Moving Now</h3>
              <p className="muted" style={{ marginBottom: 12 }}>Top buy/sell signals from your watchlist — scored by 13 strategies, news sentiment, and insider data.</p>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Stock</th><th>Market</th><th>Price</th><th>Signal</th><th>Score</th><th>Why</th></tr></thead>
                  <tbody>
                    {signals.slice(0, 10).map((r) => (
                      <tr key={r.yahoo || r.symbol}>
                        <td>
                          <Link to={`/stock/${encodeURIComponent(r.yahoo || r.symbol)}`}><strong>{r.symbol}</strong></Link>
                          <div className="muted" style={{ fontSize: 11 }}>{r.name}</div>
                        </td>
                        <td className="muted">{r.market ?? "—"}</td>
                        <td className="mono">{r.price != null ? money(r.price, r.currency || "USD") : "—"}
                          <div className={cls(r.changePct != null && r.changePct >= 0 ? "up" : "down")}>{r.changePct != null ? pct(r.changePct) : ""}</div>
                        </td>
                        <td>{r.action ? <span className={cls("badge", r.action.toLowerCase().replace(" ", "-"))}>{r.action}</span> : <span className="muted">{r.error}</span>}</td>
                        <td className="mono">{r.score ?? "—"}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{r.reasons?.[0] ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ideas.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3>Trade Ideas</h3>
              <p className="muted" style={{ marginBottom: 12 }}>Breakouts, volume spikes, reversals — spotted automatically.</p>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Stock</th><th>Price</th><th>Type</th><th>Direction</th><th>Conviction</th><th>Thesis</th></tr></thead>
                  <tbody>
                    {ideas.slice(0, 8).map((idea) => (
                      <tr key={idea.yahoo} style={{ cursor: "pointer" }} onClick={() => navigate(`/stock/${idea.yahoo}`)}>
                        <td><strong>{idea.symbol}</strong> <span className="muted">{idea.name}</span></td>
                        <td className="mono">{idea.price.toFixed(2)}</td>
                        <td><span className="badge">{idea.type.replace(/_/g, " ")}</span></td>
                        <td><span className={cls("badge", idea.direction === "bullish" ? "up" : idea.direction === "bearish" ? "down" : "")}>{idea.direction}</span></td>
                        <td><span className={cls("badge", idea.conviction >= 70 ? "up" : "")}>{idea.conviction}</span></td>
                        <td className="muted" style={{ fontSize: 11, maxWidth: 200 }}>{idea.thesis[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-2">
            <div className="card">
              <h3>Market Mood</h3>
              <p className="muted" style={{ marginBottom: 12 }}>Key indicators telling you if it's a good time to buy or sell.</p>
              {macro.length > 0 ? (
                <div className="grid grid-2" style={{ gap: 10 }}>
                  {macro.map((m) => (
                    <div key={m.name} className="kpi" style={{ padding: 8 }}>
                      <p className="muted" style={{ fontSize: 11 }}>{m.name}</p>
                      <p className="mono" style={{ fontSize: 14 }}>{m.value}</p>
                      <p className={cls("mono", m.changePct >= 0 ? "up" : "down")} style={{ fontSize: 11 }}>{m.changePct > 0 ? "+" : ""}{m.changePct}%</p>
                      <p className="muted" style={{ fontSize: 10 }}>{m.regime}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">Loading…</p>}
            </div>

            <div className="card">
              <h3>Market Breadth</h3>
              <p className="muted" style={{ marginBottom: 12 }}>How many stocks are going up vs down — a health check for the market.</p>
              {breadth ? (
                <>
                  <div className="grid grid-2" style={{ gap: 10 }}>
                    {[
                      { label: "Rising", value: String(breadth.advances), good: true },
                      { label: "Falling", value: String(breadth.declines), good: false },
                      { label: "Rise/Fall Ratio", value: breadth.advanceDeclineRatio.toFixed(2), good: breadth.advanceDeclineRatio > 1 },
                      { label: "New Highs", value: String(breadth.newHighs), good: breadth.newHighs > breadth.newLows },
                      { label: "Above 50-Day Avg", value: `${breadth.percentAboveSMA50}%`, good: breadth.percentAboveSMA50 > 50 },
                      { label: "Above 200-Day Avg", value: `${breadth.percentAboveSMA200}%`, good: breadth.percentAboveSMA200 > 50 },
                    ].map((k) => (
                      <div key={k.label} className="kpi" style={{ padding: 8 }}>
                        <p className="muted" style={{ fontSize: 11 }}>{k.label}</p>
                        <p className={cls("mono", k.good ? "up" : "down")} style={{ fontSize: 14 }}>{k.value}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, padding: "8px", background: breadth.marketPhase === "markup" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", borderRadius: 6 }}>
                    <span className="muted" style={{ fontSize: 12 }}>Market Phase: </span>
                    <strong style={{ fontSize: 12 }}>{breadth.marketPhase}</strong>
                    <span className="muted" style={{ fontSize: 12 }}> · {breadth.breadthMomentum}</span>
                  </div>
                  <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{breadth.summary}</p>
                </>
              ) : <p className="muted">Loading…</p>}
            </div>
          </div>
        </>
      )}

      {/* ── Stock Radar ── */}
      {tab === "radar" && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>Stock Radar</h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>Scans the market for stocks with strong trends, momentum, and volume spikes worth watching.</p>
              </div>
              <button className="btn primary" onClick={() => void loadRadar()} disabled={!!busy}>
                {radar.length ? "Refresh" : "Scan Market"}
              </button>
            </div>
          </div>

          {busy && <Spinner label={busy} />}

          {radar.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {radar.map((s) => {
                const trendColor = s.trend === "strong_up" ? "var(--green)" : s.trend === "up" ? "#22c55e88" : s.trend === "strong_down" ? "var(--red)" : s.trend === "down" ? "#ef444488" : "var(--muted)";
                const trendLabel = s.trend === "strong_up" ? "🚀 Strong Uptrend" : s.trend === "up" ? "📈 Uptrend" : s.trend === "strong_down" ? "📉 Strong Downtrend" : s.trend === "down" ? "↘ Downtrend" : "→ Sideways";
                return (
                  <div key={s.yahoo} className="card" style={{ padding: 12, borderLeft: `3px solid ${trendColor}` }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <Link to={`/stock/${encodeURIComponent(s.yahoo)}`} style={{ fontWeight: 700, fontSize: 16 }}>{s.symbol}</Link>
                          <span className="muted" style={{ fontSize: 12 }}>{s.name}</span>
                          <span className="badge" style={{ fontSize: 10 }}>{s.market}</span>
                          <WatchButton yahoo={s.yahoo} />
                          <AlertButton yahoo={s.yahoo} />
                        </div>
                        <p style={{ fontSize: 12, color: trendColor, margin: 0 }}>{trendLabel} · {s.reason}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="mono" style={{ fontSize: 16 }}>{money(s.price, s.currency)}</div>
                        <div className={cls("mono", s.changePct >= 0 ? "up" : "down")} style={{ fontSize: 12 }}>{pct(s.changePct)}</div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                      <span className="badge" style={{ fontSize: 10 }}>30d: {s.momentum > 0 ? "+" : ""}{s.momentum}%</span>
                      <span className="badge" style={{ fontSize: 10 }}>ADX: {s.volatility}</span>
                      {s.volumeSpike > 1.5 && <span className="badge up" style={{ fontSize: 10 }}>Vol: {s.volumeSpike}x</span>}
                      {s.signals.slice(0, 3).map((sig, i) => (
                        <span key={i} className="muted" style={{ fontSize: 10 }}>· {sig}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!busy && radar.length === 0 && (
            <div className="card">
              <p className="muted">Click "Scan Market" to find stocks with interesting trends and momentum.</p>
            </div>
          )}
        </>
      )}

      {/* ── Stock Intel ── */}
      {tab === "intel" && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>Deep Dive into Any Stock</h3>
            <p className="muted" style={{ marginBottom: 12 }}>Enter a stock symbol to see earnings history, price gaps, and seasonal patterns.</p>
            <div className="row" style={{ marginBottom: 12 }}>
              <input value={stockSymbol} onChange={(e) => setStockSymbol(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void loadStockIntel(); }} style={{ flex: 1, padding: "8px 10px" }} placeholder="e.g. RELIANCE.NS, AAPL, UBER" />
              <button className="btn primary" onClick={() => void loadStockIntel()} disabled={!!busy}>Analyze</button>
            </div>
          </div>

          {busy && <Spinner label={busy} />}

          {earnings && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3>Earnings Report Card</h3>
              <p className="muted" style={{ marginBottom: 12 }}>Does this company beat or miss expectations?</p>
              <div className="grid grid-3" style={{ gap: 12, marginBottom: 12 }}>
                <div className="kpi" style={{ padding: 10 }}>
                  <p className="muted" style={{ fontSize: 11 }}>Beat Rate</p>
                  <p className={cls("mono", earnings.beatRate > 50 ? "up" : "down")} style={{ fontSize: 18 }}>{earnings.beatRate}%</p>
                  <p className="muted" style={{ fontSize: 10 }}>{earnings.beatRate > 50 ? "Usually beats" : "Often misses"}</p>
                </div>
                <div className="kpi" style={{ padding: 10 }}>
                  <p className="muted" style={{ fontSize: 11 }}>Avg Surprise</p>
                  <p className="mono" style={{ fontSize: 18 }}>{earnings.avgSurprisePercent}%</p>
                  <p className="muted" style={{ fontSize: 10 }}>How far off estimates</p>
                </div>
                <div className="kpi" style={{ padding: 10 }}>
                  <p className="muted" style={{ fontSize: 11 }}>Tendency</p>
                  <p className={cls("mono", earnings.tendency === "beats" ? "up" : earnings.tendency === "misses" ? "down" : "")} style={{ fontSize: 18 }}>{earnings.tendency}</p>
                  <p className="muted" style={{ fontSize: 10 }}>Pattern of results</p>
                </div>
              </div>
              {earnings.upcomingInDays != null && <p className="muted" style={{ marginBottom: 8 }}>Next report in <strong>{earnings.upcomingInDays} days</strong></p>}
              {earnings.history.length > 0 && (
                <table>
                  <thead><tr><th>Date</th><th>Expected</th><th>Actual</th><th>Surprise</th></tr></thead>
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
              <h3>Price Gaps</h3>
              <p className="muted" style={{ marginBottom: 12 }}>Unfilled gaps tend to get "filled" — price often returns to close them.</p>
              <div className="grid grid-3" style={{ gap: 12 }}>
                <div className="kpi" style={{ padding: 10 }}>
                  <p className="muted" style={{ fontSize: 11 }}>Fill Rate</p>
                  <p className="mono" style={{ fontSize: 18 }}>{gaps.fillRate}%</p>
                  <p className="muted" style={{ fontSize: 10 }}>Historically filled</p>
                </div>
                <div className="kpi" style={{ padding: 10 }}>
                  <p className="muted" style={{ fontSize: 11 }}>Open Gaps</p>
                  <p className="mono" style={{ fontSize: 18 }}>{gaps.openGaps.length}</p>
                  <p className="muted" style={{ fontSize: 10 }}>Waiting to fill</p>
                </div>
                <div className="kpi" style={{ padding: 10 }}>
                  <p className="muted" style={{ fontSize: 11 }}>Nearest Gap</p>
                  <p className="mono" style={{ fontSize: 14 }}>
                    {gaps.nearestGapAbove ? `↑ ${money(gaps.nearestGapAbove.price)} (+${gaps.nearestGapAbove.percent}%)` : ""}
                    {gaps.nearestGapBelow ? ` ↓ ${money(gaps.nearestGapBelow.price)} (${gaps.nearestGapBelow.percent}%)` : " —"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {seasonality && (
            <div className="card">
              <h3>Seasonal Patterns</h3>
              <p className="muted" style={{ marginBottom: 12 }}>Historically, which months are good and bad for this stock.</p>
              <div className="row" style={{ gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <span className={cls("badge", seasonality.currentMonthSignal === "bullish" ? "up" : seasonality.currentMonthSignal === "bearish" ? "down" : "")}>
                  This Month: {seasonality.currentMonthSignal}
                </span>
                <span className="muted">Best: <strong>{seasonality.bestMonths.join(", ")}</strong></span>
                <span className="muted">Worst: <strong>{seasonality.worstMonths.join(", ")}</strong></span>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>{seasonality.summary}</p>
            </div>
          )}
        </>
      )}

      {/* ── Portfolio ── */}
      {tab === "portfolio" && (
        <div className="card">
          <h3>How's My Paper Book Doing?</h3>
          <p className="muted" style={{ marginBottom: 12 }}>Performance metrics of your paper trading portfolio.</p>
          {analytics ? (
            <div className="grid grid-4" style={{ gap: 12 }}>
              {[
                { label: "Total Return", value: `${(analytics.totalReturn * 100).toFixed(2)}%`, good: analytics.totalReturn > 0, desc: "Overall gain/loss" },
                { label: "Win Rate", value: `${(analytics.winRate * 100).toFixed(1)}%`, good: analytics.winRate > 0.5, desc: "% of winning trades" },
                { label: "Profit Factor", value: analytics.profitFactor.toFixed(2), good: analytics.profitFactor > 1.5, desc: "Wins vs losses ratio" },
                { label: "Max Drop", value: `${(analytics.maxDrawdown * 100).toFixed(2)}%`, good: analytics.maxDrawdown < 0.15, desc: "Worst losing streak" },
                { label: "Sharpe Ratio", value: analytics.sharpeRatio.toFixed(2), good: analytics.sharpeRatio > 1, desc: "Risk-adjusted return" },
                { label: "Expectancy", value: `${(analytics.expectancy * 100).toFixed(2)}%`, good: analytics.expectancy > 0, desc: "Expected gain per trade" },
                { label: "Total Trades", value: String(analytics.totalTrades), good: analytics.totalTrades > 5, desc: "Number of trades" },
                { label: "VaR 95%", value: `${(analytics.valueAtRisk95 * 100).toFixed(2)}%`, good: analytics.valueAtRisk95 < 0.03, desc: "Worst expected daily loss" },
              ].map((kpi) => (
                <div key={kpi.label} className="kpi" style={{ padding: 10 }}>
                  <p className="muted" style={{ fontSize: 11 }}>{kpi.label}</p>
                  <p className={cls("mono", kpi.good ? "up" : "down")} style={{ fontSize: 18 }}>{kpi.value}</p>
                  <p className="muted" style={{ fontSize: 10 }}>{kpi.desc}</p>
                </div>
              ))}
            </div>
          ) : <p className="muted">No paper trades yet. Start by buying on a stock page.</p>}
        </div>
      )}

      {/* ── Backtest ── */}
      {tab === "backtest" && (
        <>
          <div className="grid grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <h3>Does This Strategy Actually Work?</h3>
              <p className="muted" style={{ marginBottom: 12 }}>Test a strategy on historical data before risking real money.</p>
              <div className="row" style={{ marginBottom: 12 }}>
                <input value={wfSymbol} onChange={(e) => setWfSymbol(e.target.value)} style={{ flex: 1, padding: "8px 10px" }} placeholder="Stock symbol" />
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
                <button className="btn primary" onClick={() => void loadWF()} disabled={!!busy}>Test It</button>
              </div>
              {wf && (
                <div>
                  <div className="grid grid-2" style={{ gap: 12 }}>
                    <div style={{ padding: 10, background: "var(--panel-2)", borderRadius: 8 }}>
                      <strong style={{ fontSize: 12 }}>Training Period</strong>
                      <p className="muted" style={{ fontSize: 12 }}>Trades: {wf.inSample.trades} · Win: {wf.inSample.winRate}%</p>
                      <p className="muted" style={{ fontSize: 12 }}>Return: {wf.inSample.totalReturnPct}% · Max Drop: {wf.inSample.maxDrawdownPct}%</p>
                    </div>
                    <div style={{ padding: 10, background: "var(--panel-2)", borderRadius: 8 }}>
                      <strong style={{ fontSize: 12 }}>Validation Period</strong>
                      <p className="muted" style={{ fontSize: 12 }}>Trades: {wf.outOfSample.trades} · Win: {wf.outOfSample.winRate}%</p>
                      <p className="muted" style={{ fontSize: 12 }}>Return: {wf.outOfSample.totalReturnPct}% · Max Drop: {wf.outOfSample.maxDrawdownPct}%</p>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, padding: "8px", background: wf.stability > 0.7 ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", borderRadius: 6 }}>
                    <span className="muted" style={{ fontSize: 12 }}>Reliability: </span>
                    <strong style={{ fontSize: 12 }}>{(wf.stability * 100).toFixed(0)}%</strong>
                    <span className="muted" style={{ fontSize: 12 }}> — {wf.stability > 0.7 ? "This strategy looks solid" : "Be careful — might be overfit to the past"}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h3>Multi-Timeframe Check</h3>
              <p className="muted" style={{ marginBottom: 12 }}>See if weekly, daily, and hourly trends agree — they should before you trade.</p>
              <div className="row" style={{ marginBottom: 12 }}>
                <input value={mtfSymbol} onChange={(e) => setMtfSymbol(e.target.value)} style={{ flex: 1, padding: "8px 10px" }} placeholder="Symbol" />
                <button className="btn primary" onClick={() => void loadMTF()} disabled={!!busy}>Check</button>
              </div>
              {mtf && mtf.map((tf) => (
                <div key={tf.timeframe} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 13 }}>{tf.timeframe}</strong>
                    <span className={cls("badge", tf.trend === "bullish" ? "up" : tf.trend === "bearish" ? "down" : "")}>{tf.trend}</span>
                  </div>
                  <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>{tf.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Markets ── */}
      {tab === "markets" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Sector Rotation Map</h3>
            <p className="muted" style={{ marginBottom: 12 }}>Money flows from sector to sector in a cycle. See which are leading and which are lagging.</p>
            {sectors.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr><th>Sector</th><th>1 Week</th><th>1 Month</th><th>3 Months</th><th>YTD</th><th>Momentum</th><th>Signal</th></tr>
                  </thead>
                  <tbody>
                    {sectors.map((s) => (
                      <tr key={s.sector}>
                        <td><strong>{s.sector}</strong> <span className="muted" style={{ fontSize: 11 }}>{s.etf}</span></td>
                        <td className={cls("mono", s.week1Return >= 0 ? "up" : "down")}>{s.week1Return}%</td>
                        <td className={cls("mono", s.week4Return >= 0 ? "up" : "down")}>{s.week4Return}%</td>
                        <td className={cls("mono", s.week12Return >= 0 ? "up" : "down")}>{s.week12Return}%</td>
                        <td className={cls("mono", s.ytdReturn >= 0 ? "up" : "down")}>{s.ytdReturn}%</td>
                        <td><span className={cls("badge", s.momentum === "leading" ? "up" : s.momentum === "lagging" ? "down" : "")}>{s.momentum}</span></td>
                        <td><span className={cls("badge", s.rotationSignal === "rotate_in" ? "up" : s.rotationSignal === "rotate_out" ? "down" : "")}>{s.rotationSignal.replace("_", " ")}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">Loading sector data…</p>}
          </div>

          {corr && corr.symbols.length > 0 && (
            <div className="card">
              <h3>How Related Are My Stocks?</h3>
              <p className="muted" style={{ marginBottom: 12 }}>High correlation = they move together. Diversification means low correlation.</p>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      {corr.symbols.map((s) => <th key={s} style={{ fontSize: 10 }}>{s.replace(".NS", "")}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {corr.matrix.map((row, i) => (
                      <tr key={i}>
                        <td><strong style={{ fontSize: 10 }}>{corr.symbols[i].replace(".NS", "")}</strong></td>
                        {row.map((v, j) => (
                          <td key={j} style={{
                            background: i === j ? "var(--bg)" : v > 0.7 ? "rgba(34,197,94,0.15)" : v < -0.3 ? "rgba(239,68,68,0.15)" : "transparent",
                            textAlign: "center", fontSize: 10, fontFamily: "var(--mono)",
                          }}>
                            {v.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                <span style={{ color: "var(--green)" }}>Green</span> = move together ·
                <span style={{ color: "var(--red)" }}> Red</span> = move opposite ·
                Empty = no pattern
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
