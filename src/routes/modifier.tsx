import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useExpenseStore } from "@/core/store/expense-store";
import { AppHeader } from "@/core/components/app-header";
import { PageShell } from "@/components/ui/page-shell";
import {
  PLACES,
  TOP_CATEGORIES,
  type Expense,
  type PaidBy,
  type PaymentMethod,
  type Place,
  type ReimbursementStatus,
  type Side,
  type TopCategory,
} from "@/lib/expense-types";

export const Route = createFileRoute("/modifier")({
  component: ModifierPage,
});

const PAYMENT_METHODS: PaymentMethod[] = ["Virement", "Chèque", "Carte", "Prélèvement", "Espèces"];

function ModifierPage() {
  const navigate = useNavigate();
  const { expense, setExpense } = useExpenseStore();
  const [draft, setDraft] = useState<Expense | null>(expense);
  const [confirmSwitch, setConfirmSwitch] = useState<Side | null>(null);
  const originalSide = expense?.finalSide;

  useEffect(() => {
    if (!expense) {
      navigate({ to: "/" });
    }
  }, [expense, navigate]);

  if (!draft)
    return (
      <PageShell>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-24 rounded-lg bg-secondary" />
          <div className="h-6 w-48 rounded-lg bg-secondary" />
          <div className="h-40 rounded-2xl bg-secondary" />
          <div className="h-40 rounded-2xl bg-secondary/60" />
        </div>
      </PageShell>
    );

  function patch<K extends keyof Expense>(key: K, value: Expense[K]) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, [key]: value } as Expense;
      // Le côté qui rembourse suit toujours le côté final de la dépense.
      if (key === "finalSide") {
        next.reimbursementSide = value as Side;
      }
      return next;
    });
  }

  function requestSideChange(next: Side) {
    if (!draft) return;
    if (originalSide && next !== originalSide) {
      setConfirmSwitch(next);
    } else {
      patch("finalSide", next);
    }
  }

  function save() {
    if (!draft) return;
    setExpense(draft);
    toast.success("Fiche mise à jour.");
    navigate({ to: "/" });
  }

  return (
    <main className="min-h-dvh w-full">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-4 sm:py-10">
        <AppHeader variant="back" />

        <div className="animate-rise">
          <h1 className="page-title">Modifier la dépense</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Corrige uniquement ce qui ne va pas. Le reste est déjà prêt.
          </p>
        </div>

        <div className="mt-8 space-y-5">
          <Section title="Infos facture">
            <Text
              label="Fournisseur"
              value={draft.supplier}
              onChange={(v) => patch("supplier", v)}
            />
            <Text
              label="Date de facture"
              type="date"
              value={draft.invoiceDate?.slice(0, 10) ?? ""}
              onChange={(v) => patch("invoiceDate", v)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Text
                label="Montant TTC (€)"
                type="number"
                value={String(draft.amountTTC)}
                onChange={(v) => patch("amountTTC", parseFloat(v) || 0)}
              />
              <Text
                label="TVA (€)"
                type="number"
                value={draft.vat == null ? "" : String(draft.vat)}
                onChange={(v) => patch("vat", v === "" ? null : parseFloat(v))}
              />
            </div>
            <Text
              label="Objet détecté"
              value={draft.detectedObject}
              onChange={(v) => patch("detectedObject", v)}
            />
            <Textarea
              label="Commentaire"
              value={draft.comment}
              onChange={(v) => patch("comment", v)}
            />
          </Section>

          <Section title="Catégorie">
            <Select
              label="Catégorie"
              value={draft.topCategory}
              options={TOP_CATEGORIES as unknown as string[]}
              onChange={(v) => {
                const topCategory = v as TopCategory;
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        topCategory,
                        ...(topCategory === "Repas chantier"
                          ? { finalSide: "Association", reimbursementSide: "Association" }
                          : {
                              chantierId: undefined,
                              chantierStartDate: undefined,
                              chantierLabel: undefined,
                            }),
                      }
                    : current,
                );
              }}
            />
            <Text
              label="Détail d'achat"
              value={draft.purchaseDetail}
              onChange={(v) => patch("purchaseDetail", v)}
            />
          </Section>

          <Section title="Lieu">
            <Select
              label="Lieu"
              value={draft.place}
              options={PLACES as unknown as string[]}
              onChange={(v) => patch("place", v as Place)}
            />
          </Section>

          <Section title="Paiement">
            <div>
              <Label>Payé par</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["SCI", "Association", "Membre"] as PaidBy[]).map((opt) => (
                  <ChoiceChip
                    key={opt}
                    active={draft.paidBy === opt}
                    onClick={() => patch("paidBy", opt)}
                  >
                    {opt === "Association" ? "Asso" : opt === "Membre" ? "Un membre" : "SCI"}
                  </ChoiceChip>
                ))}
              </div>
            </div>
            <Select
              label="Moyen de paiement"
              value={draft.paymentMethod}
              options={PAYMENT_METHODS as unknown as string[]}
              onChange={(v) => patch("paymentMethod", v as PaymentMethod)}
            />
            {draft.paidBy === "Membre" && (
              <div className="space-y-3 rounded-2xl bg-secondary/50 p-4">
                <Text
                  label="Nom du membre"
                  value={draft.memberName ?? ""}
                  onChange={(v) => patch("memberName", v)}
                />
                <div>
                  <Label>RIB disponible</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <ChoiceChip
                      active={draft.ribAvailable === true}
                      onClick={() => patch("ribAvailable", true)}
                    >
                      Oui
                    </ChoiceChip>
                    <ChoiceChip
                      active={draft.ribAvailable === false}
                      onClick={() => patch("ribAvailable", false)}
                    >
                      Non
                    </ChoiceChip>
                  </div>
                </div>
                <div>
                  <Label>Statut</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["À rembourser", "Remboursé"] as ReimbursementStatus[]).map((s) => (
                      <ChoiceChip
                        key={s}
                        active={draft.reimbursementStatus === s}
                        onClick={() => patch("reimbursementStatus", s)}
                      >
                        {s}
                      </ChoiceChip>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Remboursé par</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["SCI", "Association"] as Side[]).map((s) => (
                      <ChoiceChip
                        key={s}
                        active={draft.reimbursementSide === s}
                        onClick={() => patch("reimbursementSide", s)}
                      >
                        {s === "Association" ? "Asso" : "SCI"}
                      </ChoiceChip>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section title="Décision finale">
            <div className="text-sm text-muted-foreground">Cette dépense part côté :</div>
            <div className="mt-1 grid grid-cols-2 gap-3">
              {(["SCI", "Association"] as Side[]).map((s) => {
                const active = draft.finalSide === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => requestSideChange(s)}
                    className={`rounded-2xl border px-4 py-5 text-lg font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2 ${
                      active
                        ? "border-foreground bg-foreground text-background shadow-card"
                        : "border-border bg-card text-foreground hover:bg-secondary"
                    }`}
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-current" />}
                    {s === "Association" ? "Asso" : "SCI"}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 rounded-xl bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">SCI</span> = ce qui appartient au
                lieu.
              </div>
              <div>
                <span className="font-medium text-foreground">Asso</span> = ce qui fait vivre le
                lieu.
              </div>
            </div>
          </Section>
        </div>

        <div className="sticky bottom-0 mt-8 -mx-5 grid grid-cols-2 gap-3 border-t border-border bg-background/85 px-5 py-4 backdrop-blur">
          <button
            onClick={() => navigate({ to: "/" })}
            className="tap rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold hover:bg-secondary"
          >
            Annuler
          </button>
          <button
            onClick={save}
            className={`tap lift rounded-2xl px-4 py-3.5 text-sm font-semibold shadow-card ${
              draft.finalSide === "SCI"
                ? "bg-brand-secondary text-brand-secondary-foreground"
                : "bg-brand-accent text-brand-accent-foreground"
            }`}
          >
            Enregistrer les modifications
          </button>
        </div>
      </div>

      {confirmSwitch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-float animate-rise">
            <div className="text-xl font-bold tracking-tight">Tu changes l'arbitrage proposé.</div>
            <p className="mt-2 text-sm text-muted-foreground">C'est bien ça ?</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfirmSwitch(null)}
                className="tap rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:bg-secondary"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  patch("finalSide", confirmSwitch);
                  setConfirmSwitch(null);
                }}
                className={`tap lift rounded-2xl px-4 py-3 text-sm font-semibold shadow-card ${
                  confirmSwitch === "SCI"
                    ? "bg-brand-secondary text-brand-secondary-foreground"
                    : "bg-brand-accent text-brand-accent-foreground"
                }`}
              >
                Confirmer le changement
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-muted-foreground">{children}</div>;
}

function Text({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field mt-1.5"
      />
    </label>
  );
}

function Textarea({
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
      <Label>{label}</Label>
      <textarea
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="input-field mt-1.5 py-3 resize-none"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field mt-1.5"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-soft"
          : "border-border bg-card text-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}
