import type { ReactNode } from "react";

export function SectionLabel({
  children,
  color = "muted",
}: {
  children: ReactNode;
  color?: "muted" | "brand";
}) {
  return (
    <div
      className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
        color === "brand" ? "text-brand-secondary" : "text-muted-foreground"
      }`}
    >
      {children}
    </div>
  );
}
