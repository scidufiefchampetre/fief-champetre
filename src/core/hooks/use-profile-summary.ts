import { useServerFn } from "@tanstack/react-start";
import { useQueries, useQuery } from "@tanstack/react-query";

import { listReservations } from "@/lib/reservations.functions";
import { listExpenses } from "@/lib/expenses.functions";
import { listChantiers } from "@/lib/chantier.functions";
import { listChantierRegistrations } from "@/lib/chantier-registrations.functions";
import { listChantierDuties, type ChantierDuty } from "@/lib/chantier-duties.functions";
import type { Chantier } from "@/lib/chantier-types";
import type { Reservation } from "@/lib/reservation-types";
import { getPaymentStatus } from "@/lib/pricing";
import { useExpenseStore } from "@/core/store/expense-store";

function windowRange() {
  const now = new Date();
  // Une clé de cache doit rester stable entre deux rendus. Sans cette
  // normalisation, les millisecondes changeaient à chaque rendu et React Query
  // relançait indéfiniment la recherche des chantiers.
  now.setHours(0, 0, 0, 0);
  const min = new Date(now);
  min.setMonth(min.getMonth() - 1);
  const max = new Date(now);
  max.setMonth(max.getMonth() + 12);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

export interface ProfileSummary {
  loading: boolean;
  reservationsLoading: boolean;
  reservationsError: boolean;
  expensesLoading: boolean;
  expensesError: boolean;
  chantiersLoading: boolean;
  chantiersError: boolean;
  reservationsUpcomingCount: number;
  reservationsDueCount: number;
  reservationsDueAmount: number;
  expensesPendingCount: number;
  expensesPendingAmount: number;
  nextReservation: Reservation | null;
  nextChantier: Chantier | null;
  nextChantierDuties: ChantierDuty[];
}

/**
 * Petit résumé de l'activité d'un membre (réservations + dépenses), utilisé
 * à la fois dans l'aperçu du menu burger et dans la page "Mon profil"
 * complète — un seul endroit pour ce calcul, pas de logique dupliquée.
 */
export function useProfileSummary(enabled: boolean): ProfileSummary {
  const store = useExpenseStore();
  const listRes = useServerFn(listReservations);
  const listExp = useServerFn(listExpenses);
  const listChantiersFn = useServerFn(listChantiers);
  const listRegistrations = useServerFn(listChantierRegistrations);
  const listDuties = useServerFn(listChantierDuties);
  const { timeMin, timeMax } = windowRange();

  const resQuery = useQuery({
    queryKey: ["profile-summary-reservations", store.spreadsheetId, store.member?.firstName],
    queryFn: () => listRes({ data: { spreadsheetId: store.spreadsheetId, timeMin, timeMax } }),
    enabled: enabled && !!store.member,
  });
  const expQuery = useQuery({
    queryKey: ["profile-summary-expenses", store.spreadsheetId, store.member?.firstName],
    queryFn: () => listExp({ data: { spreadsheetId: store.spreadsheetId } }),
    enabled: enabled && !!store.member,
  });
  const chantiersQuery = useQuery({
    queryKey: ["profile-summary-chantiers", timeMin, timeMax],
    queryFn: () => listChantiersFn({ data: { timeMin, timeMax } }),
    enabled: enabled && !!store.member,
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const myReservations = (resQuery.data?.reservations ?? []).filter(
    (r) =>
      r.type === "personal" && r.status === "confirmed" && r.reservedBy === store.member?.firstName,
  );
  const nextReservation =
    myReservations
      .filter((reservation) => reservation.endDate >= todayIso)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const reservationsUpcomingCount = myReservations.filter((r) => todayIso < r.startDate).length;
  const due = myReservations.filter((r) => getPaymentStatus(r).status === "due");
  const reservationsDueCount = due.length;
  const reservationsDueAmount = due.reduce((s, r) => s + r.totalAmount, 0);

  const currentName = store.member
    ? `${store.member.firstName} ${store.member.lastName}`.toLocaleLowerCase("fr-FR").trim()
    : "";
  const myExpensesAdvanced = (expQuery.data?.rows ?? []).filter((r) => {
    const p = (r.paidBy || "").toLocaleLowerCase("fr-FR").trim();
    if (!p || p === "asso" || p === "association" || p === "sci") return false;
    return p === currentName;
  });
  const pendingExpenses = myExpensesAdvanced.filter((r) => r.reimbursementStatus !== "Remboursé");
  const expensesPendingCount = pendingExpenses.length;
  const expensesPendingAmount = pendingExpenses.reduce((s, r) => s + r.amountTTC, 0);

  const upcomingChantiers = (chantiersQuery.data?.chantiers ?? [])
    .filter((chantier) => !chantier.cancelledAt && chantier.endDate >= todayIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const registrationQueries = useQueries({
    queries: upcomingChantiers.map((chantier) => ({
      queryKey: ["profile-summary-chantier-registrations", chantier.id, chantier.startDate],
      queryFn: () =>
        listRegistrations({ data: { chantierId: chantier.id, startDate: chantier.startDate } }),
      enabled: enabled && !!store.member,
    })),
  });
  const firstName = store.member?.firstName ?? "";
  const nextChantier =
    upcomingChantiers.find((chantier, index) =>
      (registrationQueries[index]?.data?.groups ?? []).some((group) =>
        group.members.some(
          (person) => person.personName === firstName || person.registeredBy === firstName,
        ),
      ),
    ) ?? null;
  const dutiesQuery = useQuery({
    queryKey: ["profile-summary-chantier-duties", nextChantier?.id, nextChantier?.startDate],
    queryFn: () =>
      listDuties({ data: { chantierId: nextChantier!.id, startDate: nextChantier!.startDate } }),
    enabled: enabled && !!nextChantier,
  });
  const nextChantierDuties = (dutiesQuery.data?.duties ?? [])
    .filter((duty) => duty.personName === firstName && duty.date >= todayIso)
    .sort((a, b) => `${a.date}-${a.slot}`.localeCompare(`${b.date}-${b.slot}`));

  return {
    loading:
      resQuery.isLoading ||
      expQuery.isLoading ||
      chantiersQuery.isLoading ||
      registrationQueries.some((query) => query.isLoading),
    reservationsLoading: resQuery.isLoading,
    reservationsError: resQuery.isError,
    expensesLoading: expQuery.isLoading,
    expensesError: expQuery.isError,
    chantiersLoading:
      chantiersQuery.isLoading || registrationQueries.some((query) => query.isLoading),
    chantiersError: chantiersQuery.isError || registrationQueries.some((query) => query.isError),
    reservationsUpcomingCount,
    reservationsDueCount,
    reservationsDueAmount,
    expensesPendingCount,
    expensesPendingAmount,
    nextReservation,
    nextChantier,
    nextChantierDuties,
  };
}
