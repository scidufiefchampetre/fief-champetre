import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  CHANTIER_TAB_HEADERS,
  CHANTIER_TAB_LAST_COL,
  chantierTabTitle,
  emptyChantierRow,
} from "./chantier-types";

const ExpensePayload = z.object({
  supplier: z.string(),
  invoiceDate: z.string(),
  amountTTC: z.number(),
  vat: z.number().nullable(),
  detectedObject: z.string(),
  topCategory: z.string(),
  purchaseDetail: z.string(),
  place: z.string(),
  paidBy: z.string(),
  memberName: z.string().optional().nullable(),
  paymentMethod: z.string(),
  ribAvailable: z.boolean().optional().nullable(),
  reimbursementStatus: z.string().optional().nullable(),
  reimbursementSide: z.string().optional().nullable(),
  finalSide: z.string(),
  comment: z.string(),
  chantierId: z.string().optional(),
  chantierStartDate: z.string().optional(),
  chantierLabel: z.string().optional(),
});

const InputSchema = z.object({
  expense: ExpensePayload,
  file: z.object({
    name: z.string(),
    mimeType: z.string(),
    dataBase64: z.string(),
  }),
  spreadsheetId: z.string().nullable(),
  personalNote: z.string().optional().nullable(),
  memberIban: z.string().optional().nullable(),
  depositor: z.object({ firstName: z.string(), lastName: z.string() }).nullable().optional(),
});

export const exportExpense = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const {
      ensureDriveFolder,
      ensureSpreadsheet,
      ensureChantiersSpreadsheet,
      ensureTabExists,
      uploadFileToDrive,
      appendRow,
      deleteDriveFile,
      deleteRow,
      getRows,
      tabForSide,
    } = await import("../core/google/google.server");

    const e = data.expense;
    if (e.topCategory === "Repas chantier" && (!e.chantierId || !e.chantierStartDate)) {
      throw new Error("Choisis le chantier associé à cette facture.");
    }
    if (e.chantierId && !e.finalSide.toLowerCase().includes("asso")) {
      throw new Error("Une facture liée à un chantier doit être enregistrée côté Association.");
    }

    const isAsso = data.expense.finalSide?.toLowerCase().includes("asso");
    const sideSlug: "Asso" | "SCI" = isAsso ? "Asso" : "SCI";

    const [targetFolderId, spreadsheetId] = await Promise.all([
      ensureDriveFolder(sideSlug),
      ensureSpreadsheet(data.spreadsheetId),
    ]);

    // Nomenclature: AAAA-MM-JJ_Objet.ext — le dossier (SCI/Asso) porte déjà le contexte.
    const slug = (s: string) =>
      (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "sans-objet";
    const dateSlug = (() => {
      const d = data.expense.invoiceDate;
      if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
      const m = d && d.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      return new Date().toISOString().slice(0, 10);
    })();
    const objetSlug = slug(
      data.expense.detectedObject || data.expense.purchaseDetail || data.expense.supplier,
    );
    const extMatch = data.file.name.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch
      ? extMatch[0].toLowerCase()
      : data.file.mimeType === "application/pdf"
        ? ".pdf"
        : data.file.mimeType.startsWith("image/")
          ? "." + data.file.mimeType.split("/")[1]
          : "";
    const id = crypto.randomUUID();
    const renamedFile = {
      ...data.file,
      name: [dateSlug, objetSlug, id.slice(0, 8)].filter(Boolean).join("_") + ext,
    };
    const uploaded = await uploadFileToDrive(targetFolderId, renamedFile);
    const depositor = data.depositor
      ? `${data.depositor.firstName} ${data.depositor.lastName}`.trim()
      : "";
    const memberFullName = e.memberName?.trim() ?? "";
    const paidByLabel = e.paidBy === "Membre" && memberFullName ? memberFullName : e.paidBy;
    const memberIban = e.paidBy === "Membre" ? (data.memberIban ?? "").replace(/\s+/g, "") : "";
    const personalNote = (data.personalNote ?? "").trim();
    const row = [
      new Date().toISOString(), // A
      e.supplier,               // B
      e.invoiceDate,            // C
      e.amountTTC,              // D
      e.vat ?? "",              // E
      e.topCategory,            // F
      e.purchaseDetail,         // G
      e.place,                  // H
      paidByLabel,              // I
      e.paymentMethod,          // J
      memberIban,               // K
      e.reimbursementStatus ?? (e.paidBy === "Membre" ? "À rembourser" : ""), // L
      e.reimbursementSide ?? "", // M
      e.comment,                // N
      personalNote,             // O
      uploaded.webViewLink,     // P
      depositor,                // Q
      id,                       // R — ID unique facture
      e.chantierId ?? "",       // S
      e.chantierStartDate ?? "", // T
      e.chantierLabel ?? "",    // U
      uploaded.id,              // V — Drive file ID (pour suppression)
    ];
    const tab = tabForSide(e.finalSide);
    let mainRowWritten = false;
    try {
      await appendRow(spreadsheetId, `${tab}!A:V`, row);
      mainRowWritten = true;

      if (e.chantierId && e.chantierStartDate) {
        const chantiersSpreadsheetId = await ensureChantiersSpreadsheet(null);
        const chantierTab = chantierTabTitle(e.chantierId, e.chantierStartDate);
        await ensureTabExists(
          chantiersSpreadsheetId,
          chantierTab,
          CHANTIER_TAB_HEADERS,
          CHANTIER_TAB_LAST_COL,
        );
        const chantierRow = emptyChantierRow();
        chantierRow[0] = "depense";
        chantierRow[1] = id;
        chantierRow[2] = new Date().toISOString();
        chantierRow[24] = id;
        chantierRow[25] = e.invoiceDate;
        chantierRow[26] = e.supplier;
        chantierRow[27] = String(e.amountTTC);
        chantierRow[28] = uploaded.webViewLink;
        chantierRow[29] = depositor;
        chantierRow[30] = e.topCategory;
        const safeTab = `'${chantierTab.replace(/'/g, "''")}'`;
        await appendRow(
          chantiersSpreadsheetId,
          `${safeTab}!A:${CHANTIER_TAB_LAST_COL}`,
          chantierRow,
        );
      }
    } catch (error) {
      if (mainRowWritten) {
        try {
          const rows = await getRows(spreadsheetId, `${tab}!A2:V`);
          const rowIndex = rows.findIndex((candidate) => candidate[17] === id);
          if (rowIndex >= 0) await deleteRow(spreadsheetId, tab, rowIndex);
        } catch (rollbackError) {
          console.error("[exportExpense] rollback de la ligne de dépense échoué:", rollbackError);
        }
      }
      try {
        await deleteDriveFile(uploaded.id);
      } catch (rollbackError) {
        console.error("[exportExpense] rollback du fichier Drive échoué:", rollbackError);
      }
      throw error;
    }

    return {
      spreadsheetId,
      fileLink: uploaded.webViewLink,
      tab,
      id,
    };
  });

