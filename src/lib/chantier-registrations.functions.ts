import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MEAL_PRICE_PER_ADULT, ASSO_CHANTIER_DAILY_REDUCTION } from "./pricing";
import {
  type ChantierDuty,
  type DutyRole,
  type DutySlotKey,
  rowToDuty,
  dutyToRow,
} from "./chantier-duties.functions";

// Onglet partagé "Inscriptions" — col A=ID Chantier, B=ID, C=Créé le, D=Groupe ID,
// E=Nom, F=Inscrit par, G=Type, H=Mode, I=Membre asso, J=Repas, K=Annulé le
export type RegistrationPersonType = "member" | "child" | "guest_adult" | "guest_child";
export type RegistrationMode = "chantier" | "teletravail" | "woofer";
export type MealType = "dejeuner" | "diner";

export const REGISTRATION_MODE_LABEL: Record<RegistrationMode, string> = {
  chantier: "Chantier",
  teletravail: "Télétravail",
  woofer: "Woofer",
};

export interface AttendedMeal {
  date: string; // YYYY-MM-DD
  meal: MealType;
}

export interface ChantierRegistrationPerson {
  id: string;
  createdAt: string;
  groupId: string;
  registeredBy: string;
  personName: string;
  personType: RegistrationPersonType;
  meals: AttendedMeal[];
  mode: RegistrationMode | "";
  isAssoMember: boolean;
  cancelledAt: string | null;
}

export interface PersonPricing {
  meals: number;
  mealCost: number;
  reduction: number;
  net: number;
}

export interface ChantierRegistrationPersonWithPricing extends ChantierRegistrationPerson {
  pricing: PersonPricing;
}

export function isChildType(t: RegistrationPersonType): boolean {
  return t === "child" || t === "guest_child";
}

function serializeMeals(meals: AttendedMeal[]): string {
  return meals.map((m) => `${m.date}:${m.meal}`).join(",");
}

function parseMeals(raw: string): AttendedMeal[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((token) => {
      const [date, meal] = token.split(":");
      if (!date || (meal !== "dejeuner" && meal !== "diner")) return null;
      return { date, meal: meal as MealType };
    })
    .filter((m): m is AttendedMeal => m !== null);
}

/**
 * Coût repas + réduction pour une personne : les enfants mangent gratuitement
 * (voir pricing.ts), les woofers aussi (repas offerts, pas de cotisation),
 * seul le mode "chantier" chez un membre Asso ouvre droit à la réduction de
 * 10€/jour de chantier effectué (jamais le télétravail, jamais un woofer).
 * Le nombre de repas vient directement des cases cochées (pas d'estimation
 * depuis des dates d'arrivée/départ) — la réduction se compte par jour
 * distinct où au moins un repas est coché.
 */
export function computePersonPricing(p: {
  personType: RegistrationPersonType;
  mode: RegistrationMode | "";
  isAssoMember: boolean;
  meals: AttendedMeal[];
}): PersonPricing {
  const mealsCount = p.meals.length;
  // Un enfant mange bien (utile pour prévoir les courses), juste gratuitement.
  if (isChildType(p.personType)) return { meals: mealsCount, mealCost: 0, reduction: 0, net: 0 };
  const mealCost = p.mode === "woofer" ? 0 : mealsCount * MEAL_PRICE_PER_ADULT;
  const distinctDays = new Set(p.meals.map((m) => m.date)).size;
  const reduction =
    p.mode === "chantier" && p.isAssoMember ? distinctDays * ASSO_CHANTIER_DAILY_REDUCTION : 0;
  return { meals: mealsCount, mealCost, reduction, net: Math.max(0, mealCost - reduction) };
}

function rowToPerson(row: string[], chantierId: string): ChantierRegistrationPerson | null {
  if ((row[0] ?? "") !== chantierId) return null;
  const id = (row[1] ?? "").trim();
  if (!id) return null;
  return {
    id,
    createdAt: row[2] ?? "",
    groupId: row[3] ?? "",
    personName: row[4] ?? "",
    registeredBy: row[5] ?? "",
    personType: (row[6] ?? "member") as RegistrationPersonType,
    mode: (row[7] ?? "") as RegistrationMode | "",
    isAssoMember: (row[8] ?? "").trim().toLocaleLowerCase("fr-FR") === "oui",
    meals: parseMeals(row[9] ?? ""),
    cancelledAt: row[10] || null,
  };
}

