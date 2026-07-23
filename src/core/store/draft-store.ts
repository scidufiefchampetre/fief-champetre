import { create } from "zustand";

export type TaskDraftPayload = {
  mode: "user" | "admin";
  chantierId: string;
  startDate: string;
  label: string;
  password?: string;
  estimatedDurationMinutes?: number;
  estimatedPeopleCount?: number;
  urgency?: "tres_urgent" | "urgent" | "important" | "must_have";
};

export type DraftStatus = "pending" | "saving" | "done" | "error";

export type DraftItem = {
  id: string;
  type: "task";
  status: DraftStatus;
  payload: TaskDraftPayload;
  /** Label court pour l'affichage dans la DraftBar */
  displayLabel: string;
};

interface DraftState {
  items: DraftItem[];
  push: (item: Omit<DraftItem, "id" | "status">) => string;
  setStatus: (id: string, status: DraftStatus) => void;
  removeDone: () => void;
  clear: () => void;
}

let _seq = 0;

export const useDraftStore = create<DraftState>((set, get) => ({
  items: [],
  push: (item) => {
    const id = `draft-${++_seq}`;
    set({ items: [...get().items, { ...item, id, status: "pending" }] });
    return id;
  },
  setStatus: (id, status) =>
    set({ items: get().items.map((i) => (i.id === id ? { ...i, status } : i)) }),
  removeDone: () => set({ items: get().items.filter((i) => i.status !== "done") }),
  clear: () => set({ items: [] }),
}));
