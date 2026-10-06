import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Users, Pencil, X, CalendarDays } from "lucide-react";
import { toast } from "sonner";

import {
  listReservations,
  updateReservation,
  cancelReservation,
} from "@/lib/reservations.functions";
import type { Reservation } from "@/lib/reservation-types";
import {
  computePriceBreakdown,
  nightsBetween,
  getPaymentStatus,
  PAYMENT_BADGE_STYLE,
} from "@/lib/pricing";
import { useExpenseStore } from "@/core/store/expense-store";
import { AppHeader } from "@/core/components/app-header";
import { PageShell } from "@/components/ui/page-shell";
import { Toggle } from "@/core/components/toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { FormSection, ReservationField, NumberStepper } from "@/components/reservation-form-ui";
import { DateRangeField } from "@/components/ui/form-primitives";
import { ListCard } from "@/components/ui/list-card";

export const Route = createFileRoute("/mes-reservations")({
  component: MesReservationsPage,
  head: () => ({
    meta: [
      { title: "Mes réservations · Fief Champêtre" },
      { name: "description", content: "Ce que tu dois, ce qui est réglé." },
    ],
  }),
});

// Rafraîchi automatiquement, parce que le montant électricité et le statut payé
// sont mis à jour par le trésorier directement dans le Google Sheet, pas depuis l'app.
const POLL_MS = 30_000;

function windowRange() {
  const now = new Date();
  const min = new Date(now);
  min.setMonth(min.getMonth() - 12);
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
  const endFmt = e.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return `${startFmt} → ${endFmt}`;
}

function fmtEur(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function normalize(v: string) {
  return v.trim().toLocaleLowerCase("fr-FR");
}

function MesReservationsPage() {
  const store = useExpenseStore();
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const list = useServerFn(listReservations);
  const { timeMin, timeMax } = useMemo(windowRange, []);

  useEffect(() => {
    useExpenseStore.getState().hydrateMember();
    setHydrated(true);
  }, []);

  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["reservations", "mine", timeMin, timeMax],
    queryFn: () => list({ data: { spreadsheetId: store.spreadsheetId, timeMin, timeMax } }),
    refetchInterval: POLL_MS,
    enabled: hydrated,
  });

  if (!hydrated) {
    return (
      <main className="min-h-dvh w-full bg-background">
        <div className="mx-auto flex min-h-dvh w-full max-w-xl items-center justify-center px-4">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Chargement…
          </div>
        </div>
      </main>
    );
  }

  if (!store.member) {
    return (
      <PageShell>
        <AppHeader variant="back" className="mb-4" />
        <div className="rounded-2xl bg-secondary/50 p-5 text-sm text-muted-foreground animate-rise">
          Identifie-toi d'abord depuis l'accueil pour voir tes réservations.
        </div>
      </PageShell>
    );
  }

  const all = data?.reservations ?? [];
  const mine = all.filter(
    (r) =>
      r.type === "personal" &&
      r.status === "confirmed" &&
      normalize(r.reservedBy) === normalize(store.member!.firstName),
  );

  const withStatus = mine.map((r) => ({ r, status: getPaymentStatus(r).status }));
  const upcoming = withStatus
    .filter((x) => x.status === "upcoming")
    .map((x) => x.r)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const awaitingTreasurer = withStatus
    .filter((x) => x.status === "awaiting_treasurer")
    .map((x) => x.r)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const due = withStatus
    .filter((x) => x.status === "due")
    .map((x) => x.r)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const paid = withStatus
    .filter((x) => x.status === "paid")
    .map((x) => x.r)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const totalDu = due.reduce((sum, r) => sum + r.totalAmount, 0);

  function refreshAll() {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
  }

  return (
    <PageShell>
      <AppHeader variant="back" />

      <div className="animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="page-title">Mes réservations.</h1>
            <p className="page-lead">
              Le montant électricité et le statut payé sont mis à jour par le trésorier, ça se
              rafraîchit ici tout seul.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-2xs font-semibold text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>

        {due.length > 0 && (
          <div className="mt-5 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 p-4">
            <div className="text-2xs font-medium uppercase tracking-widest text-brand-accent">
              À régler
            </div>
            <div className="mt-1 text-3xl font-black tracking-tight text-brand-accent">
              {fmtEur(totalDu)}
            </div>
            <div className="mt-0.5 text-xs text-brand-accent/80">
              sur {due.length} séjour{due.length > 1 ? "s" : ""}
            </div>
          </div>
        )}
        {due.length === 0 && mine.length > 0 && (
          <div className="mt-5 rounded-2xl bg-success/20 border border-success/30 p-4 text-sm font-semibold text-success-foreground">
            Tu es en règle. Rien à devoir pour l'instant.
          </div>
        )}

        <div className="mt-6 space-y-6">
          {due.length > 0 && (
            <ReservationGroup
              title={`À régler (${due.length})`}
              reservations={due}
              onEdit={setEditing}
              onCancelled={refreshAll}
            />
          )}
          {awaitingTreasurer.length > 0 && (
            <ReservationGroup
              title={`En attente du trésorier (${awaitingTreasurer.length})`}
              reservations={awaitingTreasurer}
              onEdit={setEditing}
              onCancelled={refreshAll}
            />
          )}
          {upcoming.length > 0 && (
            <ReservationGroup
              title={`À venir (${upcoming.length})`}
              reservations={upcoming}
              onEdit={setEditing}
              onCancelled={refreshAll}
            />
          )}
          {paid.length > 0 && (
            <ReservationGroup
              title={`Réglé (${paid.length})`}
              reservations={paid}
              onEdit={setEditing}
              onCancelled={refreshAll}
            />
          )}
          {mine.length === 0 && !isFetching && (
            <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
              Aucune réservation trouvée à ton nom pour l'instant.
            </div>
          )}
        </div>
      </div>

      <EditReservationSheet
        reservation={editing}
        existing={all}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={refreshAll}
      />
    </PageShell>
  );
}

