import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Banner, CallChip, EmptyState, Skeleton, Spinner } from "../components/Ui";
import { WatchButton, AlertButton } from "../components/WatchAlert";
import { useWebSocket } from "../hooks/useWebSocket";
import { api, cls, compactMoney, money, pct } from "../lib/api";

interface StockPayload {
  stock: {
    symbol: string;
    yahoo: string;
    name: string;
    sector: string;
    market: "IN" | "US";
    exchange: string;
    currency: string;
  };
  quote: { price: number; changePct: number; volume: number | null; currency?: string; dayHigh?: number | null; dayLow?: number | null; previousClose?: number };
  signal: {
    action: string;
    score: number;
    confidence: number;
    horizon: string;
    reasons: string[];
    technicals: Record<string, number | null>;
  };
  sentiment: number;
  news: Array<{ title: string; link: string; source: string; label: string; published: string }>;
  fundamentals: Record<string, number | string | null>;
  profile?: { summary?: string | null; industry?: string | null; country?: string | null; website?: string | null };
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  sources?: { prices: string[]; news: string[]; fundamentals: string[]; other: string[] };
  crawledAt?: number;
  strategyHits?: Array<{ strategyId: string; side: string; conviction: number; thesis: string[] }>;
}

interface TradePlan {
  plan: {
    entry: number;
    stop: number;
    target: number;
    atr: number;
    riskPct: number;
    riskAmount: number;
    quantity: number;
    notional: number;
    rewardRisk: number;
    positionPct: number;
  };
  checks: Array<{ id: string; label: string; pass: boolean; detail: string }>;
  passed: number;
  total: number;
  ready: boolean;
  alreadyHeld: number;
  equity: number;
  cash: number;
  disclaimer: string;
}

interface KiteStatus {
  configured: boolean;
  connected: boolean;
  userId: string | null;
}

function badgeClass(action: string) {
  return action.toLowerCase().replace(" ", "-");
}

function emaCalc(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (prev === null) { prev = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period; }
    else { prev = data[i] * k + prev * (1 - k); }
    result.push(Number(prev.toFixed(2)));
  }
  return result;
}

