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

const serviceHealthLinks: LinkItem[] = [
  { label: "Gateway", url: "http://localhost:8787/api/health", description: "HTTP API gateway health", type: "health" },
  { label: "Gateway (detailed)", url: "http://localhost:8787/api/status/detailed", description: "Full platform status JSON", type: "health" },
  { label: "Crawler", url: "http://localhost:50052/health", description: "Data crawler service health", type: "health" },
  { label: "Price Service", url: "http://localhost:8082/health", description: "Price streaming service health", type: "health" },
  { label: "Analytics", url: "http://localhost:50054/health", description: "Analytics service health", type: "health" },
  { label: "Alert Service", url: "http://localhost:50055/health", description: "Alert service health", type: "health" },
  { label: "Portfolio", url: "http://localhost:50056/health", description: "Portfolio service health", type: "health" },
];

const monitoringLinks: LinkItem[] = [
  { label: "Jaeger - All Services", url: "http://localhost:16686/", description: "Distributed tracing overview", type: "monitoring" },
  { label: "Jaeger - Gateway", url: "http://localhost:16686/search?service=gateway", description: "Gateway traces", type: "monitoring" },
  { label: "Jaeger - Crawler", url: "http://localhost:16686/search?service=crawler", description: "Crawler traces", type: "monitoring" },
  { label: "Jaeger - Price Service", url: "http://localhost:16686/search?service=price-service", description: "Price service traces", type: "monitoring" },
  { label: "Jaeger - Analytics", url: "http://localhost:16686/search?service=analytics", description: "Analytics traces", type: "monitoring" },
  { label: "Kibana", url: "http://localhost:5601/", description: "Log search and dashboards", type: "monitoring" },
  { label: "Kibana - Gateway Logs", url: "http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-gateway-*',interval:auto,query:(language:kuery,query:'service:gateway'))", description: "Gateway log stream", type: "monitoring" },
  { label: "Kibana - Crawler Logs", url: "http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-crawler-*',interval:auto,query:(language:kuery,query:'service:crawler'))", description: "Crawler log stream", type: "monitoring" },
  { label: "Kibana - Price Logs", url: "http://localhost:5601/app/discover#/?_g=(refreshInterval:(pause:!t,value:0),time:(from:now-1h,to:now))&_a=(columns:!(),index:'stockmafia-price-*',interval:auto,query:(language:kuery,query:'service:price'))", description: "Price service log stream", type: "monitoring" },
  { label: "Grafana", url: "http://localhost:3000/", description: "Metrics dashboards (if available)", type: "dashboard" },
];

const infraLinks: LinkItem[] = [
  { label: "MySQL", url: "http://localhost:3306", description: "MySQL database (port 3306)", type: "infra" },
  { label: "MySQL - Web UI", url: "http://localhost:8080", description: "phpMyAdmin or similar DB admin", type: "infra" },
  { label: "Redis", url: "http://localhost:6379", description: "Redis cache (port 6379)", type: "infra" },
  { label: "Redis Commander", url: "http://localhost:8081", description: "Redis web UI (if running)", type: "infra" },
  { label: "Kafka", url: "http://localhost:9092", description: "Kafka broker (port 9092)", type: "infra" },
  { label: "Kafka UI", url: "http://localhost:8085", description: "Kafka web UI (if running)", type: "infra" },
  { label: "Kafka - KafkaUI", url: "http://localhost:9090", description: "Kafka UI alternative", type: "infra" },
  { label: "Zookeeper", url: "http://localhost:2181", description: "Zookeeper for Kafka (port 2181)", type: "infra" },
  { label: "Elasticsearch", url: "http://localhost:9200", description: "Elasticsearch cluster (port 9200)", type: "infra" },
  { label: "Elasticsearch - Head", url: "http://localhost:9100", description: "Elasticsearch Head plugin", type: "infra" },
  { label: "Kubernetes Dashboard", url: "http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/http/https:kubernetes-dashboard:/proxy/", description: "K8s dashboard (via kubectl proxy)", type: "infra" },
];

const kafkaTopicLinks: LinkItem[] = [
  { label: "Topic: stock.prices", url: "http://localhost:8085/topic/stock.prices", description: "Real-time price update events", type: "infra" },
  { label: "Topic: stock.signals", url: "http://localhost:8085/topic/stock.signals", description: "Trading signals from analytics", type: "infra" },
  { label: "Topic: stock.alerts", url: "http://localhost:8085/topic/stock.alerts", description: "Alert trigger events", type: "infra" },
  { label: "Topic: stock.crawl.results", url: "http://localhost:8085/topic/stock.crawl.results", description: "Crawler result data", type: "infra" },
  { label: "Topic: stock.trades", url: "http://localhost:8085/topic/stock.trades", description: "Trade execution events", type: "infra" },
  { label: "Topic: stock.portfolio", url: "http://localhost:8085/topic/stock.portfolio", description: "Portfolio update events", type: "infra" },
];

const grafanaDashboardLinks: LinkItem[] = [
  { label: "Platform Overview", url: "http://localhost:3000/d/stockmafia-overview", description: "Overall platform health and metrics", type: "dashboard" },
  { label: "Service Metrics", url: "http://localhost:3000/d/stockmafia-services", description: "Per-service latency, errors, throughput", type: "dashboard" },
  { label: "Crawler Dashboard", url: "http://localhost:3000/d/stockmafia-crawler", description: "Crawl rates, source health, queue depth", type: "dashboard" },
  { label: "Market Data", url: "http://localhost:3000/d/stockmafia-market", description: "Price update frequency and staleness", type: "dashboard" },
  { label: "Alert Analytics", url: "http://localhost:3000/d/stockmafia-alerts", description: "Alert fire rate and notification delivery", type: "dashboard" },
];

/* ── Page Component ── */

export default function ServiceLinksPage() {
  const [filter, setFilter] = useState<string>("all");

  const allSections = [
    { title: "Service Health Endpoints", links: serviceHealthLinks, key: "health" },
    { title: "Monitoring & Tracing", links: monitoringLinks, key: "monitoring" },
    { title: "Infrastructure", links: infraLinks, key: "infra" },
    { title: "Kafka Topics", links: kafkaTopicLinks, key: "kafka" },
    { title: "Grafana Dashboards", links: grafanaDashboardLinks, key: "grafana" },
  ];

  const filtered = filter === "all" ? allSections : allSections.filter((s) => s.key === filter);

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Service Links & Quick Access</h2>
          <p>Direct links to health endpoints, monitoring tools, infrastructure, and dashboards.</p>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: "all", label: "All" },
          { key: "health", label: "Health" },
          { key: "monitoring", label: "Monitoring" },
          { key: "infra", label: "Infrastructure" },
          { key: "kafka", label: "Kafka" },
          { key: "grafana", label: "Grafana" },
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
        <h3 style={{ margin: "0 0 10px" }}>Quick Copy - cURL Health Checks</h3>
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
{`# Check all services at once
for port in 8787 50052 8082 50054 50055 50056; do
  echo -n "Port $port: "
  curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health || echo "DOWN"
  echo
done

# Gateway status
curl -s http://localhost:8787/api/status/detailed | jq .

# Crawler status
curl -s http://localhost:50052/status | jq .

# Quick price check
curl -s http://localhost:8082/price/RELIANCE | jq .`}
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
