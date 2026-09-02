import { useState } from "react";

export interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "WS" | "SSE";
  path: string;
  description: string;
  example?: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
}

function methodColor(m: Endpoint["method"]) {
  const colors: Record<string, string> = {
    GET: "var(--green)",
    POST: "var(--accent)",
    PUT: "var(--amber)",
    DELETE: "var(--red)",
    PATCH: "var(--amber)",
    WS: "#8b5cf6",
    SSE: "#8b5cf6",
  };
  return colors[m] || "var(--muted)";
}

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
        background: "var(--panel)",
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

export default function EndpointList({ endpoints, basePath = "" }: { endpoints: Endpoint[]; basePath?: string }) {
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  return (
    <div>
      {endpoints.map((ep) => {
        const fullPath = basePath + ep.path;
        const isOpen = expandedPath === fullPath;
        return (
          <div
            key={fullPath + ep.method}
            style={{
              display: "flex",
              flexDirection: "column",
              borderBottom: "1px solid var(--line)",
              padding: "8px 0",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              onClick={() => setExpandedPath(isOpen ? null : fullPath)}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: methodColor(ep.method),
                  background: `${methodColor(ep.method)}14`,
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  minWidth: 42,
                  textAlign: "center",
                }}
              >
                {ep.method}
              </span>
              <code className="mono" style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{fullPath}</code>
              <CopyButton text={fullPath} />
            </div>
            <p className="muted" style={{ margin: "4px 0 0 58px", fontSize: 12 }}>{ep.description}</p>

            {isOpen && (
              <div style={{ marginTop: 8, marginLeft: 58 }}>
                {/* Example */}
                {ep.example && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>Example</p>
                    <pre
                      style={{
                        background: "var(--bg)",
                        padding: "8px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                        margin: 0,
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.5,
                      }}
                    >
                      {ep.example}
                    </pre>
                  </div>
                )}

                {/* Params */}
                {ep.params && ep.params.length > 0 && (
                  <table style={{ fontSize: 11, width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Param</th>
                        <th>Type</th>
                        <th>Required</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ep.params.map((p) => (
                        <tr key={p.name}>
                          <td><code className="mono">{p.name}</code></td>
                          <td><code className="mono">{p.type}</code></td>
                          <td style={{ color: p.required ? "var(--red)" : "var(--muted)" }}>{p.required ? "yes" : "no"}</td>
                          <td className="muted">{p.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
