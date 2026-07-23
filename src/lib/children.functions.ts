import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_CHILDREN_PER_MEMBER } from "../core/google/google.server";

// Les enfants d'un membre vivent sur SA ligne dans l'onglet Membres (paires
// de colonnes "Enfant N prénom"/"Enfant N naissance" à la suite des colonnes
// fixes A..I) — jamais de ligne à part, jamais d'id propre : identifiés par
// (parent, prénom).
export interface Child {
  firstName: string;
  birthday: string; // ISO YYYY-MM-DD
}

const CHILD_COLS_START = 10; // index 0-based : A=0 (ID) … J=9, donc K=10 (premier slot enfant).

function childSlots(row: string[]): (Child | null)[] {
  const slots: (Child | null)[] = [];
  for (let i = 0; i < MAX_CHILDREN_PER_MEMBER; i++) {
    const firstName = (row[CHILD_COLS_START + i * 2] ?? "").trim();
    const birthday = (row[CHILD_COLS_START + i * 2 + 1] ?? "").trim();
    slots.push(firstName ? { firstName, birthday } : null);
  }
  return slots;
}

/** Lettre de colonne A1 pour un index 0-based (0=A, 1=B, ..., 25=Z, 26=AA...). */
function colLetter(index0: number): string {
  let n = index0;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function norm(s: string): string {
  return s.trim().toLocaleLowerCase("fr-FR");
}

function findMemberRowIndex(rows: string[][], firstName: string, lastName: string): number {
  return rows.findIndex(
    (r) => norm(r[2] ?? "") === norm(firstName) && norm(r[3] ?? "") === norm(lastName),
  );
}

const ListInput = z.object({
  spreadsheetId: z.string().nullable(),
  parentFirstName: z.string().min(1).max(60),
  parentLastName: z.string().min(1).max(60),
});

export const listChildren = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, MEMBERS_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:V`);
    const rowIndex = findMemberRowIndex(rows, data.parentFirstName, data.parentLastName);
    if (rowIndex === -1) return { children: [] };
    const children = childSlots(rows[rowIndex]).filter((c): c is Child => c !== null);
    return { children };
  });

const AddInput = z.object({
  spreadsheetId: z.string().nullable(),
  parentFirstName: z.string().min(1).max(60),
  parentLastName: z.string().min(1).max(60),
  firstName: z.string().min(1).max(60),
  birthday: z.string().max(20),
});

export const addChild = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AddInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, updateRange, MEMBERS_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:V`);
    const rowIndex = findMemberRowIndex(rows, data.parentFirstName, data.parentLastName);
    if (rowIndex === -1) throw new Error("Fiche membre introuvable.");

    const slots = childSlots(rows[rowIndex]);
    const emptySlot = slots.findIndex((s) => s === null);
    if (emptySlot === -1) {
      throw new Error(`Limite de ${MAX_CHILDREN_PER_MEMBER} enfants enregistrés atteinte.`);
    }

    const firstColIndex = CHILD_COLS_START + emptySlot * 2;
    const sheetRow = rowIndex + 2; // +2 : en-tête ligne 1, index 0-based -> ligne 1-based.
    const range = `${MEMBERS_TAB}!${colLetter(firstColIndex)}${sheetRow}:${colLetter(firstColIndex + 1)}${sheetRow}`;
    const firstName = data.firstName.trim();
    const birthday = data.birthday.trim();
    try {
      await updateRange(spreadsheetId, range, [firstName, birthday]);
    } catch (error) {
      console.error("[addChild] échec updateRange (Sheets):", error);
      throw new Error(
        `Échec de l'écriture Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { ok: true as const, child: { firstName, birthday } };
  });

const DeleteInput = z.object({
  spreadsheetId: z.string().nullable(),
  parentFirstName: z.string().min(1).max(60),
  parentLastName: z.string().min(1).max(60),
  firstName: z.string().min(1).max(60),
});

export const deleteChild = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, updateRange, MEMBERS_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:V`);
    const rowIndex = findMemberRowIndex(rows, data.parentFirstName, data.parentLastName);
    if (rowIndex === -1) throw new Error("Fiche membre introuvable.");

    const slots = childSlots(rows[rowIndex]);
    const targetSlot = slots.findIndex(
      (s) => s !== null && norm(s.firstName) === norm(data.firstName),
    );
    if (targetSlot === -1) throw new Error("Enfant introuvable.");

    // Compacte les slots restants vers le début pour ne pas laisser de trou
    // au milieu (le prochain ajout doit toujours viser le premier slot libre).
    const remaining = slots.filter((_, i) => i !== targetSlot);
    while (remaining.length < MAX_CHILDREN_PER_MEMBER) remaining.push(null);

    const sheetRow = rowIndex + 2;
    const lastColIndex = CHILD_COLS_START + MAX_CHILDREN_PER_MEMBER * 2 - 1;
    const range = `${MEMBERS_TAB}!${colLetter(CHILD_COLS_START)}${sheetRow}:${colLetter(lastColIndex)}${sheetRow}`;
    const values = remaining.flatMap((s) => [s?.firstName ?? "", s?.birthday ?? ""]);
    try {
      await updateRange(spreadsheetId, range, values);
    } catch (error) {
      console.error("[deleteChild] échec updateRange (Sheets):", error);
      throw new Error(
        `Échec de la suppression Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { ok: true as const };
  });