function personToRow(chantierId: string, p: ChantierRegistrationPerson): unknown[] {
  return [
    chantierId,
    p.id,
    p.createdAt,
    p.groupId,
    p.personName,
    p.registeredBy,
    p.personType,
    p.mode,
    p.isAssoMember ? "Oui" : "Non",
    serializeMeals(p.meals),
    p.cancelledAt ?? "",
  ];
}

const MealInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: z.enum(["dejeuner", "diner"]),
});

const PersonInput = z.object({
  name: z.string().min(1).max(60),
  personType: z.enum(["member", "child", "guest_adult", "guest_child"]),
  mode: z.enum(["chantier", "teletravail", "woofer"]).optional(),
  isAssoMember: z.boolean().optional(),
  meals: z.array(MealInput).max(60),
});

async function assertChantierEditable(chantierId: string): Promise<void> {
  const { fetchAllChantiers } = await import("./chantier.functions");
  const now = new Date();
  const min = new Date(now);
  min.setFullYear(min.getFullYear() - 1);
  const max = new Date(now);
  max.setFullYear(max.getFullYear() + 2);
  const chantiers = await fetchAllChantiers(min.toISOString(), max.toISOString());
  const chantier = chantiers.find((c) => c.id === chantierId);
  if (!chantier) throw new Error("Chantier introuvable.");
  const todayIso = new Date().toISOString().slice(0, 10);
  if (chantier.endDate < todayIso) {
    throw new Error("Ce chantier est déjà terminé, l'inscription n'est plus modifiable.");
  }
}

const ChantierRefInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listChantierRegistrations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChantierRefInput.parse(d))
  .handler(async ({ data }) => {
    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      getRows,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(
      spreadsheetId,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
    );
    const rows = await getRows(spreadsheetId, `${INSCRIPTIONS_TAB}!A2:${INSCRIPTION_LAST_COL}`);
    const people = rows
      .map((r) => rowToPerson(r, data.chantierId))
      .filter((p): p is ChantierRegistrationPerson => p !== null && !p.cancelledAt);

    const withPricing: ChantierRegistrationPersonWithPricing[] = people.map((p) => ({
      ...p,
      pricing: computePersonPricing(p),
    }));

    const adults = withPricing.filter((p) => !isChildType(p.personType)).length;
    const children = withPricing.filter((p) => isChildType(p.personType)).length;
    const totalMealCost = withPricing.reduce((sum, p) => sum + p.pricing.mealCost, 0);
    const totalReduction = withPricing.reduce((sum, p) => sum + p.pricing.reduction, 0);

    const groups = new Map<string, ChantierRegistrationPersonWithPricing[]>();
    for (const p of withPricing) {
      if (!groups.has(p.groupId)) groups.set(p.groupId, []);
      groups.get(p.groupId)!.push(p);
    }

    return {
      people: withPricing,
      groups: [...groups.entries()].map(([groupId, members]) => ({ groupId, members })),
      totals: { adults, children, totalMealCost, totalReduction },
    };
  });

const CreateInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  registeredBy: z.string().min(1).max(60),
  people: z.array(PersonInput).min(1).max(20),
});

