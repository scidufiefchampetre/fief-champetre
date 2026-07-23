import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const IS_MOCK = process.env["VITE_USE_MOCK_DATA"] === "true";

const SubmitBugInput = z.object({
  quoi: z.string().min(1).max(200),
  ou: z.string().min(1),
  description: z.string().max(2000).optional().default(""),
  gravite: z.enum(["bloquant", "genant", "cosmetique"]),
  auteur: z.string().max(100).optional().default("Anonyme"),
  urlPage: z.string().max(500).optional().default(""),
  userAgent: z.string().max(500).optional().default(""),
  viewport: z.string().max(100).optional().default(""),
  screenshot: z
    .object({
      dataBase64: z.string().min(1).max(12_000_000),
      mimeType: z.string().min(1),
      fileName: z.string().min(1),
    })
    .optional(),
});

const SubmitIdeaInput = z.object({
  titre: z.string().min(1).max(200),
  contexte: z.string().max(2000).optional().default(""),
  proposition: z.string().max(2000).optional().default(""),
  priorite: z.enum(["indispensable", "utile", "bonus"]),
  auteur: z.string().max(100).optional().default("Anonyme"),
});

export const submitBug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitBugInput.parse(d))
  .handler(async ({ data }) => {
    if (IS_MOCK) return { ok: true };

    const {
      ensureFeedbackSpreadsheet,
      appendRow,
      ensureDriveFolder,
      ensureDriveSubfolder,
      uploadFileToDrive,
      FEEDBACK_BUGS_TAB,
    } = await import("../core/google/google.server");

    const ssId = await ensureFeedbackSpreadsheet(null);

    let screenshotUrl = "";
    if (data.screenshot) {
      const rootFolder = await ensureDriveFolder("Asso");
      const feedbackFolder = await ensureDriveSubfolder(rootFolder, "Feedback Screenshots");
      const ext = data.screenshot.mimeType.includes("png")
        ? "png"
        : data.screenshot.mimeType.includes("webp")
          ? "webp"
          : "jpg";
      const uploaded = await uploadFileToDrive(feedbackFolder, {
        name: `bug-${Date.now()}.${ext}`,
        mimeType: data.screenshot.mimeType,
        dataBase64: data.screenshot.dataBase64,
      });
      screenshotUrl = uploaded.webViewLink;
    }

    const id = `BUG-${Date.now()}`;
    const now = new Date().toISOString();
    const graviteLabel: Record<string, string> = {
      bloquant: "Bloquant",
      genant: "Gênant",
      cosmetique: "Cosmétique",
    };

    await appendRow(ssId, `${FEEDBACK_BUGS_TAB}!A:L`, [
      id,
      now,
      data.auteur,
      data.quoi,
      data.ou,
      data.description,
      graviteLabel[data.gravite] ?? data.gravite,
      screenshotUrl,
      data.urlPage,
      data.userAgent,
      data.viewport,
      "Nouveau",
    ]);

    return { ok: true, id };
  });

export const submitIdea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitIdeaInput.parse(d))
  .handler(async ({ data }) => {
    if (IS_MOCK) return { ok: true };

    const { ensureFeedbackSpreadsheet, appendRow, FEEDBACK_IDEES_TAB } =
      await import("../core/google/google.server");

    const ssId = await ensureFeedbackSpreadsheet(null);

    const id = `IDEE-${Date.now()}`;
    const now = new Date().toISOString();
    const prioriteLabel: Record<string, string> = {
      indispensable: "Indispensable",
      utile: "Utile",
      bonus: "Bonus",
    };

    await appendRow(ssId, `${FEEDBACK_IDEES_TAB}!A:H`, [
      id,
      now,
      data.auteur,
      data.titre,
      data.contexte,
      data.proposition,
      prioriteLabel[data.priorite] ?? data.priorite,
      "Nouvelle",
    ]);

    return { ok: true, id };
  });
