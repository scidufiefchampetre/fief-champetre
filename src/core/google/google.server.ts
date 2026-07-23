import { Buffer } from "node:buffer";
import { getGoogleAccessToken } from "./google-oauth.server";

// Accès direct à Google Sheets + Drive via OAuth "compte perso" (voir
// google-oauth.server.ts). Remplace entièrement la passerelle Lovable —
// plus aucune dépendance à Lovable pour parler à Google.
//
// Variables d'environnement à configurer :
//   GOOGLE_SHEETS_SPREADSHEET_ID  → spreadsheet Admin — Fief Champêtre
//   GOOGLE_CHANTIERS_SPREADSHEET_ID → spreadsheet Chantiers — Fief Champêtre
//   GOOGLE_DRIVE_FOLDER_SCI_ID    → dossier Factures SCI
//   GOOGLE_DRIVE_FOLDER_ASSO_ID   → dossier Factures Asso
// Sans ces variables, le code retombe sur une recherche par nom.

const SHEETS_API = "https://sheets.googleapis.com/v4";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export const SCI_FOLDER_NAME = "Factures SCI";
export const ASSO_FOLDER_NAME = "Factures Asso";
export const SPREADSHEET_NAME = "Admin — Fief Champêtre";
export const EXPENSES_TAB = "Dépenses";
export const SCI_TAB = "SCI";
export const ASSO_TAB = "Asso";
export const MEMBERS_TAB = "Membres";
export const RESERVATIONS_TAB = "Réservations";

// Classeur séparé dédié aux chantiers : onglets partagés par type de donnée
// (Inscriptions, Tâches, Intendance) + onglet récap Chantiers.
export const CHANTIERS_SPREADSHEET_NAME = "Chantiers — Fief Champêtre";
export const CHANTIER_TAB = "Chantier Overview";
export const CHANTIER_HEADERS = [
  "ID", // A 0
  "Créé le", // B 1
  "Réservé par", // C 2
  "Date début", // D 3
  "Date fin", // E 4
  "Titre", // F 5  — ex: "WE Chantier Août 2026"
  "Description", // G 6  — texte libre (fiche admin)
  "Titre fiche", // H 7  — titre court affiché sur la fiche
  "Moment début", // I 8
  "Moment fin", // J 9
  "ID événement Calendar", // K 10
  "Annulé le", // L 11
];

// Onglets partagés (toutes données de tous les chantiers, col A = ID Chantier)
export const INSCRIPTIONS_TAB = "Inscriptions";
export const TACHES_TAB = "Tâches";
export const INTENDANCE_TAB = "Intendance";

export const INSCRIPTION_HEADERS = [
  "ID Chantier",
  "ID",
  "Créé le",
  "Groupe ID",
  "Nom",
  "Inscrit par",
  "Type",
  "Mode",
  "Membre asso",
  "Repas",
  "Annulé le",
];
export const INSCRIPTION_LAST_COL = "K";

export const TACHE_HEADERS = [
  "ID Chantier",
  "ID",
  "Créé le",
  "Tâche",
  "Urgence",
  "Fait",
  "Note",
  "Participants",
  "Terminé le",
  "Photo résultat",
  "Durée (min)",
  "Nb personnes",
];
export const TACHE_LAST_COL = "L";

export const INTENDANCE_HEADERS = [
  "ID Chantier",
  "ID",
  "Créé le",
  "Date",
  "Créneau",
  "Rôle",
  "Personne",
];
export const INTENDANCE_LAST_COL = "G";

export function tabForSide(side: string): string {
  const s = (side || "").toLowerCase();
  if (s.includes("sci") || s.includes("locative") || s.includes("airbnb")) return SCI_TAB;
  return ASSO_TAB;
}

export const EXPENSE_HEADERS = [
  "Enregistré le",
  "Fournisseur",
  "Date facture",
  "Montant TTC (€)",
  "TVA (€)",
  "Catégorie",
  "Détail de l'achat",
  "Lieu",
  "Payé par",
  "Moyen de paiement",
  "IBAN membre",
  "Statut remboursement",
  "À rembourser par",
  "Commentaire IA",
  "Commentaire perso",
  "Lien facture",
  "Déposé par",
  "ID",
  "ID chantier",
  "Date début chantier",
  "Chantier",
];

