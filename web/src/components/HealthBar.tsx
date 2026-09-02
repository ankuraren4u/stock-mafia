interface HealthBarProps {
  score: number;
  label?: string;
  showPct?: boolean;
}

function healthColor(score: number) {
  if (score >= 99) return "var(--green)";
  if (score >= 95) return "var(--amber)";
  return "var(--red)";
}

export default function HealthBar({ score, label, showPct = true }: HealthBarProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = healthColor(clamped);

  return (
    <div style={{ width: "100%" }}>
      {(label || showPct) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          {label ? <span className="muted" style={{ fontSize: 11 }}>{label}</span> : <span />}
          {showPct && (
            <span className="mono" style={{ fontSize: 12, color, fontWeight: 600 }}>
              {clamped.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div style={{ height: 8, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}
