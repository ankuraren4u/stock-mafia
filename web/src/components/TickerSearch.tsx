import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "./Ui";
import { useMarket } from "../hooks/useMarket";
import { api, cls } from "../lib/api";

interface Hit {
  symbol: string;
  yahoo: string;
  name: string;
  sector: string;
  market: "IN" | "US";
  exchange: string;
}

const RECENTS_KEY = "stockmafia-recent-tickers";

function readRecents(): Hit[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as Hit[]).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function writeRecent(hit: Hit) {
  const next = [hit, ...readRecents().filter((h) => h.yahoo !== hit.yahoo)].slice(0, 6);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.trim().length)}</mark>
      {text.slice(i + q.trim().length)}
    </>
  );
}

export default function TickerSearch() {
  const navigate = useNavigate();
  const { market } = useMarket();
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recents = useMemo(() => readRecents().filter((r) => r.market === market), [open, market]);

  useEffect(() => {
    if (q.trim().length < 1) {
      setHits(recents);
      setSearching(false);
      return;
    }
    const ac = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/market/search?q=${encodeURIComponent(q.trim())}&market=${market}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((d: { results?: Hit[] }) => {
          setHits(d.results ?? []);
          setActive(0);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setHits([]);
        })
        .finally(() => setSearching(false));
    }, 120);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, recents, market]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const list = q.trim() ? hits : recents;

  async function openHit(hit: Hit) {
    setBusy(true);
    setError("");
    setOpen(false);
    setQ(hit.symbol);
    writeRecent(hit);
    try {
      await api("/api/market/track", {
        method: "POST",
        body: JSON.stringify({ yahoo: hit.yahoo }),
      });
      navigate(`/stock/${encodeURIComponent(hit.yahoo)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open ticker");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      void openHit(list[active]);
    }
  }

  const placeholder = market === "IN"
    ? "Search Indian stocks — RELIANCE, TCS, INFY…"
    : "Search US stocks — AAPL, TSLA, UBER…";

  return (
    <div className="search" ref={box}>
      <input
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      {searching ? <span className="search-spinner" aria-hidden /> : null}
      {busy ? <Spinner label="Opening ticker…" /> : null}
      {error ? <div className="error">{error}</div> : null}
      {open ? (
        <div className="search-results" role="listbox">
          {!q.trim() && recents.length > 0 ? <div className="search-label">Recent</div> : null}
          {q.trim() && searching && hits.length === 0 ? <div className="search-empty">Matching tickers…</div> : null}
          {q.trim() && !searching && list.length === 0 ? (
            <div className="search-empty">No matching stocks. Try {market === "IN" ? "RELIANCE, TCS, INFY" : "AAPL, NVDA, UBER"}.</div>
          ) : null}
          {list.map((h, i) => (
            <button
              key={h.yahoo}
              type="button"
              role="option"
              aria-selected={i === active}
              className={cls("search-hit", i === active && "active")}
              onMouseEnter={() => setActive(i)}
              onClick={() => void openHit(h)}
            >
              <span className="search-hit-top">
                <strong>{highlight(h.symbol, q)}</strong>
                <span className="badge hold">{h.market}</span>
              </span>
              <span className="muted">
                {highlight(h.name, q)} · {h.exchange}
                {h.sector && h.sector !== "—" ? ` · ${h.sector}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