// Les enfants d'un membre vivent sur SA ligne (pas de ligne à part) : une
// paire de colonnes "Enfant N prénom" / "Enfant N naissance" par enfant, à
// la suite des colonnes fixes. MAX_CHILDREN_PER_MEMBER fixe le nombre de
// paires réservées dans l'en-tête (voir children.functions.ts).
export const MAX_CHILDREN_PER_MEMBER = 6;
export const MEMBER_HEADERS = [
  "ID",
  "Inscrit le",
  "Prénom",
  "Nom",
  "IBAN",
  "Banque",
  "Naissance",
  "Email",
  "Conjoint prénom",
  "Conjoint nom",
  ...Array.from({ length: MAX_CHILDREN_PER_MEMBER }, (_, i) => [
    `Enfant ${i + 1} prénom`,
    `Enfant ${i + 1} naissance`,
  ]).flat(),
];

export const RESERVATION_HEADERS = [
  "ID",
  "Créé le",
  "Type",
  "Statut",
  "Réservé par",
  "Date début",
  "Date fin",
  "Adultes",
  "Enfants",
  "Privatisation",
  "Mood / thème",
  "Pré-chauffage",
  "Montant nuitées (€)",
  "Montant électricité (€)",
  "Total (€)",
  "Payé",
  "ID événement Calendar",
  "Annulée le",
  "Heure d'arrivée",
];

async function sheetsAuthHeaders(): Promise<Record<string, string>> {
  const token = await getGoogleAccessToken([SHEETS_SCOPE]);
  return { Authorization: `Bearer ${token}` };
}
async function driveAuthHeaders(): Promise<Record<string, string>> {
  const token = await getGoogleAccessToken([DRIVE_SCOPE]);
  return { Authorization: `Bearer ${token}` };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    lastErr = `${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
    const retryAfter = res.headers.get("Retry-After");
    const baseMs = retryAfter
      ? Math.max(0, parseInt(retryAfter, 10)) * 1000
      : 500 * Math.pow(2, attempt);
    const wait = Math.min(baseMs + Math.random() * 200, 20000);
    await sleep(wait);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(
      `${label} failed after retries [${res.status || lastErr}]: ${await res.text()}`,
    );
  }
  return res;
}

export async function findDriveIdsByName(name: string, mime: string): Promise<string[]> {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='${mime}' and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,modifiedTime)&orderBy=${encodeURIComponent("modifiedTime desc")}&pageSize=10`;
  const res = await fetch(url, { headers: await driveAuthHeaders() });
  if (!res.ok) throw new Error(`Drive search failed [${res.status}]: ${await res.text()}`);
  const j = (await res.json()) as { files?: Array<{ id: string }> };
  return (j.files ?? []).map((file) => file.id).filter(Boolean);
}

async function findDriveByName(name: string, mime: string): Promise<string | null> {
  const ids = await findDriveIdsByName(name, mime);
  return ids[0] ?? null;
}

const publicSharedFolders = new Set<string>();

