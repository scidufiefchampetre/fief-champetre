import { FileText, HardHat } from "lucide-react";
import type { Expense } from "@/lib/expense-types";

export function ExpenseCard({ expense, fileName }: { expense: Expense; fileName?: string }) {
  const side = expense.finalSide;
  const sideLabel = side === "Association" ? "Asso" : "SCI";
  const category = expense.topCategory.split(" — ")[0];
  const isAsso = side === "Association";
  const sideBg = isAsso ? "bg-brand-accent" : "bg-brand-secondary";
  const sideFg = isAsso ? "text-brand-accent-foreground" : "text-brand-secondary-foreground";

  const sideAccentBg = isAsso ? "bg-brand-secondary/10" : "bg-brand-secondary/10";
  const rembSide = expense.reimbursementSide === "Association" ? "Asso" : "SCI";
  const rembIsAsso = expense.reimbursementSide === "Association";
  const rembDot = rembIsAsso ? "bg-brand-accent" : "bg-brand-secondary";

  return (
    <div className="rounded-3xl bg-card border border-border/60 shadow-card overflow-hidden">
      <div className="p-4">
        {/* Side pill accentué */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest ${sideBg} ${sideFg}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90" />
            {sideLabel}
          </span>
          <span
            className={`text-[10px] font-semibold px-2 py-1 rounded-full ${sideAccentBg} text-foreground truncate max-w-[60%]`}
          >
            {category}
          </span>
        </div>

        {/* Header */}
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Fournisseur
            </p>
            <h2 className="mt-0.5 text-[22px] font-black uppercase leading-[1.05] tracking-tight truncate text-foreground">
              {expense.supplier || "Fournisseur"}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatDate(expense.invoiceDate)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[22px] font-black leading-none tracking-tight tabular-nums text-foreground">
              {formatAmount(expense.amountTTC)}&nbsp;€
            </p>
            {expense.vat != null && (
              <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                TVA {formatAmount(expense.vat)}&nbsp;€
              </p>
            )}
          </div>
        </div>

        {/* Metadata grid */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetaCell label="Lieu" value={expense.place || "…"} />
          <MetaCell label="Moyen" value={expense.paymentMethod || "…"} />
          <MetaCell label="Payé par" value={shortPaidBy(expense.paidBy)} />
          {expense.paidBy === "Membre" && expense.memberName && (
            <div className="min-w-0 rounded-xl bg-secondary/50 px-3 py-2">
              <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
                Remb.
              </div>
              <div className="text-[12px] font-semibold truncate mt-0.5 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${rembDot}`} />
                <span className="truncate">
                  {expense.memberName} · {rembSide}
                </span>
              </div>
            </div>
          )}
        </div>

        {expense.chantierId && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
            <HardHat className="h-3.5 w-3.5 shrink-0 text-brand-accent" />
            <div className="min-w-0">
              <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
                Chantier associé
              </div>
              <div className="mt-0.5 truncate text-[11px] font-semibold">
                {expense.chantierLabel || expense.chantierStartDate}
              </div>
            </div>
          </div>
        )}

        {/* Commentaire encadré */}
        {expense.comment && (
          <div className="mt-3 rounded-2xl bg-secondary/40 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1">
              Commentaire
            </p>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">{expense.comment}</p>
          </div>
        )}
      </div>

      {/* Fichier */}
      {fileName && (
        <div className="flex items-center gap-1.5 border-t border-border/50 bg-secondary/30 px-4 py-2 text-[10px] font-medium text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{fileName}</span>
        </div>
      )}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/50 px-3 py-2">
      <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-[12px] font-semibold truncate mt-0.5">{value}</div>
    </div>
  );
}

function shortPaidBy(v: string | null | undefined) {
  if (!v) return "…";
  if (v === "Association") return "Asso";
  if (v === "Membre") return "Membre";
  return v;
}

function formatAmount(n: number) {
  return n.toFixed(2).replace(".", ",");
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
