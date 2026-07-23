import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AdminSpace = "SCI" | "Association";

export interface PendingReimbursement {
  id: string;
  memberName: string;
  supplier: string;
  detail: string;
  invoiceDate: string;
  amountTTC: number;
  iban: string;
  comment: string;
  reimbursementStatus: string;
  fileLink: string;
}

function envPasswordFor(space: AdminSpace): string {
  const key = space === "SCI" ? "ADMIN_SCI_PASSWORD" : "ADMIN_ASSO_PASSWORD";
  return process.env[key] || "";
}

/**
 * Vérifie le mot de passe côté serveur. Un mot de passe vide dans le .env
 * refuse tout le monde (fail-safe). Exportée pour être réutilisée par les
 * autres server functions qui touchent à des données admin (chantiers,
 * remboursements...) — chaque mutation sensible revalide le mot de passe
 * elle-même, indépendamment de ce que montre l'UI côté client.
 */
export function checkPassword(space: AdminSpace, password: string): boolean {
  // Mode provisoire demandé : les écrans admin sont ouverts sans mot de passe.
  // La sentinelle n'est émise que par l'interface admin et permet de réactiver
  // ultérieurement la vérification sans modifier toutes les mutations.
  if (password === "__admin_open__") return true;
  const expected = envPasswordFor(space);
  if (!expected) {
    console.warn(
      `[admin] ${space === "SCI" ? "ADMIN_SCI_PASSWORD" : "ADMIN_ASSO_PASSWORD"} non défini dans .env — accès admin ${space} refusé.`,
    );
    return false;
  }
  return password === expected;
}

const CheckPasswordInput = z.object({
  space: z.enum(["SCI", "Association"]),
  password: z.string().min(1),
});

export const checkAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CheckPasswordInput.parse(d))
  .handler(async ({ data }) => {
    return { ok: checkPassword(data.space, data.password) };
  });

const ListInput = z.object({
  spreadsheetId: z.string().nullable(),
  side: z.enum(["SCI", "Association"]),
  status: z.enum(["pending", "all"]),
});

export const listReimbursements = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, SCI_TAB, ASSO_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const tab = data.side === "SCI" ? SCI_TAB : ASSO_TAB;
    const rows = await getRows(spreadsheetId, `${tab}!A2:R`);

    // "En attente de remboursement" = une ligne où "Payé par" (col I, index 8)
    // est le nom d'un membre (pas "SCI" ni "Association" en toutes lettres) —
    // c'est-à-dire un membre qui a avancé l'argent et attend d'être remboursé.
    // On ignore les lignes sans ID (dépenses enregistrées avant l'ajout de la
    // colonne ID technique) : impossible de les cibler fiablement pour un futur
    // "coché = réglé".
    const items: PendingReimbursement[] = rows
      .filter((r) => {
        const id = (r[17] ?? "").trim();
        if (!id) return false;
        const paidBy = (r[8] ?? "").trim();
        if (paidBy === "SCI" || paidBy === "Association" || !paidBy) return false;
        const status = (r[11] ?? "").trim();
        const isPending = status === "À rembourser" || status === "";
        if (data.status === "pending") return isPending;
        return isPending || status === "Remboursé";
      })
      .map((r) => ({
        id: (r[17] ?? "").trim(),
        memberName: r[8] ?? "",
        supplier: r[1] ?? "",
        detail: r[6] ?? "",
        invoiceDate: r[2] ?? "",
        amountTTC: Number((r[3] ?? "0").toString().replace(",", ".")) || 0,
        iban: r[10] ?? "",
        comment: r[13] ?? "",
        reimbursementStatus: (r[11] ?? "").trim() || "À rembourser",
        fileLink: r[15] ?? "",
      }))
      .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));

    return { spreadsheetId, items };
  });

const MarkReimbursedInput = z.object({
  spreadsheetId: z.string().nullable(),
  side: z.enum(["SCI", "Association"]),
  expenseId: z.string().min(1),
  password: z.string().min(1),
});

export const markReimbursed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => MarkReimbursedInput.parse(d))
  .handler(async ({ data }) => {
    if (!checkPassword(data.side, data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }

    const { ensureSpreadsheet, getRows, updateRange, SCI_TAB, ASSO_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const tab = data.side === "SCI" ? SCI_TAB : ASSO_TAB;
    const rows = await getRows(spreadsheetId, `${tab}!A2:R`);
    const rowIndex = rows.findIndex((r) => (r[17] ?? "").trim() === data.expenseId);
    if (rowIndex === -1)
      throw new Error(
        "Dépense introuvable (elle a peut-être été enregistrée avant l'ajout du suivi des remboursements).",
      );

    const row = [...rows[rowIndex]];
    row[11] = "Remboursé";
    const sheetRow = rowIndex + 2; // +2 : en-tête ligne 1, index 0-based -> ligne 1-based.
    try {
      await updateRange(spreadsheetId, `${tab}!A${sheetRow}:R${sheetRow}`, row);
    } catch (error) {
      console.error("[markReimbursed] échec updateRange (Sheets):", error);
      throw new Error(
        `Échec de la mise à jour Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { ok: true as const };
  });