async function ensureFolderPublic(folderId: string): Promise<void> {
  if (publicSharedFolders.has(folderId)) return;
  try {
    const res = await fetchWithRetry(
      `${DRIVE_API}/files/${folderId}/permissions?supportsAllDrives=true`,
      {
        method: "POST",
        headers: { ...(await driveAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone", allowFileDiscovery: false }),
      },
      "Drive folder share",
    );
    if (res.ok || res.status === 409) {
      publicSharedFolders.add(folderId);
    } else {
      console.warn(`Drive folder share failed [${res.status}]: ${await res.text()}`);
    }
  } catch (e) {
    console.warn("Drive folder share threw", e);
  }
}

export async function ensureDriveFolder(side: "SCI" | "Asso"): Promise<string> {
  const envVar =
    side === "SCI"
      ? process.env.GOOGLE_DRIVE_FOLDER_SCI_ID
      : process.env.GOOGLE_DRIVE_FOLDER_ASSO_ID;
  if (envVar) {
    await ensureFolderPublic(envVar);
    return envVar;
  }
  const folderName = side === "SCI" ? SCI_FOLDER_NAME : ASSO_FOLDER_NAME;
  const found = await findDriveByName(folderName, "application/vnd.google-apps.folder");
  if (found) {
    await ensureFolderPublic(found);
    return found;
  }
  const res = await fetchWithRetry(
    `${DRIVE_API}/files`,
    {
      method: "POST",
      headers: { ...(await driveAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" }),
    },
    "Drive folder create",
  );
  if (!res.ok) throw new Error(`Drive folder create failed [${res.status}]: ${await res.text()}`);
  const j = (await res.json()) as { id: string };
  console.warn(
    `Dossier Drive "${folderName}" créé (id: ${j.id}). Configure GOOGLE_DRIVE_FOLDER_${side}_ID.`,
  );
  await ensureFolderPublic(j.id);
  return j.id;
}

/** Renomme un fichier ou dossier Drive existant (par id), sans toucher à son contenu ni ses liens. */
export async function renameDriveFile(fileId: string, newName: string): Promise<void> {
  const res = await fetchWithRetry(
    `${DRIVE_API}/files/${fileId}`,
    {
      method: "PATCH",
      headers: { ...(await driveAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    },
    `Rename Drive file ${fileId}`,
  );
  if (!res.ok) throw new Error(`Drive rename failed [${res.status}]: ${await res.text()}`);
}

const subfolderCache = new Map<string, string>();

/** Trouve ou crée un sous-dossier (ex: "SCI" / "Asso") à l'intérieur d'un dossier Drive parent. */
export async function ensureDriveSubfolder(parentId: string, name: string): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const cached = subfolderCache.get(cacheKey);
  if (cached) return cached;

  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`;
  const res = await fetch(url, { headers: await driveAuthHeaders() });
  if (!res.ok)
    throw new Error(`Drive subfolder search failed [${res.status}]: ${await res.text()}`);
  const j = (await res.json()) as { files?: Array<{ id: string }> };
  const found = j.files?.[0]?.id;
  if (found) {
    await ensureFolderPublic(found);
    subfolderCache.set(cacheKey, found);
    return found;
  }

  const create = await fetchWithRetry(
    `${DRIVE_API}/files`,
    {
      method: "POST",
      headers: { ...(await driveAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
    `Drive subfolder create (${name})`,
  );
  if (!create.ok)
    throw new Error(`Drive subfolder create failed [${create.status}]: ${await create.text()}`);
  const cj = (await create.json()) as { id: string };
  await ensureFolderPublic(cj.id);
  subfolderCache.set(cacheKey, cj.id);
  return cj.id;
}

// Classeur feedback
export const FEEDBACK_SPREADSHEET_NAME = "Feedback — Fief Champêtre";
export const FEEDBACK_BUGS_TAB = "Bugs";
export const FEEDBACK_IDEES_TAB = "Idées";

// ID • Soumis le • Auteur • Quoi • Où • Description • Gravité • Screenshot URL • URL page • User agent • Viewport • Statut
export const FEEDBACK_BUG_HEADERS = [
  "ID",
  "Soumis le",
  "Auteur",
  "Quoi",
  "Où",
  "Description",
  "Gravité",
  "Screenshot URL",
  "URL page",
  "User agent",
  "Viewport",
  "Statut",
];
export const FEEDBACK_BUG_LAST_COL = "L";

// ID • Soumis le • Auteur • Titre • Contexte • Proposition • Priorité • Statut
export const FEEDBACK_IDEE_HEADERS = [
  "ID",
  "Soumis le",
  "Auteur",
  "Titre",
  "Contexte",
  "Proposition",
  "Priorité",
  "Statut",
];
export const FEEDBACK_IDEE_LAST_COL = "H";

let cachedSpreadsheetId: string | null = null;
let cachedChantiersSpreadsheetId: string | null = null;
let cachedFeedbackSpreadsheetId: string | null = null;

const META_CACHE_TTL_MS = 5 * 60_000;
const SCHEMA_CACHE_TTL_MS = 6 * 60 * 60_000;
const ROW_CACHE_TTL_MS = 3_000;

type SheetMetadata = Map<string, number>;
type TimedPromise<T> = { expiresAt: number; promise: Promise<T> };

const metadataCache = new Map<string, TimedPromise<SheetMetadata>>();
const rowsCache = new Map<string, TimedPromise<string[][]>>();
const schemaCache = new Map<string, TimedPromise<void>>();

function invalidateRowsCache(spreadsheetId: string) {
  for (const key of rowsCache.keys()) {
    if (key.startsWith(`${spreadsheetId}::`)) rowsCache.delete(key);
  }
}

function invalidateStructureCache(spreadsheetId: string) {
  metadataCache.delete(spreadsheetId);
  invalidateRowsCache(spreadsheetId);
  for (const key of schemaCache.keys()) {
    if (key.includes(`:${spreadsheetId}:`)) schemaCache.delete(key);
  }
}

async function fetchSheetMetadata(spreadsheetId: string): Promise<SheetMetadata> {
  const cached = metadataCache.get(spreadsheetId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    const meta = await fetchWithRetry(
      `${SHEETS_API}/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
      { headers: await sheetsAuthHeaders() },
      "Sheet meta",
    );
    const mj = (await meta.json()) as {
      sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
    };
    return new Map(
      (mj.sheets ?? [])
        .map((sheet) => [sheet.properties?.title, sheet.properties?.sheetId] as const)
        .filter((entry): entry is readonly [string, number] =>
          Boolean(entry[0] && entry[1] !== undefined),
        ),
    );
  })();
  metadataCache.set(spreadsheetId, { expiresAt: Date.now() + META_CACHE_TTL_MS, promise });
  try {
    return await promise;
  } catch (error) {
    metadataCache.delete(spreadsheetId);
    throw error;
  }
}

export async function fetchSheetTitles(spreadsheetId: string): Promise<Set<string>> {
  return new Set((await fetchSheetMetadata(spreadsheetId)).keys());
}

async function getSheetIdByTitle(spreadsheetId: string, title: string): Promise<number> {
  const sheetId = (await fetchSheetMetadata(spreadsheetId)).get(title);
  if (sheetId === undefined) throw new Error(`Onglet "${title}" introuvable.`);
  return sheetId;
}

/** Supprime une ligne (index 0-based, tel que retourné par getRows sur une plage démarrant à la ligne 2). */
export async function deleteRow(
  spreadsheetId: string,
  tabTitle: string,
  rowIndex0Based: number,
): Promise<void> {
  const sheetId = await getSheetIdByTitle(spreadsheetId, tabTitle);
  // +1 : la ligne d'en-tête (ligne 1) n'est pas comprise dans rowIndex0Based,
  // qui compte depuis la première ligne de données (ligne 2 du Sheet).
  const startIndex = rowIndex0Based + 1;
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: { sheetId, dimension: "ROWS", startIndex, endIndex: startIndex + 1 },
            },
          },
        ],
      }),
    },
    `Delete row in ${tabTitle}`,
  );
  if (!res.ok)
    throw new Error(`Delete row in ${tabTitle} failed [${res.status}]: ${await res.text()}`);
  invalidateRowsCache(spreadsheetId);
}

