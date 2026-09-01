import { useEffect, useState } from "react";
import { api, cls } from "../lib/api";

interface Status {
  ok: boolean;
  api: string;
  crawler: {
    running: boolean;
    lastRun: number | null;
    snapshots: number;
    lastError: string | null;
  };
  sessions?: {
    india: { open: boolean; clock: string };
    us: { open: boolean; clock: string };
  };
}

export default function AppStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let live = true;
    async function ping() {
      try {
        const s = await api<Status>("/api/status");
        if (!live) return;
        setStatus(s);
        setDown(false);
      } catch {
        if (live) setDown(true);
      }
    }
    void ping();
    const t = setInterval(() => void ping(), 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const apiOk = !down && Boolean(status);
  const crawling = Boolean(status?.crawler.running);

  return (
    <div className="statusbar" aria-live="polite">
      <span className={cls("dot", apiOk ? "ok" : "bad")} />
      <span>{apiOk ? "API up" : "API unreachable"}</span>
      <span className="sep">·</span>
      <span className={cls("dot", crawling ? "busy" : "ok")} />
      <span>{crawling ? "Crawling in background" : "Crawler idle"}</span>
      {status ? (
        <>
          <span className="sep">·</span>
          <span>{status.crawler.snapshots} snapshots</span>
          {status.sessions ? (
            <>
              <span className="sep">·</span>
              <span>IN {status.sessions.india.open ? "open" : "closed"}</span>
              <span className="sep">·</span>
              <span>US {status.sessions.us.open ? "open" : "closed"}</span>
            </>
          ) : null}
        </>
      ) : (
        <span className="spinner sm" />
      )}
    </div>
  );
}