const DeleteExpenseInput = z.object({
  spreadsheetId: z.string().nullable(),
  side: z.enum(["SCI", "Association"]),
  expenseId: z.string().min(1),
  password: z.string().min(1),
});

export const deleteExpense = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DeleteExpenseInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword(data.side, data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }

    const {
      ensureSpreadsheet,
      ensureChantiersSpreadsheet,
      getRows,
      deleteRow,
      deleteDriveFile,
      SCI_TAB,
      ASSO_TAB,
    } = await import("../core/google/google.server");
    const { CHANTIER_TAB_LAST_COL } = await import("./chantier-types");

    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const tab = data.side === "SCI" ? SCI_TAB : ASSO_TAB;
    const rows = await getRows(spreadsheetId, `${tab}!A2:V`);
    const rowIndex = rows.findIndex((r) => (r[17] ?? "").trim() === data.expenseId);
    if (rowIndex === -1) throw new Error("Facture introuvable.");

    const row = rows[rowIndex];
    const driveFileId = (row[21] ?? "").trim(); // col V
    const chantierId = (row[18] ?? "").trim();   // col S
    const chantierStartDate = (row[19] ?? "").trim(); // col T

    // 1. Supprimer la ligne principale
    await deleteRow(spreadsheetId, tab, rowIndex);

    // 2. Supprimer le fichier Drive si on a l'ID
    if (driveFileId) {
      try {
        await deleteDriveFile(driveFileId);
      } catch (e) {
        console.error("[deleteExpense] échec suppression Drive:", e);
      }
    }

    // 3. Supprimer la ligne dans l'onglet chantier si lié
    if (chantierId && chantierStartDate) {
      try {
        const { chantierTabTitle } = await import("./chantier-types");
        const cSpreadsheetId = await ensureChantiersSpreadsheet(null);
        const chantierTab = chantierTabTitle(chantierId, chantierStartDate);
        const safeTab = `'${chantierTab.replace(/'/g, "''")}'`;
        const cRows = await getRows(cSpreadsheetId, `${safeTab}!A2:${CHANTIER_TAB_LAST_COL}`);
        const cRowIndex = cRows.findIndex((r) => (r[24] ?? "").trim() === data.expenseId);
        if (cRowIndex !== -1) {
          await deleteRow(cSpreadsheetId, chantierTab, cRowIndex);
        }
      } catch (e) {
        console.error("[deleteExpense] échec suppression onglet chantier:", e);
      }
    }

    return { ok: true as const };
  });
