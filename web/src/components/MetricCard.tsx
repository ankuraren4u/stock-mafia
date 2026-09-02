import { LineChart, Line, ResponsiveContainer } from "recharts";

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: number;
  sparkline?: number[];
  color?: string;
  compact?: boolean;
}

function deltaColor(d: number | undefined) {
  if (d == null) return undefined;
  return d > 0 ? "var(--green)" : d < 0 ? "var(--red)" : "var(--muted)";
}

export default function MetricCard({ label, value, delta, sparkline, color = "var(--accent)", compact }: MetricCardProps) {
  return (
    <div className="card" style={{ padding: compact ? 10 : 14 }}>
      <p className="muted" style={{ fontSize: 11, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6, gap: 8 }}>
        <div>
          <p className="mono" style={{ fontSize: compact ? 16 : 20, fontWeight: 600, margin: 0, lineHeight: 1.1 }}>
            {value}
          </p>
          {delta != null && (
            <p className="mono" style={{ fontSize: 11, margin: "2px 0 0", color: deltaColor(delta) }}>
              {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
            </p>
          )}
        </div>
        {sparkline && sparkline.length > 2 && (
          <div style={{ width: 64, height: 24, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline.map((v) => ({ v }))}>
                <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
