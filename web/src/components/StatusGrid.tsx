import type { ReactNode } from "react";

interface StatusGridProps {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}

export default function StatusGrid({ columns = 3, children }: StatusGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}
