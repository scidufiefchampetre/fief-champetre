import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight as ArrowRightIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  Flame,
  Hammer,
  Home as HomeIcon,
  Sun,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  listReservations,
  createReservation,
  cancelReservation,
} from "@/lib/reservations.functions";
import { listTaskCatalog, logChantierContribution } from "@/lib/chantier-contributions.functions";
import type { Reservation, ReservationType } from "@/lib/reservation-types";
import { TYPE_LABEL } from "@/lib/reservation-types";
import {
  computePriceBreakdown,
  nightsBetween,
  getPaymentStatus,
  PAYMENT_BADGE_STYLE,
} from "@/lib/pricing";
import { useExpenseStore } from "@/core/store/expense-store";
import { AppHeader } from "@/core/components/app-header";
import { ChantierBriefCard } from "@/features/chantiers/components/chantier-brief-card";
import { PageShell } from "@/components/ui/page-shell";
import { Toggle } from "@/core/components/toggle";
import { FormSection, ReservationField, NumberStepper } from "@/components/reservation-form-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/agenda")({
  component: AgendaPage,
  head: () => ({
    meta: [
      { title: "Agenda · Fief Champêtre" },
      {
        name: "description",
        content: "Réserver la maison, voir qui est là, calculer ce que tu dois.",
      },
    ],
  }),
});

function windowRange() {
  const now = new Date();
  const min = new Date(now);
  min.setMonth(min.getMonth() - 1);
  const max = new Date(now);
  max.setMonth(max.getMonth() + 12);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

function fmtRange(startDate: string, endDate: string) {
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const startFmt = s.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
  });
  const endFmt = e.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${startFmt} → ${endFmt}`;
}

function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function monthKey(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dernier jour inclus d'une réservation (endDate est exclusive, format Calendar all-day). */
function lastNightIso(endDate: string): string {
  const d = new Date(`${endDate}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

const TYPE_STYLES: Record<ReservationType, { bg: string; fg: string; icon: typeof HomeIcon }> = {
  personal: { bg: "bg-brand-secondary", fg: "text-brand-secondary-foreground", icon: HomeIcon },
  airbnb: { bg: "bg-secondary", fg: "text-secondary-foreground", icon: Sun },
  chantier: {
    bg: "bg-brand-dark dark:ring-1 dark:ring-brand-light/25",
    fg: "text-brand-light",
    icon: Hammer,
  },
};

