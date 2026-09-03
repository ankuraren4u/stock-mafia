import { useState } from "react";

/* ── Helpers ── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        background: "transparent",
        border: "1px solid var(--line)",
        borderRadius: 4,
        padding: "1px 6px",
        fontSize: 10,
        cursor: "pointer",
        color: copied ? "var(--green)" : "var(--muted)",
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

interface LinkItem {
  label: string;
  url: string;
  description: string;
  type: "health" | "monitoring" | "infra" | "dashboard" | "config";
}

const typeColors: Record<string, string> = {
  health: "var(--green)",
  monitoring: "var(--accent)",
  infra: "var(--amber)",
  dashboard: "#8b5cf6",
  config: "var(--muted)",
};

const typeLabels: Record<string, string> = {
  health: "Health",
  monitoring: "Monitoring",
  infra: "Infrastructure",
  dashboard: "Dashboard",
  config: "Config",
};

function LinkCard({ link }: { link: LinkItem }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px 14px",
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: hovered ? "var(--panel-2)" : "var(--panel)",
        textDecoration: "none",
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{link.label}</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 3,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: typeColors[link.type],
            background: `${typeColors[link.type]}18`,
          }}
        >
          {typeLabels[link.type]}
        </span>
      </div>
      <code className="mono" style={{ fontSize: 11, color: "var(--accent)", wordBreak: "break-all" }}>
        {link.url}
      </code>
      <span className="muted" style={{ fontSize: 11 }}>{link.description}</span>
      <div>
        <CopyButton text={link.url} />
      </div>
    </a>
  );
}

function LinkSection({ title, links }: { title: string; links: LinkItem[] }) {
  return (
    <div>
      <h3 style={{ margin: "0 0 10px", fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {title} ({links.length})
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
        {links.map((link) => (
          <LinkCard key={link.url} link={link} />
        ))}
      </div>
    </div>
  );
}

/* ── Link Data ── */

const getBaseUrl = () => `${window.location.protocol}//${window.location.host}`;
const getWsUrl = () => `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

const serviceHealthLinks: LinkItem[] = [
  { label: "Gateway Health", url: `${getBaseUrl()}/api/health`, description: "API gateway health check", type: "health" },
  { label: "Detailed Status", url: `${getBaseUrl()}/api/status/detailed`, description: "Full platform status with all metrics", type: "health" },
  { label: "Prometheus Metrics", url: `${getBaseUrl()}/api/status/metrics`, description: "Prometheus-format metrics", type: "health" },
  { label: "Crawler Status", url: `${getBaseUrl()}/api/crawler/status`, description: "Crawler status, sources, and recent crawls", type: "health" },
];

const realtimeLinks: LinkItem[] = [
  { label: "SSE Event Stream", url: `${getBaseUrl()}/api/events`, description: "Server-Sent Events for real-time updates", type: "monitoring" },
  { label: "WebSocket", url: getWsUrl(), description: "WebSocket for real-time price streaming", type: "monitoring" },
  { label: "Kite Login", url: `${getBaseUrl()}/api/kite/login-url`, description: "Zerodha Kite OAuth login (if configured)", type: "monitoring" },
  { label: "Kite Status", url: `${getBaseUrl()}/api/kite/status`, description: "Zerodha Kite connection status", type: "monitoring" },
];

const appPages: LinkItem[] = [
  { label: "Markets Dashboard", url: `${getBaseUrl()}/`, description: "Live prices for watched stocks", type: "infra" },
  { label: "Research Hub", url: `${getBaseUrl()}/research`, description: "Signals, screener, stock intel, radar", type: "infra" },
  { label: "Trade Desk", url: `${getBaseUrl()}/desk`, description: "Daily trading command center", type: "infra" },
  { label: "Paper Book", url: `${getBaseUrl()}/paper`, description: "Simulated portfolio with positions", type: "infra" },
  { label: "Data Crawler", url: `${getBaseUrl()}/crawler`, description: "Manage data collection and watchlist", type: "infra" },
  { label: "Service Status", url: `${getBaseUrl()}/status`, description: "Service health and metrics dashboard", type: "infra" },
  { label: "Service Help", url: `${getBaseUrl()}/service-health`, description: "API documentation for all endpoints", type: "infra" },
];

const quickApiLinks: LinkItem[] = [
  { label: "Search Stocks", url: `${getBaseUrl()}/api/market/search?q=AAPL`, description: "Search stocks by name or symbol", type: "dashboard" },
  { label: "Stock Details", url: `${getBaseUrl()}/api/market/stocks/AAPL`, description: "Full stock data (price, fundamentals, signals)", type: "dashboard" },
  { label: "Trading Signals", url: `${getBaseUrl()}/api/signals`, description: "Current signals for watchlist stocks", type: "dashboard" },
  { label: "Smart Alert", url: `${getBaseUrl()}/api/desk/alert/analyze/AAPL`, description: "Analyze any stock for buy/sell recommendation", type: "dashboard" },
  { label: "Screener Presets", url: `${getBaseUrl()}/api/screener/presets`, description: "Available screener filter presets", type: "dashboard" },
  { label: "Watchlist", url: `${getBaseUrl()}/api/desk/watchlist`, description: "Current watchlist and tracked instruments", type: "dashboard" },
];

/* ── Page Component ── */

export default function ServiceLinksPage() {
  const [filter, setFilter] = useState<string>("all");

  const allSections = [
    { title: "Service Health & API", links: serviceHealthLinks, key: "health" },
    { title: "Real-time & Alerts", links: realtimeLinks, key: "monitoring" },
    { title: "Application Pages", links: appPages, key: "infra" },
    { title: "Quick API Access", links: quickApiLinks, key: "dashboard" },
  ];

  const filtered = filter === "all" ? allSections : allSections.filter((s) => s.key === filter);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Service Links & Quick Access</h2>
          <p>Direct links to all running services, API endpoints, and application pages.</p>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: "all", label: "All" },
          { key: "health", label: "Health & API" },
          { key: "monitoring", label: "Real-time" },
          { key: "infra", label: "App Pages" },
          { key: "dashboard", label: "Quick API" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={filter === f.key ? "btn primary" : "btn ghost"}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Quick Copy Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 10px" }}>Quick Copy — cURL Examples</h3>
        <pre
          style={{
            background: "var(--bg)",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            margin: 0,
            overflow: "auto",
            lineHeight: 1.6,
          }}
        >
{`# Health check
curl -sk https://192.168.10.223:8787/api/health | jq .

# Detailed status
curl -sk https://192.168.10.223:8787/api/status/detailed | jq .

# Search stocks
curl -sk "https://192.168.10.223:8787/api/market/search?q=AAPL" | jq .

# Stock details (includes chart, fundamentals, signals)
curl -sk "https://192.168.10.223:8787/api/market/stocks/AAPL" | jq .

# Smart alert analysis
curl -sk "https://192.168.10.223:8787/api/desk/alert/analyze/AAPL" | jq .

# Crawler status
curl -sk "https://192.168.10.223:8787/api/crawler/status" | jq .`}
        </pre>
      </div>

      {/* Sections */}
      <div style={{ display: "grid", gap: 24 }}>
        {filtered.map((section) => (
          <LinkSection key={section.key} title={section.title} links={section.links} />
        ))}
      </div>
    </>
  );
}
