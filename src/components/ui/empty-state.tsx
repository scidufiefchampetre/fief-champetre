import type { ReactNode } from "react";

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">{children}</div>
  );
}
