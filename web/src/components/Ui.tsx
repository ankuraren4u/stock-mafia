import type { ReactNode } from "react";
import { cls } from "../lib/api";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loader-row" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="skeleton-stack">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${88 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p className="muted">{body}</p>
    </div>
  );
}

export function CallChip({
  label,
  state,
}: {
  label: string;
  state: "idle" | "loading" | "ok" | "error" | "empty";
}) {
  return (
    <span className={cls("chip", state)}>
      {state === "loading" ? <span className="spinner sm" aria-hidden /> : null}
      {label}
      {state === "ok" ? " · live" : state === "loading" ? " · fetching" : state === "error" ? " · failed" : state === "empty" ? " · none" : ""}
    </span>
  );
}

export function Banner({
  kind,
  children,
}: {
  kind: "info" | "error" | "ok";
  children: ReactNode;
}) {
  return <div className={cls("banner", kind)}>{children}</div>;
}
