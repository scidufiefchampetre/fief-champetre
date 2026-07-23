import { create } from "zustand";
import type { Expense } from "../../lib/expense-types";
import type { Member } from "../../lib/members.functions";

interface UploadedFile {
  name: string;
  mimeType: string;
  dataUrl: string; // data:...;base64,...
}

export interface StoredMember {
  firstName: string;
  lastName: string;
  iban: string;
  bankName?: string;
}

interface MembersCache {
  members: Member[];
  spreadsheetId: string;
  fetchedAt: number;
}

interface StoreState {
  file: UploadedFile | null;
  expense: Expense | null;
  spreadsheetId: string | null;
  member: StoredMember | null;
  membersCache: MembersCache | null;
  setFile: (f: UploadedFile | null) => void;
  setExpense: (e: Expense | null) => void;
  updateExpense: (patch: Partial<Expense>) => void;
  setConfig: (cfg: { spreadsheetId?: string | null }) => void;
  hydrateConfig: () => void;
  setMember: (m: StoredMember | null) => void;
  hydrateMember: () => void;
  setMembersCache: (cache: MembersCache | null) => void;
  hydrateMembersCache: () => void;
}

const STORAGE_KEY = "fief-config-v2";
const MEMBER_KEY = "sci-asso-member-v1";
const MEMBERS_CACHE_KEY = "sci-asso-members-cache-v1";
const MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const useExpenseStore = create<StoreState>((set, get) => ({
  file: null,
  expense: null,
  spreadsheetId: null,
  member: null,
  membersCache: null,
  setFile: (file) => set({ file }),
  setExpense: (expense) =>
    set({
      expense: expense ? { ...expense, reimbursementSide: expense.finalSide } : expense,
    }),
  updateExpense: (patch) => {
    const cur = get().expense;
    if (!cur) return;
    const next = { ...cur, ...patch };
    if (patch.finalSide || !next.reimbursementSide) {
      next.reimbursementSide = next.finalSide;
    }
    set({ expense: next });
  },
  setConfig: (cfg) => {
    const merged = { spreadsheetId: cfg.spreadsheetId ?? get().spreadsheetId };
    set(merged);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    }
  },
  hydrateConfig: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      set({ spreadsheetId: cfg?.spreadsheetId ?? null });
    } catch {
      /* ignore */
    }
  },
  setMember: (member) => {
    set({ member });
    if (typeof window !== "undefined") {
      if (member) localStorage.setItem(MEMBER_KEY, JSON.stringify(member));
      else localStorage.removeItem(MEMBER_KEY);
    }
  },
  hydrateMember: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(MEMBER_KEY);
      if (!raw) return;
      const m = JSON.parse(raw);
      if (m?.firstName && m?.lastName) set({ member: m });
    } catch {
      /* ignore */
    }
  },
  setMembersCache: (cache) => {
    set({ membersCache: cache });
    if (typeof window !== "undefined") {
      if (cache) localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify(cache));
      else localStorage.removeItem(MEMBERS_CACHE_KEY);
    }
  },
  hydrateMembersCache: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(MEMBERS_CACHE_KEY);
      if (!raw) return;
      const cache = JSON.parse(raw) as MembersCache;
      if (
        cache &&
        Array.isArray(cache.members) &&
        cache.members.length > 1 &&
        typeof cache.spreadsheetId === "string" &&
        typeof cache.fetchedAt === "number" &&
        Date.now() - cache.fetchedAt < MEMBERS_CACHE_TTL_MS
      ) {
        set({ membersCache: cache });
      } else {
        localStorage.removeItem(MEMBERS_CACHE_KEY);
      }
    } catch {
      /* ignore */
    }
  },
}));