/** Supprime plusieurs lignes en une seule requête Sheets (indices de données, hors en-tête). */
export async function deleteRows(
  spreadsheetId: string,
  tabTitle: string,
  rowIndexes0Based: number[],
): Promise<void> {
  const indexes = [...new Set(rowIndexes0Based)].sort((a, b) => b - a);
  if (indexes.length === 0) return;
  const sheetId = await getSheetIdByTitle(spreadsheetId, tabTitle);
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: indexes.map((index) => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: index + 1,
              endIndex: index + 2,
            },
          },
        })),
      }),
    },
    `Delete rows in ${tabTitle}`,
  );
  if (!res.ok)
    throw new Error(`Delete rows in ${tabTitle} failed [${res.status}]: ${await res.text()}`);
  invalidateRowsCache(spreadsheetId);
}

type SheetRowMutation = {
  rowIndex0Based: number;
  startColumn0Based: number;
  values: unknown[];
};

function asExtendedValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return { numberValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  if (value === null || value === undefined) return {};
  const stringValue = String(value);
  if (stringValue.startsWith("=")) return { formulaValue: stringValue };
  return { stringValue };
}

/**
 * Applique mises à jour, suppressions et ajouts de lignes dans un onglet avec
 * un seul `spreadsheets.batchUpdate`. Les mises à jour passent avant les
 * suppressions afin que leurs index restent ceux de la lecture initiale.
 */
export async function batchMutateRows(
  spreadsheetId: string,
  tabTitle: string,
  input: {
    updates?: SheetRowMutation[];
    deletes?: number[];
    appends?: unknown[][];
  },
): Promise<void> {
  const updates = input.updates ?? [];
  const deletes = [...new Set(input.deletes ?? [])].sort((a, b) => b - a);
  const appends = input.appends ?? [];
  if (updates.length === 0 && deletes.length === 0 && appends.length === 0) return;

  const sheetId = await getSheetIdByTitle(spreadsheetId, tabTitle);
  const requests = [
    ...updates.map((update) => ({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: update.rowIndex0Based + 1,
          endRowIndex: update.rowIndex0Based + 2,
          startColumnIndex: update.startColumn0Based,
          endColumnIndex: update.startColumn0Based + update.values.length,
        },
        rows: [
          {
            values: update.values.map((value) => ({ userEnteredValue: asExtendedValue(value) })),
          },
        ],
        fields: "userEnteredValue",
      },
    })),
    ...deletes.map((index) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: index + 1,
          endIndex: index + 2,
        },
      },
    })),
    ...(appends.length
      ? [
          {
            appendCells: {
              sheetId,
              rows: appends.map((row) => ({
                values: row.map((value) => ({ userEnteredValue: asExtendedValue(value) })),
              })),
              fields: "userEnteredValue",
            },
          },
        ]
      : []),
  ];

  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    },
    `Batch mutate rows in ${tabTitle}`,
  );
  if (!res.ok)
    throw new Error(`Batch mutate rows in ${tabTitle} failed [${res.status}]: ${await res.text()}`);
  invalidateRowsCache(spreadsheetId);
}

