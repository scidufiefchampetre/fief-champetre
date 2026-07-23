import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/core/components/theme-toggle";
import { BurgerMenu } from "@/core/components/burger-menu";
import { useExpenseStore } from "@/core/store/expense-store";

export function AppHeader({
  variant = "back",
  backTo,
  backLabel,
  onBack,
  onHome,
  title,
  rightSlot,
  className = "mb-4",
}: {
  /** Le bandeau principal reste identique ; "back" ajoute un retour contextuel en dessous. */
  variant?: "home" | "back";
  backTo?: string;
  backLabel?: string;
  /** Retour interne pour les sous-écrans qui ne changent pas d’URL. */
  onBack?: () => void;
  /** Remet à zéro un parcours local avant de revenir à l’accueil. */
  onHome?: () => void;
  title?: string;
  /** Remplace le badge membre par défaut (ex: bouton contextuel pendant un flux en cours). */
  rightSlot?: ReactNode;
  className?: string;
}) {
  const store = useExpenseStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const logicalParent = getLogicalParent(pathname);
  const resolvedBackTo = backTo ?? logicalParent.to;
  const resolvedBackLabel = backLabel ?? labelForTarget(resolvedBackTo, logicalParent.label);

  return (
    <header className={className}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BurgerMenu />
          <Link
            to="/"
            onClick={onHome}
            className="truncate text-base font-bold tracking-tight transition-opacity hover:opacity-65 sm:text-xl"
          >
            {title ?? "Fief Champêtre"}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rightSlot ??
            (store.member && (
              <button
                onClick={() => store.setMember(null)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground"
              >
                <LogOut className="h-3 w-3" />
                {store.member.firstName}
              </button>
            ))}
          <ThemeToggle />
        </div>
      </div>
      {variant === "back" &&
        (onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={`Retour vers ${resolvedBackLabel}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {resolvedBackLabel}
          </button>
        ) : (
          <Link
            to={resolvedBackTo}
            aria-label={`Retour vers ${resolvedBackLabel}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-[10px] font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {resolvedBackLabel}
          </Link>
        ))}
    </header>
  );
}

function getLogicalParent(pathname: string): { to: string; label: string } {
  if (pathname.startsWith("/chantier/") || pathname === "/signaler") {
    return { to: "/chantiers", label: "Tous les chantiers" };
  }
  if (pathname === "/modifier") {
    return { to: "/depenses", label: "Mes dépenses" };
  }
  if (pathname === "/admin") {
    return { to: "/", label: "Accueil" };
  }
  return { to: "/", label: "Accueil" };
}

function labelForTarget(target: string, fallback: string) {
  const labels: Record<string, string> = {
    "/": "Accueil",
    "/chantiers": "Tous les chantiers",
    "/depenses": "Mes dépenses",
    "/admin": "Espace admin",
    "/agenda": "Agenda",
  };
  return labels[target] ?? fallback;
}
