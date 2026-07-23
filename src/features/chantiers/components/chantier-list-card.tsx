import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Check, HardHat } from "lucide-react";
import type { Chantier, ChantierPeriod } from "@/lib/chantier-types";

const PERIOD_LABEL: Record<Exclude<ChantierPeriod, "">, string> = {
  matin: "matin",
  apres_midi: "après-midi",
  soir: "soir",
};

export function fmtChantierDate(iso: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

export function chantierMonthTitle(iso: string) {
  const label = new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function chantierTitle(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const inclusiveDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return inclusiveDays > 5
    ? `Semaine chantier ${start.getFullYear()}`
    : chantierMonthTitle(startDate);
}

export function displayedPeriod(period: ChantierPeriod, edge: "start" | "end") {
  return PERIOD_LABEL[period || (edge === "start" ? "matin" : "apres_midi")];
}

export function ChantierListCard({
  chantier,
  past = false,
}: {
  chantier: Chantier;
  past?: boolean;
}) {
  return (
    <Link
      to="/chantier/$id"
      params={{ id: chantier.id }}
      search={{ startDate: chantier.startDate, demo: false, signupDemo: false, focus: undefined }}
      className={`group block rounded-2xl border p-3.5 transition-colors hover-device:hover:border-brand-secondary/35 ${past ? "border-border bg-secondary/20" : "border-border bg-card"}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${past ? "bg-secondary text-muted-foreground" : "bg-brand-accent/15 text-brand-accent"}`}
        >
          {past ? (
            <Check className="h-4.5 w-4.5" />
          ) : (
            <HardHat className="h-4.5 w-4.5" strokeWidth={2} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[15px] font-black tracking-[-0.01em]">
              {chantierTitle(chantier.startDate, chantier.endDate)}
            </h2>
            {past && (
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Terminé
              </span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[8px] font-medium text-muted-foreground sm:text-[9px]">
            <CalendarDays className="h-3 w-3 shrink-0 text-brand-secondary" />
            <span className="shrink-0 capitalize">{fmtChantierDate(chantier.startDate)}</span>
            <span className="shrink-0 font-semibold text-foreground">
              · {displayedPeriod(chantier.startPeriod, "start")}
            </span>
            <ArrowRight className="h-2.5 w-2.5 shrink-0 text-brand-secondary" />
            <span className="shrink-0 capitalize">{fmtChantierDate(chantier.endDate)}</span>
            <span className="shrink-0 font-semibold text-foreground">
              · {displayedPeriod(chantier.endPeriod, "end")}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[9px] font-semibold text-brand-secondary">
          <span className="hidden sm:inline">{past ? "Voir le récap" : "Voir"}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
