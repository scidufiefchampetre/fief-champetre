import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  INTENDANCE_TAB,
  INTENDANCE_HEADERS,
  INTENDANCE_LAST_COL,
} from "../core/google/google.server";

// Tâches d'intendance (courses/cuisine/garde) — onglet partagé "Intendance"
// col A=ID Chantier, col B=ID, col C=Créé le, col D=Date, col E=Créneau,
// col F=Rôle, col G=Personne. Filtrage par chantierId côté serveur.
export type DutyRole = "courses" | "cuisine" | "garde";
export type DutySlotKey = "matin" | "apres_midi";

export const DUTY_ROLE_LABEL: Record<DutyRole, string> = {
  courses: "Courses",
  cuisine: "Cuisine",
  garde: "Garde d'enfants",
};

export const DUTY_ROLE_SLOTS: Record<DutyRole, DutySlotKey[]> = {
  courses: ["matin"],
  cuisine: ["matin", "apres_midi"],
  garde: ["matin", "apres_midi"],
};

export const DUTY_SLOT_LABEL: Record<DutyRole, Partial<Record<DutySlotKey, string>>> = {
  courses: { matin: "Pour la journée" },
  cuisine: { matin: "Déjeuner", apres_midi: "Dîner" },
  garde: { matin: "Matin", apres_midi: "Après-midi" },
};

export interface ChantierDuty {
  id: string;
  createdAt: string;
  date: string;
  slot: DutySlotKey;
  role: DutyRole;
  personName: string;
}

// row: [chantierId, id, createdAt, date, slot, role, personName]
export function rowToDuty(row: string[], expectedChantierId?: string): ChantierDuty | null {
  if (expectedChantierId && (row[0] ?? "") !== expectedChantierId) return null;
  const id = (row[1] ?? "").trim();
  if (!id) return null;
  return {
    id,
    createdAt: row[2] ?? "",
    date: row[3] ?? "",
    slot: (row[4] ?? "matin") as DutySlotKey,
    role: (row[5] ?? "courses") as DutyRole,
    personName: row[6] ?? "",
  };
}

export function dutyToRow(chantierId: string, d: ChantierDuty): unknown[] {
  return [chantierId, d.id, d.createdAt, d.date, d.slot, d.role, d.personName];
}

const ChantierRefInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listChantierDuties = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChantierRefInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, INTENDANCE_TAB, INTENDANCE_HEADERS, INTENDANCE_LAST_COL);
    const rows = await getRows(spreadsheetId, `${INTENDANCE_TAB}!A2:${INTENDANCE_LAST_COL}`);
    const duties = rows
      .map((r) => rowToDuty(r, data.chantierId))
      .filter((d): d is ChantierDuty => d !== null);
    return { duties };
  });

const ClaimInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["matin", "apres_midi"]),
  role: z.enum(["courses", "cuisine", "garde"]),
  personName: z.string().min(1).max(60),
});

export const claimChantierDuty = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ClaimInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, appendRow, batchMutateRows } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, INTENDANCE_TAB, INTENDANCE_HEADERS, INTENDANCE_LAST_COL);
    const allRows = await getRows(spreadsheetId, `${INTENDANCE_TAB}!A2:${INTENDANCE_LAST_COL}`);
    const absIndex = allRows.findIndex((r) => {
      const d = rowToDuty(r, data.chantierId);
      return d && d.date === data.date && d.slot === data.slot && d.role === data.role;
    });

    const duty: ChantierDuty = {
      id: absIndex === -1 ? crypto.randomUUID() : allRows[absIndex][1],
      createdAt: absIndex === -1 ? new Date().toISOString() : allRows[absIndex][2],
      date: data.date,
      slot: data.slot,
      role: data.role,
      personName: data.personName.trim(),
    };

    if (absIndex === -1) {
      await appendRow(
        spreadsheetId,
        `${INTENDANCE_TAB}!A:${INTENDANCE_LAST_COL}`,
        dutyToRow(data.chantierId, duty),
      );
    } else {
      await batchMutateRows(spreadsheetId, INTENDANCE_TAB, {
        updates: [
          {
            rowIndex0Based: absIndex,
            startColumn0Based: 3,
            values: [duty.date, duty.slot, duty.role, duty.personName],
          },
        ],
      });
    }
    return { ok: true as const, duty };
  });

const ClaimAllInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  role: z.enum(["courses", "cuisine", "garde"]),
  personName: z.string().min(1).max(60),
});

