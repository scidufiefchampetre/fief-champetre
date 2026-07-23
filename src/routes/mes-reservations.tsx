import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Users, Pencil, X } from "lucide-react";
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
            <p className="mt-2 text-xs text-muted-foreground">
              Le montant électricité et le statut payé sont mis à jour par le trésorier, ça se
              rafraîchit ici tout seul.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>

        {due.length > 0 && (
          <div className="mt-5 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-brand-accent">
              À régler
            </div>
            <div className="mt-1 text-3xl font-black tracking-tight text-brand-accent">
              {fmtEur(totalDu)}
            </div>
            <div className="mt-0.5 text-[11px] text-brand-accent/80">
              sur {due.length} séjour{due.length > 1 ? "s" : ""}
            </div>
          </div>
        )}
        {due.length === 0 && mine.length > 0 && (
          <div className="mt-5 rounded-2xl bg-success/20 border border-success/30 p-4 text-[13px] font-semibold text-success-foreground">
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
      <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
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
  // Modifiable et annulable tant que ce n'est pas payé — la date du séjour
  // (passé ou à venir) n'entre pas en compte, seul le paiement ferme la porte.
  const canEdit = !reservation.paid;

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
    <div className="rounded-2xl border border-border bg-card overflow-hidden transition hover:border-foreground/20">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div>
          <div className="text-[13px] font-bold">
            {fmtRange(reservation.startDate, reservation.endDate)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" /> {reservation.adults + reservation.children} pers
            {reservation.privatized && (
              <span className="font-semibold text-foreground">· Privatisé</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${PAYMENT_BADGE_STYLE[paymentStatus.status]}`}
          >
            {paymentStatus.label}
          </span>
          {canEdit && (
            <>
              <button
                onClick={() => onEdit(reservation)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                aria-label="Modifier la réservation"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={cancelling}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive transition disabled:opacity-40"
                aria-label="Annuler la réservation"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-[12px]">
          <span className="text-muted-foreground">{breakdown.nuiteesDetail}</span>
          <span className="font-semibold tabular-nums">{fmtEur(breakdown.nuiteesAmount)}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-muted-foreground">Électricité</span>
          <span className="font-semibold tabular-nums">
            {reservation.electricityAmount === null ? (
              <span className="italic text-muted-foreground">en attente du trésorier</span>
            ) : (
              fmtEur(reservation.electricityAmount)
            )}
          </span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 text-[13px] font-bold">
          <span>Total</span>
          <span className="tabular-nums">{fmtEur(breakdown.total)}</span>
        </div>
      </div>
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
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold tracking-tight">
            Modifier la réservation
          </SheetTitle>
          <SheetDescription className="text-xs">
            Change tes dates ou tes détails, on recalcule.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 px-1 pb-6">
          <FormSection step={1} title="Quand">
            <div className="grid grid-cols-2 gap-3">
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

            {blockingOverlap && (
              <p className="mt-2 rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2 text-[11px] text-destructive">
                Ces dates chevauchent une privatisation. Choisis d'autres dates.
              </p>
            )}
            {willBlockBecausePrivatizing && (
              <p className="mt-2 rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2 text-[11px] text-destructive">
                D'autres réservations existent déjà sur ces dates. Impossible de privatiser.
              </p>
            )}
            {!blockingOverlap && externalOverlap && (
              <p className="mt-2 rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2 text-[11px] font-bold text-destructive">
                ⚠️ Ces dates chevauchent{" "}
                {externalOverlap.type === "airbnb" ? "une location Airbnb" : "un chantier"}. Vérifie
                avant de confirmer.
              </p>
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

            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Privatisation complète</div>
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
                  onChange={(e) => setMood(e.target.value)}
                  placeholder="Ex : anniversaire de Paul, chill en famille…"
                  className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </ReservationField>
            </div>
          </FormSection>

          {breakdown && (
            <div className="rounded-2xl bg-secondary/50 p-4">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">{breakdown.nuiteesDetail}</span>
                <span className="font-semibold tabular-nums">
                  {fmtEur(breakdown.nuiteesAmount)}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                L'électricité s'ajoutera après le séjour, saisie par le trésorier.
              </p>
            </div>
          )}

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