export const createChantierRegistration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    await assertChantierEditable(data.chantierId);

    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      appendRows,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(
      spreadsheetId,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
    );

    const groupId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const persons: ChantierRegistrationPerson[] = data.people.map((p) => ({
      id: crypto.randomUUID(),
      createdAt,
      groupId,
      registeredBy: data.registeredBy,
      personName: p.name.trim(),
      personType: p.personType,
      meals: p.meals,
      mode: isChildType(p.personType) ? "" : (p.mode ?? "chantier"),
      isAssoMember: isChildType(p.personType) ? false : (p.isAssoMember ?? false),
      cancelledAt: null,
    }));

    try {
      await appendRows(
        spreadsheetId,
        `${INSCRIPTIONS_TAB}!A:${INSCRIPTION_LAST_COL}`,
        persons.map((p) => personToRow(data.chantierId, p)),
      );
    } catch (error) {
      console.error("[createChantierRegistration] échec appendRows (Sheets):", error);
      throw new Error(
        `Échec de l'écriture Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { ok: true as const, groupId };
  });

const UpdateInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupId: z.string().min(1),
  registeredBy: z.string().min(1).max(60),
  people: z.array(PersonInput).min(1).max(20),
});

export const updateChantierRegistration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data }) => {
    await assertChantierEditable(data.chantierId);

    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      getRows,
      batchMutateRows,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(
      spreadsheetId,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
    );

    const allRows = await getRows(spreadsheetId, `${INSCRIPTIONS_TAB}!A2:${INSCRIPTION_LAST_COL}`);
    const toDelete = allRows
      .map((row, absIdx) => ({ absIdx, person: rowToPerson(row, data.chantierId) }))
      .filter((x) => x.person && x.person.groupId === data.groupId)
      .sort((a, b) => b.absIdx - a.absIdx)
      .map((x) => x.absIdx);

    const createdAt = new Date().toISOString();
    const newPersons: ChantierRegistrationPerson[] = data.people.map((p) => ({
      id: crypto.randomUUID(),
      createdAt,
      groupId: data.groupId,
      registeredBy: data.registeredBy,
      personName: p.name.trim(),
      personType: p.personType,
      meals: p.meals,
      mode: isChildType(p.personType) ? "" : (p.mode ?? "chantier"),
      isAssoMember: isChildType(p.personType) ? false : (p.isAssoMember ?? false),
      cancelledAt: null,
    }));

    try {
      await batchMutateRows(spreadsheetId, INSCRIPTIONS_TAB, {
        deletes: toDelete,
        appends: newPersons.map((p) => personToRow(data.chantierId, p)),
      });
    } catch (error) {
      console.error("[updateChantierRegistration] échec batchMutateRows (Sheets):", error);
      throw new Error(
        `Échec de la mise à jour Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { ok: true as const };
  });

const CancelInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupId: z.string().min(1),
});

export const cancelChantierRegistration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CancelInput.parse(d))
  .handler(async ({ data }) => {
    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      getRows,
      batchUpdateRanges,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(
      spreadsheetId,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
    );
    const allRows = await getRows(spreadsheetId, `${INSCRIPTIONS_TAB}!A2:${INSCRIPTION_LAST_COL}`);
    const cancelledAt = new Date().toISOString();
    const updates: Array<{ range: string; row: unknown[] }> = [];
    for (let i = 0; i < allRows.length; i++) {
      const person = rowToPerson(allRows[i], data.chantierId);
      if (!person || person.groupId !== data.groupId) continue;
      const sheetRow = i + 2;
      // col K (index 10) = Annulé le
      updates.push({ range: `${INSCRIPTIONS_TAB}!K${sheetRow}`, row: [cancelledAt] });
    }
    if (updates.length === 0) throw new Error("Inscription introuvable.");
    await batchUpdateRanges(spreadsheetId, updates);
    return { ok: true as const };
  });

const DutyDraftInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["matin", "apres_midi"]),
  role: z.enum(["courses", "cuisine", "garde"]),
  personName: z.string().min(1).max(60),
});

const SaveParticipationInput = CreateInput.extend({
  groupId: z.string().min(1).optional(),
  initialDuties: z.array(DutyDraftInput).max(100).default([]),
  currentDuties: z.array(DutyDraftInput).max(100).default([]),
});

function chantierDutyKey(duty: Pick<ChantierDuty, "date" | "slot" | "role">) {
  return `${duty.date}:${duty.slot}:${duty.role}`;
}

