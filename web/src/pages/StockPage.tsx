import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banner, CallChip, EmptyState, Skeleton, Spinner } from "../components/Ui";
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
  quote: { price: number; changePct: number; volume: number | null; currency?: string };
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
  profile?: { summary?: string | null; industry?: string | null; country?: string | null };
  candles: Array<{ time: number; close: number }>;
  sources?: { prices: string[]; news: string[]; fundamentals: string[]; other: string[] };
  crawledAt?: number;
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

function badgeClass(action: string) {
  return action.toLowerCase().replace(" ", "-");
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

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    setLoading(true);
    api<StockPayload>(`/api/market/stocks/${encodeURIComponent(symbol)}`)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    api<TradePlan>(`/api/desk/plan/${encodeURIComponent(symbol)}`)
      .then((p) => {
        if (!live) return;
        setPlan(p);
        setQty(p.plan.quantity);
      })
      .catch(() => {
        if (live) setPlan(null);
      });
    return () => {
      live = false;
    };
  }, [symbol]);

  async function paper(side: "BUY" | "SELL") {
    try {
      const stopNote = plan
        ? `stop ${plan.plan.stop} target ${plan.plan.target}`
        : "stock page";
      await api("/api/paper/order", {
        method: "POST",
        body: JSON.stringify({
          symbol: data?.stock.yahoo || symbol,
          side,
          quantity: qty,
          note: thesis || stopNote,
        }),
      });
      if (thesis.trim().length >= 8 && data) {
        await api("/api/desk/journal", {
          method: "POST",
          body: JSON.stringify({
            yahoo: data.stock.yahoo,
            symbol: data.stock.symbol,
            thesis,
            side,
          }),
        });
      }
      if (plan && side === "BUY") {
        await api("/api/desk/alerts", {
          method: "POST",
          body: JSON.stringify({
            yahoo: data?.stock.yahoo,
            direction: "below",
            price: plan.plan.stop,
            note: "auto stop",
          }),
        });
        await api("/api/desk/alerts", {
          method: "POST",
          body: JSON.stringify({
            yahoo: data?.stock.yahoo,
            direction: "above",
            price: plan.plan.target,
            note: "auto target",
          }),
        });
      }
      setNote(side === "BUY" ? "Paper buy recorded with stop/target alerts." : "Paper sell recorded.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Order failed");
    }
  }

  if (loading) {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>{decodeURIComponent(symbol)}</h2>
            <p>Crawling prices, news, and fundamentals from multiple sources.</p>
          </div>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <CallChip label="Prices" state="loading" />
          <CallChip label="News feeds" state="loading" />
          <CallChip label="Fundamentals" state="loading" />
        </div>
        <div className="card">
          <Spinner label={`Fetching ${decodeURIComponent(symbol)} — Yahoo, Stooq/NSE, news wires…`} />
          <Skeleton lines={6} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>{decodeURIComponent(symbol)}</h2>
            <p>Could not finish this crawl.</p>
          </div>
        </div>
        <Banner kind="error">{error}</Banner>
        <EmptyState title="Insight unavailable" body="Try Crawler → Crawl ticker, then refresh this page." />
      </>
    );
  }

  if (!data) return null;

  const ccy = data.quote.currency || data.stock.currency || "USD";
  const chart = data.candles.map((c) => ({
    t: new Date(c.time).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    close: c.close,
  }));

  return (
    <>
      <div className="topbar">
        <div>
          <h2>
            {data.stock.symbol} <span className="muted">{data.stock.name}</span>
          </h2>
          <p>
            <span className="badge hold">{data.stock.market}</span> {data.stock.exchange}
            {data.stock.sector ? ` · ${data.stock.sector}` : ""}
          </p>
        </div>
        <div className="row">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <button className="btn primary" onClick={() => void paper("BUY")}>
            Paper buy
          </button>
          <button className="btn danger" onClick={() => void paper("SELL")}>
            Paper sell
          </button>
        </div>
      </div>
      <div className="hero-quote">
        <div>
          <div className="px">{money(data.quote.price, ccy)}</div>
          <div className={data.quote.changePct >= 0 ? "up" : "down"}>{pct(data.quote.changePct)}</div>
        </div>
      </div>
      {data.profile?.summary ? (
        <p className="muted">{data.profile.summary.slice(0, 360)}…</p>
      ) : null}
      <div className="row" style={{ marginBottom: 12 }}>
        <CallChip label="Prices" state={data.sources?.prices.length ? "ok" : "empty"} />
        <CallChip label="News" state={data.news.length ? "ok" : "empty"} />
        <CallChip label="Fundamentals" state={data.sources?.fundamentals.length ? "ok" : "empty"} />
      </div>
      {note ? <Banner kind="ok">{note}</Banner> : null}
      {plan ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Trade plan · 1% risk · 2×ATR stop · 2R target</h3>
          <div className="grid grid-4" style={{ marginBottom: 12 }}>
            <div>
              <div className="muted">Suggested qty</div>
              <div className="mono">{plan.plan.quantity}</div>
            </div>
            <div>
              <div className="muted">Invalid if (stop)</div>
              <div className="mono down">{money(plan.plan.stop, ccy)}</div>
            </div>
            <div>
              <div className="muted">Take-profit</div>
              <div className="mono up">{money(plan.plan.target, ccy)}</div>
            </div>
            <div>
              <div className="muted">Risk / book</div>
              <div className="mono">
                {money(plan.plan.riskAmount, ccy)} · {plan.plan.positionPct}%
              </div>
            </div>
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
            {plan.passed}/{plan.total} checks · {plan.ready ? "Process allows a paper buy." : "Do not size up until more checks pass."}{" "}
            {plan.alreadyHeld ? `Already holding ${plan.alreadyHeld}.` : ""} {plan.disclaimer}
          </p>
          <textarea
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
            placeholder="Thesis: why buy, what would prove you wrong, why this size."
            rows={2}
            style={{ width: "100%", marginTop: 8 }}
          />
        </div>
      ) : null}
      {data.sources ? (
        <p className="muted">
          Crawled {data.crawledAt ? new Date(data.crawledAt).toLocaleString("en-IN") : ""} · prices{" "}
          {data.sources.prices.join(", ") || "—"} · news {data.sources.news.slice(0, 5).join(", ") || "—"}
        </p>
      ) : null}

      <div className="grid grid-2">
        <div className="card">
          <h3>Price tracker</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a6feb" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#1a6feb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#d8e0e8" strokeDasharray="3 3" />
                <XAxis dataKey="t" hide />
                <YAxis domain={["auto", "auto"]} width={70} stroke="#5c6b7a" />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #d8e0e8",
                    borderRadius: 8,
                    color: "#1a2330",
                  }}
                />
                <Area type="monotone" dataKey="close" stroke="#1a6feb" fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Model suggestion</h3>
          <p>
            <span className={cls("badge", badgeClass(data.signal.action))}>{data.signal.action}</span>
          </p>
          <p className="mono">
            Score {data.signal.score} · confidence {data.signal.confidence}%
          </p>
          <p className="muted">{data.signal.horizon}</p>
          <ul>
            {data.signal.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Fundamentals</h3>
          <table>
            <tbody>
              {[
                ["P/E", data.fundamentals.pe],
                ["Forward P/E", data.fundamentals.forwardPe],
                ["P/B", data.fundamentals.pb],
                ["ROE", data.fundamentals.roe != null ? `${(Number(data.fundamentals.roe) * 100).toFixed(1)}%` : null],
                ["D/E", data.fundamentals.debtToEquity],
                ["EPS", data.fundamentals.eps],
                ["Market cap", compactMoney(Number(data.fundamentals.marketCap), ccy)],
                ["Target", data.fundamentals.targetMeanPrice != null ? money(Number(data.fundamentals.targetMeanPrice), ccy) : null],
                ["Street view", data.fundamentals.recommendation],
                ["Industry", data.profile?.industry],
                ["Country", data.profile?.country],
              ].map(([k, v]) => (
                <tr key={String(k)}>
                  <td className="muted">{k}</td>
                  <td className="mono">{v == null || v === "" ? "—" : String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card news">
          <h3>News & sentiment {pct(data.sentiment * 100)}</h3>
          {data.news.length === 0 ? <p className="muted">No headlines returned for this crawl.</p> : null}
          {data.news.map((n) => (
            <a key={n.link + n.title} href={n.link} target="_blank" rel="noreferrer">
              <span className={cls("badge", n.label)}>{n.label}</span> {n.title}
              <div className="muted">
                {n.source} · {n.published}
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