export default function StockPage() {
  const { symbol = "" } = useParams();
  const [data, setData] = useState<StockPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState<TradePlan | null>(null);
  const [thesis, setThesis] = useState("");
  const [tradeMode, setTradeMode] = useState<"paper" | "live">("paper");
  const [kite, setKite] = useState<KiteStatus | null>(null);
  const [liveConfirm, setLiveConfirm] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [chartRange, setChartRange] = useState<"1w" | "1m" | "3m" | "6m" | "1y">("6m");

  const yahoo = data?.stock.yahoo || decodeURIComponent(symbol);
  const { connected, prices: livePrices } = useWebSocket(yahoo ? [yahoo] : []);

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    setLoading(true);
    api<StockPayload>(`/api/market/stocks/${encodeURIComponent(symbol)}`)
      .then((d) => { if (live) setData(d); })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : "Failed"); })
      .finally(() => { if (live) setLoading(false); });
    api<TradePlan>(`/api/desk/plan/${encodeURIComponent(symbol)}`)
      .then((p) => { if (live) { setPlan(p); setQty(p.plan.quantity); } })
      .catch(() => { if (live) setPlan(null); });
    api<KiteStatus>("/api/kite/status")
      .then((k) => { if (live) setKite(k); })
      .catch(() => {});
    return () => { live = false; };
  }, [symbol]);

  async function executePaper(side: "BUY" | "SELL") {
    try {
      const stopNote = plan ? `stop ${plan.plan.stop} target ${plan.plan.target}` : "stock page";
      await api("/api/paper/order", {
        method: "POST",
        body: JSON.stringify({ symbol: data?.stock.yahoo || symbol, side, quantity: qty, note: thesis || stopNote }),
      });
      if (thesis.trim().length >= 8 && data) {
        await api("/api/desk/journal", {
          method: "POST",
          body: JSON.stringify({ yahoo: data.stock.yahoo, symbol: data.stock.symbol, thesis, side }),
        });
      }
      if (plan && side === "BUY") {
        await api("/api/desk/alerts", { method: "POST", body: JSON.stringify({ yahoo: data?.stock.yahoo, direction: "below", price: plan.plan.stop, note: "auto stop" }) });
        await api("/api/desk/alerts", { method: "POST", body: JSON.stringify({ yahoo: data?.stock.yahoo, direction: "above", price: plan.plan.target, note: "auto target" }) });
      }
      setNote(side === "BUY" ? "Paper buy recorded with stop/target alerts." : "Paper sell recorded.");
    } catch (err) { setNote(err instanceof Error ? err.message : "Order failed"); }
  }

  async function executeLive(side: "BUY" | "SELL") {
    if (!liveConfirm) { setLiveConfirm(true); return; }
    setLiveBusy(true); setNote("");
    try {
      await api("/api/kite/order", { method: "POST", body: JSON.stringify({ symbol: data?.stock.symbol || symbol, side, quantity: qty, product: "CNC" }) });
      setNote(`Live ${side} order submitted to Zerodha Kite.`);
      setLiveConfirm(false);
    } catch (err) { setNote(err instanceof Error ? err.message : "Live order failed"); }
    finally { setLiveBusy(false); }
  }

  if (loading) {
    return (
      <>
        <div className="topbar"><div><h2>{decodeURIComponent(symbol)}</h2><p>Crawling prices, news, and fundamentals from multiple sources.</p></div></div>
        <div className="row" style={{ marginBottom: 12 }}><CallChip label="Prices" state="loading" /><CallChip label="News feeds" state="loading" /><CallChip label="Fundamentals" state="loading" /></div>
        <div className="card"><Spinner label={`Fetching ${decodeURIComponent(symbol)}…`} /><Skeleton lines={6} /></div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="topbar"><div><h2>{decodeURIComponent(symbol)}</h2><p>Could not finish this crawl.</p></div></div>
        <Banner kind="error">{error}</Banner>
        <EmptyState title="Insight unavailable" body="Try Crawler → Crawl ticker, then refresh this page." />
      </>
    );
  }

  if (!data) return null;

  const ccy = data.stock.currency || "USD";
  const liveTick = livePrices.get(data.stock.yahoo);
  const displayPrice = liveTick?.price ?? data.quote.price;
  const displayChangePct = liveTick?.changePct ?? data.quote.changePct;

  const rangeDays = chartRange === "1w" ? 7 : chartRange === "1m" ? 30 : chartRange === "3m" ? 90 : chartRange === "1y" ? 365 : 180;
  const cutoff = Date.now() - rangeDays * 86400000;
  const filteredCandles = data.candles.filter((c) => c.time >= cutoff);

  const closes = filteredCandles.map((c) => c.close);
  const ema20Data = emaCalc(closes, 20);
  const ema50Data = emaCalc(closes, 50);

  const chartData = filteredCandles.map((c, i) => ({
    t: new Date(c.time).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    close: c.close,
    volume: c.volume,
    ema20: ema20Data[i],
    ema50: ema50Data[i],
  }));

  const isIndian = data.stock.market === "IN";
  const kiteReady = kite?.configured && kite?.connected;
  const showLive = isIndian && kiteReady;
  const kiteNotConfigured = isIndian && !kite?.configured;
  const kiteNotConnected = isIndian && kite?.configured && !kite?.connected;

  const f = data.fundamentals;
  const hasValue = (v: unknown) => v != null && v !== "" && v !== "N/A";

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{data.stock.symbol} <span className="muted">{data.stock.name}</span></h2>
          <p>
            <span className="badge hold">{data.stock.market}</span> {data.stock.exchange}
            {data.stock.sector ? ` · ${data.stock.sector}` : ""}
            {ccy === "INR" ? " · ₹" : " · $"}
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <WatchButton yahoo={data.stock.yahoo} name={data.stock.name} />
          <AlertButton yahoo={data.stock.yahoo} />
        </div>
      </div>

      {/* Trade Mode */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn primary" onClick={() => { setTradeMode("paper"); setLiveConfirm(false); }}>Paper Trade</button>
            {isIndian && (
              <button
                className={cls("btn", tradeMode === "live" && "primary")}
                onClick={() => setTradeMode("live")}
                disabled={!kiteReady}
              >
                Live Trade (Kite)
              </button>
            )}
          </div>
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 72, padding: "4px 6px" }} />
            {tradeMode === "paper" ? (
              <>
                <button className="btn primary" onClick={() => void executePaper("BUY")}>Buy</button>
                <button className="btn danger" onClick={() => void executePaper("SELL")}>Sell</button>
              </>
            ) : showLive ? (
              <>
                {liveConfirm ? (
                  <button className="btn danger" disabled={!kiteReady || liveBusy} onClick={() => void executeLive("BUY")}>
                    {liveBusy ? "Sending…" : `Confirm ${qty} × ${data.stock.symbol}`}
                  </button>
                ) : (
                  <button className="btn primary" disabled={!kiteReady || liveBusy} onClick={() => void executeLive("BUY")}>Buy on Kite</button>
                )}
                <button className="btn danger" disabled={!kiteReady || liveBusy} onClick={() => void executeLive("SELL")}>Sell on Kite</button>
              </>
            ) : null}
          </div>
        </div>
        {tradeMode === "live" && liveConfirm && <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>Click "Confirm" again to send a real order to Zerodha.</p>}
      </div>

      {/* Kite status messages */}
      {isIndian && kiteNotConfigured && (
        <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.06)", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <strong>Live trading not available.</strong> Set <code>KITE_API_KEY</code> and <code>KITE_API_SECRET</code> in your server <code>.env</code> file to enable Zerodha live trading.
        </div>
      )}
      {isIndian && kiteNotConnected && (
        <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.06)", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <strong>Kite not connected.</strong> API keys are set but you need to complete the daily login. Go to <a href="/desk">Trade Desk</a> to connect.
        </div>
      )}
      {!isIndian && (
        <div style={{ padding: "8px 12px", background: "rgba(26,111,235,0.06)", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          US stocks are <strong>paper trading only</strong>. Live trading requires Zerodha Kite (Indian markets only).
        </div>
      )}

      {/* Hero Quote */}
      <div className="hero-quote">
        <div>
          <div className="px">
            {money(displayPrice, ccy)}
            {connected && liveTick && <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>LIVE</span>}
          </div>
          <div className={displayChangePct >= 0 ? "up" : "down"}>
            {pct(displayChangePct)}
            {data.quote.previousClose && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>prev {money(data.quote.previousClose, ccy)}</span>}
          </div>
        </div>
      </div>

      {/* After Hours Section (US stocks only) */}
      {!isIndian && data.quote && (
        <div style={{ padding: "10px 14px", background: "var(--panel-2)", borderRadius: 8, marginBottom: 12 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span className="badge" style={{ fontSize: 11, background: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}>After Hours</span>
            <span className="mono" style={{ fontSize: 14 }}>{money(displayPrice, ccy)}</span>
            <span className={cls("mono", displayChangePct >= 0 ? "up" : "down")} style={{ fontSize: 12 }}>{pct(displayChangePct)}</span>
            {data.quote.dayHigh && <span className="muted" style={{ fontSize: 11 }}>H: {money(data.quote.dayHigh, ccy)}</span>}
            {data.quote.dayLow && <span className="muted" style={{ fontSize: 11 }}>L: {money(data.quote.dayLow, ccy)}</span>}
          </div>
        </div>
      )}

      {data.profile?.summary && <p className="muted">{data.profile.summary.slice(0, 360)}…</p>}

      <div className="row" style={{ marginBottom: 12 }}>
        <CallChip label="Prices" state={data.sources?.prices.length ? "ok" : "empty"} />
        <CallChip label="News" state={data.news.length ? "ok" : "empty"} />
        <CallChip label="Fundamentals" state={data.sources?.fundamentals.length ? "ok" : "empty"} />
        <CallChip label="Live feed" state={connected ? "ok" : "empty"} />
      </div>
      {note ? <Banner kind="ok">{note}</Banner> : null}

      {/* Trade Plan */}
      {plan && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Trade plan · {plan.plan.riskPct}% risk · 2×ATR stop · 2R target</h3>
          <div className="grid grid-4" style={{ marginBottom: 12 }}>
            <div><div className="muted">Qty</div><div className="mono">{plan.plan.quantity}</div></div>
            <div><div className="muted">Stop</div><div className="mono down">{money(plan.plan.stop, ccy)}</div></div>
            <div><div className="muted">Target</div><div className="mono up">{money(plan.plan.target, ccy)}</div></div>
            <div><div className="muted">Risk</div><div className="mono">{money(plan.plan.riskAmount, ccy)} · {plan.plan.positionPct}%</div></div>
          </div>
          <div className="checks">
            {plan.checks.map((c) => (
              <div key={c.id} className={cls("check", c.pass ? "pass" : "fail")}>
                <strong>{c.pass ? "Pass" : "Wait"}</strong> {c.label}
                <div className="muted">{c.detail}</div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            {plan.passed}/{plan.total} checks · {plan.ready ? "Ready." : "Do not size up."}
            {plan.alreadyHeld ? ` Holding ${plan.alreadyHeld}.` : ""} {plan.disclaimer}
          </p>
          <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="Thesis: why buy, what would prove you wrong." rows={2} style={{ width: "100%", marginTop: 8 }} />
        </div>
      )}

      {data.sources && (
        <p className="muted" style={{ marginBottom: 12 }}>
          Crawled {data.crawledAt ? new Date(data.crawledAt).toLocaleString("en-IN") : ""} ·
          prices {data.sources.prices.join(", ") || "—"} ·
          news {data.sources.news.slice(0, 5).join(", ") || "—"}
        </p>
      )}

      {/* Price Tracker */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Price Tracker</h3>
          <div className="row" style={{ gap: 4 }}>
            {(["1w", "1m", "3m", "6m", "1y"] as const).map((r) => (
              <button key={r} className={cls("btn", chartRange === r && "primary")} style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setChartRange(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 320 }}>
          {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="gPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a6feb" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#1a6feb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e8ecf0" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#9ca3af" />
              <YAxis yAxisId="price" domain={["auto", "auto"]} width={70} stroke="#5c6b7a" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="vol" orientation="right" hide />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #d8e0e8", borderRadius: 8, color: "#1a2330", fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  if (name === "volume") return [`${(value / 1000000).toFixed(1)}M`, "Vol"];
                  return [money(value, ccy), name];
                }}
              />
              <Bar yAxisId="vol" dataKey="volume" fill="#d1d5db" opacity={0.4} />
              <Area yAxisId="price" type="monotone" dataKey="close" stroke="#1a6feb" fill="url(#gPrice)" strokeWidth={2} dot={false} />
              <Line yAxisId="price" type="monotone" dataKey="ema20" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="4 2" />
              <Line yAxisId="price" type="monotone" dataKey="ema50" stroke="#8b5cf6" strokeWidth={1} dot={false} strokeDasharray="6 3" />
              {plan && <ReferenceLine yAxisId="price" y={plan.plan.stop} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Stop", fill: "#ef4444", fontSize: 10 }} />}
              {plan && <ReferenceLine yAxisId="price" y={plan.plan.target} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "Target", fill: "#22c55e", fontSize: 10 }} />}
            </ComposedChart>
          </ResponsiveContainer>
          ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 14, margin: 0 }}>Chart data pending</p>
            <p style={{ fontSize: 12, margin: 0 }}>Add to watchlist and run the crawler to get historical price data.</p>
          </div>
          )}
        </div>
        <div className="row" style={{ gap: 12, marginTop: 6, fontSize: 11 }}>
          <span className="muted">● <span style={{ color: "#1a6feb" }}>Price</span></span>
          <span className="muted">● <span style={{ color: "#f59e0b" }}>EMA 20</span></span>
          <span className="muted">● <span style={{ color: "#8b5cf6" }}>EMA 50</span></span>
          {plan && <span className="muted">-- <span style={{ color: "#ef4444" }}>Stop</span></span>}
          {plan && <span className="muted">-- <span style={{ color: "#22c55e" }}>Target</span></span>}
        </div>
      </div>

      {/* Model Suggestion + Technical Indicators */}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Model Suggestion</h3>
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span className={cls("badge", badgeClass(data.signal.action))} style={{ fontSize: 14, fontWeight: 700 }}>{data.signal.action}</span>
            <span className="mono" style={{ fontSize: 14 }}>Score {data.signal.score}</span>
            <span className="muted">· {data.signal.confidence}% confidence</span>
          </div>
          <p className="muted" style={{ marginBottom: 8 }}>{data.signal.horizon}</p>
          {data.signal.reasons.map((r, i) => (
            <div key={i} style={{ fontSize: 13, padding: "3px 0", borderBottom: "1px solid var(--line)" }}>• {r}</div>
          ))}
          {data.strategyHits && data.strategyHits.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 12 }}>Strategy Hits</strong>
              {data.strategyHits.map((h, i) => (
                <div key={i} style={{ fontSize: 12, padding: "4px 0" }}>
                  <span className={cls("badge", h.side === "BUY" ? "up" : "down")}>{h.side}</span> {h.strategyId} ({h.conviction}%)
                  {h.thesis[0] && <div className="muted" style={{ fontSize: 11 }}>→ {h.thesis[0]}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Technical Indicators</h3>
          <table>
            <tbody>
              {Object.entries(data.signal.technicals).map(([key, val]) => (
                <tr key={key}>
                  <td className="muted" style={{ fontSize: 12 }}>{key.replace(/([A-Z])/g, " $1").trim()}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {val == null ? "—" :
                      key.toLowerCase().includes("rsi") || key.toLowerCase().includes("adx") || key.toLowerCase().includes("percent") || key.toLowerCase().includes("yield") || key.toLowerCase().includes("margin")
                        ? `${Number(val).toFixed(1)}`
                        : key.toLowerCase().includes("macd")
                          ? Number(val).toFixed(4)
                          : money(Number(val), ccy)
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.sentiment !== 0 && (
            <div style={{ marginTop: 8, padding: "6px 8px", background: data.sentiment > 0 ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", borderRadius: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>News Sentiment: </span>
              <span className={cls("mono", data.sentiment > 0 ? "up" : "down")} style={{ fontSize: 12 }}>{pct(data.sentiment * 100)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Fundamentals */}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Fundamentals</h3>
          <table>
            <tbody>
              {([
                ["P/E", f.pe != null ? Number(f.pe).toFixed(2) : null],
                ["Forward P/E", f.forwardPe != null ? Number(f.forwardPe).toFixed(2) : null],
                ["P/B", f.pb != null ? Number(f.pb).toFixed(2) : null],
                ["P/S", f.priceToSales != null ? Number(f.priceToSales).toFixed(2) : null],
                ["PEG", f.pegRatio != null ? Number(f.pegRatio).toFixed(2) : null],
                ["EPS", f.eps != null ? money(Number(f.eps), ccy) : null],
                ["Fwd EPS", f.forwardEps != null ? money(Number(f.forwardEps), ccy) : null],
                ["Revenue", f.revenue != null ? compactMoney(Number(f.revenue), ccy) : null],
                ["Rev/Share", f.revenuePerShare != null ? money(Number(f.revenuePerShare), ccy) : null],
                ["Net Income", f.netIncome != null ? compactMoney(Number(f.netIncome), ccy) : null],
                ["Free Cashflow", f.freeCashflow != null ? compactMoney(Number(f.freeCashflow), ccy) : null],
                ["Market Cap", f.marketCap != null ? compactMoney(Number(f.marketCap), ccy) : null],
                ["Enterprise Value", f.enterpriseValue != null ? compactMoney(Number(f.enterpriseValue), ccy) : null],
                ["Book Value", f.bookValue != null ? money(Number(f.bookValue), ccy) : null],
                ["52W High", f.week52High != null ? money(Number(f.week52High), ccy) : null],
                ["52W Low", f.week52Low != null ? money(Number(f.week52Low), ccy) : null],
                ["Dividend Yield", f.dividendYield != null ? `${(Number(f.dividendYield) * 100).toFixed(2)}%` : null],
                ["Beta", f.beta != null ? Number(f.beta).toFixed(2) : null],
                ["ROE", f.roe != null ? `${(Number(f.roe) * 100).toFixed(1)}%` : null],
                ["Profit Margin", f.profitMargins != null ? `${(Number(f.profitMargins) * 100).toFixed(1)}%` : null],
                ["Op Margin", f.operatingMargins != null ? `${(Number(f.operatingMargins) * 100).toFixed(1)}%` : null],
                ["Gross Margin", f.grossMargins != null ? `${(Number(f.grossMargins) * 100).toFixed(1)}%` : null],
                ["D/E", f.debtToEquity != null ? Number(f.debtToEquity).toFixed(1) : null],
                ["Rev Growth", f.revenueGrowth != null ? `${(Number(f.revenueGrowth) * 100).toFixed(1)}%` : null],
                ["Earn Growth", f.earningsGrowth != null ? `${(Number(f.earningsGrowth) * 100).toFixed(1)}%` : null],
                ["Q Earn Growth", f.earningsQuarterlyGrowth != null ? `${(Number(f.earningsQuarterlyGrowth) * 100).toFixed(1)}%` : null],
                ["Target", f.targetMeanPrice != null ? money(Number(f.targetMeanPrice), ccy) : null],
                ["Analyst", f.recommendation != null ? String(f.recommendation) : null],
                ["Short %", f.shortPercentOfFloat != null ? `${(Number(f.shortPercentOfFloat) * 100).toFixed(1)}%` : null],
                ["Insider %", f.heldPercentInsiders != null ? `${(Number(f.heldPercentInsiders) * 100).toFixed(1)}%` : null],
                ["Institutional %", f.heldPercentInstitutions != null ? `${(Number(f.heldPercentInstitutions) * 100).toFixed(1)}%` : null],
                ["Industry", data.profile?.industry],
                ["Country", data.profile?.country],
              ] as [string, unknown][]).filter(([, v]) => hasValue(v)).map(([k, v]) => (
                <tr key={String(k)}>
                  <td className="muted" style={{ fontSize: 12 }}>{k}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card news">
          <h3>News & Sentiment {pct(data.sentiment * 100)}</h3>
          {data.news.length === 0 ? <p className="muted">No headlines returned for this crawl.</p> : null}
          {data.news.map((n) => (
            <a key={n.link + n.title} href={n.link} target="_blank" rel="noreferrer">
              <span className={cls("badge", n.label)}>{n.label}</span> {n.title}
              <div className="muted">{n.source} · {n.published}</div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
