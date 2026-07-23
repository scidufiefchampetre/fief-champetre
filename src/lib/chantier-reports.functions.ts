import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Backlog de signalements/propositions de tâches pour les chantiers, alimenté
// par tous les membres. L'admin Asso pioche dedans quand il crée les tâches
// d'un nouveau week-end chantier (voir chantier.$id.tsx), ce qui marque le
// signalement "planifie" et le lie au chantier choisi.
export type ReportCategory = "tache" | "dysfonctionnement" | "casse";
export type ReportUrgency = "tres_urgent" | "urgent" | "important" | "must_have";
export type ReportStatus = "ouvert" | "planifie";

export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  tache: "Tâche à faire",
  dysfonctionnement: "Dysfonctionnement",
  casse: "Casse",
};

export const REPORT_URGENCY_LABEL: Record<ReportUrgency, string> = {
  tres_urgent: "Très urgent",
  urgent: "Urgent",
  important: "Important",
  must_have: "Must have",
};

export const REPORT_URGENCY_SUBLABEL: Record<ReportUrgency, string> = {
  tres_urgent: "Avant le prochain WE chantier",
  urgent: "Au prochain WE chantier",
  important: "Dès que possible",
  must_have: "Un jour",
};

const URGENCY_ORDER: Record<ReportUrgency, number> = {
  tres_urgent: 0,
  urgent: 1,
  important: 2,
  must_have: 3,
};

export interface ChantierReport {
  id: string;
  createdAt: string;
  reportedBy: string;
  title: string;
  category: ReportCategory;
  location: string;
  timeEstimate: string;
  personDaysEstimate: number | null;
  budgetEstimate: number | null;
  description: string;
  urgency: ReportUrgency;
  status: ReportStatus;
  linkedChantierId: string;
  photoUrl: string;
}

const REPORTS_TAB = "Tâches chantier";
const REPORTS_HEADERS = [
  "ID",
  "Créé le",
  "Nom",
  "Catégorie",
  "Lieu",
  "Temps estimé",
  "Jours-homme estimés",
  "Budget estimé",
  "Description",
  "Urgence",
  "Statut",
  "Chantier ID lié",
  "Photo",
  "Titre tâche",
];

function rowToReport(row: string[]): ChantierReport | null {
  const id = (row[0] ?? "").trim();
  if (!id) return null;
  const personDays = (row[6] ?? "").trim();
  const budget = (row[7] ?? "").trim();
  return {
    id,
    createdAt: row[1] ?? "",
    reportedBy: row[2] ?? "",
    category: (row[3] ?? "tache") as ReportCategory,
    location: row[4] ?? "",
    timeEstimate: row[5] ?? "",
    personDaysEstimate: personDays ? Number(personDays.replace(",", ".")) : null,
    budgetEstimate: budget ? Number(budget.replace(",", ".")) : null,
    description: row[8] ?? "",
    urgency: (row[9] ?? "important") as ReportUrgency,
    status: (row[10] ?? "ouvert") as ReportStatus,
    linkedChantierId: row[11] ?? "",
    photoUrl: row[12] ?? "",
    title: (row[13] ?? "").trim(),
  };
}

function reportToRow(r: ChantierReport): unknown[] {
  return [
    r.id,
    r.createdAt,
    r.reportedBy,
    r.category,
    r.location,
    r.timeEstimate,
    r.personDaysEstimate ?? "",
    r.budgetEstimate ?? "",
    r.description,
    r.urgency,
    r.status,
    r.linkedChantierId,
    r.photoUrl,
    r.title,
  ];
}

const ReportInput = z.object({
  reportedBy: z.string().min(1).max(60),
  title: z.string().min(1).max(120),
  category: z.enum(["tache", "dysfonctionnement", "casse"]),
  location: z.string().min(1).max(200),
  timeEstimate: z.string().max(100).optional(),
  personDaysEstimate: z.number().min(0).max(365).optional(),
  budgetEstimate: z.number().min(0).max(1_000_000).optional(),
  description: z.string().max(2000).optional(),
  urgency: z.enum(["tres_urgent", "urgent", "important", "must_have"]),
  photo: z
    .object({
      name: z.string().min(1).max(180),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
      dataBase64: z.string().min(1).max(12_000_000),
    })
    .optional(),
});

export const reportChantierIssue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReportInput.parse(d))
  .handler(async ({ data }) => {
    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      appendRow,
      ensureDriveFolder,
      ensureDriveSubfolder,
      uploadFileToDrive,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, REPORTS_TAB, REPORTS_HEADERS, "N");

    const createdAt = new Date().toISOString();
    let photoUrl = "";
    if (data.photo) {
      const rootFolderId = await ensureDriveFolder("Asso");
      const reportsFolderId = await ensureDriveSubfolder(rootFolderId, "Tâches chantier");
      const extension = data.photo.mimeType.includes("png")
        ? "png"
        : data.photo.mimeType.includes("webp")
          ? "webp"
          : data.photo.mimeType.includes("hei")
            ? "heic"
            : "jpg";
      const safeLocation =
        data.location
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "signalement";
      const uploaded = await uploadFileToDrive(reportsFolderId, {
        name: `${createdAt.slice(0, 10)}-${safeLocation}-${Date.now()}.${extension}`,
        mimeType: data.photo.mimeType,
        dataBase64: data.photo.dataBase64,
      });
      photoUrl = uploaded.webViewLink;
    }

    const report: ChantierReport = {
      id: crypto.randomUUID(),
      createdAt,
      reportedBy: data.reportedBy,
      title: data.title.trim(),
      category: data.category,
      location: data.location.trim(),
      timeEstimate: (data.timeEstimate ?? "").trim(),
      personDaysEstimate: data.personDaysEstimate ?? null,
      budgetEstimate: data.budgetEstimate ?? null,
      description: (data.description ?? "").trim(),
      urgency: data.urgency,
      status: "ouvert",
      linkedChantierId: "",
      photoUrl,
    };
    await appendRow(spreadsheetId, `'${REPORTS_TAB}'!A:N`, reportToRow(report));
    return { ok: true as const, report };
  });

const ListReportsInput = z.object({ password: z.string().min(1) });

export const listChantierReports = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListReportsInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, REPORTS_TAB, REPORTS_HEADERS, "N");
    const rows = await getRows(spreadsheetId, `'${REPORTS_TAB}'!A2:N`);
    const reports = rows
      .map(rowToReport)
      .filter((r): r is ChantierReport => r !== null)
      .sort(
        (a, b) =>
          URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
          a.createdAt.localeCompare(b.createdAt),
      );
    return { reports };
  });

const MarkPlannedInput = z.object({
  id: z.string().min(1),
  chantierId: z.string().min(1),
  password: z.string().min(1),
});

export const markReportPlanned = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => MarkPlannedInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, updateRange } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, REPORTS_TAB, REPORTS_HEADERS, "N");
    const rows = await getRows(spreadsheetId, `'${REPORTS_TAB}'!A2:N`);
    const rowIndex = rows.findIndex((r) => (r[0] ?? "").trim() === data.id);
    if (rowIndex === -1) throw new Error("Signalement introuvable.");
    const sheetRow = rowIndex + 2;
    await updateRange(spreadsheetId, `'${REPORTS_TAB}'!K${sheetRow}:L${sheetRow}`, [
      "planifie",
      data.chantierId,
    ]);
    return { ok: true as const };
  });
