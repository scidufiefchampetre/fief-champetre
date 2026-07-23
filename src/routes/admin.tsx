import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Hammer,
  Wallet,
  ExternalLink,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
  User,
  Clock,
  CalendarDays,
  Sunrise,
  Sun,
  Sunset,
  Baby,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/core/components/app-header";
import { PageShell } from "@/components/ui/page-shell";
import { SectionLabel } from "@/components/ui/section-label";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskItem, AddTaskButton } from "@/features/chantiers/components/task-item";
import { Field } from "@/core/components/member-gate";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useExpenseStore } from "@/core/store/expense-store";
import { useAdminStore } from "@/core/store/admin-store";
import {
  listReimbursements,
  markReimbursed,
  checkAdminPassword,
  type AdminSpace,
  type PendingReimbursement,
} from "@/lib/admin.functions";
import { deleteExpense } from "@/lib/export-expense.functions";
import {
  createChantier,
  listChantiers,
  updateChantierDates,
  cancelChantier,
  getChantierFiche,
  updateChantierFiche,
  listChantierTasks,
  addChantierTask,
  deleteChantierTask,
  updateChantierTaskExecution,
} from "@/lib/chantier.functions";
import { chantierDisplayName, getTaskPhase, type ChantierPeriod } from "@/lib/chantier-types";
import { TaskFormSheet } from "@/features/chantiers/components/task-form";
import {
  durationLabel,
  parseDurationToMinutes,
  shortDurationLabel,
} from "@/features/chantiers/components/task-execution-form";
import {
  listChantierReports,
  markReportPlanned,
  REPORT_CATEGORY_LABEL,
  REPORT_URGENCY_LABEL,
  type ChantierReport,
} from "@/lib/chantier-reports.functions";
import { ReportForm } from "@/features/chantiers/components/report-form";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Espace admin · Fief Champêtre" },
      { name: "description", content: "Remboursements et chantiers, pour les admins SCI et Asso." },
    ],
  }),
});

function fmtEur(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function PeriodIcon({ period }: { period: Exclude<ChantierPeriod, ""> }) {
  if (period === "matin") return <Sunrise className="h-3 w-3 shrink-0" />;
  if (period === "soir") return <Sunset className="h-3 w-3 shrink-0" />;
  return <Sun className="h-3 w-3 shrink-0" />;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const SPACE_LABEL: Record<AdminSpace, string> = { SCI: "SCI", Association: "Asso" };
const PERIOD_LABEL: Record<ChantierPeriod, string> = {
  "": "Journée",
  matin: "Matin",
  apres_midi: "Après-midi",
  soir: "Soir",
};

// Style de libellé partagé par tous les champs du formulaire chantier —
// garder identique à celui utilisé par <Field> pour que les rangées
// date/période s'alignent pixel pour pixel.
const FORM_LABEL_CLASS = "mb-1.5 block text-[11px] font-medium text-muted-foreground";
const FORM_CONTROL_CLASS =
  "h-8 w-full rounded-xl border border-border bg-card outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className={FORM_LABEL_CLASS}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FORM_CONTROL_CLASS} px-3 text-sm`}
      />
    </label>
  );
}

function PeriodChips({
  value,
  onChange,
}: {
  value: Exclude<ChantierPeriod, "">;
  onChange: (value: Exclude<ChantierPeriod, "">) => void;
}) {
  const options: Exclude<ChantierPeriod, "">[] = ["matin", "apres_midi", "soir"];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={`h-8 w-full min-w-0 overflow-hidden rounded-xl border px-0.5 text-center text-[clamp(7.5px,2vw,10.5px)] font-semibold tracking-tight leading-none whitespace-nowrap outline-none transition ${
            value === opt
              ? "border-brand-secondary bg-brand-secondary text-white"
              : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
          }`}
        >
          {PERIOD_LABEL[opt]}
        </button>
      ))}
    </div>
  );
}

function PeriodSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ChantierPeriod;
  onChange: (value: ChantierPeriod) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ChantierPeriod)}
        className="h-10 w-full rounded-xl border border-border bg-card px-3 text-[12px] outline-none focus:border-ring"
      >
        {Object.entries(PERIOD_LABEL).map(([key, option]) => (
          <option key={key} value={key}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

const ADMIN_RETURN_KEY = "admin-return-v1";

interface AdminReturnState {
  space?: AdminSpace;
  openSection?: string;
  chantierId?: string;
}

function readAndClearAdminReturn(): AdminReturnState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ADMIN_RETURN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ADMIN_RETURN_KEY);
    return JSON.parse(raw) as AdminReturnState;
  } catch {
    return null;
  }
}

function setAdminReturn(state: AdminReturnState) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMIN_RETURN_KEY, JSON.stringify(state));
}

