import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banner, Spinner } from "../components/Ui";
import { api, cls, money } from "../lib/api";

interface ScreenerResult {
  symbol: string;
  yahoo: string;
  name: string;
  sector: string;
  market: string;
  price: number;
  changePct: number;
  volume: number | null;
  marketCap: number | null;
  pe: number | null;
  roe: number | null;
  rsi: number | null;
  adx: number | null;
  score: number;
  signals: string[];
}

interface CategoryPreset {
  id: string;
  label: string;
  description: string;
  filters: Record<string, unknown>;
}

const CATEGORIES: CategoryPreset[] = [
  { id: "oversold", label: "Oversold Bounce", description: "Stocks that dropped hard, might snap back", filters: { maxRSI: 35 } },
  { id: "strong-trend", label: "Strong Uptrend", description: "Price above key averages, momentum confirmed", filters: { minADX: 25, emaAbove: 20, macdBullish: true } },
  { id: "breakout", label: "Breaking Out", description: "Volume surging with fresh highs", filters: { macdBullish: true, minVolume: 1000000 } },
  { id: "value", label: "Undervalued", description: "Low P/E with solid fundamentals", filters: { maxPE: 18, minROE: 0.12 } },
  { id: "high-dividend", label: "High Dividend", description: "Income stocks with consistent yields", filters: { minDividend: 0.03 } },
  { id: "vwap", label: "Near VWAP", description: "Price close to VWAP — mean-reversion setups", filters: { nearVWAP: true, maxRSI: 40 } },
  { id: "momentum", label: "Momentum Plays", description: "Fast movers with strong directional conviction", filters: { minADX: 30, minVolume: 500000 } },
];

