import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function WatchButton({ yahoo }: { yahoo: string; name?: string }) {
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ watchlist: string[] }>("/api/desk/watchlist")
      .then((d) => setWatching(d.watchlist.includes(yahoo)))
      .catch(() => {});
  }, [yahoo]);

  async function toggle() {
    setBusy(true);
    try {
      if (watching) {
        await api(`/api/desk/watchlist/${encodeURIComponent(yahoo)}`, { method: "DELETE" });
        setWatching(false);
      } else {
        await api("/api/desk/watchlist", { method: "POST", body: JSON.stringify({ symbol: yahoo }) });
        setWatching(true);
      }
    } catch {}
    setBusy(false);
  }

  return (
    <button
      className={watching ? "btn primary" : "btn"}
      disabled={busy}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggle(); }}
      style={{ fontSize: 11, padding: "2px 8px" }}
      title={watching ? "Remove from watchlist" : "Add to watchlist"}
    >
      {watching ? "★ Watching" : "☆ Watch"}
    </button>
  );
}

export function AlertButton({ yahoo }: { yahoo: string }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [dir, setDir] = useState<"above" | "below">("above");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!price) return;
    setBusy(true);
    try {
      await api("/api/desk/alert", {
        method: "POST",
        body: JSON.stringify({ yahoo, direction: dir, price: Number(price), note: note || "alert" }),
      });
      setSaved(true);
      setTimeout(() => { setOpen(false); setSaved(false); setPrice(""); setNote(""); }, 1200);
    } catch {}
    setBusy(false);
  }

  return (
    <span style={{ position: "relative" }}>
      <button
        className="btn"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        style={{ fontSize: 11, padding: "2px 8px" }}
        title="Set price alert"
      >
        🔔 Alert
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "100%", right: 0, zIndex: 100,
            background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
            padding: 10, width: 220, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {saved ? (
            <div style={{ color: "var(--green)", fontSize: 12, textAlign: "center", padding: 8 }}>Alert saved!</div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Alert when {yahoo}</div>
              <div className="row" style={{ gap: 4, marginBottom: 6 }}>
                <select value={dir} onChange={(e) => setDir(e.target.value as "above" | "below")} style={{ fontSize: 11, padding: "2px 4px" }}>
                  <option value="above">Price goes above</option>
                  <option value="below">Price drops below</option>
                </select>
              </div>
              <input
                type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder="Target price" style={{ width: "100%", fontSize: 11, padding: "4px 6px", marginBottom: 6 }}
              />
              <input
                value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)" style={{ width: "100%", fontSize: 11, padding: "4px 6px", marginBottom: 6 }}
              />
              <div className="row" style={{ gap: 4 }}>
                <button className="btn primary" style={{ fontSize: 11, flex: 1 }} disabled={!price || busy} onClick={() => void save()}>Save</button>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
