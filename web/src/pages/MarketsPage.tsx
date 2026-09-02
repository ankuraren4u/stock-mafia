import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TickerSearch from "../components/TickerSearch";
import { Banner, EmptyState, Spinner } from "../components/Ui";
import { WatchButton, AlertButton } from "../components/WatchAlert";
import { useWebSocket } from "../hooks/useWebSocket";
import { useMarket } from "../hooks/useMarket";
import { api, cls, money } from "../lib/api";

interface QuoteRow {
  symbol: string;
  yahoo: string;
  name: string;
  sector: string;
  market: "IN" | "US";
  currency: string;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
}

export default function MarketsPage() {
  const { market } = useMarket();
  const [indices, setIndices] = useState<QuoteRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const yahooSymbols = [...indices, ...quotes].map((q) => q.yahoo).filter(Boolean);
  const { prices: livePrices } = useWebSocket(yahooSymbols);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setIndices([]);
    setQuotes([]);
    setError("");

    const fetches: Promise<void>[] = [];

    if (market === "IN") {
      fetches.push(
        api<{ quotes: QuoteRow[] }>(`/api/market/indices?market=IN`)
          .then((d) => { if (live) setIndices((prev) => [...prev, ...d.quotes.filter((q) => q.price != null)]); })
          .catch(() => {}),
        api<{ quotes: QuoteRow[] }>(`/api/market/quotes?market=IN`)
          .then((d) => { if (live) setQuotes((prev) => [...prev, ...d.quotes.filter((q) => q.price != null)]); })
          .catch(() => {}),
      );
    }

    if (market === "US") {
      fetches.push(
        api<{ quotes: QuoteRow[] }>(`/api/market/indices?market=US`)
          .then((d) => { if (live) setIndices((prev) => [...prev, ...d.quotes.filter((q) => q.price != null)]); })
          .catch(() => {}),
        api<{ quotes: QuoteRow[] }>(`/api/market/quotes?market=US`)
          .then((d) => { if (live) setQuotes((prev) => [...prev, ...d.quotes.filter((q) => q.price != null)]); })
          .catch(() => {}),
      );
    }

    Promise.allSettled(fetches).finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [market]);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{market === "IN" ? "Indian Markets" : market === "US" ? "US Markets" : "All Markets"}</h2>
          <p>Live quotes for indices and tracked stocks.</p>
        </div>
      </div>
      <TickerSearch />

      {loading && <Spinner label="Fetching live prices…" />}
      {error && <Banner kind="error">{error}</Banner>}

      {indices.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3>Indices</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Index</th><th>Price</th><th>Change</th><th></th></tr></thead>
              <tbody>
                {indices.map((q) => {
                  const live = livePrices.get(q.yahoo);
                  const price = live?.price ?? q.price;
                  const pct = live?.changePct ?? q.changePct;
                  return (
                    <tr key={q.yahoo}>
                      <td><strong>{q.symbol}</strong> <span className="muted" style={{ fontSize: 11 }}>{q.name}</span></td>
                      <td className="mono">{money(price, q.currency)}</td>
                      <td className={cls("mono", pct >= 0 ? "up" : "down")}>{pct > 0 ? "+" : ""}{pct.toFixed(2)}%</td>
                      <td className="muted" style={{ fontSize: 11 }}>{q.market}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {quotes.length > 0 && (
        <div className="card">
          <h3>Tracked Stocks ({quotes.length})</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Stock</th><th>Market</th><th>Price</th><th>Change</th><th></th></tr></thead>
              <tbody>
                {quotes.sort((a, b) => a.market.localeCompare(b.market) || a.symbol.localeCompare(b.symbol)).map((q) => {
                  const live = livePrices.get(q.yahoo);
                  const price = live?.price ?? q.price;
                  const pctVal = live?.changePct ?? q.changePct;
                  return (
                    <tr key={q.yahoo}>
                      <td>
                        <Link to={`/stock/${encodeURIComponent(q.yahoo)}`}><strong>{q.symbol}</strong></Link>
                        <div className="muted" style={{ fontSize: 11 }}>{q.name}</div>
                      </td>
                      <td className="muted">{q.market}</td>
                      <td className="mono">{money(price, q.currency)}</td>
                      <td className={cls("mono", pctVal >= 0 ? "up" : "down")}>{pctVal > 0 ? "+" : ""}{pctVal.toFixed(2)}%</td>
                      <td className="row" style={{ gap: 4 }}>
                        <WatchButton yahoo={q.yahoo} />
                        <AlertButton yahoo={q.yahoo} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && quotes.length === 0 && indices.length === 0 && (
        <EmptyState title="No quotes loaded" body="Add stocks to your watchlist or run the crawler." />
      )}
    </>
  );
}