/** Ajoute des lignes dans plusieurs onglets d'un même classeur en un seul appel. */
export async function batchAppendRowsByTab(
  spreadsheetId: string,
  batches: Array<{ tabTitle: string; rows: unknown[][] }>,
): Promise<void> {
  const nonEmpty = batches.filter((batch) => batch.rows.length > 0);
  if (nonEmpty.length === 0) return;
  const metadata = await fetchSheetMetadata(spreadsheetId);
  const requests = nonEmpty.map((batch) => {
    const sheetId = metadata.get(batch.tabTitle);
    if (sheetId === undefined) throw new Error(`Onglet "${batch.tabTitle}" introuvable.`);
    return {
      appendCells: {
        sheetId,
        rows: batch.rows.map((row) => ({
          values: row.map((value) => ({ userEnteredValue: asExtendedValue(value) })),
        })),
        fields: "userEnteredValue",
      },
    };
  });
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    },
    "Batch append rows",
  );
  if (!res.ok) throw new Error(`Batch append rows failed [${res.status}]: ${await res.text()}`);
  invalidateRowsCache(spreadsheetId);
}

/** Supprime un onglet entier (ex: l'onglet tâches d'un chantier retiré du miroir). */
export async function deleteSheetTab(spreadsheetId: string, tabTitle: string): Promise<void> {
  const sheetId = await getSheetIdByTitle(spreadsheetId, tabTitle);
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }),
    },
    `Delete tab ${tabTitle}`,
  );
  if (!res.ok)
    throw new Error(`Delete tab ${tabTitle} failed [${res.status}]: ${await res.text()}`);
  invalidateStructureCache(spreadsheetId);
}

/** Renomme un onglet — utile quand un titre déterministe (ex: date de chantier) change. */
export async function renameSheetTab(
  spreadsheetId: string,
  oldTitle: string,
  newTitle: string,
): Promise<void> {
  if (oldTitle === newTitle) return;
  const sheetId = await getSheetIdByTitle(spreadsheetId, oldTitle);
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { updateSheetProperties: { properties: { sheetId, title: newTitle }, fields: "title" } },
        ],
      }),
    },
    `Rename tab ${oldTitle} → ${newTitle}`,
  );
  if (!res.ok)
    throw new Error(`Rename tab ${oldTitle} failed [${res.status}]: ${await res.text()}`);
  invalidateStructureCache(spreadsheetId);
}

export async function addTab(
  spreadsheetId: string,
  title: string,
  headers: string[],
  width: string,
) {
  const add = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    },
    `Add ${title} tab`,
  );
  if (!add.ok) throw new Error(`Add ${title} tab failed [${add.status}]: ${await add.text()}`);
  invalidateStructureCache(spreadsheetId);
  const headerUpdate = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${title}!A1:${width}1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headers] }),
    },
    `Write ${title} headers`,
  );
  if (!headerUpdate.ok)
    throw new Error(
      `Write ${title} headers failed [${headerUpdate.status}]: ${await headerUpdate.text()}`,
    );
}

async function writeHeaders(
  spreadsheetId: string,
  title: string,
  headers: string[],
  width: string,
) {
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${title}!A1:${width}1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headers] }),
    },
    `Refresh ${title} headers`,
  );
  if (!res.ok)
    throw new Error(`Refresh ${title} headers failed [${res.status}]: ${await res.text()}`);
}

