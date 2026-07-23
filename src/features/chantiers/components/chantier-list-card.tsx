import { ArrowRight, CalendarDays, Check, HardHat } from "lucide-react";
import type { Chantier, ChantierPeriod } from "@/lib/chantier-types";
import { ListCard } from "@/components/ui/list-card";

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
    <ListCard
      as="link"
      to="/chantier/$id"
      params={{ id: chantier.id }}
      search={{ startDate: chantier.startDate, demo: false, signupDemo: false, focus: undefined }}
      muted={past}
      icon={past ? <Check className="h-4.5 w-4.5" /> : <HardHat className="h-4.5 w-4.5" strokeWidth={2} />}
      title={chantierTitle(chantier.startDate, chantier.endDate)}
      badge={
        past ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Terminé
          </span>
        ) : undefined
      }
      meta1={
        <>
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
        </>
      }
    />
  );
}
