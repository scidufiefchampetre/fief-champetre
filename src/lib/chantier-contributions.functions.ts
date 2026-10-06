import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TASK_CATALOG_TAB = "Tâches types";
const TASK_CATALOG_HEADERS = ["ID", "Libellé"];
const CONTRIBUTIONS_TAB = "Jours chantier";
const CONTRIBUTIONS_HEADERS = ["ID", "Créé le", "Réservation ID", "Personne", "Tâche", "Jours"];

export interface TaskCatalogEntry {
  id: string;
  label: string;
}

export interface ChantierContribution {
  id: string;
  createdAt: string;
  reservationId: string;
  person: string;
  taskLabel: string;
  days: number;
}

function rowToTaskCatalogEntry(row: string[]): TaskCatalogEntry | null {
  const id = (row[0] ?? "").trim();
  if (!id) return null;
  return { id, label: row[1] ?? "" };
}

function rowToContribution(row: string[]): ChantierContribution | null {
  const id = (row[0] ?? "").trim();
  if (!id) return null;
  return {
    id,
    createdAt: row[1] ?? "",
    reservationId: row[2] ?? "",
    person: row[3] ?? "",
    taskLabel: row[4] ?? "",
    days: Number(row[5] ?? "0") || 0,
  };
}

/**
 * Catalogue de tâches = onglet « Tâches types » (s'il existe encore) + libellés
 * distincts des missions déjà créées (onglet « Missions », col D, hors
 * signalements col T). Lecture seule : aucune création d'onglet ni réécriture
 * d'en-têtes ici (avant, chaque lecture à froid faisait métadonnées + écriture
 * des en-têtes + lecture), et un seul appel batchGet pour les plages.
 */
export const listTaskCatalog = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureChantiersSpreadsheet, fetchSheetTitles, batchGetRows, MISSIONS_TAB } =
    await import("../core/google/google.server");
  const spreadsheetId = await ensureChantiersSpreadsheet(null);
  const titles = await fetchSheetTitles(spreadsheetId);
  const hasCatalog = titles.has(TASK_CATALOG_TAB);
  const hasMissions = titles.has(MISSIONS_TAB);
  const ranges = [
    ...(hasCatalog ? [`'${TASK_CATALOG_TAB}'!A2:B`] : []),
    ...(hasMissions ? [`${MISSIONS_TAB}!D2:D`, `${MISSIONS_TAB}!T2:T`] : []),
  ];
  const results = await batchGetRows(spreadsheetId, ranges);
  const catalogRows = hasCatalog ? (results[0] ?? []) : [];
  const offset = hasCatalog ? 1 : 0;
  const missionLabels = hasMissions ? (results[offset] ?? []) : [];
  const missionTypes = hasMissions ? (results[offset + 1] ?? []) : [];

  const seen = new Set<string>();
  const tasks: TaskCatalogEntry[] = [];
  const push = (entry: TaskCatalogEntry) => {
    const label = entry.label.trim();
    const key = label.toLocaleLowerCase("fr-FR");
    if (!label || seen.has(key)) return;
    seen.add(key);
    tasks.push({ id: entry.id, label });
  };
  for (const row of catalogRows) {
    const entry = rowToTaskCatalogEntry(row);
    if (entry) push(entry);
  }
  missionLabels.forEach((row, index) => {
    if ((missionTypes[index]?.[0] ?? "").trim() === "signalement") return;
    const label = (row[0] ?? "").trim();
    push({ id: `mission:${label.toLocaleLowerCase("fr-FR")}`, label });
  });
  tasks.sort((x, y) => x.label.localeCompare(y.label, "fr"));
  return { tasks };
});

const LogContributionInput = z.object({
  reservationId: z.string().min(1),
  person: z.string().min(1).max(60),
  taskLabel: z.string().min(1).max(200),
  days: z.number().positive().max(30),
});

export const logChantierContribution = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LogContributionInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows, batchAppendRowsByTab } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, TASK_CATALOG_TAB, TASK_CATALOG_HEADERS, "B");
    await ensureTabExists(spreadsheetId, CONTRIBUTIONS_TAB, CONTRIBUTIONS_HEADERS, "F");

    const label = data.taskLabel.trim();

    // Upsert dans le catalogue : réutilise une tâche existante (comparaison
    // insensible à la casse) plutôt que d'en dupliquer une nouvelle à chaque
    // fois que quelqu'un choisit une tâche déjà connue.
    const catalogRows = await getRows(spreadsheetId, `'${TASK_CATALOG_TAB}'!A2:B`);
    const existing = catalogRows
      .map(rowToTaskCatalogEntry)
      .find(
        (t): t is TaskCatalogEntry =>
          t !== null &&
          t.label.trim().toLocaleLowerCase("fr-FR") === label.toLocaleLowerCase("fr-FR"),
      );
    const contribution: ChantierContribution = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reservationId: data.reservationId,
      person: data.person,
      taskLabel: label,
      days: data.days,
    };
    await batchAppendRowsByTab(spreadsheetId, [
      {
        tabTitle: TASK_CATALOG_TAB,
        rows: existing ? [] : [[crypto.randomUUID(), label]],
      },
      {
        tabTitle: CONTRIBUTIONS_TAB,
        rows: [
          [
            contribution.id,
            contribution.createdAt,
            contribution.reservationId,
            contribution.person,
            contribution.taskLabel,
            contribution.days,
          ],
        ],
      },
    ]);
    return { ok: true as const, contribution };
  });

const ListContributionsInput = z.object({ password: z.string().min(1) });

export const listChantierContributions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListContributionsInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }

    const { ensureChantiersSpreadsheet, ensureTabExists, getRows } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, CONTRIBUTIONS_TAB, CONTRIBUTIONS_HEADERS, "F");
    const rows = await getRows(spreadsheetId, `'${CONTRIBUTIONS_TAB}'!A2:F`);
    const contributions = rows
      .map(rowToContribution)
      .filter((c): c is ChantierContribution => c !== null);

    const totalsByPerson = new Map<string, number>();
    for (const c of contributions) {
      totalsByPerson.set(c.person, (totalsByPerson.get(c.person) ?? 0) + c.days);
    }
    const totals = [...totalsByPerson.entries()]
      .map(([person, days]) => ({ person, days }))
      .sort((a, b) => b.days - a.days);

    return { contributions, totals };
  });

const MyDaysInput = z.object({ person: z.string().min(1).max(60) });

// Pas de mot de passe : contrairement à listChantierContributions (qui expose
// tout le monde, réservé à l'admin Asso), on ne renvoie ici que le total
// d'UNE personne — chacun voit ses propres jours depuis son profil.
export const listMyChantierDays = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => MyDaysInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, ensureTabExists, getRows } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, CONTRIBUTIONS_TAB, CONTRIBUTIONS_HEADERS, "F");
    const rows = await getRows(spreadsheetId, `'${CONTRIBUTIONS_TAB}'!A2:F`);
    const contributions = rows
      .map(rowToContribution)
      .filter((c): c is ChantierContribution => c !== null);
    const now = new Date();
    const seasonStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const seasonStart = `${seasonStartYear}-07-01`;
    const seasonEnd = `${seasonStartYear + 1}-06-30`;
    const days = contributions
      .filter((c) => {
        const contributionDate = c.createdAt.slice(0, 10);
        return (
          c.person.trim().toLocaleLowerCase("fr-FR") ===
            data.person.trim().toLocaleLowerCase("fr-FR") &&
          contributionDate >= seasonStart &&
          contributionDate <= seasonEnd
        );
      })
      .reduce((sum, c) => sum + c.days, 0);
    return { days, seasonStartYear };
  });