async function ensureAllTabs(spreadsheetId: string) {
  const schemaKey = `main:${spreadsheetId}:${JSON.stringify([
    EXPENSE_HEADERS,
    MEMBER_HEADERS,
    RESERVATION_HEADERS,
  ])}`;
  const cached = schemaCache.get(schemaKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    const titles = await fetchSheetTitles(spreadsheetId);
    const tabs = [
      { title: SCI_TAB, headers: EXPENSE_HEADERS, width: "U" },
      { title: ASSO_TAB, headers: EXPENSE_HEADERS, width: "U" },
      { title: MEMBERS_TAB, headers: MEMBER_HEADERS, width: "V" },
      { title: RESERVATIONS_TAB, headers: RESERVATION_HEADERS, width: "S" },
    ];
    const missing = tabs.filter((tab) => !titles.has(tab.title));
    for (const tab of missing) {
      await addTab(spreadsheetId, tab.title, tab.headers, tab.width);
    }
    // Migration : l'onglet Membres a gagné une colonne "ID" en tête (col A).
    // Sur un classeur d'avant cette évolution, A1 vaut encore "Inscrit le" —
    // on insère alors physiquement une colonne A pour décaler les données,
    // AVANT de réécrire les en-têtes (sinon ils masqueraient le décalage).
    if (titles.has(MEMBERS_TAB)) {
      const headerRow = await getRows(spreadsheetId, `${MEMBERS_TAB}!A1:A1`);
      if ((headerRow[0]?.[0] ?? "") !== "ID") {
        const sheetId = await getSheetIdByTitle(spreadsheetId, MEMBERS_TAB);
        const res = await fetchWithRetry(
          `${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`,
          {
            method: "POST",
            headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
            body: JSON.stringify({
              requests: [
                {
                  insertDimension: {
                    range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
                    inheritFromBefore: false,
                  },
                },
              ],
            }),
          },
          `Insert ID column in ${MEMBERS_TAB}`,
        );
        if (!res.ok)
          throw new Error(
            `Insert ID column in ${MEMBERS_TAB} failed [${res.status}]: ${await res.text()}`,
          );
        invalidateRowsCache(spreadsheetId);
      }
    }
    const existing = tabs.filter((tab) => titles.has(tab.title));
    if (existing.length) {
      await batchUpdateRanges(
        spreadsheetId,
        existing.map((tab) => ({
          range: `${tab.title}!A1:${tab.width}1`,
          row: tab.headers,
        })),
      );
    }
  })();
  schemaCache.set(schemaKey, { expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS, promise });
  try {
    await promise;
    schemaCache.set(schemaKey, {
      expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
      promise: Promise.resolve(),
    });
  } catch (error) {
    schemaCache.delete(schemaKey);
    throw error;
  }
}

/**
 * Crée un onglet dynamique (ex: un onglet "Chantier ..." par date) s'il
 * n'existe pas déjà. Seule sa ligne d'en-tête est resynchronisée : les
 * lignes de contenu ne sont jamais touchées.
 */
export async function ensureTabExists(
  spreadsheetId: string,
  title: string,
  headers: string[],
  width: string,
): Promise<void> {
  const schemaKey = `tab:${spreadsheetId}:${title}:${JSON.stringify(headers)}`;
  const cached = schemaCache.get(schemaKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = (async () => {
    const titles = await fetchSheetTitles(spreadsheetId);
    if (!titles.has(title)) await addTab(spreadsheetId, title, headers, width);
    else await writeHeaders(spreadsheetId, title, headers, width);
  })();
  schemaCache.set(schemaKey, { expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS, promise });
  try {
    await promise;
    schemaCache.set(schemaKey, {
      expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
      promise: Promise.resolve(),
    });
  } catch (error) {
    schemaCache.delete(schemaKey);
    throw error;
  }
}

export async function ensureSpreadsheet(existing: string | null): Promise<string> {
  const preconfigured = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || null;
  let id: string | null = null;

  if (existing) {
    id = existing;
  } else if (preconfigured) {
    id = preconfigured;
  } else if (cachedSpreadsheetId) {
    id = cachedSpreadsheetId;
  } else {
    id = await findDriveByName(SPREADSHEET_NAME, "application/vnd.google-apps.spreadsheet");
  }

  if (!id) {
    const res = await fetchWithRetry(
      `${SHEETS_API}/spreadsheets`,
      {
        method: "POST",
        headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: { title: SPREADSHEET_NAME },
          sheets: [
            { properties: { title: SCI_TAB } },
            { properties: { title: ASSO_TAB } },
            { properties: { title: MEMBERS_TAB } },
            { properties: { title: RESERVATIONS_TAB } },
          ],
        }),
      },
      "Sheet create",
    );
    if (!res.ok) throw new Error(`Sheet create failed [${res.status}]: ${await res.text()}`);
    const j = (await res.json()) as { spreadsheetId: string };
    id = j.spreadsheetId;
    console.warn(
      `Google Sheet "${SPREADSHEET_NAME}" créé (id: ${id}). Configure GOOGLE_SHEETS_SPREADSHEET_ID pour éviter d'en recréer un à chaque fois si le nom change.`,
    );
  } else {
    await ensureAllTabs(id);
  }
  cachedSpreadsheetId = id;
  return id;
}

export async function resolveSpreadsheetId(existing: string | null): Promise<string> {
  const preconfigured = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || null;
  if (existing) {
    cachedSpreadsheetId = existing;
    return existing;
  }
  if (preconfigured) {
    cachedSpreadsheetId = preconfigured;
    return preconfigured;
  }
  if (cachedSpreadsheetId) return cachedSpreadsheetId;
  const found = await findDriveByName(SPREADSHEET_NAME, "application/vnd.google-apps.spreadsheet");
  if (found) {
    cachedSpreadsheetId = found;
    return found;
  }
  return ensureSpreadsheet(null);
}