export const saveChantierParticipation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SaveParticipationInput.parse(d))
  .handler(async ({ data }) => {
    await assertChantierEditable(data.chantierId);
    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      getRows,
      batchMutateRows,
      INSCRIPTIONS_TAB,
      INSCRIPTION_HEADERS,
      INSCRIPTION_LAST_COL,
      INTENDANCE_TAB,
      INTENDANCE_HEADERS,
      INTENDANCE_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await Promise.all([
      ensureTabExists(spreadsheetId, INSCRIPTIONS_TAB, INSCRIPTION_HEADERS, INSCRIPTION_LAST_COL),
      ensureTabExists(spreadsheetId, INTENDANCE_TAB, INTENDANCE_HEADERS, INTENDANCE_LAST_COL),
    ]);

    const [inscRows, intRows] = await Promise.all([
      getRows(spreadsheetId, `${INSCRIPTIONS_TAB}!A2:${INSCRIPTION_LAST_COL}`),
      getRows(spreadsheetId, `${INTENDANCE_TAB}!A2:${INTENDANCE_LAST_COL}`),
    ]);

    const groupId = data.groupId ?? crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Registrations
    const regDeletes = data.groupId
      ? inscRows
          .map((row, absIdx) => ({ absIdx, person: rowToPerson(row, data.chantierId) }))
          .filter((x) => x.person?.groupId === data.groupId)
          .map((x) => x.absIdx)
      : [];
    const regAppends = data.people.map((person) =>
      personToRow(data.chantierId, {
        id: crypto.randomUUID(),
        createdAt,
        groupId,
        registeredBy: data.registeredBy,
        personName: person.name.trim(),
        personType: person.personType,
        meals: person.meals,
        mode: isChildType(person.personType) ? "" : (person.mode ?? "chantier"),
        isAssoMember: isChildType(person.personType) ? false : (person.isAssoMember ?? false),
        cancelledAt: null,
      }),
    );

    // Duties (onglet INTENDANCE_TAB séparé)
    const liveDuties = intRows
      .map((row, absIdx) => ({ absIdx, duty: rowToDuty(row, data.chantierId) }))
      .filter((e): e is { absIdx: number; duty: ChantierDuty } => e.duty !== null);
    const liveByKey = new Map(liveDuties.map((e) => [chantierDutyKey(e.duty), e]));
    const initialByKey = new Map(data.initialDuties.map((d) => [chantierDutyKey(d), d]));
    const currentByKey = new Map(data.currentDuties.map((d) => [chantierDutyKey(d), d]));

    const dutyDeletes: number[] = [];
    const dutyUpdates: Array<{
      rowIndex0Based: number;
      startColumn0Based: number;
      values: unknown[];
    }> = [];
    const dutyAppends: unknown[][] = [];

    for (const [key, initialDuty] of initialByKey) {
      if (currentByKey.has(key)) continue;
      const liveEntry = liveByKey.get(key);
      if (!liveEntry) continue;
      if (liveEntry.duty.personName !== initialDuty.personName) {
        throw new Error("Un créneau d’intendance vient d’être modifié. Recharge la fiche.");
      }
      dutyDeletes.push(liveEntry.absIdx);
    }

    for (const [key, currentDuty] of currentByKey) {
      const initialDuty = initialByKey.get(key);
      if (initialDuty?.personName === currentDuty.personName) continue;
      const liveEntry = liveByKey.get(key);
      if (liveEntry) {
        if (!initialDuty || liveEntry.duty.personName !== initialDuty.personName) {
          if (liveEntry.duty.personName !== currentDuty.personName) {
            throw new Error("Un créneau d’intendance vient d’être pris. Recharge la fiche.");
          }
          continue;
        }
        // col D=3 : Date, Créneau, Rôle, Personne
        dutyUpdates.push({
          rowIndex0Based: liveEntry.absIdx,
          startColumn0Based: 3,
          values: [
            currentDuty.date,
            currentDuty.slot as DutySlotKey,
            currentDuty.role as DutyRole,
            currentDuty.personName.trim(),
          ],
        });
      } else {
        dutyAppends.push(
          dutyToRow(data.chantierId, {
            id: crypto.randomUUID(),
            createdAt,
            date: currentDuty.date,
            slot: currentDuty.slot,
            role: currentDuty.role,
            personName: currentDuty.personName.trim(),
          }),
        );
      }
    }

    await batchMutateRows(spreadsheetId, INSCRIPTIONS_TAB, {
      deletes: regDeletes,
      appends: regAppends,
    });
    if (dutyUpdates.length || dutyDeletes.length || dutyAppends.length) {
      await batchMutateRows(spreadsheetId, INTENDANCE_TAB, {
        updates: dutyUpdates,
        deletes: dutyDeletes,
        appends: dutyAppends,
      });
    }
    return { ok: true as const, groupId };
  });
