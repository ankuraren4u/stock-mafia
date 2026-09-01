import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TickerSearch from "../components/TickerSearch";
import { Banner, CallChip, EmptyState, Skeleton, Spinner } from "../components/Ui";
import { api, cls, money, pct } from "../lib/api";

interface Row {
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

export default function SignalsPage() {
  const [market, setMarket] = useState<"ALL" | "US" | "IN">("ALL");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = market === "ALL" ? "" : `?market=${market}`;
    api<{ signals: Row[] }>(`/api/signals${q}`)
      .then((d) => setRows(d.signals))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, [market]);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Signals</h2>
          <p>
            Direction score from RSI, MACD, EMAs, Bollinger, valuation, and crawled news sentiment.
          </p>
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
      <div className="row" style={{ margin: "12px 0" }}>
        <CallChip label="Watchlist scores" state={loading ? "loading" : error ? "error" : rows.length ? "ok" : "empty"} />
      </div>
      {loading ? (
        <div className="card">
          <Spinner label="Scoring watchlist from crawled prices and news…" />
          <Skeleton lines={8} />
        </div>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="No signals yet" body="Run the data crawler, then return here." />
      ) : null}
      {!loading && rows.length > 0 ? (
      <div className="card" style={{ marginTop: 16 }}>
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
            {rows.map((r) => (
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
      ) : null}
    </>
  );
}