/**
 * Classeur séparé pour les chantiers (et leurs onglets de tâches
 * dynamiques), placé dans le même dossier Drive que les factures. L'API
 * Sheets ne permet pas de spécifier un dossier à la création : on crée le
 * classeur (atterrit à la racine du Drive), puis on le déplace dans le
 * dossier via l'API Drive.
 */
export async function ensureChantiersSpreadsheet(existing: string | null): Promise<string> {
  const preconfigured = process.env.GOOGLE_CHANTIERS_SPREADSHEET_ID || null;
  let id: string | null = null;

  if (existing) {
    id = existing;
  } else if (preconfigured) {
    id = preconfigured;
  } else if (cachedChantiersSpreadsheetId) {
    id = cachedChantiersSpreadsheetId;
  } else {
    id = await findDriveByName(
      CHANTIERS_SPREADSHEET_NAME,
      "application/vnd.google-apps.spreadsheet",
    );
  }

  if (!id) {
    const res = await fetchWithRetry(
      `${SHEETS_API}/spreadsheets`,
      {
        method: "POST",
        headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: { title: CHANTIERS_SPREADSHEET_NAME },
          sheets: [{ properties: { title: CHANTIER_TAB } }],
        }),
      },
      "Chantiers sheet create",
    );
    if (!res.ok)
      throw new Error(`Chantiers sheet create failed [${res.status}]: ${await res.text()}`);
    const j = (await res.json()) as { spreadsheetId: string };
    id = j.spreadsheetId;
    await writeHeaders(id, CHANTIER_TAB, CHANTIER_HEADERS, "L"); // 12 cols A→L

    try {
      const folderId = await ensureDriveFolder("Asso");
      const move = await fetchWithRetry(
        `${DRIVE_API}/files/${id}?addParents=${folderId}&removeParents=root&fields=id,parents`,
        {
          method: "PATCH",
          headers: { ...(await driveAuthHeaders()), "Content-Type": "application/json" },
          body: "{}",
        },
        "Move chantiers sheet to folder",
      );
      if (!move.ok) {
        console.warn(
          `Déplacement du classeur Chantiers dans le dossier factures échoué [${move.status}]: ${await move.text()}`,
        );
      }
    } catch (e) {
      console.warn(
        "Déplacement du classeur Chantiers dans le dossier factures a levé une erreur:",
        e,
      );
    }

    console.warn(
      `Google Sheet "${CHANTIERS_SPREADSHEET_NAME}" créé (id: ${id}). Configure GOOGLE_CHANTIERS_SPREADSHEET_ID pour éviter d'en recréer un à chaque fois si le nom change.`,
    );
  } else {
    await ensureTabExists(id, CHANTIER_TAB, CHANTIER_HEADERS, "L"); // 12 cols A→L
  }
  cachedChantiersSpreadsheetId = id;
  return id;
}

export async function ensureFeedbackSpreadsheet(existing: string | null): Promise<string> {
  const preconfigured = process.env.GOOGLE_FEEDBACK_SPREADSHEET_ID || null;
  let id: string | null = null;

  if (existing) {
    id = existing;
  } else if (preconfigured) {
    id = preconfigured;
  } else if (cachedFeedbackSpreadsheetId) {
    id = cachedFeedbackSpreadsheetId;
  } else {
    id = await findDriveByName(
      FEEDBACK_SPREADSHEET_NAME,
      "application/vnd.google-apps.spreadsheet",
    );
  }

  if (!id) {
    const res = await fetchWithRetry(
      `${SHEETS_API}/spreadsheets`,
      {
        method: "POST",
        headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: { title: FEEDBACK_SPREADSHEET_NAME },
          sheets: [
            { properties: { title: FEEDBACK_BUGS_TAB } },
            { properties: { title: FEEDBACK_IDEES_TAB } },
          ],
        }),
      },
      "Feedback sheet create",
    );
    if (!res.ok)
      throw new Error(`Feedback sheet create failed [${res.status}]: ${await res.text()}`);
    const j = (await res.json()) as { spreadsheetId: string };
    id = j.spreadsheetId;
    await batchUpdateRanges(id, [
      { range: `${FEEDBACK_BUGS_TAB}!A1:${FEEDBACK_BUG_LAST_COL}1`, row: FEEDBACK_BUG_HEADERS },
      { range: `${FEEDBACK_IDEES_TAB}!A1:${FEEDBACK_IDEE_LAST_COL}1`, row: FEEDBACK_IDEE_HEADERS },
    ]);
    console.warn(
      `Google Sheet "${FEEDBACK_SPREADSHEET_NAME}" créé (id: ${id}). Configure GOOGLE_FEEDBACK_SPREADSHEET_ID.`,
    );
  } else {
    await Promise.all([
      ensureTabExists(id, FEEDBACK_BUGS_TAB, FEEDBACK_BUG_HEADERS, FEEDBACK_BUG_LAST_COL),
      ensureTabExists(id, FEEDBACK_IDEES_TAB, FEEDBACK_IDEE_HEADERS, FEEDBACK_IDEE_LAST_COL),
    ]);
  }
  cachedFeedbackSpreadsheetId = id;
  return id;
}