function ReservationGroup({
  title,
  reservations,
  onEdit,
  onCancelled,
}: {
  title: string;
  reservations: Reservation[];
  onEdit: (r: Reservation) => void;
  onCancelled: () => void;
}) {
  return (
    <div>
      <div className="mb-2 text-2xs font-medium uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="space-y-2">
        {reservations.map((r) => (
          <ReservationBreakdownCard
            key={r.id}
            reservation={r}
            onEdit={onEdit}
            onCancelled={onCancelled}
          />
        ))}
      </div>
    </div>
  );
}

function ReservationBreakdownCard({
  reservation,
  onEdit,
  onCancelled,
}: {
  reservation: Reservation;
  onEdit: (r: Reservation) => void;
  onCancelled: () => void;
}) {
  const store = useExpenseStore();
  const cancel = useServerFn(cancelReservation);
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const nights = nightsBetween(reservation.startDate, reservation.endDate);
  const breakdown = computePriceBreakdown({
    adults: reservation.adults,
    nights,
    privatized: reservation.privatized,
    electricityAmount: reservation.electricityAmount,
  });
  const paymentStatus = getPaymentStatus(reservation);
  // Modifiable et annulable uniquement si le séjour n'est pas encore passé et non payé.
  // Après le séjour, seul l'admin peut annuler (depuis l'espace admin).
  const today = new Date().toISOString().slice(0, 10);
  const isPast = reservation.endDate < today;
  const canEdit = !reservation.paid && !isPast;

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
    <>
    <ListCard
      as="div"
      icon={<CalendarDays className="h-4.5 w-4.5" />}
      title={fmtRange(reservation.startDate, reservation.endDate)}
      badge={
        <span
          className={`rounded-full px-2.5 py-1 text-2xs font-bold uppercase tracking-wide ${PAYMENT_BADGE_STYLE[paymentStatus.status]}`}
        >
          {paymentStatus.label}
        </span>
      }
      meta1={
        <>
          <Users className="h-3 w-3 shrink-0" />
          <span>{reservation.adults + reservation.children} pers</span>
          {reservation.privatized && (
            <span className="font-semibold text-foreground">· Privatisé</span>
          )}
        </>
      }
      meta2={
        canEdit ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(reservation)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition"
              aria-label="Modifier la réservation"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={cancelling}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive transition disabled:opacity-40"
              aria-label="Annuler la réservation"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : undefined
      }
      chevron={false}
    >
      <div className="border-t border-border/60 px-3.5 py-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{breakdown.nuiteesDetail}</span>
          <span className="font-semibold tabular-nums">{fmtEur(breakdown.nuiteesAmount)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Électricité</span>
          <span className="font-semibold tabular-nums">
            {reservation.electricityAmount === null ? (
              <span className="italic text-muted-foreground">en attente du trésorier</span>
            ) : (
              fmtEur(reservation.electricityAmount)
            )}
          </span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 text-sm font-bold">
          <span>Total</span>
          <span className="tabular-nums">{fmtEur(breakdown.total)}</span>
        </div>
      </div>
    </ListCard>
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
    </>
  );
}