export const claimAllChantierDuty = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ClaimAllInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, appendRows } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, INTENDANCE_TAB, INTENDANCE_HEADERS, INTENDANCE_LAST_COL);
    const allRows = await getRows(spreadsheetId, `${INTENDANCE_TAB}!A2:${INTENDANCE_LAST_COL}`);
    const existing = allRows
      .map((r) => rowToDuty(r, data.chantierId))
      .filter((d): d is ChantierDuty => d !== null);

    const personName = data.personName.trim();
    const slots = DUTY_ROLE_SLOTS[data.role];
    const newDuties: ChantierDuty[] = [];
    for (const date of data.dates) {
      for (const slot of slots) {
        const taken = existing.some(
          (d) => d.date === date && d.slot === slot && d.role === data.role,
        );
        if (taken) continue;
        newDuties.push({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          date,
          slot,
          role: data.role,
          personName,
        });
      }
    }
    if (newDuties.length > 0) {
      await appendRows(
        spreadsheetId,
        `${INTENDANCE_TAB}!A:${INTENDANCE_LAST_COL}`,
        newDuties.map((d) => dutyToRow(data.chantierId, d)),
      );
    }
    return { ok: true as const, claimed: newDuties.length };
  });

const ReleaseInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["matin", "apres_midi"]),
  role: z.enum(["courses", "cuisine", "garde"]),
});

export const releaseChantierDuty = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReleaseInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, deleteRow } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, INTENDANCE_TAB, INTENDANCE_HEADERS, INTENDANCE_LAST_COL);
    const allRows = await getRows(spreadsheetId, `${INTENDANCE_TAB}!A2:${INTENDANCE_LAST_COL}`);
    const absIndex = allRows.findIndex((r) => {
      const d = rowToDuty(r, data.chantierId);
      return d && d.date === data.date && d.slot === data.slot && d.role === data.role;
    });
    if (absIndex === -1) return { ok: true as const };
    await deleteRow(spreadsheetId, INTENDANCE_TAB, absIndex);
    return { ok: true as const };
  });

const DutyDraftInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["matin", "apres_midi"]),
  role: z.enum(["courses", "cuisine", "garde"]),
  personName: z.string().min(1).max(60),
});

const SyncDutiesInput = ChantierRefInput.extend({
  initial: z.array(DutyDraftInput).max(100),
  current: z.array(DutyDraftInput).max(100),
});

function dutyKey(duty: Pick<ChantierDuty, "date" | "slot" | "role">) {
  return `${duty.date}:${duty.slot}:${duty.role}`;
}

export const syncChantierDuties = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SyncDutiesInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, batchMutateRows } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, INTENDANCE_TAB, INTENDANCE_HEADERS, INTENDANCE_LAST_COL);
    const allRows = await getRows(spreadsheetId, `${INTENDANCE_TAB}!A2:${INTENDANCE_LAST_COL}`);
    const live = allRows
      .map((row, absIdx) => ({ absIdx, duty: rowToDuty(row, data.chantierId) }))
      .filter((e): e is { absIdx: number; duty: ChantierDuty } => e.duty !== null);
    const liveByKey = new Map(live.map((e) => [dutyKey(e.duty), e]));
    const initialByKey = new Map(data.initial.map((d) => [dutyKey(d), d]));
    const currentByKey = new Map(data.current.map((d) => [dutyKey(d), d]));

    const deletes: number[] = [];
    const updates: Array<{ rowIndex0Based: number; startColumn0Based: number; values: unknown[] }> =
      [];
    const appends: unknown[][] = [];

    for (const [key, initialDuty] of initialByKey) {
      if (currentByKey.has(key)) continue;
      const liveEntry = liveByKey.get(key);
      if (!liveEntry) continue;
      if (liveEntry.duty.personName !== initialDuty.personName) {
        throw new Error(
          "Ce créneau vient d'être modifié par quelqu'un d'autre. Recharge la fiche.",
        );
      }
      deletes.push(liveEntry.absIdx);
    }

    for (const [key, currentDuty] of currentByKey) {
      const initialDuty = initialByKey.get(key);
      if (initialDuty?.personName === currentDuty.personName) continue;
      const liveEntry = liveByKey.get(key);
      if (liveEntry) {
        if (initialDuty && liveEntry.duty.personName !== initialDuty.personName) {
          throw new Error("Ce créneau vient d'être pris par quelqu'un d'autre. Recharge la fiche.");
        }
        if (!initialDuty && liveEntry.duty.personName !== currentDuty.personName) {
          throw new Error("Ce créneau vient d'être pris par quelqu'un d'autre. Recharge la fiche.");
        }
        // col D=3 : Date, Créneau, Rôle, Personne
        updates.push({
          rowIndex0Based: liveEntry.absIdx,
          startColumn0Based: 3,
          values: [
            currentDuty.date,
            currentDuty.slot,
            currentDuty.role,
            currentDuty.personName.trim(),
          ],
        });
      } else {
        appends.push(
          dutyToRow(data.chantierId, {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            ...currentDuty,
            personName: currentDuty.personName.trim(),
          }),
        );
      }
    }

    await batchMutateRows(spreadsheetId, INTENDANCE_TAB, { updates, deletes, appends });
    return { ok: true as const, changed: updates.length + deletes.length + appends.length };
  });
