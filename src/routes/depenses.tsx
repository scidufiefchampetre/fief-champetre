import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, RefreshCw, UserPlus, LogOut } from "lucide-react";
import { toast } from "sonner";
import { listExpenses, type ExpenseRow } from "@/lib/expenses.functions";
import { listMembers, type Member } from "@/lib/members.functions";
import { AppHeader } from "@/core/components/app-header";
import { PageShell } from "@/components/ui/page-shell";
import { useExpenseStore } from "@/core/store/expense-store";

export const Route = createFileRoute("/depenses")({
  component: DepensesPage,
  head: () => ({
    meta: [
      { title: "Mes dépenses · Fief Champêtre" },
      { name: "description", content: "Tes avances, tes remboursements, tes factures." },
    ],
  }),
});

function fmtEur(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function DepensesPage() {
  const store = useExpenseStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useExpenseStore.getState().hydrateConfig();
    useExpenseStore.getState().hydrateMember();
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <PageShell>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 rounded-lg bg-secondary" />
          <div className="h-32 rounded-2xl bg-secondary" />
          <div className="h-32 rounded-2xl bg-secondary/60" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <AppHeader variant="back" />
      {store.member ? <MyExpenses /> : <IdentifyGate />}
    </PageShell>
  );
}

function IdentifyGate() {
  const store = useExpenseStore();
  const call = useServerFn(listMembers);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    call({ data: { spreadsheetId: store.spreadsheetId } })
      .then((res) => {
        store.setConfig({ spreadsheetId: res.spreadsheetId });
        setMembers(res.members);
      })
      .catch((e) => {
        console.error("listMembers failed", e);
        const msg = e instanceof Error ? e.message : String(e);
        const friendly =
          msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")
            ? "Google Sheets est saturé une minute. Réessaie dans 1 min."
            : "Impossible de charger la liste des membres.";
        toast.error(friendly);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!members) return [];
    const q = query.trim().toLocaleLowerCase("fr-FR");
    if (!q) return members;
    return members.filter((m) =>
      `${m.firstName} ${m.lastName}`.toLocaleLowerCase("fr-FR").includes(q),
    );
  }, [members, query]);

  return (
    <section className="animate-rise">
      <h1 className="page-title">Qui es-tu&nbsp;?</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Identifie-toi pour voir <span className="font-semibold text-foreground">tes</span> dépenses
        et tes remboursements.
      </p>

      <div className="mt-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher ton prénom…"
          className="input-field"
        />
      </div>

      <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1 no-scrollbar">
        {loading && (
          <div className="animate-pulse space-y-2">
            <div className="h-12 rounded-2xl bg-secondary" />
            <div className="h-12 rounded-2xl bg-secondary/60" />
            <div className="h-12 rounded-2xl bg-secondary/40" />
          </div>
        )}
        {!loading && members && members.length === 0 && (
          <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
            Aucun membre pour l'instant.
          </div>
        )}
        {!loading && filtered.length === 0 && members && members.length > 0 && (
          <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
            Aucun nom ne correspond.
          </div>
        )}
        {filtered.map((m, i) => (
          <button
            key={`${m.firstName}-${m.lastName}-${i}`}
            onClick={() => {
              store.setMember(m);
              toast.success(`Salut ${m.firstName}.`);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition hover:bg-secondary active:scale-[0.99]"
          >
            <div className="text-base font-medium">
              <span>{m.firstName}</span> <span className="text-muted-foreground">{m.lastName}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
          </button>
        ))}
      </div>

      <Link
        to="/"
        className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-brand-accent p-5 text-brand-accent-foreground shadow-card transition active:scale-[0.99]"
      >
        <div>
          <div className="text-[10px] font-medium uppercase tracking-widest opacity-70">
            Nouveau
          </div>
          <div className="text-base font-bold mt-0.5">Créer ma fiche</div>
        </div>
        <UserPlus className="h-5 w-5" strokeWidth={2} />
      </Link>
    </section>
  );
}

function MyExpenses() {
  const store = useExpenseStore();
  const call = useServerFn(listExpenses);

  const query = useQuery({
    queryKey: ["expenses", store.spreadsheetId],
    queryFn: () => call({ data: { spreadsheetId: store.spreadsheetId } }),
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const currentName = store.member ? `${store.member.firstName} ${store.member.lastName}` : "";
  const currentNameNorm = currentName.toLocaleLowerCase("fr-FR").trim();

  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");

  const mine = useMemo(() => {
    return rows.filter((r) => {
      const depositor = (r.depositor || "").toLocaleLowerCase("fr-FR").trim();
      const memberName = (r.memberName || "").toLocaleLowerCase("fr-FR").trim();
      return depositor === currentNameNorm || memberName === currentNameNorm;
    });
  }, [rows, currentNameNorm]);

  const filtered = useMemo(() => {
    return mine.filter((r) => {
      if (filter === "pending" && r.reimbursementStatus === "Remboursé") return false;
      if (filter === "done" && r.reimbursementStatus !== "Remboursé") return false;
      return true;
    });
  }, [mine, filter]);

  const totals = useMemo(() => {
    const norm = (s: string) => s.toLocaleLowerCase("fr-FR").trim();
    const advanced = mine.filter((r) => {
      const p = norm(r.paidBy);
      if (!p) return false;
      if (p === "asso" || p === "association" || p === "sci") return false;
      return p === currentNameNorm;
    });
    const bySide = (side: "SCI" | "Association") => {
      const rows = advanced.filter((r) => r.finalSide === side);
      const pending = rows
        .filter((r) => r.reimbursementStatus !== "Remboursé")
        .reduce((s, r) => s + r.amountTTC, 0);
      const done = rows
        .filter((r) => r.reimbursementStatus === "Remboursé")
        .reduce((s, r) => s + r.amountTTC, 0);
      const total = pending + done;
      return { pending, done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
    };
    const sci = bySide("SCI");
    const asso = bySide("Association");
    return {
      sci,
      asso,
      pending: sci.pending + asso.pending,
      done: sci.done + asso.done,
      total: sci.total + asso.total,
    };
  }, [mine, currentNameNorm]);

  return (
    <div className="animate-rise">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between sm:items-center">
        <div className="min-w-0">
          <h1 className="page-title">Mes dépenses.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {store.member?.firstName} {store.member?.lastName}
          </p>
        </div>
        <button
          onClick={() => query.refetch()}
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition"
        >
          <RefreshCw className={`h-3 w-3 ${query.isFetching ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <SideTotalCard label="SCI" totals={totals.sci} tone="sci" />
        <SideTotalCard label="Asso" totals={totals.asso} tone="asso" />
      </div>

      <div className="mt-5 flex gap-1.5">
        {(["all", "pending", "done"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`flex-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
              filter === k
                ? "bg-foreground text-background border-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "all" ? "Toutes" : k === "pending" ? "À rembourser" : "Remboursées"}
          </button>
        ))}
      </div>

      <div className="mt-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {filtered.length} dépense{filtered.length > 1 ? "s" : ""} pour {store.member?.firstName}
      </div>

      <div className="mt-2 space-y-2">
        {query.isLoading && (
          <div className="animate-pulse space-y-2">
            <div className="h-16 rounded-2xl bg-secondary" />
            <div className="h-16 rounded-2xl bg-secondary/60" />
            <div className="h-16 rounded-2xl bg-secondary/40" />
          </div>
        )}
        {query.isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Impossible de charger les dépenses.
          </div>
        )}
        {!query.isLoading && filtered.length === 0 && (
          <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
            Rien à afficher.
          </div>
        )}
        {filtered.map((r, i) => (
          <ExpenseListItem key={i} row={r} />
        ))}
      </div>
    </div>
  );
}

const SIDE_TONE_CLASSES: Record<"sci" | "asso", string> = {
  sci: "bg-brand-secondary text-brand-secondary-foreground",
  asso: "bg-brand-accent text-brand-accent-foreground",
};

function SideTotalCard({
  label,
  totals,
  tone,
}: {
  label: string;
  totals: { pending: number; done: number; total: number; percent: number };
  tone: "sci" | "asso";
}) {
  return (
    <div
      className={`rounded-3xl p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg ${SIDE_TONE_CLASSES[tone]}`}
    >
      <div className="text-[10px] font-medium uppercase tracking-widest opacity-70">{label}</div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-current/20">
        <div
          className="h-full rounded-full bg-current transition-all duration-500"
          style={{ width: `${totals.percent}%` }}
        />
      </div>
      <div className="mt-3">
        <div className="text-[9px] font-medium uppercase tracking-widest opacity-70">
          À rembourser
        </div>
        <div className="text-xl font-bold tracking-tight tabular-nums">
          {fmtEur(totals.pending)}
        </div>
      </div>
      <div className="mt-1.5 text-[10px] font-semibold opacity-80">
        {totals.total > 0 ? `${fmtEur(totals.done)} déjà remboursé` : "Aucune avance"}
      </div>
    </div>
  );
}

function ExpenseListItem({ row }: { row: ExpenseRow }) {
  const sideLabel = row.finalSide === "Association" ? "Asso" : "SCI";
  const isAdvance = row.paidBy === "Membre";
  const done = row.reimbursementStatus === "Remboursé";

  return (
    <div className="tap lift rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight truncate">{row.supplier || "…"}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtDate(row.invoiceDate)}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-bold tracking-tight">{fmtEur(row.amountTTC)}</div>
          <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground mt-0.5">
            {sideLabel}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            !isAdvance
              ? "bg-secondary text-muted-foreground"
              : done
                ? "bg-success text-success-foreground"
                : "bg-secondary text-foreground border border-border"
          }`}
        >
          {!isAdvance ? "Payé directement" : done ? "Remboursé" : "À rembourser"}
        </span>
        {row.fileLink && (
          <a
            href={row.fileLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition"
          >
            Facture <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
