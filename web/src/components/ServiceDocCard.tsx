import { useState, type ReactNode } from "react";

export interface ServiceDocCardProps {
  name: string;
  description: string;
  ports: { label: string; port: number | string; protocol?: string }[];
  healthEndpoint: string;
  configOptions?: { key: string; default: string; description: string }[];
  commonIssues?: { problem: string; solution: string }[];
  kibanaLink?: string;
  jaegerLink?: string;
  grafanaLink?: string;
  children?: ReactNode;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--line)",
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        cursor: "pointer",
        color: copied ? "var(--green)" : "var(--muted)",
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function StatusDot({ status }: { status: "ok" | "degraded" | "down" }) {
  const color = status === "ok" ? "var(--green)" : status === "degraded" ? "var(--amber)" : "var(--red)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

export default function ServiceDocCard({
  name,
  description,
  ports,
  healthEndpoint,
  configOptions,
  commonIssues,
  kibanaLink,
  jaegerLink,
  grafanaLink,
  children,
}: ServiceDocCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--accent)" }}>
      {/* Header */}
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <StatusDot status="ok" />
            <strong style={{ fontSize: 16, letterSpacing: "-0.01em" }}>{name}</strong>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{description}</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
          {jaegerLink && (
            <a href={jaegerLink} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="chip" title="Jaeger Traces">
              <span style={{ fontSize: 10 }}>T</span> Jaeger
            </a>
          )}
          {kibanaLink && (
            <a href={kibanaLink} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="chip" title="Kibana Logs">
              <span style={{ fontSize: 10 }}>L</span> Kibana
            </a>
          )}
          {grafanaLink && (
            <a href={grafanaLink} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="chip" title="Grafana Dashboard">
              <span style={{ fontSize: 10 }}>G</span> Grafana
            </a>
          )}
        </div>
      </div>

      {/* Ports */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        {ports.map((p) => (
          <div
            key={p.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: "var(--panel-2)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <span className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {p.label}
            </span>
            <span className="mono" style={{ fontWeight: 600 }}>{p.port}</span>
            {p.protocol && <span className="muted" style={{ fontSize: 10 }}>{p.protocol}</span>}
          </div>
        ))}
      </div>

      {/* Health Endpoint */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Health</span>
          <code className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{healthEndpoint}</code>
        </div>
        <CopyButton text={healthEndpoint} />
      </div>

      {/* Expandable section */}
      {expanded && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          {children}

          {/* Config Options */}
          {configOptions && configOptions.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>
                Configuration
              </h4>
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Default</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {configOptions.map((c) => (
                    <tr key={c.key}>
                      <td><code className="mono" style={{ fontSize: 11 }}>{c.key}</code></td>
                      <td><code className="mono" style={{ fontSize: 11 }}>{c.default}</code></td>
                      <td className="muted">{c.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Common Issues */}
          {commonIssues && commonIssues.length > 0 && (
            <div>
              <h4 style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>
                Common Issues & Solutions
              </h4>
              <div style={{ display: "grid", gap: 8 }}>
                {commonIssues.map((issue, i) => (
                  <div key={i} className="card" style={{ padding: 10, background: "var(--bg)" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 4px" }}>{issue.problem}</p>
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>{issue.solution}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
