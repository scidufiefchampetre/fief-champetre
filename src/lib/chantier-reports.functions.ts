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

// Reports are stored in the unified "Tâches chantier" tab alongside actual tasks.
// New V schema (22 cols): P=Type discriminator ("signalement"), Q-V=signalement-only fields.
// A=ID Chantier, B=ID, C=Créé le, D=Titre, E=Urgence, F=Statut, G=Pourcentage,
// H=Description, I=À acheter, J=Photo avant, K=Photo après, L=Durée, M=Nb personnes,
// N=Participants (=Signalé par for reports), O=Terminé le, P=Type,
// Q=Catégorie, R=Lieu, S=Statut sig., T=Temps estimé, U=Jours-homme, V=Budget estimé

function rowToReport(row: string[]): ChantierReport | null {
  const id = (row[1] ?? "").trim(); // B
  if (!id) return null;
  const chantierId = (row[0] ?? "").trim(); // A
  const type = (row[15] ?? "").trim(); // P
  if (chantierId !== "" && type !== "signalement") return null;
  const urgency = (row[4] ?? "important").trim(); // E
  const rawStatus = (row[18] ?? "").trim(); // S
  const status: ReportStatus = rawStatus === "planifie" || chantierId !== "" ? "planifie" : "ouvert";
  const personDays = (row[20] ?? "").trim(); // U
  const budget = (row[21] ?? "").trim();     // V
  return {
    id,
    createdAt: row[2] ?? "",                           // C
    reportedBy: row[13] ?? "",                         // N
    title: (row[3] ?? "").trim(),                      // D
    category: (row[16] ?? "tache") as ReportCategory,  // Q
    location: row[17] ?? "",                           // R
    timeEstimate: row[19] ?? "",                       // T
    personDaysEstimate: personDays ? Number(personDays.replace(",", ".")) : null,
    budgetEstimate: budget ? Number(budget.replace(",", ".")) : null,
    description: row[7] ?? "",                         // H
    urgency: (urgency === "tres_urgent" || urgency === "urgent" || urgency === "important" || urgency === "must_have"
      ? urgency : "important") as ReportUrgency,
    status,
    linkedChantierId: chantierId,
    photoUrl: row[9] ?? "",                            // J
  };
}

function reportToRow(r: ChantierReport): unknown[] {
  return [
    r.linkedChantierId, // A
    r.id,               // B
    r.createdAt,        // C
    r.title,            // D
    r.urgency,          // E
    "À faire",          // F: Statut
    "",                 // G: Pourcentage
    r.description,      // H
    "[]",               // I: À acheter
    r.photoUrl,         // J: Photo avant
    "",                 // K: Photo après
    "",                 // L: Durée
    "",                 // M: Nb personnes
    r.reportedBy,       // N: Participants (signalé par)
    "",                 // O: Terminé le
    "signalement",      // P: Type
    r.category,         // Q
    r.location,         // R
    r.status,           // S: Statut sig.
    r.timeEstimate,     // T
    r.personDaysEstimate ?? "", // U
    r.budgetEstimate ?? "",     // V
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
      TACHES_TAB,
      TACHE_HEADERS,
      TACHE_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, TACHES_TAB, TACHE_HEADERS, TACHE_LAST_COL);

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
    await appendRow(spreadsheetId, `${TACHES_TAB}!A:${TACHE_LAST_COL}`, reportToRow(report));
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
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, TACHES_TAB, TACHE_HEADERS, TACHE_LAST_COL } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, TACHES_TAB, TACHE_HEADERS, TACHE_LAST_COL);
    const rows = await getRows(spreadsheetId, `${TACHES_TAB}!A2:${TACHE_LAST_COL}`);
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
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, updateRange, TACHES_TAB, TACHE_HEADERS, TACHE_LAST_COL } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, TACHES_TAB, TACHE_HEADERS, TACHE_LAST_COL);
    const rows = await getRows(spreadsheetId, `${TACHES_TAB}!A2:${TACHE_LAST_COL}`);
    // col B (index 1) holds the ID for unified schema
    const rowIndex = rows.findIndex((r) => (r[1] ?? "").trim() === data.id);
    if (rowIndex === -1) throw new Error("Signalement introuvable.");
    const sheetRow = rowIndex + 2;
    // Update col A (chantierId) and col S (statut sig.)
    await updateRange(spreadsheetId, `${TACHES_TAB}!A${sheetRow}`, [[data.chantierId]]);
    await updateRange(spreadsheetId, `${TACHES_TAB}!S${sheetRow}`, [["planifie"]]);
    return { ok: true as const };
  });
