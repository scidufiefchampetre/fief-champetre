export function StatBadge({
  count,
  variant = "muted",
}: {
  count: number;
  variant?: "brand" | "muted";
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${
        variant === "brand"
          ? "bg-brand-secondary/10 text-brand-secondary"
          : "bg-secondary text-muted-foreground"
      }`}
    >
      {count}
    </span>
  );
}