function AgendaPage() {
  const store = useExpenseStore();
  const queryClient = useQueryClient();
  const list = useServerFn(listReservations);
  const [formOpen, setFormOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [detail, setDetail] = useState<Reservation | null>(null);
  const [chantierDetail, setChantierDetail] = useState<{ id: string; startDate: string } | null>(null);

  const { timeMin, timeMax } = useMemo(windowRange, []);
  const { data, isLoading } = useQuery({
    queryKey: ["reservations", timeMin, timeMax],
    queryFn: () => list({ data: { spreadsheetId: store.spreadsheetId, timeMin, timeMax } }),
    refetchInterval: 30_000,
  });

  const reservations = (data?.reservations ?? []).filter((r) => r.status === "confirmed");
  // Le calendrier a besoin de TOUT le monde (pour repérer les conflits), mais
  // la liste en dessous ne doit montrer que mes propres réservations.
  const myReservations = useMemo(
    () =>
      reservations.filter((r) => r.type === "personal" && r.reservedBy === store.member?.firstName),
    [reservations, store.member?.firstName],
  );
  const grouped = useMemo(() => {
    const groups = new Map<string, Reservation[]>();
    for (const r of myReservations) {
      const key = monthKey(r.startDate);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return [...groups.entries()];
  }, [myReservations]);

  const startDayReservations = useMemo(() => {
    if (!rangeStart) return [];
    return reservations.filter((r) => rangeStart >= r.startDate && rangeStart < r.endDate);
  }, [reservations, rangeStart]);

  const rangeOverlap = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    return reservations.filter((r) => rangeStart < r.endDate && rangeEnd > r.startDate);
  }, [reservations, rangeStart, rangeEnd]);

  const rangeBlockingOverlap = rangeOverlap.find((r) => r.type === "personal" && r.privatized);
  const rangeExternalOverlap = rangeOverlap.find(
    (r) => r.type === "airbnb" || r.type === "chantier",
  );
  const rangeSharedOverlap = rangeOverlap.filter((r) => r.type === "personal" && !r.privatized);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  }

  function handleDayClick(iso: string) {
    if (!rangeStart || (rangeStart && rangeEnd) || iso === rangeStart) {
      setRangeStart(iso);
      setRangeEnd(null);
      return;
    }
    if (iso < rangeStart) {
      setRangeEnd(rangeStart);
      setRangeStart(iso);
    } else {
      setRangeEnd(iso);
    }
  }

  function clearSelection() {
    setRangeStart(null);
    setRangeEnd(null);
  }

  return (
    <PageShell>
      <AppHeader variant="back" />

      <div className="animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="page-title">Agenda.</h1>
            <p className="mt-2 text-xs text-muted-foreground">
              Clique une date de début, puis une date de fin, pour réserver.
            </p>
          </div>
          <button
            onClick={() => {
              clearSelection();
              setFormOpen(true);
            }}
            className="tap lift flex shrink-0 items-center gap-1.5 rounded-full bg-brand-secondary px-4 py-2 text-[12px] font-semibold text-brand-secondary-foreground shadow-card"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Réserver
          </button>
        </div>

        <div className="mt-4 flex gap-2 text-[10px] font-semibold">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-brand-secondary" /> Perso
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
            <span className="h-2 w-2 rounded-full border border-border bg-secondary" /> Airbnb
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-brand-dark dark:ring-1 dark:ring-brand-light/30" />
            Chantier
          </span>
        </div>

        <div className="mt-5">
          <MonthCalendar
            reservations={reservations}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onDayClick={handleDayClick}
            onSegmentClick={(r) => {
              if (r.type === "chantier") {
                setChantierDetail({ id: r.id, startDate: r.startDate });
              } else {
                setDetail(r);
              }
            }}
          />
        </div>

        {rangeStart && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            {!rangeEnd ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-bold capitalize">
                    Arrivée : {fmtDay(rangeStart)}
                  </div>
                  <button
                    onClick={clearSelection}
                    className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Annuler
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Clique maintenant la date de départ sur le calendrier.
                </p>
                {startDayReservations.length > 0 && (
                  <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                    {startDayReservations.map((r) => (
                      <div key={r.id}>
                        {r.type === "personal" ? r.reservedBy : TYPE_LABEL[r.type]},{" "}
                        {r.adults + r.children} pers
                        {r.mood ? ` · "${r.mood}"` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-bold">{fmtRange(rangeStart, rangeEnd)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {nightsBetween(rangeStart, rangeEnd)} nuit
                      {nightsBetween(rangeStart, rangeEnd) > 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    onClick={clearSelection}
                    className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Recommencer
                  </button>
                </div>

                {rangeBlockingOverlap && (
                  <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive">
                    {rangeBlockingOverlap.reservedBy} a privatisé la maison sur cette période.
                  </p>
                )}
                {!rangeBlockingOverlap && rangeExternalOverlap && (
                  <p className="mt-2 rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2 text-[11px] font-bold text-destructive">
                    ⚠️ Chevauche{" "}
                    {rangeExternalOverlap.type === "airbnb" ? "une location Airbnb" : "un chantier"}{" "}
                    Vérifie avant de confirmer.
                  </p>
                )}
                {!rangeBlockingOverlap && rangeSharedOverlap.length > 0 && (
                  <div className="mt-2 rounded-xl bg-brand-secondary/10 border border-brand-secondary/30 px-3 py-2 text-[11px] text-foreground space-y-1">
                    {rangeSharedOverlap.map((r) => (
                      <div key={r.id}>
                        Déjà là : <strong>{r.reservedBy}</strong> ({r.adults + r.children} pers)
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setFormOpen(true)}
                  disabled={!!rangeBlockingOverlap}
                  className="tap lift mt-3 w-full rounded-2xl bg-brand-secondary py-3 text-sm font-semibold text-brand-secondary-foreground shadow-card disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuer
                </button>
              </>
            )}
          </div>
        )}

        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Mes réservations
            </div>
            <Link
              to="/mes-reservations"
              className="text-[11px] font-semibold text-brand-secondary hover:underline"
            >
              Tout voir →
            </Link>
          </div>
          {isLoading && (
            <div className="animate-pulse space-y-2">
              <div className="h-16 rounded-2xl bg-secondary" />
              <div className="h-16 rounded-2xl bg-secondary/60" />
            </div>
          )}
          {!isLoading && grouped.length === 0 && (
            <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
              Tu n'as encore rien réservé — clique deux dates sur le calendrier pour commencer.
            </div>
          )}
          {grouped.map(([month, items]) => (
            <div key={month}>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {month}
              </div>
              <div className="space-y-2">
                {items.map((r) => (
                  <ReservationCard
                    key={r.id}
                    reservation={r}
                    onCancelled={refresh}
                    currentMember={store.member?.firstName ?? ""}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ReservationForm
        open={formOpen}
        onOpenChange={setFormOpen}
        existing={reservations}
        initialStart={rangeStart}
        initialEnd={rangeEnd}
        onCreated={() => {
          refresh();
          clearSelection();
        }}
      />

      <ReservationDetailSheet reservation={detail} onOpenChange={(v) => !v && setDetail(null)} />

      <Sheet open={!!chantierDetail} onOpenChange={(v) => !v && setChantierDetail(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Fiche chantier</SheetTitle>
            <SheetDescription>Détail du chantier</SheetDescription>
          </SheetHeader>
          {chantierDetail && (
            <ChantierBriefCard
              chantierId={chantierDetail.id}
              startDate={chantierDetail.startDate}
              groups={[]}
            />
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

interface DayCell {
  date: Date;
  iso: string;
  inMonth: boolean;
}

interface WeekSegment {
  reservation: Reservation;
  startCol: number;
  endCol: number;
  lane: number;
  isTrueStart: boolean;
  isTrueEnd: boolean;
}

function MonthCalendar({
  reservations,
  rangeStart,
  rangeEnd,
  onDayClick,
  onSegmentClick,
}: {
  reservations: Reservation[];
  rangeStart: string | null;
  rangeEnd: string | null;
  onDayClick: (iso: string) => void;
  onSegmentClick: (r: Reservation) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const touchStartX = useState({ x: 0 })[0];

  function goMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  const todayIso = isoDate(new Date());

  const cells = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    // Lundi = 0 ... Dimanche = 6
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - firstWeekday);

    const days: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push({ date: d, iso: isoDate(d), inMonth: d.getMonth() === cursor.getMonth() });
    }
    return days;
  }, [cursor]);

  const weeks = useMemo(() => {
    const out: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  // Attribution des rangées ("lanes") pour empiler proprement les barres qui se chevauchent,
  // stable sur toute la grille visible (pas recalculé à chaque semaine).
  const laneOf = useMemo(() => {
    const gridStartIso = cells[0]?.iso ?? "";
    const gridEndIso = cells[cells.length - 1]?.iso ?? "";
    const relevant = reservations.filter(
      (r) => r.endDate > gridStartIso && r.startDate <= gridEndIso,
    );
    const sorted = [...relevant].sort(
      (a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate),
    );
    const laneEnds: string[] = [];
    const map = new Map<string, number>();
    for (const r of sorted) {
      let lane = laneEnds.findIndex((end) => end <= r.startDate);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(r.endDate);
      } else {
        laneEnds[lane] = r.endDate;
      }
      map.set(r.id, lane);
    }
    return map;
  }, [reservations, cells]);

  function segmentsForWeek(week: DayCell[]): WeekSegment[] {
    const weekStartIso = week[0].iso;
    const weekEndIso = week[6].iso;
    const segs: WeekSegment[] = [];
    for (const r of reservations) {
      if (r.endDate <= weekStartIso || r.startDate > weekEndIso) continue;
      const lastIso = lastNightIso(r.endDate);
      const segStartIso = r.startDate > weekStartIso ? r.startDate : weekStartIso;
      const segEndIso = lastIso < weekEndIso ? lastIso : weekEndIso;
      const startCol = week.findIndex((d) => d.iso === segStartIso);
      const endCol = week.findIndex((d) => d.iso === segEndIso);
      if (startCol === -1 || endCol === -1) continue;
      segs.push({
        reservation: r,
        startCol,
        endCol,
        lane: laneOf.get(r.id) ?? 0,
        isTrueStart: segStartIso === r.startDate,
        isTrueEnd: segEndIso === lastIso,
      });
    }
    return segs;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => goMonth(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-[13px] font-bold capitalize">
          {cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </div>
        <button
          onClick={() => goMonth(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary"
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        onTouchStart={(e) => {
          touchStartX.x = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const delta = e.changedTouches[0].clientX - touchStartX.x;
          if (delta > 50) goMonth(-1);
          else if (delta < -50) goMonth(1);
        }}
      >
        <div className="grid grid-cols-7 text-center text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="space-y-[3px]">
          {weeks.map((week, wi) => (
            <WeekRow
              key={wi}
              week={week}
              segments={segmentsForWeek(week)}
              todayIso={todayIso}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onDayClick={onDayClick}
              onSegmentClick={onSegmentClick}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Glisse à gauche/droite pour changer de mois
      </p>
    </div>
  );
}

function WeekRow({
  week,
  segments,
  todayIso,
  rangeStart,
  rangeEnd,
  onDayClick,
  onSegmentClick,
}: {
  week: DayCell[];
  segments: WeekSegment[];
  todayIso: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  onDayClick: (iso: string) => void;
  onSegmentClick: (r: Reservation) => void;
}) {
  const maxLane = segments.reduce((m, s) => Math.max(m, s.lane), -1);

  return (
    <div>
      <div className="grid grid-cols-7 gap-x-[3px]">
        {week.map(({ date, iso, inMonth }) => {
          const isToday = iso === todayIso;
          const isCap = iso === rangeStart || iso === rangeEnd;
          const inRange = !!rangeStart && !!rangeEnd && iso > rangeStart && iso < rangeEnd;
          return (
            <button
              key={iso}
              onClick={() => onDayClick(iso)}
              className={`tap flex h-7 items-center justify-center rounded-md text-[11px] transition active:scale-90 ${
                isCap
                  ? "bg-foreground text-background font-bold"
                  : inRange
                    ? "bg-foreground/10 font-semibold"
                    : isToday
                      ? "bg-brand-secondary/20 font-bold"
                      : inMonth
                        ? "hover:bg-secondary"
                        : "opacity-30 hover:bg-secondary"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      {maxLane >= 0 && (
        <div className="mt-[3px] space-y-[3px]">
          {Array.from({ length: maxLane + 1 }).map((_, lane) => {
            const laneSegs = segments.filter((s) => s.lane === lane);
            if (laneSegs.length === 0) return <div key={lane} style={{ height: 15 }} />;
            return (
              <div key={lane} className="grid grid-cols-7 gap-x-[3px]" style={{ height: 15 }}>
                {laneSegs.map((s) => {
                  const style = TYPE_STYLES[s.reservation.type];
                  const label =
                    s.reservation.type === "personal"
                      ? s.reservation.reservedBy
                      : TYPE_LABEL[s.reservation.type];
                  return (
                    <button
                      key={s.reservation.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSegmentClick(s.reservation);
                      }}
                      style={{ gridColumn: `${s.startCol + 1} / ${s.endCol + 2}` }}
                      className={`tap flex items-center overflow-hidden px-1.5 text-[9px] font-bold leading-none transition hover:brightness-110 active:scale-[0.96] ${style.bg} ${style.fg} ${
                        s.isTrueStart ? "rounded-l-full" : ""
                      } ${s.isTrueEnd ? "rounded-r-full" : ""}`}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReservationCard({
  reservation,
  onCancelled,
  currentMember,
}: {
  reservation: Reservation;
  onCancelled: () => void;
  currentMember: string;
}) {
  const store = useExpenseStore();
  const cancel = useServerFn(cancelReservation);
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const style = TYPE_STYLES[reservation.type];
  const Icon = style.icon;
  const canCancel =
    reservation.type === "personal" &&
    reservation.reservedBy === currentMember &&
    !reservation.paid;

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancel({ data: { spreadsheetId: store.spreadsheetId, id: reservation.id } });
      toast.success("Réservation annulée.");
      onCancelled();
    } catch (e) {
      console.error(e);
      toast.error("L'annulation a échoué.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.bg}`}>
        <Icon className={`h-4.5 w-4.5 ${style.fg}`} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold truncate">
            {reservation.type === "personal"
              ? reservation.reservedBy
              : TYPE_LABEL[reservation.type]}
          </span>
          {reservation.privatized && (
            <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
              Privatisé
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {fmtRange(reservation.startDate, reservation.endDate)}
        </div>
        {reservation.type === "personal" && (
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {reservation.adults + reservation.children}
            </span>
            {reservation.mood && <span className="truncate italic">"{reservation.mood}"</span>}
          </div>
        )}
      </div>
      {reservation.type === "personal" && (
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${PAYMENT_BADGE_STYLE[getPaymentStatus(reservation).status]}`}
        >
          {getPaymentStatus(reservation).label}
        </span>
      )}
      {canCancel && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={cancelling}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive transition disabled:opacity-40"
          aria-label="Annuler la réservation"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler cette réservation ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? "Annulation…" : "Annuler la réservation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReservationDetailSheet({
  reservation,
  onOpenChange,
}: {
  reservation: Reservation | null;
  onOpenChange: (v: boolean) => void;
}) {
  if (!reservation) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" />
      </Sheet>
    );
  }

  const style = TYPE_STYLES[reservation.type];
  const Icon = style.icon;
  const nights = nightsBetween(reservation.startDate, reservation.endDate);
  const breakdown =
    reservation.type === "personal"
      ? computePriceBreakdown({
          adults: reservation.adults,
          nights,
          privatized: reservation.privatized,
          electricityAmount: reservation.electricityAmount,
        })
      : null;
  const paymentStatus = reservation.type === "personal" ? getPaymentStatus(reservation) : null;

  return (
    <Sheet open={!!reservation} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader className="sr-only">
          <SheetTitle>Détail de la réservation</SheetTitle>
          <SheetDescription>
            {reservation.type === "personal"
              ? reservation.reservedBy
              : TYPE_LABEL[reservation.type]}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.bg}`}
          >
            <Icon className={`h-5 w-5 ${style.fg}`} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight truncate">
              {reservation.type === "personal"
                ? reservation.reservedBy
                : TYPE_LABEL[reservation.type]}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {fmtRange(reservation.startDate, reservation.endDate)}
            </div>
          </div>
        </div>

        {reservation.type === "personal" && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {paymentStatus && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${PAYMENT_BADGE_STYLE[paymentStatus.status]}`}
                >
                  {paymentStatus.label}
                </span>
              )}
              {reservation.privatized && (
                <span className="rounded-full bg-foreground/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide">
                  Privatisé
                </span>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Personnes</span>
                <span className="font-semibold">
                  {reservation.adults} adulte{reservation.adults > 1 ? "s" : ""}
                  {reservation.children > 0
                    ? ` + ${reservation.children} enfant${reservation.children > 1 ? "s" : ""}`
                    : ""}
                </span>
              </div>
              {reservation.mood && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Mood</span>
                  <span className="font-semibold text-right italic">"{reservation.mood}"</span>
                </div>
              )}
              {reservation.arrivalTime && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Arrivée prévue</span>
                  <span className="font-semibold text-right">{reservation.arrivalTime}</span>
                </div>
              )}
            </div>

            {breakdown && (
              <div className="rounded-2xl bg-secondary/50 p-4 space-y-1.5 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{breakdown.nuiteesDetail}</span>
                  <span className="font-semibold tabular-nums">{breakdown.nuiteesAmount}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Électricité</span>
                  <span className="font-semibold tabular-nums">
                    {reservation.electricityAmount === null ? (
                      <span className="italic text-muted-foreground">en attente du trésorier</span>
                    ) : (
                      `${reservation.electricityAmount}€`
                    )}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-[13px] font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{breakdown.total}€</span>
                </div>
              </div>
            )}
          </div>
        )}

        {reservation.type === "chantier" && (
          <Link
            to="/chantier/$id"
            params={{ id: reservation.id }}
            search={{
              startDate: reservation.startDate,
              demo: false,
              signupDemo: false,
              focus: undefined,
            }}
            className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-secondary/50 p-4 text-[13px] transition hover:bg-secondary"
          >
            <div>
              <p className="font-semibold text-foreground">Voir la fiche du chantier</p>
              <p className="mt-1 text-muted-foreground">Tâches, effectif et budget repas.</p>
            </div>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        )}

        {reservation.type === "airbnb" && (
          <div className="mt-5 rounded-2xl bg-secondary/50 p-4 text-[13px] text-muted-foreground">
            Location Airbnb, gérée en dehors de l'app par le gestionnaire.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReservationForm({
  open,
  onOpenChange,
  existing,
  initialStart,
  initialEnd,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: Reservation[];
  initialStart: string | null;
  initialEnd: string | null;
  onCreated: () => void;
}) {
  const create = useServerFn(createReservation);
  const logContribution = useServerFn(logChantierContribution);
  const listTasks = useServerFn(listTaskCatalog);
  const store = useExpenseStore();
  // On est forcément identifié pour arriver jusqu'ici (gate global dans __root.tsx),
  // donc pas de champ texte libre pour le nom : on réserve toujours en son propre nom.
  const identifiedName = store.member?.firstName ?? "";
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [privatized, setPrivatized] = useState(false);
  const [mood, setMood] = useState("");
  const [preheat, setPreheat] = useState(false);
  const [arrivalTime, setArrivalTime] = useState("");
  const [doingChantier, setDoingChantier] = useState(false);
  const [chantierTask, setChantierTask] = useState("");
  const [chantierDays, setChantierDays] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const { data: taskCatalogData } = useQuery({
    queryKey: ["chantier-task-catalog"],
    queryFn: () => listTasks(),
    enabled: open,
  });
  const taskCatalog = taskCatalogData?.tasks ?? [];
  const [receipt, setReceipt] = useState<Reservation | null>(null);

  // Repart des dates choisies sur le calendrier à chaque ouverture du formulaire.
  useEffect(() => {
    if (open) {
      setStartDate(initialStart ?? "");
      setEndDate(initialEnd ?? "");
    }
  }, [open, initialStart, initialEnd]);

  const nights = startDate && endDate ? nightsBetween(startDate, endDate) : 0;
  const breakdown =
    nights > 0
      ? computePriceBreakdown({ adults, nights, privatized, electricityAmount: null })
      : null;

  const overlapping = useMemo(() => {
    if (!startDate || !endDate || nights <= 0) return [];
    return existing.filter(
      (r) => r.status === "confirmed" && startDate < r.endDate && endDate > r.startDate,
    );
  }, [existing, startDate, endDate, nights]);

  // Seule une privatisation déjà en place bloque vraiment (règle de la
  // maison). Airbnb et Chantier ne bloquent plus : on laisse réserver mais on
  // prévient fort, il faut vérifier avant de confirmer pour ne pas empiéter.
  const blockingOverlap = overlapping.find((r) => r.type === "personal" && r.privatized);
  const externalOverlap = overlapping.find((r) => r.type === "airbnb" || r.type === "chantier");
  const sharedOverlap = overlapping.filter((r) => r.type === "personal" && !r.privatized);
  const willBlockBecausePrivatizing = privatized && overlapping.length > 0 && !blockingOverlap;

  function reset() {
    setAdults(1);
    setChildren(0);
    setPrivatized(false);
    setMood("");
    setPreheat(false);
    setArrivalTime("");
    setDoingChantier(false);
    setChantierTask("");
    setChantierDays(1);
    setReceipt(null);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function handleSubmit() {
    if (!identifiedName) {
      toast.error("Identifie-toi d'abord pour pouvoir réserver.");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Choisis une date d'arrivée et de départ.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await create({
        data: {
          spreadsheetId: store.spreadsheetId,
          type: "personal",
          reservedBy: identifiedName,
          startDate,
          endDate,
          adults,
          children,
          privatized,
          mood,
          preheat,
          arrivalTime: arrivalTime || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      if (doingChantier && chantierTask.trim() && chantierDays > 0) {
        try {
          await logContribution({
            data: {
              reservationId: res.reservation.id,
              person: identifiedName,
              taskLabel: chantierTask.trim(),
              days: chantierDays,
            },
          });
        } catch (e) {
          console.error(e);
          toast.error("La réservation est créée, mais l'enregistrement du chantier a échoué.");
        }
      }
      toast.success("Réservation créée.");
      setReceipt(res.reservation);
      onCreated();
    } catch (e) {
      console.error(e);
      toast.error("La réservation a échoué. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
        {receipt ? (
          <ReservationReceipt reservation={receipt} onClose={() => handleClose(false)} />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="text-2xl font-bold tracking-tight">
                Nouvelle réservation
              </SheetTitle>
              <SheetDescription className="text-xs">
                Bloque tes dates, on calcule le reste.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5 px-1 pb-6">
              <FormSection step={1} title="Qui & quand">
                <ReservationField label="Toi">
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/50 px-4 py-3 text-base font-semibold">
                    {identifiedName || "—"}
                  </div>
                </ReservationField>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <ReservationField label="Arrivée">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-card px-3 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </ReservationField>
                  <ReservationField label="Départ">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-card px-3 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </ReservationField>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Choisies sur le calendrier, modifiables ici si besoin.
                </p>

                {blockingOverlap && (
                  <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-[12px] font-medium text-destructive">
                    {blockingOverlap.reservedBy} a privatisé la maison sur cette période.
                  </p>
                )}
                {willBlockBecausePrivatizing && (
                  <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-[12px] font-medium text-destructive">
                    Il y a déjà du monde sur cette période, tu ne peux pas privatiser.
                  </p>
                )}
                {!blockingOverlap && externalOverlap && (
                  <p className="mt-3 rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-[12px] font-bold text-destructive">
                    ⚠️ Ces dates chevauchent{" "}
                    {externalOverlap.type === "airbnb" ? "une location Airbnb" : "un chantier"}.
                    Vérifie avant de confirmer, pour ne pas empiéter dessus.
                  </p>
                )}
                {!blockingOverlap && sharedOverlap.length > 0 && (
                  <div className="mt-3 rounded-xl bg-brand-secondary/10 border border-brand-secondary/30 px-3 py-2.5 text-[12px] text-foreground space-y-1">
                    {sharedOverlap.map((r) => (
                      <div key={r.id}>
                        Déjà là : <strong>{r.reservedBy}</strong> ({r.adults + r.children} pers)
                        {r.mood && <>, ambiance : "{r.mood}"</>}
                      </div>
                    ))}
                  </div>
                )}
              </FormSection>

              <FormSection step={2} title="Détails du séjour">
                <div className="grid grid-cols-2 gap-3">
                  <ReservationField label="Adultes (16 ans et +)">
                    <NumberStepper value={adults} onChange={setAdults} min={0} />
                  </ReservationField>
                  <ReservationField label="Enfants (- 16 ans)">
                    <NumberStepper value={children} onChange={setChildren} min={0} />
                  </ReservationField>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                  <div>
                    <div className="text-[13px] font-semibold">Privatisation complète</div>
                    <div className="text-[11px] text-muted-foreground">
                      250€ forfait, personne d'autre ne peut réserver
                    </div>
                  </div>
                  <Toggle
                    checked={privatized}
                    onChange={() => setPrivatized(!privatized)}
                    label="Privatisation complète"
                  />
                </div>

                <div className="mt-3">
                  <ReservationField label="Mood / thème du week-end (optionnel)">
                    <input
                      value={mood}
                      onChange={(e) => setMood(e.target.value.slice(0, 200))}
                      placeholder="Ex : anniversaire de Paul, chill en famille…"
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </ReservationField>
                </div>

                <div className="mt-3">
                  <ReservationField label="Heure d'arrivée (optionnel)">
                    <input
                      type="time"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </ReservationField>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                  <div>
                    <div className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Flame className="h-3.5 w-3.5" /> Pré-chauffage
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Lancer le chauffage avant l'arrivée
                    </div>
                  </div>
                  <Toggle
                    checked={preheat}
                    onChange={() => setPreheat(!preheat)}
                    label="Pré-chauffage"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                  <div>
                    <div className="text-[13px] font-semibold flex items-center gap-1.5">
                      <Hammer className="h-3.5 w-3.5" /> Je viens aussi faire du chantier
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Compte des jours dans ta contribution
                    </div>
                  </div>
                  <Toggle
                    checked={doingChantier}
                    onChange={() => setDoingChantier(!doingChantier)}
                    label="Je viens aussi faire du chantier"
                  />
                </div>

                {doingChantier && (
                  <div className="mt-3 rounded-2xl border border-border bg-card p-4 space-y-3">
                    <ReservationField label="Tâche">
                      <input
                        list="chantier-task-catalog"
                        value={chantierTask}
                        onChange={(e) => setChantierTask(e.target.value)}
                        placeholder="Choisis une tâche ou tape-en une nouvelle…"
                        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                      />
                      <datalist id="chantier-task-catalog">
                        {taskCatalog.map((t) => (
                          <option key={t.id} value={t.label} />
                        ))}
                      </datalist>
                    </ReservationField>
                    <ReservationField label="Nombre de jours">
                      <NumberStepper value={chantierDays} onChange={setChantierDays} min={1} />
                    </ReservationField>
                  </div>
                )}
              </FormSection>

              {breakdown && (
                <FormSection step={3} title="Prix">
                  <div className="rounded-2xl bg-secondary/50 p-4 space-y-1.5">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-muted-foreground">{breakdown.nuiteesDetail}</span>
                      <span className="font-semibold tabular-nums">{breakdown.nuiteesAmount}€</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Électricité (à saisir après le séjour)</span>
                      <span>—</span>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-[13px] font-bold">
                      <span>Total nuitées</span>
                      <span className="tabular-nums">{breakdown.nuiteesAmount}€</span>
                    </div>
                  </div>
                </FormSection>
              )}

              <button
                onClick={handleSubmit}
                disabled={
                  submitting || !!blockingOverlap || willBlockBecausePrivatizing || !identifiedName
                }
                className="tap lift w-full rounded-2xl bg-brand-secondary py-3.5 text-sm font-semibold text-brand-secondary-foreground shadow-card disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Réservation…" : "Confirmer la réservation"}
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReservationReceipt({
  reservation: r,
  onClose,
}: {
  reservation: Reservation;
  onClose: () => void;
}) {
  const nights = nightsBetween(r.startDate, r.endDate);
  const breakdown = computePriceBreakdown({
    adults: r.adults,
    nights,
    privatized: r.privatized,
    electricityAmount: r.electricityAmount,
  });
  const style = TYPE_STYLES[r.type];
  const Icon = style.icon;

  return (
    <div className="animate-rise px-1 pb-6">
      <div className="flex flex-col items-center pt-2 pb-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/60">
          <Check className="h-7 w-7 text-success-foreground" strokeWidth={3} />
        </div>
        <h2 className="mt-3 text-2xl font-bold tracking-tight">C'est réservé !</h2>
        <p className="mt-1 text-xs text-muted-foreground">Voici ta fiche de réservation.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden transition hover:border-foreground/20">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.bg}`}
          >
            <Icon className={`h-4.5 w-4.5 ${style.fg}`} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold">
              {r.type === "personal" ? r.reservedBy : TYPE_LABEL[r.type]}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {fmtRange(r.startDate, r.endDate)}
            </div>
          </div>
        </div>

        {r.type === "personal" && (
          <div className="px-4 py-3 space-y-2 text-[12px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Personnes</span>
              <span className="font-semibold">
                {r.adults} adulte{r.adults > 1 ? "s" : ""}
                {r.children > 0 ? ` + ${r.children} enfant${r.children > 1 ? "s" : ""}` : ""}
              </span>
            </div>
            {r.privatized && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Privatisation</span>
                <span className="font-semibold">Oui</span>
              </div>
            )}
            {r.mood && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ambiance</span>
                <span className="font-semibold italic truncate max-w-[60%] text-right">
                  "{r.mood}"
                </span>
              </div>
            )}
            <div className="border-t border-border pt-2 flex justify-between font-bold text-[13px]">
              <span>Nuitées</span>
              <span className="tabular-nums">{breakdown.nuiteesAmount}€</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              L'électricité s'ajoutera après le séjour, saisie par le trésorier. Suis le total sur
              "Mes réservations".
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onClose}
          className="tap lift flex-1 rounded-2xl bg-brand-secondary py-3.5 text-sm font-semibold text-brand-secondary-foreground shadow-card"
        >
          Terminé
        </button>
        <Link
          to="/mes-reservations"
          onClick={onClose}
          className="tap lift flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold"
        >
          Mes résa <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