export async function uploadFileToDrive(
  folderId: string,
  file: { name: string; mimeType: string; dataBase64: string },
): Promise<{ id: string; webViewLink: string }> {
  const boundary = "----fief" + Math.random().toString(36).slice(2);
  const metadata = { name: file.name, parents: [folderId], mimeType: file.mimeType };
  const bin = Buffer.from(file.dataBase64, "base64");
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, bin, tail]);
  const res = await fetchWithRetry(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: "POST",
      headers: {
        ...(await driveAuthHeaders()),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
    "Drive upload",
  );
  if (!res.ok) throw new Error(`Drive upload failed [${res.status}]: ${await res.text()}`);
  const j = (await res.json()) as { id: string; webViewLink?: string };
  return { id: j.id, webViewLink: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` };
}

/** Suppression ciblée utilisée notamment pour garantir le nettoyage des tests d'intégration. */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const res = await fetchWithRetry(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE", headers: await driveAuthHeaders() },
    "Drive file delete",
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive file delete failed [${res.status}]: ${await res.text()}`);
  }
}

export async function appendRow(
  spreadsheetId: string,
  range: string,
  row: unknown[],
): Promise<void> {
  await appendRows(spreadsheetId, range, [row]);
}

/** Ajoute plusieurs lignes avec un seul appel Google Sheets. */
export async function appendRows(
  spreadsheetId: string,
  range: string,
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    },
    "Sheet append",
  );
  if (!res.ok) throw new Error(`Sheet append failed [${res.status}]: ${await res.text()}`);
  invalidateRowsCache(spreadsheetId);
}

export async function updateRange(
  spreadsheetId: string,
  range: string,
  row: unknown[],
): Promise<void> {
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    },
    "Sheet update",
  );
  if (!res.ok) throw new Error(`Sheet update failed [${res.status}]: ${await res.text()}`);
  invalidateRowsCache(spreadsheetId);
}

/** Met à jour plusieurs plages indépendantes en un seul appel Google Sheets. */
export async function batchUpdateRanges(
  spreadsheetId: string,
  updates: Array<{ range: string; row: unknown[] }>,
): Promise<void> {
  if (updates.length === 0) return;
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: { ...(await sheetsAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates.map((update) => ({ range: update.range, values: [update.row] })),
      }),
    },
    "Sheet batch update",
  );
  if (!res.ok) throw new Error(`Sheet batch update failed [${res.status}]: ${await res.text()}`);
  invalidateRowsCache(spreadsheetId);
}

export async function getRows(spreadsheetId: string, range: string): Promise<string[][]> {
  const cacheKey = `${spreadsheetId}::${range}`;
  const cached = rowsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = (async () => {
    const res = await fetchWithRetry(
      `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}`,
      { headers: await sheetsAuthHeaders() },
      "Sheet read",
    );
    const j = (await res.json()) as { values?: string[][] };
    return j.values ?? [];
  })();
  rowsCache.set(cacheKey, { expiresAt: Date.now() + ROW_CACHE_TTL_MS, promise });
  try {
    return await promise;
  } catch (error) {
    rowsCache.delete(cacheKey);
    throw error;
  }
}

/** Lit plusieurs plages d'un même classeur en un seul appel Google Sheets. */
export async function batchGetRows(spreadsheetId: string, ranges: string[]): Promise<string[][][]> {
  if (ranges.length === 0) return [];
  const params = new URLSearchParams({ majorDimension: "ROWS" });
  for (const range of ranges) params.append("ranges", range);
  const res = await fetchWithRetry(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`,
    { headers: await sheetsAuthHeaders() },
    "Sheet batch read",
  );
  const json = (await res.json()) as {
    valueRanges?: Array<{ values?: string[][] }>;
  };
  const returned = json.valueRanges ?? [];
  return ranges.map((_, index) => returned[index]?.values ?? []);
}