function AdminPage() {
  const [adminReturn] = useState(readAndClearAdminReturn);
  const [space, setSpace] = useState<AdminSpace | null>(() => adminReturn?.space ?? null);
  const passwords = useAdminStore((s) => s.passwords);
  const hydrate = useAdminStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const password = space ? passwords[space] : undefined;

  return (
    <PageShell>
      <AppHeader variant="back" backTo={space ? "/admin" : "/"} />

      {!space && (
        <div className="animate-rise">
          <h1 className="page-title">Espace admin.</h1>
          <p className="mt-2 text-xs text-muted-foreground">Choisis l'espace que tu veux gérer.</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => setSpace("SCI")}
              className="tap lift flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15">
                  <Wallet className="h-5 w-5 text-brand-secondary" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Admin
                  </div>
                  <div className="text-xl font-bold mt-0.5">SCI</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => setSpace("Association")}
              className="tap lift flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15">
                  <Hammer className="h-5 w-5 text-brand-secondary" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Admin
                  </div>
                  <div className="text-xl font-bold mt-0.5">Asso</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {space && !password && (
        <AdminPasswordGate
          space={space}
          onUnlocked={(pwd) => useAdminStore.getState().unlock(space, pwd)}
          onBack={() => setSpace(null)}
        />
      )}

      {space && password && (
        <AdminSpacePanel
          space={space}
          password={password}
          onBack={() => setSpace(null)}
          initialOpenSection={adminReturn?.openSection}
          initialChantierId={adminReturn?.chantierId}
        />
      )}
    </PageShell>
  );
}

function AccordionHeader({
  icon: Icon,
  label,
  open,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="tap mt-6 flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-left first:mt-0"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-secondary text-brand-secondary-foreground">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </span>
      <ChevronDown
        className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

function AdminPasswordGate({
  space,
  onUnlocked,
  onBack,
}: {
  space: AdminSpace;
  onUnlocked: (password: string) => void;
  onBack: () => void;
}) {
  const check = useServerFn(checkAdminPassword);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const isMock = import.meta.env["VITE_USE_MOCK_DATA"] === "true";

  // En mode démo, on déverrouille immédiatement sans mot de passe
  useState(() => {
    if (isMock) onUnlocked("__admin_open__");
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const { ok } = await check({ data: { space, password: value } });
      if (ok) {
        onUnlocked(value);
      } else {
        setError("Mot de passe incorrect.");
      }
    } catch {
      setError("Impossible de vérifier le mot de passe, réessaie.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="animate-rise">
      <button
        onClick={onBack}
        className="tap flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        Changer d'espace
      </button>
      <h1 className="page-title mt-3">Admin {SPACE_LABEL[space]}.</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Indique le mot de passe de l'espace {SPACE_LABEL[space]} pour continuer.
      </p>
      {import.meta.env["VITE_USE_MOCK_DATA"] === "true" && (
        <div className="mt-4 rounded-xl border border-dashed border-brand-secondary/40 bg-brand-secondary/5 px-3 py-2.5 text-[11px] text-brand-secondary">
          <span className="font-bold">Mode démo</span> : entre n'importe quel mot de passe pour
          continuer.
        </div>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="block">
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Mot de passe
          </div>
          <input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            autoFocus
            autoComplete="current-password"
            className="mt-1.5 w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="tap lift mt-1 flex items-center justify-center rounded-2xl bg-brand-accent px-5 py-3.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {checking ? "Vérification…" : "Entrer"}
        </button>
      </form>
    </div>
  );
}

function AdminSpacePanel({
  space,
  password,
  onBack,
  initialOpenSection,
  initialChantierId,
}: {
  space: AdminSpace;
  password: string;
  onBack: () => void;
  initialOpenSection?: string;
  initialChantierId?: string;
}) {
  const store = useExpenseStore();
  const queryClient = useQueryClient();
  const list = useServerFn(listReimbursements);
  const [showPaid, setShowPaid] = useState(false);
  const [detail, setDetail] = useState<PendingReimbursement | null>(null);
  const [openSection, setOpenSection] = useState<"remb" | "chantiers" | "taches">(
    (initialOpenSection as "remb" | "chantiers" | "taches") ??
      (space === "Association" ? "chantiers" : "remb"),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["reimbursements", space, showPaid],
    queryFn: () =>
      list({
        data: {
          spreadsheetId: store.spreadsheetId,
          side: space,
          status: showPaid ? "all" : "pending",
        },
      }),
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];
  const pendingTotal = items
    .filter((i) => i.reimbursementStatus === "À rembourser")
    .reduce((sum, i) => sum + i.amountTTC, 0);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["reimbursements", space] });
  }

  return (
    <section className="animate-rise">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Admin {SPACE_LABEL[space]}.</h1>
        <button
          onClick={onBack}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Changer d'espace
        </button>
      </div>

      {space === "Association" && (
        <>
          <AccordionHeader
            icon={Hammer}
            label="Chantiers"
            open={openSection === "chantiers"}
            onToggle={() => setOpenSection((s) => (s === "chantiers" ? "remb" : "chantiers"))}
          />
          {openSection === "chantiers" && (
            <ChantiersSection
              password={password}
              showHeader={false}
              initialExpandedId={initialChantierId}
            />
          )}
        </>
      )}

      <AccordionHeader
        icon={Wallet}
        label="Remboursements"
        open={openSection === "remb"}
        onToggle={() => setOpenSection((s) => (s === "remb" ? s : "remb"))}
      />
      {openSection === "remb" && (
        <div className="mt-3">
          <div className="rounded-2xl bg-secondary/50 p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              En attente
            </div>
            <div className="text-2xl font-black tracking-tight tabular-nums mt-0.5">
              {fmtEur(pendingTotal)}
            </div>
          </div>

          <button
            onClick={() => setShowPaid((v) => !v)}
            className="mt-3 self-start text-[11px] font-semibold text-muted-foreground hover:text-foreground transition"
          >
            {showPaid ? "Masquer les réglés" : "Voir aussi les réglés"}
          </button>

          <div className="mt-3 space-y-2">
            {isLoading && (
              <div className="animate-pulse space-y-2">
                <div className="h-16 rounded-2xl bg-secondary" />
                <div className="h-16 rounded-2xl bg-secondary/60" />
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
                Rien en attente pour l'instant.
              </div>
            )}
            {items.map((item) => {
              const paid = item.reimbursementStatus === "Remboursé";
              return (
                <button
                  key={item.id}
                  onClick={() => setDetail(item)}
                  className="tap group flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left hover-device:hover:bg-secondary"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{item.memberName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {item.supplier} · {fmtDate(item.invoiceDate)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold tabular-nums">{fmtEur(item.amountTTC)}</span>
                    {paid ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/60">
                        <Check className="h-3.5 w-3.5 text-success-foreground" strokeWidth={3} />
                      </span>
                    ) : (
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {space === "Association" && (
        <>
          <AccordionHeader
            icon={ClipboardList}
            label="Tâches à faire"
            open={openSection === "taches"}
            onToggle={() => setOpenSection((s) => (s === "taches" ? "chantiers" : "taches"))}
          />
          {openSection === "taches" && (
            <ChantierBacklogSection password={password} showHeader={false} />
          )}
        </>
      )}

      <ReimbursementDetailSheet
        item={detail}
        space={space}
        password={password}
        onOpenChange={(open) => !open && setDetail(null)}
        onPaid={() => { setDetail(null); refresh(); }}
        onDeleted={() => { setDetail(null); refresh(); }}
      />
    </section>
  );
}

function makeBankRef(item: PendingReimbursement): string {
  const supplier = (item.supplier || "").trim().slice(0, 20);
  const d = item.invoiceDate;
  const dateShort = d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 7).replace("-", "/") : d.slice(0, 7);
  return `Remb ${supplier} ${dateShort}`.trim().slice(0, 50);
}

function BankRefCard({ item }: { item: PendingReimbursement }) {
  const [copied, setCopied] = useState(false);
  const ref = makeBankRef(item);

  function copy() {
    void navigator.clipboard.writeText(ref).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        Objet virement
      </div>
      <button
        type="button"
        onClick={copy}
        className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left transition hover:bg-secondary/80 active:scale-[0.99]"
      >
        <span className="text-sm font-semibold font-mono tracking-tight">{ref}</span>
        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
          {copied ? "✓ Copié" : "Copier"}
        </span>
      </button>
      {item.fileLink && (
        <a
          href={item.fileLink}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-accent hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Voir le ticket de caisse
        </a>
      )}
    </div>
  );
}

function ReimbursementDetailSheet({
  item,
  space,
  password,
  onOpenChange,
  onPaid,
  onDeleted,
}: {
  item: PendingReimbursement | null;
  space: AdminSpace;
  password: string;
  onOpenChange: (open: boolean) => void;
  onPaid: () => void;
  onDeleted: () => void;
}) {
  const store = useExpenseStore();
  const mark = useServerFn(markReimbursed);
  const del = useServerFn(deleteExpense);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function confirmPaid() {
    if (!item) return;
    setSubmitting(true);
    try {
      await mark({
        data: { spreadsheetId: store.spreadsheetId, side: space, expenseId: item.id, password },
      });
      toast.success(`${item.memberName} marqué comme remboursé.`);
      onPaid();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la mise à jour.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    setDeleting(true);
    try {
      await del({
        data: { spreadsheetId: store.spreadsheetId, side: space, expenseId: item.id, password },
      });
      toast.success("Facture supprimée.");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la suppression.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const paid = item?.reimbursementStatus === "Remboursé";

  return (
    <Sheet open={!!item} onOpenChange={(o) => { if (!o) setConfirmDelete(false); onOpenChange(o); }}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
        {item && (
          <>
            <SheetHeader>
              <SheetTitle className="text-2xl font-black tracking-tight">
                Fiche de paiement
              </SheetTitle>
              <SheetDescription className="text-xs">Virement à effectuer</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Bénéficiaire
                </div>
                <div className="text-lg font-bold mt-0.5">{item.memberName}</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  IBAN
                </div>
                <div className="text-sm font-mono mt-0.5 break-all">
                  {item.iban || "Non renseigné"}
                </div>
              </div>
              <BankRefCard item={item} />

              <div className="rounded-2xl bg-secondary/50 p-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Montant</span>
                <span className="text-xl font-black tabular-nums">{fmtEur(item.amountTTC)}</span>
              </div>
            </div>

            {paid ? (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-success/15 px-4 py-4 text-sm font-semibold text-success">
                <Check className="h-4 w-4" strokeWidth={2.5} /> Déjà réglé
              </div>
            ) : (
              <button
                onClick={confirmPaid}
                disabled={submitting || deleting}
                className="tap lift mt-6 w-full rounded-2xl bg-brand-accent px-4 py-4 text-sm font-semibold text-brand-accent-foreground disabled:opacity-50 shadow-card"
              >
                {submitting ? "Enregistrement…" : "Marquer comme réglé"}
              </button>
            )}

            <div className="mt-3">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                  className="w-full rounded-2xl border border-destructive/30 py-3 text-[13px] font-semibold text-destructive hover:bg-destructive/5 transition disabled:opacity-50"
                >
                  Supprimer cette facture
                </button>
              ) : (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-[13px] font-semibold text-destructive text-center">
                    Supprimer la facture, le fichier Drive et les données liées ?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-xl border border-border py-2.5 text-[13px] font-semibold text-muted-foreground"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-xl bg-destructive py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      {deleting ? "Suppression…" : "Confirmer"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface DraftTask {
  label: string;
  peopleCount: number;
  durationMinutes: number;
  urgency: ChantierReport["urgency"] | "";
  reportId?: string;
}

function ChantiersSection({
  password,
  showHeader = true,
  initialExpandedId,
}: {
  password: string;
  showHeader?: boolean;
  initialExpandedId?: string;
}) {
  const queryClient = useQueryClient();
  const list = useServerFn(listChantiers);
  const create = useServerFn(createChantier);
  const setFiche = useServerFn(updateChantierFiche);
  const addTask = useServerFn(addChantierTask);
  const listReports = useServerFn(listChantierReports);
  const markPlanned = useServerFn(markReportPlanned);
  const [formOpen, setFormOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startPeriod, setStartPeriod] = useState<Exclude<ChantierPeriod, "">>("soir");
  const [endPeriod, setEndPeriod] = useState<Exclude<ChantierPeriod, "">>("apres_midi");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSubtitle, setDraftSubtitle] = useState("");
  const [draftTasks, setDraftTasks] = useState<DraftTask[]>([]);
  const [taskQuery, setTaskQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId ?? null);
  const [showPast, setShowPast] = useState(false);
  const [createReportOpen, setCreateReportOpen] = useState(false);

  const { data: reportsData } = useQuery({
    queryKey: ["chantier-reports-backlog", password],
    queryFn: () => listReports({ data: { password } }),
    enabled: formOpen,
  });
  const openReports = (reportsData?.reports ?? []).filter((r) => r.status === "ouvert");
  const taskQueryLower = taskQuery.trim().toLowerCase();
  const filteredReports = taskQueryLower
    ? openReports.filter(
        (r) =>
          reportDisplayName(r).toLowerCase().includes(taskQueryLower) ||
          r.description.toLowerCase().includes(taskQueryLower),
      )
    : openReports;

  function toggleDraftReport(r: ChantierReport) {
    setDraftTasks((tasks) => {
      if (tasks.some((t) => t.reportId === r.id)) {
        return tasks.filter((t) => t.reportId !== r.id);
      }
      return [
        ...tasks,
        {
          label: reportDisplayName(r),
          peopleCount: r.personDaysEstimate ?? 0,
          durationMinutes: parseDurationToMinutes(r.timeEstimate),
          urgency: r.urgency,
          reportId: r.id,
        },
      ];
    });
  }

  const { timeMin, timeMax } = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setMonth(min.getMonth() - 3);
    const max = new Date(now);
    max.setMonth(max.getMonth() + 12);
    return { timeMin: min.toISOString(), timeMax: max.toISOString() };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["chantiers-admin", timeMin, timeMax],
    queryFn: () => list({ data: { timeMin, timeMax } }),
  });

  const chantiers = (data?.chantiers ?? []).filter((c) => !c.cancelledAt);

  async function submitCreate() {
    if (!startDate || !endDate) {
      toast.error("Renseigne les deux dates.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await create({ data: { startDate, endDate, startPeriod, endPeriod, password } });
      if (res.ok) {
        const chantierId = res.chantier.id;
        const title = draftTitle.trim();
        const description = draftSubtitle.trim();
        if (title || description) {
          await setFiche({
            data: { chantierId, startDate, title, description, password },
          });
        }
        for (const t of draftTasks) {
          await addTask({
            data: {
              chantierId,
              startDate,
              label: t.label,
              password,
              estimatedDurationMinutes: t.durationMinutes || undefined,
              estimatedPeopleCount: t.peopleCount || undefined,
              urgency: t.urgency || undefined,
            },
          });
          if (t.reportId) {
            await markPlanned({ data: { id: t.reportId, chantierId, password } });
          }
        }
        toast.success("Chantier créé.");
        setFormOpen(false);
        setStartDate("");
        setEndDate("");
        setStartPeriod("soir");
        setEndPeriod("apres_midi");
        setDraftTitle("");
        setDraftSubtitle("");
        setDraftTasks([]);
        setTaskQuery("");
        setExpandedId(chantierId);
        queryClient.invalidateQueries({ queryKey: ["chantiers-admin"] });
        queryClient.invalidateQueries({ queryKey: ["reservations"] });
        queryClient.invalidateQueries({ queryKey: ["chantier-reports-backlog", password] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la création.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`flex flex-col ${showHeader ? "mt-8" : "mt-3"}`}>
      {showHeader && (
        <>
          <div className="flex items-center gap-2">
            <Hammer className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Chantiers
            </h2>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Fiche (consignes) et tâches se gèrent ici. L'effectif n'est jamais estimé, il ne
            provient que des inscriptions réelles.
          </p>
        </>
      )}

      {(() => {
        const todayIso = new Date().toISOString().slice(0, 10);
        const upcoming = chantiers.filter((c) => c.endDate >= todayIso);
        const past = chantiers.filter((c) => c.endDate < todayIso);
        const PIcon = (p: Exclude<ChantierPeriod, "">) => {
          if (p === "matin") return <Sunrise className="h-3 w-3 shrink-0" />;
          if (p === "soir") return <Sunset className="h-3 w-3 shrink-0" />;
          return <Sun className="h-3 w-3 shrink-0" />;
        };
        const renderCard = (c: (typeof chantiers)[number], isPast: boolean) => {
          const monthYear = new Date(`${c.startDate}T00:00:00`)
            .toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
            .replace(/^./, (s) => s.toUpperCase());
          const typeLabel = chantierDisplayName(c.startDate, c.endDate).split(" / ")[0];
          return (
            <div
              key={c.id}
              className={`rounded-xl border overflow-hidden ${isPast ? "border-border/50 bg-secondary/20" : "border-border bg-card"}`}
            >
              <button
                onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                className="flex w-full items-center gap-2 px-4 py-3.5 text-left hover-device:hover:bg-secondary/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`text-[17px] font-black leading-tight tracking-[-0.01em] ${isPast ? "text-muted-foreground" : "text-foreground"}`}
                    >
                      {monthYear}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${isPast ? "bg-secondary text-muted-foreground" : "bg-brand-secondary/15 text-brand-secondary"}`}
                    >
                      {typeLabel}
                    </span>
                    {isPast && (
                      <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                        Terminé
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[11px] text-muted-foreground">
                    {PIcon(c.startPeriod || "matin")}
                    <span className="capitalize">{fmtDate(c.startDate)}</span>
                    <ArrowRight className="h-2 w-2 shrink-0" />
                    {PIcon(c.endPeriod || "apres_midi")}
                    <span className="capitalize">{fmtDate(c.endDate)}</span>
                    <span className="mx-1 text-border">·</span>
                    <User className="h-3 w-3 shrink-0 text-brand-secondary" />
                    <span className="font-semibold text-foreground">{c.adults}</span>
                    {c.children > 0 && (
                      <>
                        <Baby className="h-3 w-3 shrink-0 text-brand-secondary" />
                        <span className="font-semibold text-foreground">{c.children}</span>
                      </>
                    )}
                  </div>
                </div>
                {expandedId === c.id ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {expandedId === c.id && (
                <div className="border-t border-border p-4 space-y-4">
                  <ChantierCardBody
                    chantierId={c.id}
                    startDate={c.startDate}
                    endDate={c.endDate}
                    startPeriod={c.startPeriod}
                    endPeriod={c.endPeriod}
                    password={password}
                    onDeleted={() => setExpandedId(null)}
                  />
                </div>
              )}
            </div>
          );
        };
        return (
          <div className="order-2 mt-3 space-y-2.5">
            {isLoading && (
              <div className="animate-pulse space-y-2">
                <div className="h-20 rounded-2xl bg-secondary" />
                <div className="h-20 rounded-2xl bg-secondary/60" />
              </div>
            )}
            {!isLoading && chantiers.length === 0 && (
              <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
                Aucun chantier prévu.
              </div>
            )}
            {upcoming.map((c) => renderCard(c, false))}
            {past.length > 0 && (
              <>
                <button
                  onClick={() => setShowPast((v) => !v)}
                  className="tap flex w-full items-center gap-1.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 hover:text-muted-foreground"
                >
                  {showPast ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Passés ({past.length})
                </button>
                {showPast && past.map((c) => renderCard(c, true))}
              </>
            )}
          </div>
        );
      })()}

      {!formOpen ? (
        <button
          onClick={() => setFormOpen(true)}
          className="tap order-1 mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition"
        >
          <Plus className="h-4 w-4" /> Nouvelle date de chantier
        </button>
      ) : (
        <div className="order-1 mt-4 rounded-2xl border border-border bg-card p-4 space-y-5">
          <div className="space-y-3">
            <label className="block">
              <span className={FORM_LABEL_CLASS}>Titre du chantier</span>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Le thème ou le gros projet du week-end…"
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>

            <label className="block">
              <span className={FORM_LABEL_CLASS}>Détails du chantier</span>
              <textarea
                value={draftSubtitle}
                onChange={(e) => setDraftSubtitle(e.target.value)}
                placeholder="Détaille le chantier : précisions, matériel à prévoir, organisation…"
                rows={3}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <DateField label="Début" value={startDate} onChange={setStartDate} />
              <div className="mt-1.5">
                <PeriodChips value={startPeriod} onChange={setStartPeriod} />
              </div>
            </div>
            <div>
              <DateField label="Fin" value={endDate} onChange={setEndDate} />
              <div className="mt-1.5">
                <PeriodChips value={endPeriod} onChange={setEndPeriod} />
              </div>
            </div>
          </div>

          <div>
            <span className={FORM_LABEL_CLASS}>Tâches</span>
            <div className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-2">
              <input
                value={taskQuery}
                onChange={(e) => setTaskQuery(e.target.value)}
                placeholder="Chercher une tâche, ou en créer une nouvelle…"
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-ring"
              />

              <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-card">
                {filteredReports.length === 0 && (
                  <div className="px-3 py-2 text-[12px] text-muted-foreground">
                    {openReports.length === 0
                      ? "Aucune tâche ouverte."
                      : "Aucun résultat pour cette recherche."}
                  </div>
                )}
                {filteredReports.map((r) => (
                  <ReportLine
                    key={r.id}
                    report={r}
                    checked={draftTasks.some((t) => t.reportId === r.id)}
                    onToggle={() => toggleDraftReport(r)}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCreateReportOpen(true)}
                className="tap flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Créer une nouvelle tâche
              </button>
            </div>

            {draftTasks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {draftTasks.map((t) => (
                  <button
                    key={t.reportId ?? t.label}
                    type="button"
                    onClick={() =>
                      setDraftTasks((tasks) =>
                        tasks.filter((x) => (x.reportId ?? x.label) !== (t.reportId ?? t.label)),
                      )
                    }
                    className="flex items-center gap-1 rounded-full bg-brand-secondary/15 px-2.5 py-1 text-[11px] font-semibold text-brand-secondary"
                  >
                    {t.label}
                    {t.peopleCount > 0 && (
                      <span className="font-normal text-brand-secondary/70">
                        {" "}
                        · {t.peopleCount} j-h
                      </span>
                    )}{" "}
                    ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <button
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold text-muted-foreground"
            >
              Annuler
            </button>
            <button
              onClick={submitCreate}
              disabled={submitting}
              className="tap lift flex-1 rounded-2xl bg-brand-accent px-4 py-2 text-[12px] font-semibold text-brand-accent-foreground disabled:opacity-50"
            >
              {submitting ? "Envoi vers Google…" : "Valider"}
            </button>
          </div>
        </div>
      )}

      <Sheet open={createReportOpen} onOpenChange={setCreateReportOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-border sm:mx-auto sm:max-w-xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Nouvelle tâche</SheetTitle>
            <SheetDescription>
              Elle rejoindra la liste des tâches à faire, à piocher depuis un chantier.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 pb-2">
            <ReportForm
              identifiedName=""
              onSubmitted={() => {
                setCreateReportOpen(false);
                queryClient.invalidateQueries({ queryKey: ["chantier-reports-backlog", password] });
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ChantierCardBody({
  chantierId,
  startDate,
  endDate,
  startPeriod,
  endPeriod,
  password,
  onDeleted,
}: {
  chantierId: string;
  startDate: string;
  endDate: string;
  startPeriod: ChantierPeriod;
  endPeriod: ChantierPeriod;
  password: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const getFiche = useServerFn(getChantierFiche);
  const updateFiche = useServerFn(updateChantierFiche);
  const updateDates = useServerFn(updateChantierDates);
  const cancelFn = useServerFn(cancelChantier);
  const addTaskFn = useServerFn(addChantierTask);
  const markPlannedFn = useServerFn(markReportPlanned);

  const [editing, setEditing] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<
    Array<{
      label: string;
      urgency: string;
      estimatedPeopleCount?: number;
      estimatedDurationMinutes?: number;
      reportId?: string;
    }>
  >([]);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [draftStartPeriod, setDraftStartPeriod] = useState<ChantierPeriod>(startPeriod);
  const [draftEndPeriod, setDraftEndPeriod] = useState<ChantierPeriod>(endPeriod);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");

  const { data: ficheData } = useQuery({
    queryKey: ["chantier-fiche", chantierId, startDate],
    queryFn: () => getFiche({ data: { chantierId, startDate } }),
  });
  const title = ficheData?.title ?? "";
  const description = ficheData?.description ?? "";

  function openEdit() {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setDraftStartPeriod(startPeriod);
    setDraftEndPeriod(endPeriod);
    setDraftTitle(title);
    setDraftDesc(description);
    setEditing(true);
    setLocked(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const promises: Promise<unknown>[] = [];
      if (editing) {
        if (!draftStart || !draftEnd) {
          toast.error("Renseigne les deux dates.");
          setSaving(false);
          return;
        }
        promises.push(
          updateDates({
            data: {
              id: chantierId,
              startDate: draftStart,
              endDate: draftEnd,
              startPeriod: draftStartPeriod,
              endPeriod: draftEndPeriod,
              password,
            },
          }),
          updateFiche({
            data: {
              chantierId,
              startDate: draftStart,
              title: draftTitle,
              description: draftDesc,
              password,
            },
          }),
        );
      }
      for (const pt of pendingTasks) {
        promises.push(
          addTaskFn({
            data: {
              chantierId,
              startDate,
              label: pt.label,
              password,
              estimatedDurationMinutes: pt.estimatedDurationMinutes,
              estimatedPeopleCount: pt.estimatedPeopleCount,
              urgency: pt.urgency as "tres_urgent" | "urgent" | "important" | "must_have" | "",
            },
          }).then(async () => {
            if (pt.reportId) {
              await markPlannedFn({ data: { id: pt.reportId, chantierId, password } });
            }
          }),
        );
      }
      await Promise.all(promises);
      toast.success("Modifications enregistrées.");
      setEditing(false);
      setPendingTasks([]);
      queryClient.invalidateQueries({ queryKey: ["chantiers-admin"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["chantier-fiche", chantierId, startDate] });
      queryClient.invalidateQueries({ queryKey: ["chantier-tasks", chantierId, startDate] });
      queryClient.invalidateQueries({ queryKey: ["chantier-reports-backlog", password] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la mise à jour.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await cancelFn({ data: { id: chantierId, password } });
      toast.success("Chantier supprimé.");
      onDeleted();
      queryClient.invalidateQueries({ queryKey: ["chantiers-admin"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la suppression.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {editing ? (
        <div className="space-y-3">
          <label className="block">
            <span className={FORM_LABEL_CLASS}>Titre du chantier</span>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Le thème ou le gros projet du week-end…"
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <DateField label="Début" value={draftStart} onChange={setDraftStart} />
              <div className="mt-1.5">
                <PeriodChips value={draftStartPeriod || "matin"} onChange={setDraftStartPeriod} />
              </div>
            </div>
            <div>
              <DateField label="Fin" value={draftEnd} onChange={setDraftEnd} />
              <div className="mt-1.5">
                <PeriodChips value={draftEndPeriod || "apres_midi"} onChange={setDraftEndPeriod} />
              </div>
            </div>
          </div>
          <label className="block">
            <span className={FORM_LABEL_CLASS}>Détails du chantier</span>
            <textarea
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              rows={3}
              placeholder="Détaille le chantier : précisions, matériel à prévoir, organisation…"
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </label>
        </div>
      ) : (
        <div>
          {title && (
            <p className="text-[24px] font-black leading-tight tracking-[-0.02em] text-foreground">
              {title}
            </p>
          )}
          {description && (
            <p
              className={`text-[12px] text-muted-foreground leading-relaxed ${title ? "mt-1.5" : ""}`}
            >
              {description}
            </p>
          )}
        </div>
      )}

      {/* Tâches */}
      <ChantierTasksAdmin
        chantierId={chantierId}
        startDate={startDate}
        endDate={endDate}
        password={password}
        locked={locked && !editing}
        pendingTasks={pendingTasks}
        onAddPending={(task) => setPendingTasks((prev) => [...prev, task])}
        onRemovePending={(idx) => setPendingTasks((prev) => prev.filter((_, i) => i !== idx))}
      />

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border pt-3">
        {editing || pendingTasks.length > 0 ? (
          <>
            <button
              onClick={() => {
                setEditing(false);
                setPendingTasks([]);
              }}
              className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold text-muted-foreground"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="tap lift flex-1 rounded-2xl bg-brand-accent px-4 py-2 text-[12px] font-semibold text-brand-accent-foreground disabled:opacity-50"
            >
              {saving
                ? "Envoi vers Google…"
                : `Valider${pendingTasks.length > 0 ? ` (${pendingTasks.length} tâche${pendingTasks.length > 1 ? "s" : ""})` : ""}`}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={openEdit}
              className="tap rounded-xl border border-border bg-card px-3.5 py-2 text-[12px] font-semibold text-foreground hover:bg-secondary/60 transition-colors"
            >
              Modifier
            </button>
            <button
              onClick={() => setLocked((v) => !v)}
              className={`tap rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-colors ${
                locked
                  ? "border-brand-secondary/30 bg-brand-secondary/10 text-brand-secondary"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary/60"
              }`}
            >
              {locked ? "Déverrouiller" : "Verrouiller"}
            </button>
            <div className="flex-1" />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={deleting}
                  className="text-[11px] font-semibold text-destructive hover:underline disabled:opacity-50"
                >
                  {deleting ? "Suppression…" : "Supprimer"}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer définitivement ce chantier ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible : la fiche, les tâches, les inscriptions et
                    l'intendance associées seront supprimées.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}

function reportDisplayName(r: ChantierReport) {
  return r.title || `${REPORT_CATEGORY_LABEL[r.category]} — ${r.location}`;
}

// Mise en page commune à toute tâche affichée dans le site : Nom > effectif
// (icône personne) > durée (icône horloge) > case à cocher. `onToggle` porte
// l'action (pioche immédiate ou simple sélection selon le contexte) ; omis,
// la ligne est purement informative.
function ReportLine({
  report,
  checked = false,
  onToggle,
  picking,
}: {
  report: ChantierReport;
  checked?: boolean;
  onToggle?: () => void;
  picking?: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
        {reportDisplayName(report)}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <User className="h-3 w-3" />
        {report.personDaysEstimate || "—"}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        {shortDurationLabel(report.timeEstimate) || "—"}
      </span>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          disabled={picking}
          aria-pressed={checked}
          aria-label={checked ? "Retirer" : "Ajouter"}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-50 ${
            checked
              ? "border-brand-secondary bg-brand-secondary text-brand-secondary-foreground"
              : "border-foreground/20 bg-background"
          }`}
        >
          {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
      )}
    </div>
  );
}

function ChantierTasksAdmin({
  chantierId,
  startDate,
  endDate,
  password,
  locked = false,
  pendingTasks = [],
  onAddPending,
  onRemovePending,
}: {
  chantierId: string;
  startDate: string;
  endDate: string;
  password: string;
  locked?: boolean;
  pendingTasks?: Array<{
    label: string;
    urgency: string;
    estimatedPeopleCount?: number;
    estimatedDurationMinutes?: number;
    reportId?: string;
  }>;
  onAddPending?: (task: {
    label: string;
    urgency: string;
    estimatedPeopleCount?: number;
    estimatedDurationMinutes?: number;
    reportId?: string;
  }) => void;
  onRemovePending?: (idx: number) => void;
}) {
  const queryClient = useQueryClient();
  const listTasks = useServerFn(listChantierTasks);
  const addTask = useServerFn(addChantierTask);
  const deleteTask = useServerFn(deleteChantierTask);
  const listReports = useServerFn(listChantierReports);
  const markPlanned = useServerFn(markReportPlanned);

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["chantier-tasks", chantierId, startDate],
    queryFn: () => listTasks({ data: { chantierId, startDate } }),
  });
  const tasks = tasksData?.tasks ?? [];

  const [query, setQuery] = useState("");
  const [addingReportId, setAddingReportId] = useState<string | null>(null);
  const [adderOpen, setAdderOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const phase = getTaskPhase(startDate, endDate || startDate);

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["chantier-reports-backlog", password],
    queryFn: () => listReports({ data: { password } }),
  });
  const openReports = (reportsData?.reports ?? []).filter((r) => r.status === "ouvert");
  const q = query.trim().toLowerCase();
  const filteredReports = q
    ? openReports.filter(
        (r) =>
          reportDisplayName(r).toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      )
    : openReports;

  function refreshTasks() {
    queryClient.invalidateQueries({ queryKey: ["chantier-tasks", chantierId, startDate] });
  }

  async function handleDelete(taskId: string) {
    try {
      await deleteTask({ data: { chantierId, startDate, taskId, password } });
      refreshTasks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la suppression.");
    }
  }

  async function handlePickReport(r: ChantierReport) {
    if (onAddPending) {
      onAddPending({
        label: reportDisplayName(r),
        urgency: r.urgency,
        estimatedPeopleCount: r.personDaysEstimate ?? undefined,
        estimatedDurationMinutes: parseDurationToMinutes(r.timeEstimate) || undefined,
        reportId: r.id,
      });
      return;
    }
    setAddingReportId(r.id);
    try {
      await addTask({
        data: {
          chantierId,
          startDate,
          label: reportDisplayName(r),
          password,
          estimatedDurationMinutes: parseDurationToMinutes(r.timeEstimate) || undefined,
          estimatedPeopleCount: r.personDaysEstimate ?? undefined,
          urgency: r.urgency,
        },
      });
      await markPlanned({ data: { id: r.id, chantierId, password } });
      queryClient.invalidateQueries({ queryKey: ["chantier-reports-backlog", password] });
      refreshTasks();
      toast.success("Tâche ajoutée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'ajout.");
    } finally {
      setAddingReportId(null);
    }
  }

  const todoTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const totalCount = tasks.length + pendingTasks.length;

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <SectionLabel>Tâches</SectionLabel>
        {totalCount > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground/60">
            · {doneTasks.length}/{totalCount}
          </span>
        )}
      </div>

      <div className="mt-1.5 divide-y divide-border/40">
        {tasksLoading && (
          <div className="animate-pulse space-y-2 py-2">
            <div className="h-8 rounded-lg bg-secondary" />
            <div className="h-8 rounded-lg bg-secondary/60" />
          </div>
        )}
        {!tasksLoading && totalCount === 0 && <EmptyState>Aucune tâche pour l'instant.</EmptyState>}
        {todoTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            chantierId={chantierId}
            startDate={startDate}
            phase={phase}
            onDelete={() => handleDelete(task.id)}
          />
        ))}
        {pendingTasks.map((pt, idx) => (
          <TaskItem
            key={`pending-${idx}`}
            task={{
              id: `pending-${idx}`,
              label: pt.label,
              done: false,
              note: "",
              participants: "",
              completedAt: "",
              resultPhotoUrl: "",
              durationMinutes: pt.estimatedDurationMinutes ?? 0,
              peopleCount: pt.estimatedPeopleCount ?? 0,
              urgency:
                (pt.urgency as "tres_urgent" | "urgent" | "important" | "must_have" | "") || "",
              isPending: true,
            }}
            chantierId={chantierId}
            startDate={startDate}
            phase={phase}
            onDelete={() => onRemovePending?.(idx)}
          />
        ))}
        {doneTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            chantierId={chantierId}
            startDate={startDate}
            phase={phase}
            onDelete={() => handleDelete(task.id)}
          />
        ))}
      </div>

      {!locked && !adderOpen && <AddTaskButton onClick={() => setAdderOpen(true)} />}

      {!locked && adderOpen && (
        <div className="mt-2 rounded-xl border border-border bg-secondary/30 p-2.5">
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder="Chercher une tâche (mot-clé)…"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-[13px] outline-none focus:border-ring"
            />
            <button
              onClick={() => setAdderOpen(false)}
              aria-label="Fermer"
              className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-card">
            {reportsLoading && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">Chargement…</div>
            )}
            {!reportsLoading && filteredReports.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">
                {openReports.length === 0 ? "Aucune tâche ouverte." : "Aucun résultat."}
              </div>
            )}
            {filteredReports.map((r) => (
              <ReportLine
                key={r.id}
                report={r}
                picking={addingReportId === r.id}
                onToggle={() => handlePickReport(r)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setAdderOpen(false);
              setCreateOpen(true);
            }}
            className="tap mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Créer une nouvelle tâche
          </button>
        </div>
      )}

      <TaskFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nouvelle tâche planifiée"
        chantierId={chantierId}
        startDate={startDate}
        mode="admin"
        password={password}
      />
    </div>
  );
}

function ChantierBacklogSection({
  password,
  showHeader = true,
}: {
  password: string;
  showHeader?: boolean;
}) {
  const list = useServerFn(listChantierReports);
  const queryClient = useQueryClient();
  const store = useExpenseStore();
  const identifiedName = store.member?.firstName ?? "";
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<ChantierReport | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["chantier-reports-backlog", password],
    queryFn: () => list({ data: { password } }),
  });

  const reports = data?.reports ?? [];
  const open = reports.filter((r) => r.status === "ouvert");
  const planned = reports.filter((r) => r.status === "planifie");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? open.filter(
        (r) =>
          reportDisplayName(r).toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      )
    : open;

  return (
    <div className={showHeader ? "mt-8" : "mt-3"}>
      {showHeader && (
        <>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Tâches à faire
            </h2>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Trié par urgence. Pioche dedans depuis la fiche d'un chantier pour créer les tâches.
          </p>
        </>
      )}

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher une tâche…"
          className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-card">
        {isLoading && (
          <div className="px-3 py-2.5 text-[12px] text-muted-foreground">Chargement…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="px-3 py-2.5 text-[12px] text-muted-foreground">
            {open.length === 0 ? "Aucune tâche ouverte." : "Aucun résultat."}
          </div>
        )}
        {filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setDetail(r)}
            className="block w-full text-left hover-device:hover:bg-secondary/40 transition-colors"
          >
            <ReportLine report={r} />
          </button>
        ))}
      </div>
      {planned.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {planned.length} déjà planifié{planned.length > 1 ? "s" : ""} sur un chantier.
        </p>
      )}

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="tap mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Créer une nouvelle tâche
      </button>

      {/* Pop-up création */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-border sm:mx-auto sm:max-w-xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Nouvelle tâche</SheetTitle>
            <SheetDescription>
              Elle rejoindra la liste des tâches à faire, à piocher depuis un chantier.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 pb-2">
            <ReportForm
              identifiedName={identifiedName}
              onSubmitted={() => {
                toast.success("Tâche créée.");
                setCreateOpen(false);
                queryClient.invalidateQueries({ queryKey: ["chantier-reports-backlog", password] });
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Pop-up détail */}
      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-border sm:mx-auto sm:max-w-xl"
        >
          {detail && (
            <>
              <SheetHeader className="text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-brand-secondary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-brand-secondary">
                    {REPORT_CATEGORY_LABEL[detail.category]}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${
                      detail.urgency === "tres_urgent"
                        ? "bg-destructive/10 text-destructive"
                        : detail.urgency === "urgent"
                          ? "bg-brand-accent/10 text-brand-accent"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {REPORT_URGENCY_LABEL[detail.urgency]}
                  </span>
                </div>
                <SheetTitle className="text-[22px] font-black leading-tight tracking-[-0.01em]">
                  {detail.title}
                </SheetTitle>
                {detail.location && (
                  <SheetDescription className="text-[12px]">📍 {detail.location}</SheetDescription>
                )}
              </SheetHeader>

              <div className="mt-4 space-y-4 pb-2">
                {(detail.personDaysEstimate ?? 0) > 0 ||
                detail.timeEstimate ||
                (detail.budgetEstimate ?? 0) > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-secondary/50 p-3 text-center">
                      <User className="mx-auto h-4 w-4 text-brand-secondary" />
                      <div className="mt-1 text-sm font-bold tabular-nums">
                        {detail.personDaysEstimate || "—"}
                      </div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Personnes
                      </div>
                    </div>
                    <div className="rounded-2xl bg-secondary/50 p-3 text-center">
                      <Clock className="mx-auto h-4 w-4 text-brand-secondary" />
                      <div className="mt-1 text-sm font-bold">
                        {shortDurationLabel(detail.timeEstimate) || "—"}
                      </div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Durée
                      </div>
                    </div>
                    <div className="rounded-2xl bg-secondary/50 p-3 text-center">
                      <Wallet className="mx-auto h-4 w-4 text-brand-secondary" />
                      <div className="mt-1 text-sm font-bold tabular-nums">
                        {detail.budgetEstimate ? `${detail.budgetEstimate} €` : "—"}
                      </div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Budget
                      </div>
                    </div>
                  </div>
                ) : null}

                {detail.description && (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Description
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                      {detail.description}
                    </p>
                  </div>
                )}

                {detail.photoUrl && (
                  <a
                    href={detail.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="tap flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Voir la photo
                  </a>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Signalé par{" "}
                  <span className="font-semibold text-foreground">{detail.reportedBy}</span>
                  {detail.createdAt ? ` · ${fmtDate(detail.createdAt.slice(0, 10))}` : ""}
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
