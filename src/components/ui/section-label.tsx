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
      className={`eyebrow ${color === "brand" ? "!text-brand-secondary" : ""}`}
    >
      {children}
    </div>
  );
}
