import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Spinner } from "../components/Ui";
import { api, cls } from "../lib/api";

interface Status {
  lastRun: number | null;
  running: boolean;
  lastError: string | null;
  snapshots: number;
  finnhub: boolean;
  symbols: string[];
  recent: Array<{ time: number; yahoo: string; ok: boolean; sources: string[]; error?: string }>;
}

interface WatchlistItem {
  symbol: string;
  name: string;
  market: string;
}

export default function CrawlerPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [msg, setMsg] = useState("");
  const [addSymbol, setAddSymbol] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [s, wl] = await Promise.all([
      api<Status>("/api/crawler/status"),
      api<{ watchlist: string[]; tracked: WatchlistItem[] }>("/api/desk/watchlist"),
    ]);
    setStatus(s);
    setWatchlist(wl.tracked.map((t: any) => ({ symbol: t.yahoo, name: t.name || t.symbol, market: t.market || "?" })));
  }

  useEffect(() => {
    void refresh().catch((err) => setMsg(err instanceof Error ? err.message : "Failed"));
    const t = setInterval(() => void refresh().catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, []);

  async function crawlAll() {
    setBusy(true);
    setMsg("Crawling watchlist…");
    try {
      await api("/api/crawler/run", { method: "POST" });
      setMsg("Crawl started — data will update in a few seconds.");
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    setBusy(false);
  }

  async function addToWatchlist() {
    if (!addSymbol.trim()) return;
    setBusy(true);
    try {
      await api("/api/desk/watchlist", { method: "POST", body: JSON.stringify({ symbol: addSymbol.trim() }) });
      setAddSymbol("");
      setMsg("Added to watchlist — will be crawled automatically.");
      await refresh();
    } catch (err) { setMsg(err instanceof Error ? err.message : "Failed"); }
    setBusy(false);
  }

  async function removeFromWatchlist(yahoo: string) {
    try {
      await api(`/api/desk/watchlist/${encodeURIComponent(yahoo)}`, { method: "DELETE" });
      await refresh();
    } catch {}
  }

  if (!status) return <div className="card"><Spinner label="Connecting to crawler…" /></div>;

  const uniqueSources = new Set(status.recent.flatMap((r) => r.sources));
  const crawledStocks = new Set(status.recent.map((r) => r.yahoo));

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Data Crawler</h2>
          <p>Fetches prices, news, and fundamentals from 80+ sources for your watched stocks.</p>
        </div>
      </div>

      {msg && <Banner kind={msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("error") ? "error" : "info"}>{msg}</Banner>}

      {/* Status */}
      <div className="grid grid-4" style={{ marginBottom: 12 }}>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Status</p>
          <p className={cls("mono", status.running ? "up" : "")} style={{ fontSize: 14 }}>{status.running ? "● Running" : "● Idle"}</p>
        </div>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Last Run</p>
          <p className="mono" style={{ fontSize: 14 }}>{status.lastRun ? new Date(status.lastRun).toLocaleString("en-IN") : "never"}</p>
        </div>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Snapshots</p>
          <p className="mono" style={{ fontSize: 14 }}>{status.snapshots}</p>
        </div>
        <div className="card kpi" style={{ padding: 10 }}>
          <p className="muted" style={{ fontSize: 11 }}>Sources Used</p>
          <p className="mono" style={{ fontSize: 14 }}>{uniqueSources.size}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Crawl Controls</h3>
        <div className="row" style={{ marginBottom: 10, alignItems: "center" }}>
          <button className="btn primary" disabled={busy || status.running} onClick={() => void crawlAll()}>
            {status.running ? "Running…" : "Crawl All Watched Stocks"}
          </button>
          <div className="row" style={{ gap: 4 }}>
            <input
              value={addSymbol}
              onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") void addToWatchlist(); }}
              placeholder="Add stock to watchlist"
              style={{ width: 160, padding: "6px 8px" }}
            />
            <button className="btn" disabled={busy || !addSymbol.trim()} onClick={() => void addToWatchlist()}>Add</button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Auto-crawls every 15 minutes. Manual crawls take 5-30 seconds per stock depending on sources.
          Set <code>FINNHUB_API_KEY</code> for extra US data.
        </p>
        {status.lastError && <p style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>Last error: {status.lastError}</p>}
      </div>

      {/* Watchlist */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Watched Stocks ({watchlist.length})</h3>
        <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>These stocks are crawled automatically every 15 minutes.</p>
        {watchlist.length === 0 ? (
          <p className="muted">No stocks watched yet. Add a stock above.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {watchlist.map((w) => (
              <div key={w.symbol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "var(--panel-2)", borderRadius: 6, fontSize: 12 }}>
                <Link to={`/stock/${encodeURIComponent(w.symbol)}`} style={{ fontWeight: 600 }}>{w.symbol.replace(".NS", "")}</Link>
                <span className="muted">{w.market}</span>
                {crawledStocks.has(w.symbol) && <span style={{ color: "var(--green)", fontSize: 10 }}>●</span>}
                <button onClick={() => void removeFromWatchlist(w.symbol)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 14, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Crawls */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>Recent Crawls</h3>
        <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>What data was fetched and from where.</p>
        {status.recent.length === 0 ? (
          <p className="muted">No crawls yet. Click "Crawl All" to start.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Time</th><th>Stock</th><th>Sources</th><th>Status</th><th>Error</th></tr></thead>
              <tbody>
                {status.recent.slice(0, 20).map((r) => (
                  <tr key={r.time + r.yahoo}>
                    <td className="muted" style={{ fontSize: 12 }}>{new Date(r.time).toLocaleString("en-IN")}</td>
                    <td><Link to={`/stock/${encodeURIComponent(r.yahoo)}`}>{r.yahoo.replace(".NS", "")}</Link></td>
                    <td className="muted" style={{ fontSize: 11 }}>{r.sources.slice(0, 5).join(", ")}{r.sources.length > 5 ? ` +${r.sources.length - 5} more` : ""}</td>
                    <td><span className={cls("badge", r.ok ? "up" : "down")}>{r.ok ? "OK" : "Failed"}</span></td>
                    <td className="muted" style={{ fontSize: 11, maxWidth: 200, color: r.error ? "var(--red)" : undefined }}>
                      {r.error || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Data Sources */}
      <div className="card">
        <h3>Active Data Sources ({uniqueSources.size})</h3>
        <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>All the sources used across your recent crawls.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {[...uniqueSources].sort().map((s) => (
            <span key={s} className="badge" style={{ fontSize: 10 }}>{s}</span>
          ))}
        </div>
      </div>
    </>
  );
}
