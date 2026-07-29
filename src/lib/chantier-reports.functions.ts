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

// Signalements dans l'onglet "Missions" (schéma 20 cols A-T).
// T=Type="signalement", I=Statut ("ouvert"/"planifie"), F=Catégorie, G=Lieu,
// S=Signalé par, R=Budget estimé. Les autres colonnes sont vides pour les signalements.

function rowToReport(row: string[]): ChantierReport | null {
  const id = (row[1] ?? "").trim(); // B
  if (!id) return null;
  const chantierId = (row[0] ?? "").trim(); // A
  const type = (row[19] ?? "").trim(); // T
  if (chantierId !== "" && type !== "signalement") return null;
  const urgency = (row[4] ?? "important").trim(); // E
  const rawStatus = (row[8] ?? "").trim(); // I = Statut
  const status: ReportStatus = rawStatus === "planifie" || chantierId !== "" ? "planifie" : "ouvert";
  const budget = (row[17] ?? "").trim(); // R = Budget estimé
  return {
    id,
    createdAt: row[2] ?? "",                           // C
    reportedBy: row[18] ?? "",                         // S = Signalé par
    title: (row[3] ?? "").trim(),                      // D
    category: (row[5] ?? "tache") as ReportCategory,  // F = Catégorie
    location: row[6] ?? "",                            // G = Lieu
    timeEstimate: "",                                  // supprimé du schéma
    personDaysEstimate: null,                          // supprimé du schéma
    budgetEstimate: budget ? Number(budget.replace(",", ".")) : null,
    description: row[7] ?? "",                         // H
    urgency: (urgency === "tres_urgent" || urgency === "urgent" || urgency === "important" || urgency === "must_have"
      ? urgency : "important") as ReportUrgency,
    status,
    linkedChantierId: chantierId,
    photoUrl: row[11] ?? "",                           // L = Photo avant
  };
}

function reportToRow(r: ChantierReport): unknown[] {
  return [
    r.linkedChantierId, // A(0)
    r.id,               // B(1)
    r.createdAt,        // C(2)
    r.title,            // D(3)
    r.urgency,          // E(4)
    r.category,         // F(5): Catégorie
    r.location,         // G(6): Lieu
    r.description,      // H(7)
    r.status,           // I(8): Statut ("ouvert"/"planifie")
    "",                 // J(9): Pourcentage
    "[]",               // K(10): À acheter
    r.photoUrl,         // L(11): Photo avant
    "",                 // M(12): Photo après
    "",                 // N(13): Durée
    "",                 // O(14): Nb personnes
    "",                 // P(15): Participants (vide pour signalements)
    "",                 // Q(16): Terminé le
    r.budgetEstimate ?? "", // R(17): Budget estimé
    r.reportedBy,       // S(18): Signalé par
    "signalement",      // T(19): Type
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
      MISSIONS_TAB,
      MISSION_HEADERS,
      MISSION_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, MISSIONS_TAB, MISSION_HEADERS, MISSION_LAST_COL);

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
    await appendRow(spreadsheetId, `${MISSIONS_TAB}!A:${MISSION_LAST_COL}`, reportToRow(report));
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
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, MISSIONS_TAB, MISSION_HEADERS, MISSION_LAST_COL } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, MISSIONS_TAB, MISSION_HEADERS, MISSION_LAST_COL);
    const rows = await getRows(spreadsheetId, `${MISSIONS_TAB}!A2:${MISSION_LAST_COL}`);
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
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, updateRange, MISSIONS_TAB, MISSION_HEADERS, MISSION_LAST_COL } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, MISSIONS_TAB, MISSION_HEADERS, MISSION_LAST_COL);
    const rows = await getRows(spreadsheetId, `${MISSIONS_TAB}!A2:${MISSION_LAST_COL}`);
    const rowIndex = rows.findIndex((r) => (r[1] ?? "").trim() === data.id);
    if (rowIndex === -1) throw new Error("Signalement introuvable.");
    const sheetRow = rowIndex + 2;
    // Update col A (chantierId) and col I (Statut unifié)
    await updateRange(spreadsheetId, `${MISSIONS_TAB}!A${sheetRow}`, [[data.chantierId]]);
    await updateRange(spreadsheetId, `${MISSIONS_TAB}!I${sheetRow}`, [["planifie"]]);
    return { ok: true as const };
  });
