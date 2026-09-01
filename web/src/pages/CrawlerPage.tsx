import { useEffect, useState } from "react";
import { Banner, CallChip, EmptyState, Skeleton, Spinner } from "../components/Ui";
import { api } from "../lib/api";

interface Status {
  lastRun: number | null;
  running: boolean;
  lastError: string | null;
  snapshots: number;
  finnhub: boolean;
  symbols: string[];
  recent: Array<{ time: number; yahoo: string; ok: boolean; sources: string[] }>;
}

export default function CrawlerPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState("");
  const [symbol, setSymbol] = useState("AAPL");

  async function refresh() {
    setStatus(await api<Status>("/api/crawler/status"));
  }

  useEffect(() => {
    void refresh().catch((err) => setMsg(err instanceof Error ? err.message : "Failed"));
    const t = setInterval(() => void refresh().catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, []);

  async function runAll() {
    setMsg("Watchlist crawl started in the background.");
    try {
      await api("/api/crawler/run", { method: "POST" });
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Crawl failed");
    }
  }

  async function runOne() {
    setMsg(`Queued ${symbol} in the background.`);
    try {
      await api(`/api/crawler/symbol/${encodeURIComponent(symbol)}`, { method: "POST" });
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Crawl failed");
    }
  }

  if (!status) {
    return (
      <div className="card">
        <Spinner label="Connecting to crawler…" />
        <Skeleton lines={4} />
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Data crawler</h2>
          <p>Prices and headlines refresh in the background every 15 minutes, including when this page is closed.</p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <CallChip label="Crawler" state={status.running ? "loading" : "ok"} />
        <CallChip label="Finnhub" state={status.finnhub ? "ok" : "empty"} />
      </div>
      {status.running ? <Spinner label="Background crawl in progress…" /> : null}
      {msg && !status.running ? <Banner kind={msg.toLowerCase().includes("fail") ? "error" : "info"}>{msg}</Banner> : null}
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <div className="label">Snapshots on disk</div>
          <div className="value">{status.snapshots}</div>
        </div>
        <div className="card kpi">
          <div className="label">Last run</div>
          <div className="value" style={{ fontSize: 16 }}>
            {status.lastRun ? new Date(status.lastRun).toLocaleString("en-IN") : "never"}
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Finnhub</div>
          <div className="value" style={{ fontSize: 16 }}>
            {status.finnhub ? "on" : "off"}
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Run</h3>
        <div className="row">
          <button className="btn primary" disabled={status.running} onClick={() => void runAll()}>
            Run now
          </button>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} style={{ width: 140 }} />
          <button className="btn" disabled={status.running} onClick={() => void runOne()}>
            Queue ticker
          </button>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Starts on server boot if data is older than 15 minutes, then repeats every 15 minutes. Manual runs also
          return immediately. Set FINNHUB_API_KEY in server/.env for extra US quotes and company news.
        </p>
        {status.lastError ? <p className="error">{status.lastError}</p> : null}
      </div>
      <div className="card">
        <h3>Recent crawls</h3>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Ticker</th>
              <th>Sources used</th>
            </tr>
          </thead>
          <tbody>
            {status.recent.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <EmptyState title="No snapshots yet" body="Run crawl watchlist or open a stock page." />
                </td>
              </tr>
            ) : (
              status.recent.map((r) => (
                <tr key={r.time + r.yahoo}>
                  <td className="muted">{new Date(r.time).toLocaleString("en-IN")}</td>
                  <td>{r.yahoo}</td>
                  <td className="muted">{r.sources.join(", ") || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
