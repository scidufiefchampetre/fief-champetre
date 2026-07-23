import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { AppHeader } from "@/core/components/app-header";
import { PageShell } from "@/components/ui/page-shell";
import { SectionLabel } from "@/components/ui/section-label";
import { StatBadge } from "@/components/ui/stat-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ChantierListCard } from "@/features/chantiers/components/chantier-list-card";
import { listChantiers } from "@/lib/chantier.functions";
import type { Chantier } from "@/lib/chantier-types";

export const Route = createFileRoute("/chantiers")({
  component: ChantiersPage,
  head: () => ({
    meta: [
      { title: "Chantiers · Fief Champêtre" },
      { name: "description", content: "S'inscrire à un chantier." },
    ],
  }),
});

// Année associative : de septembre (inclus) à août (inclus), pas l'année civile.
function assoYearLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const y = d.getFullYear();
  const start = d.getMonth() >= 8 ? y : y - 1; // getMonth() 8 = septembre
  return `${start} – ${start + 1}`;
}

function groupByAssoYear(chantiers: Chantier[]) {
  const groups: { label: string; items: Chantier[] }[] = [];
  for (const chantier of chantiers) {
    const label = assoYearLabel(chantier.startDate);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(chantier);
    else groups.push({ label, items: [chantier] });
  }
  return groups;
}

function ChantiersPage() {
  const list = useServerFn(listChantiers);

  const { timeMin, timeMax } = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setFullYear(min.getFullYear() - 2);
    const max = new Date(now);
    max.setFullYear(max.getFullYear() + 2);
    return { timeMin: min.toISOString(), timeMax: max.toISOString() };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["chantiers-public", timeMin, timeMax],
    queryFn: () => list({ data: { timeMin, timeMax } }),
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const chantiers = (data?.chantiers ?? []).filter((c) => !c.cancelledAt);
  const upcomingChantiers = chantiers
    .filter((c) => c.endDate >= todayIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const pastChantiers = chantiers
    .filter((c) => c.endDate < todayIso)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <PageShell>
      <AppHeader variant="back" backTo="/" />

      <div className="animate-rise">
        <h1 className="page-title">Chantiers.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choisis le prochain chantier ou retrouve le récapitulatif des précédents.
        </p>

        <div className="mt-6">
          {isLoading && (
            <div className="space-y-2 animate-pulse">
              <div className="h-6 w-32 rounded bg-secondary" />
              <div className="h-24 rounded-2xl bg-secondary/60" />
              <div className="h-24 rounded-2xl bg-secondary/40" />
            </div>
          )}
          {!isLoading && (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <SectionLabel color="brand">À venir</SectionLabel>
                    <h2 className="section-title">Prochains chantiers</h2>
                  </div>
                  <StatBadge count={upcomingChantiers.length} variant="brand" />
                </div>
                <div className="space-y-2">
                  {upcomingChantiers.length ? (
                    upcomingChantiers.map((chantier) => (
                      <ChantierListCard key={chantier.id} chantier={chantier} />
                    ))
                  ) : (
                    <EmptyState>Aucun chantier à venir pour l’instant.</EmptyState>
                  )}
                </div>
              </section>

              <section className="mt-8 border-t border-border pt-5">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <SectionLabel>Archives</SectionLabel>
                    <h2 className="section-title">Anciens chantiers</h2>
                  </div>
                  <StatBadge count={pastChantiers.length} />
                </div>
                <p className="mb-3 text-[10px] text-muted-foreground">
                  Consultation uniquement · aucune modification possible.
                </p>
                <div className="space-y-5">
                  {pastChantiers.length ? (
                    groupByAssoYear(pastChantiers).map((group) => (
                      <div key={group.label}>
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                          {group.label}
                        </div>
                        <div className="space-y-2">
                          {group.items.map((chantier) => (
                            <ChantierListCard key={chantier.id} chantier={chantier} past />
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState>Aucun ancien chantier disponible.</EmptyState>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
