import { useState } from "react";
export interface ServiceInfo {
  name: string;
  status: "ok" | "degraded" | "down" | "unknown";
  uptime: string;
  requests: number;
  errorRate: number;
  latency: { p50: number; p95: number; p99: number };
  cpu: number;
  memory: number;
  lastCheck: string;
  version?: string;
  port?: string;
}

function statusColor(s: ServiceInfo["status"]) {
  return s === "ok" ? "var(--green)" : s === "degraded" ? "var(--amber)" : s === "down" ? "var(--red)" : "var(--muted)";
}

function statusLabel(s: ServiceInfo["status"]) {
  return s === "ok" ? "Healthy" : s === "degraded" ? "Degraded" : s === "down" ? "Down" : "Unknown";
}

function pctColor(v: number, warn = 80) {
  return v >= warn ? "var(--red)" : v >= warn - 20 ? "var(--amber)" : "var(--muted)";
}

function msColor(ms: number) {
  return ms < 50 ? "var(--green)" : ms < 200 ? "var(--muted)" : "var(--red)";
}

export default function ServiceCard({ svc }: { svc: ServiceInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card" style={{ borderLeft: `3px solid ${statusColor(svc.status)}`, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(svc.status), display: "inline-block" }} />
            <strong style={{ fontSize: 14 }}>{svc.name}</strong>
          </div>
          <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
            {statusLabel(svc.status)} · {svc.uptime} uptime
            {svc.version ? ` · v${svc.version}` : ""}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p className="mono" style={{ fontSize: 13, margin: 0 }}>{svc.requests.toLocaleString()} req</p>
          <p className="mono" style={{ fontSize: 11, margin: "2px 0 0", color: svc.errorRate > 1 ? "var(--red)" : "var(--muted)" }}>
            {svc.errorRate.toFixed(2)}% err
          </p>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <p className="muted" style={{ fontSize: 10, margin: 0, textTransform: "uppercase" }}>CPU</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <div style={{ flex: 1, height: 6, background: "var(--panel-2)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${svc.cpu}%`, height: "100%", background: pctColor(svc.cpu), borderRadius: 3 }} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: pctColor(svc.cpu) }}>{svc.cpu}%</span>
              </div>
            </div>
            <div>
              <p className="muted" style={{ fontSize: 10, margin: 0, textTransform: "uppercase" }}>Memory</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <div style={{ flex: 1, height: 6, background: "var(--panel-2)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${svc.memory}%`, height: "100%", background: pctColor(svc.memory), borderRadius: 3 }} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: pctColor(svc.memory) }}>{svc.memory}%</span>
              </div>
            </div>
            <div>
              <p className="muted" style={{ fontSize: 10, margin: 0, textTransform: "uppercase" }}>Error Rate</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <div style={{ flex: 1, height: 6, background: "var(--panel-2)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(svc.errorRate * 10, 100)}%`, height: "100%", background: svc.errorRate > 1 ? "var(--red)" : "var(--green)", borderRadius: 3 }} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: svc.errorRate > 1 ? "var(--red)" : "var(--green)" }}>{svc.errorRate.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {([
              { label: "p50", value: `${svc.latency.p50}ms` },
              { label: "p95", value: `${svc.latency.p95}ms` },
              { label: "p99", value: `${svc.latency.p99}ms` },
              { label: "Last Check", value: svc.lastCheck },
            ] as const).map((m) => (
              <div key={m.label}>
                <p className="muted" style={{ fontSize: 10, margin: 0 }}>{m.label}</p>
                <p className="mono" style={{ fontSize: 12, margin: "2px 0 0", color: m.label !== "Last Check" ? msColor(parseInt(String(m.value), 10)) : undefined }}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
