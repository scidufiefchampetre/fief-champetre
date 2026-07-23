import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Baby,
  ChefHat,
  ClipboardCheck,
  HardHat,
  ShoppingCart,
  Users,
} from "lucide-react";

import { AppHeader } from "@/core/components/app-header";
import { PageShell } from "@/components/ui/page-shell";
import { useExpenseStore } from "@/core/store/expense-store";
import { listChantiers } from "@/lib/chantier.functions";
import { isChildType, listChantierRegistrations } from "@/lib/chantier-registrations.functions";
import {
  DUTY_ROLE_LABEL,
  DUTY_SLOT_LABEL,
  listChantierDuties,
  type DutyRole,
} from "@/lib/chantier-duties.functions";

export const Route = createFileRoute("/mes-chantiers")({
  component: MesChantiersPage,
  head: () => ({ meta: [{ title: "Mes chantiers · Fief Champêtre" }] }),
});

function fmtDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function dateRange(startDate: string, endDate: string) {
  return `${fmtDate(startDate)} → ${fmtDate(endDate)}`;
}

function dutyIcon(role: DutyRole) {
  return role === "courses" ? ShoppingCart : role === "cuisine" ? ChefHat : Baby;
}

function MesChantiersPage() {
  const store = useExpenseStore();
  const [hydrated, setHydrated] = useState(false);
  const listChantiersFn = useServerFn(listChantiers);
  const listRegistrations = useServerFn(listChantierRegistrations);
  const listDuties = useServerFn(listChantierDuties);

  useEffect(() => {
    useExpenseStore.getState().hydrateMember();
    setHydrated(true);
  }, []);

  const { timeMin, timeMax } = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setMonth(min.getMonth() - 1);
    const max = new Date(now);
    max.setFullYear(max.getFullYear() + 2);
    return { timeMin: min.toISOString(), timeMax: max.toISOString() };
  }, []);

  const chantiersQuery = useQuery({
    queryKey: ["my-chantiers-list", timeMin, timeMax],
    queryFn: () => listChantiersFn({ data: { timeMin, timeMax } }),
    enabled: hydrated && !!store.member,
  });
  const today = new Date().toISOString().slice(0, 10);
  const candidates = (chantiersQuery.data?.chantiers ?? [])
    .filter((chantier) => !chantier.cancelledAt && chantier.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const registrationQueries = useQueries({
    queries: candidates.map((chantier) => ({
      queryKey: ["my-chantiers-registrations", chantier.id, chantier.startDate],
      queryFn: () =>
        listRegistrations({ data: { chantierId: chantier.id, startDate: chantier.startDate } }),
      enabled: hydrated && !!store.member,
    })),
  });
  const firstName = store.member?.firstName ?? "";
  const mine = candidates.flatMap((chantier, index) => {
    const groups = registrationQueries[index]?.data?.groups ?? [];
    const group = groups.find((candidate) =>
      candidate.members.some(
        (person) => person.registeredBy === firstName || person.personName === firstName,
      ),
    );
    return group ? [{ chantier, group }] : [];
  });
  const dutyQueries = useQueries({
    queries: mine.map(({ chantier }) => ({
      queryKey: ["my-chantiers-duties", chantier.id, chantier.startDate],
      queryFn: () =>
        listDuties({ data: { chantierId: chantier.id, startDate: chantier.startDate } }),
      enabled: hydrated && !!store.member,
    })),
  });
  const loading =
    !hydrated || chantiersQuery.isLoading || registrationQueries.some((query) => query.isLoading);

  return (
    <PageShell>
      <AppHeader variant="back" />
      <div className="animate-rise">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-secondary/15 text-brand-secondary">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <h1 className="page-title mt-3">Mes chantiers</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Tes inscriptions, les personnes avec toi et ton intendance.
        </p>

        {!store.member && hydrated && (
          <div className="mt-5 rounded-2xl bg-secondary/50 p-5 text-sm text-muted-foreground">
            Identifie-toi depuis l’accueil pour retrouver tes chantiers.
          </div>
        )}
        {loading && store.member && (
          <div className="mt-5 space-y-2 animate-pulse">
            <div className="h-36 rounded-2xl bg-secondary" />
            <div className="h-36 rounded-2xl bg-secondary/60" />
          </div>
        )}
        {!loading && store.member && mine.length === 0 && (
          <div className="mt-5 rounded-2xl border border-border bg-card p-5">
            <div className="text-sm font-bold">Aucun chantier à venir</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tu n’es inscrit à aucun chantier pour le moment.
            </p>
            <Link
              to="/chantiers"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-brand-secondary"
            >
              Voir les prochains chantiers <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {mine.map(({ chantier, group }, index) => {
            const people = group.members.filter((person) => !person.cancelledAt);
            const adults = people.filter((person) => !isChildType(person.personType)).length;
            const children = people.length - adults;
            const duties = (dutyQueries[index]?.data?.duties ?? [])
              .filter((duty) => duty.personName === firstName)
              .sort((a, b) => `${a.date}-${a.slot}`.localeCompare(`${b.date}-${b.slot}`));
            return (
              <Link
                key={chantier.id}
                to="/chantier/$id"
                params={{ id: chantier.id }}
                search={{
                  startDate: chantier.startDate,
                  demo: false,
                  signupDemo: false,
                  focus: undefined,
                }}
                className="group block overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-brand-secondary/35 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-secondary/15 text-brand-secondary">
                    <HardHat className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      {chantier.startDate <= today ? "En cours" : "À venir"}
                    </div>
                    <div className="mt-0.5 text-sm font-black capitalize">
                      {dateRange(chantier.startDate, chantier.endDate)}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="border-t border-border/70 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[10px] font-bold">
                      <Users className="h-3.5 w-3.5 text-brand-secondary" />
                      {people.length} personne{people.length > 1 ? "s" : ""}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {adults} adulte{adults > 1 ? "s" : ""}
                      {children ? ` · ${children} enfant${children > 1 ? "s" : ""}` : ""}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {people.map((person) => (
                      <span
                        key={person.id}
                        className="rounded-full bg-secondary px-2 py-1 text-[9px] font-semibold"
                      >
                        {person.personName}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border/70 px-4 py-3">
                  <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
                    Ton intendance
                  </div>
                  {duties.length ? (
                    <div className="mt-2 space-y-1.5">
                      {duties.map((duty) => {
                        const DutyIcon = dutyIcon(duty.role);
                        return (
                          <div key={duty.id} className="flex items-center gap-2 text-[10px]">
                            <DutyIcon className="h-3.5 w-3.5 text-brand-accent" />
                            <span className="font-bold">{DUTY_ROLE_LABEL[duty.role]}</span>
                            <span className="text-muted-foreground">
                              {fmtDate(duty.date)} · {DUTY_SLOT_LABEL[duty.role][duty.slot]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[10px] text-muted-foreground">
                      Aucune mission choisie
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
