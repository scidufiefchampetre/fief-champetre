import { create } from "zustand";
import type { AdminSpace } from "../../lib/admin.functions";

// On mémorise le mot de passe lui-même (pas juste un booléen "déverrouillé")
// pour pouvoir le renvoyer à chaque appel serveur sensible (markReimbursed,
// création/édition de chantier...), qui le revalide systématiquement côté
// serveur. C'est le choix le plus simple compatible avec "un seul mot de
// passe partagé par espace, mémorisé sur l'appareil" — pas de vraie session,
// pas de token, juste le secret repassé à chaque mutation.

interface AdminStoreState {
  passwords: Partial<Record<AdminSpace, string>>;
  unlock: (space: AdminSpace, password: string) => void;
  lock: (space: AdminSpace) => void;
  hydrate: () => void;
}

const ADMIN_KEY = "sci-asso-admin-v1";

export const useAdminStore = create<AdminStoreState>((set, get) => ({
  passwords: {},
  unlock: (space, password) => {
    const next = { ...get().passwords, [space]: password };
    set({ passwords: next });
    if (typeof window !== "undefined") {
      localStorage.setItem(ADMIN_KEY, JSON.stringify(next));
    }
  },
  lock: (space) => {
    const next = { ...get().passwords };
    delete next[space];
    set({ passwords: next });
    if (typeof window !== "undefined") {
      localStorage.setItem(ADMIN_KEY, JSON.stringify(next));
    }
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(ADMIN_KEY);
      if (!raw) return;
      const passwords = JSON.parse(raw);
      if (passwords && typeof passwords === "object") set({ passwords });
    } catch {
      /* ignore */
    }
  },
}));