function EditReservationSheet({
  reservation,
  existing,
  onOpenChange,
  onSaved,
}: {
  reservation: Reservation | null;
  existing: Reservation[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const store = useExpenseStore();
  const update = useServerFn(updateReservation);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [privatized, setPrivatized] = useState(false);
  const [mood, setMood] = useState("");
  const [saving, setSaving] = useState(false);

  // Repart des valeurs de la réservation à chaque ouverture.
  useEffect(() => {
    if (!reservation) return;
    setStartDate(reservation.startDate);
    setEndDate(reservation.endDate);
    setAdults(reservation.adults);
    setChildren(reservation.children);
    setPrivatized(reservation.privatized);
    setMood(reservation.mood);
  }, [reservation]);

  const nights = startDate && endDate ? nightsBetween(startDate, endDate) : 0;
  const breakdown =
    nights > 0
      ? computePriceBreakdown({ adults, nights, privatized, electricityAmount: null })
      : null;

  const overlapping = useMemo(() => {
    if (!reservation || !startDate || !endDate || nights <= 0) return [];
    return existing.filter(
      (r) =>
        r.id !== reservation.id &&
        r.status === "confirmed" &&
        startDate < r.endDate &&
        endDate > r.startDate,
    );
  }, [existing, reservation, startDate, endDate, nights]);

  const blockingOverlap = overlapping.find((r) => r.type === "personal" && r.privatized);
  const externalOverlap = overlapping.find((r) => r.type === "airbnb" || r.type === "chantier");
  const willBlockBecausePrivatizing = privatized && overlapping.length > 0 && !blockingOverlap;

  async function handleSubmit() {
    if (!reservation) return;
    if (!startDate || !endDate) {
      toast.error("Choisis une date d'arrivée et de départ.");
      return;
    }
    setSaving(true);
    try {
      const res = await update({
        data: {
          spreadsheetId: store.spreadsheetId,
          id: reservation.id,
          startDate,
          endDate,
          adults,
          children,
          privatized,
          mood,
        },
      });
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      toast.success("Réservation modifiée.");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("La modification a échoué. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!reservation} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[100dvh] flex-col rounded-t-3xl px-5 pb-0 pt-6">
        <SheetHeader className="shrink-0 mb-4">
          <SheetTitle className="text-2xl font-bold tracking-tight">
            Modifier la réservation
          </SheetTitle>
          <SheetDescription className="text-xs">
            Change tes dates ou tes détails, on recalcule.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-5 pb-6">
            <FormSection step={1} title="Quand">
              <DateRangeField
                startDate={startDate}
                endDate={endDate}
                onStartChange={setStartDate}
                onEndChange={setEndDate}
              />

              {blockingOverlap && (
                <p className="mt-2 rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                  Ces dates chevauchent une privatisation. Choisis d'autres dates.
                </p>
              )}
              {willBlockBecausePrivatizing && (
                <p className="mt-2 rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                  D'autres réservations existent déjà sur ces dates. Impossible de privatiser.
                </p>
              )}
              {!blockingOverlap && externalOverlap && (
                <p className="mt-2 rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs font-bold text-destructive">
                  ⚠️ Ces dates chevauchent{" "}
                  {externalOverlap.type === "airbnb" ? "une location Airbnb" : "un chantier"}. Vérifie
                  avant de confirmer.
                </p>
              )}
            </FormSection>

            <FormSection step={2} title="Détails du séjour">
              <div className="space-y-3">
                <ReservationField label="Adultes (16 ans et +)">
                  <NumberStepper value={adults} onChange={setAdults} min={0} />
                </ReservationField>
                <ReservationField label="Enfants (- 16 ans)">
                  <NumberStepper value={children} onChange={setChildren} min={0} />
                </ReservationField>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">Privatisation complète</div>
                  <div className="text-xs text-muted-foreground">
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
                    onChange={(e) => setMood(e.target.value)}
                    placeholder="Ex : anniversaire de Paul, chill en famille…"
                    className="input-field"
                  />
                </ReservationField>
              </div>
            </FormSection>

            {breakdown && (
              <div className="rounded-2xl bg-secondary/50 p-4">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{breakdown.nuiteesDetail}</span>
                  <span className="font-semibold tabular-nums">
                    {fmtEur(breakdown.nuiteesAmount)}
                  </span>
                </div>
                <p className="mt-1.5 text-2xs text-muted-foreground">
                  L'électricité s'ajoutera après le séjour, saisie par le trésorier.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 pb-4 pt-2">
          <button
            onClick={handleSubmit}
            disabled={saving || !!blockingOverlap || willBlockBecausePrivatizing}
            className="tap lift w-full rounded-2xl bg-brand-secondary px-4 py-4 text-sm font-bold text-brand-secondary-foreground disabled:opacity-50 shadow-card"
          >
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
