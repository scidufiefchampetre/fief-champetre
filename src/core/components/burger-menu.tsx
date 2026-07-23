import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Menu,
  ChevronDown,
  HelpCircle,
  LogOut,
  ArrowRight,
  User,
  Lock,
  Bug,
  Lightbulb,
} from "lucide-react";

import { useExpenseStore } from "@/core/store/expense-store";
import { useProfileSummary } from "@/core/hooks/use-profile-summary";

function fmtEur(n: number) {
  return `${n.toFixed(0)} €`;
}

function ProfilePreviewCard({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const store = useExpenseStore();
  const summary = useProfileSummary(open);
  const hasStats =
    summary.reservationsDueCount > 0 ||
    summary.expensesPendingCount > 0 ||
    summary.reservationsUpcomingCount > 0;

  return (
    <Link
      to="/profil"
      onClick={onNavigate}
      className="group flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 transition hover:bg-secondary hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <User className="h-5 w-5 text-foreground" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight">Mon profil</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {store.member?.firstName}, vue d'ensemble
          </p>
        </div>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
          strokeWidth={2.5}
        />
      </div>
      {!summary.loading && hasStats && (
        <div className="flex flex-wrap gap-1.5 pl-[52px]">
          {summary.reservationsUpcomingCount > 0 && (
            <span className="rounded-full bg-brand-secondary/15 px-2 py-0.5 text-[10px] font-semibold text-brand-secondary">
              {summary.reservationsUpcomingCount} résa à venir
            </span>
          )}
          {summary.reservationsDueCount > 0 && (
            <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[10px] font-semibold text-brand-accent">
              {fmtEur(summary.reservationsDueAmount)} dû
            </span>
          )}
          {summary.expensesPendingCount > 0 && (
            <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[10px] font-semibold text-brand-accent">
              {fmtEur(summary.expensesPendingAmount)} à rembourser
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export function BurgerMenu() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const store = useExpenseStore();

  function close() {
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Ouvrir le menu"
          className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-secondary transition"
        >
          <Menu className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[86%] sm:w-96 bg-background border-r border-border flex flex-col"
      >
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold tracking-tight">Menu</SheetTitle>
          <SheetDescription className="sr-only">Menu</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 overflow-y-auto px-4 space-y-2">
          {store.member && <ProfilePreviewCard open={open} onNavigate={close} />}
          <div className="rounded-2xl overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === "feedback" ? null : "feedback")}
              className="flex w-full items-center gap-3 bg-card p-4 text-left transition hover:bg-secondary"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Lightbulb className="h-5 w-5 text-muted-foreground" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold leading-tight">Améliorer l'app</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">2 options</p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded === "feedback" ? "rotate-180" : ""}`}
                strokeWidth={2.5}
              />
            </button>
            {expanded === "feedback" && (
              <div className="border-t border-border bg-card p-2 space-y-1">
                <Link
                  to="/signaler-bug"
                  onClick={close}
                  className="group flex items-center gap-3 rounded-xl p-3 transition hover:bg-card active:scale-[0.99]"
                >
                  <Bug className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-tight">
                      Signaler un problème
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Quelque chose ne marche pas ?
                    </p>
                  </div>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
                    strokeWidth={2.5}
                  />
                </Link>
                <Link
                  to="/proposer-idee"
                  onClick={close}
                  className="group flex items-center gap-3 rounded-xl p-3 transition hover:bg-card active:scale-[0.99]"
                >
                  <Lightbulb className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-tight">Proposer une idée</div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Une fonctionnalité qui manque ?
                    </p>
                  </div>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
                    strokeWidth={2.5}
                  />
                </Link>
              </div>
            )}
          </div>
          <Link
            to="/regles"
            onClick={close}
            className="group flex items-center gap-3 rounded-2xl bg-card p-4 transition hover:bg-secondary active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <HelpCircle className="h-5 w-5 text-muted-foreground" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-tight">Règles SCI vs Asso</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Comment savoir si c'est SCI ou Asso
              </p>
            </div>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </Link>
          <Link
            to="/admin"
            onClick={close}
            className="group flex items-center gap-3 rounded-2xl bg-card p-4 transition hover:bg-secondary active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <Lock className="h-5 w-5 text-muted-foreground" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-tight">Espace admin</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Trésoriers SCI et Asso</p>
            </div>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </Link>
          {store.member && (
            <button
              onClick={() => {
                store.setMember(null);
                close();
              }}
              className="flex w-full items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition"
            >
              <LogOut className="h-4 w-4" />
              Changer de membre ({store.member.firstName})
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