export default function ScreenerPage() {
  const navigate = useNavigate();
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [market, setMarket] = useState<"ALL" | "IN" | "US">("ALL");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [customFilters, setCustomFilters] = useState(false);
  const [minRSI, setMinRSI] = useState("");
  const [maxRSI, setMaxRSI] = useState("");
  const [minADX, setMinADX] = useState("");
  const [minVolume, setMinVolume] = useState("");
  const [macdBullish, setMacdBullish] = useState(false);
  const [emaAbove, setEmaAbove] = useState<"" | "20" | "50">("");
  const [nearVWAP, setNearVWAP] = useState(false);

  async function runScreener(preset?: Record<string, unknown>) {
    setBusy(true);
    setMsg("");
    try {
      const filters: Record<string, unknown> = { market: market === "ALL" ? undefined : market, ...preset };
      if (customFilters && !preset) {
        if (minRSI) filters.minRSI = Number(minRSI);
        if (maxRSI) filters.maxRSI = Number(maxRSI);
        if (minADX) filters.minADX = Number(minADX);
        if (minVolume) filters.minVolume = Number(minVolume);
        if (macdBullish) filters.macdBullish = true;
        if (emaAbove) filters.emaAbove = Number(emaAbove);
        if (nearVWAP) filters.nearVWAP = true;
      }

      const out = await api<{ results: ScreenerResult[]; count: number }>("/api/screener/run", {
        method: "POST",
        body: JSON.stringify(filters),
      });
      setResults(out.results);
      const catLabel = preset ? CATEGORIES.find((c) => c.filters === preset)?.label : "custom";
      setMsg(`${out.count} stocks matched${preset ? ` "${catLabel}"` : ""}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Screener failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Stock Screener</h2>
          <p>Pick a category to find opportunities. No jargon needed.</p>
        </div>
      </div>

      {msg ? <Banner kind="info">{msg}</Banner> : null}
      {busy ? <Spinner label="Scanning universe…" /> : null}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 12 }}>
          <select value={market} onChange={(e) => setMarket(e.target.value as typeof market)} style={{ padding: "6px 8px" }}>
            <option value="ALL">All markets</option>
            <option value="IN">India (NSE)</option>
            <option value="US">US</option>
          </select>
          <button className="btn" onClick={() => setCustomFilters(!customFilters)}>
            {customFilters ? "Hide" : "Advanced"} Filters
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={cls("btn", activeCategory === cat.id && "primary")}
              onClick={() => { setActiveCategory(cat.id); void runScreener(cat.filters); }}
              disabled={busy}
              style={{ textAlign: "left", padding: "10px 12px" }}
            >
              <strong style={{ display: "block", fontSize: 13 }}>{cat.label}</strong>
              <span className="muted" style={{ fontSize: 11 }}>{cat.description}</span>
            </button>
          ))}
        </div>

        {customFilters && (
          <div style={{ marginTop: 12, padding: "12px", background: "var(--panel-2)", borderRadius: "var(--radius)" }}>
            <h4 style={{ margin: "0 0 8px" }}>Custom Filters</h4>
            <div className="grid grid-3" style={{ gap: 10 }}>
              <div>
                <label className="muted" style={{ fontSize: 12 }}>Min RSI</label>
                <input type="number" value={minRSI} onChange={(e) => setMinRSI(e.target.value)} placeholder="e.g. 20" style={{ width: "100%", padding: "6px 8px" }} />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12 }}>Max RSI</label>
                <input type="number" value={maxRSI} onChange={(e) => setMaxRSI(e.target.value)} placeholder="e.g. 40" style={{ width: "100%", padding: "6px 8px" }} />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12 }}>Min ADX</label>
                <input type="number" value={minADX} onChange={(e) => setMinADX(e.target.value)} placeholder="e.g. 25" style={{ width: "100%", padding: "6px 8px" }} />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12 }}>Min Volume</label>
                <input type="number" value={minVolume} onChange={(e) => setMinVolume(e.target.value)} placeholder="e.g. 1000000" style={{ width: "100%", padding: "6px 8px" }} />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12 }}>EMA Above</label>
                <select value={emaAbove} onChange={(e) => setEmaAbove(e.target.value as typeof emaAbove)} style={{ width: "100%", padding: "6px 8px" }}>
                  <option value="">Any</option>
                  <option value="20">Above EMA 20</option>
                  <option value="50">Above EMA 50</option>
                </select>
              </div>
            </div>
            <div className="row" style={{ gap: 16, marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={macdBullish} onChange={(e) => setMacdBullish(e.target.checked)} />
                MACD Bullish
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={nearVWAP} onChange={(e) => setNearVWAP(e.target.checked)} />
                Near VWAP
              </label>
              <button className="btn primary" onClick={() => { setActiveCategory(null); void runScreener(); }} disabled={busy}>
                Run Custom
              </button>
            </div>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Results ({results.length})</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Chg%</th>
                  <th>RSI</th>
                  <th>ADX</th>
                  <th>P/E</th>
                  <th>ROE</th>
                  <th>Score</th>
                  <th>Signals</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.yahoo} style={{ cursor: "pointer" }} onClick={() => navigate(`/stock/${r.yahoo}`)}>
                    <td>
                      <strong>{r.symbol}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{r.name} · {r.market}</div>
                    </td>
                    <td className="mono">{money(r.price, r.market === "US" ? "USD" : "INR")}</td>
                    <td className={cls("mono", r.changePct >= 0 ? "up" : "down")}>{r.changePct.toFixed(2)}%</td>
                    <td className="mono">{r.rsi?.toFixed(1) ?? "—"}</td>
                    <td className="mono">{r.adx?.toFixed(1) ?? "—"}</td>
                    <td className="mono">{r.pe?.toFixed(1) ?? "—"}</td>
                    <td className="mono">{r.roe != null ? `${(r.roe * 100).toFixed(1)}%` : "—"}</td>
                    <td>
                      <span className={cls("badge", r.score >= 70 ? "up" : r.score <= 30 ? "down" : "")}>
                        {r.score}
                      </span>
                    </td>
                    <td>
                      {r.signals.map((s, i) => (
                        <span key={i} className="muted" style={{ fontSize: 11, display: "block" }}>{s}</span>
                      ))}
                    </td>
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
