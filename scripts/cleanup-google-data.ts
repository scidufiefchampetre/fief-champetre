import { getGoogleAccessToken } from "../src/core/google/google-oauth.server";
import {
  ASSO_TAB,
  CHANTIERS_SPREADSHEET_NAME,
  CHANTIER_HEADERS,
  CHANTIER_TAB,
  EXPENSE_HEADERS,
  MEMBERS_TAB,
  MEMBER_HEADERS,
  RESERVATIONS_TAB,
  RESERVATION_HEADERS,
  SCI_TAB,
} from "../src/core/google/google.server";
import { CHANTIER_TAB_HEADERS } from "../src/lib/chantier-types";

const apply = process.argv.includes("--apply");
const BACKUP_FOLDER_NAME = "_Sauvegardes avant nettoyage";
const TASK_CATALOG_HEADERS = ["ID", "Libellé"];
const CONTRIBUTIONS_HEADERS = ["ID", "Créé le", "Réservation ID", "Personne", "Tâche", "Jours"];
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
];

const MAIN_SCHEMAS = new Map<string, string[]>([
  [SCI_TAB, EXPENSE_HEADERS],
  [ASSO_TAB, EXPENSE_HEADERS],
  [MEMBERS_TAB, MEMBER_HEADERS],
  [RESERVATIONS_TAB, RESERVATION_HEADERS],
]);
const CHANTIER_SCHEMAS = new Map<string, string[]>([
  [CHANTIER_TAB, CHANTIER_HEADERS],
  ["Tâches types", TASK_CATALOG_HEADERS],
  ["Jours chantier", CONTRIBUTIONS_HEADERS],
  ["Signalements chantier", REPORTS_HEADERS],
]);

type FileMeta = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  md5Checksum?: string;
};
type SheetMeta = {
  properties: {
    sheetId: number;
    title: string;
    index: number;
    gridProperties?: { rowCount?: number; columnCount?: number };
  };
};
type SpreadsheetMeta = {
  spreadsheetId: string;
  properties: { title: string };
  sheets: SheetMeta[];
};

function quote(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

function columnLetter(count: number) {
  let result = "";
  for (let value = count; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(((value - 1) % 26) + 65) + result;
  }
  return result;
}

async function google<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function resolveChantiersSpreadsheet(token: string) {
  if (process.env.GOOGLE_CHANTIERS_SPREADSHEET_ID)
    return process.env.GOOGLE_CHANTIERS_SPREADSHEET_ID;
  const result = await google<{ files?: FileMeta[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name = '${CHANTIERS_SPREADSHEET_NAME.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`)}&fields=files(id,name,mimeType)&orderBy=modifiedTime desc&pageSize=10`,
    token,
  );
  const id = result.files?.[0]?.id;
  if (!id) throw new Error("Classeur Chantiers introuvable.");
  return id;
}

async function metadata(id: string, token: string) {
  return google<SpreadsheetMeta>(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId,properties.title,sheets.properties`,
    token,
  );
}

async function values(id: string, title: string, token: string) {
  return (
    (
      await google<{ values?: unknown[][] }>(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`${quote(title)}!A:ZZ`)}`,
        token,
      )
    ).values ?? []
  );
}

function driveIdsIn(rows: unknown[][]) {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const value of row) {
      for (const match of String(value ?? "").matchAll(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{15,})/g)) {
        if (match[1]) ids.add(match[1]);
      }
    }
  }
  return ids;
}

async function ensureBackupFolder(folderId: string, token: string) {
  const query = `'${folderId}' in parents and name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await google<{ files?: FileMeta[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=10`,
    token,
  );
  if (found.files?.[0]) return found.files[0].id;
  if (!apply) return "<nouveau dossier de sauvegarde>";
  const created = await google<FileMeta>(
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name: BACKUP_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
        parents: [folderId],
      }),
    },
  );
  return created.id;
}

async function backupSpreadsheet(id: string, title: string, backupFolderId: string, token: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return google<{ id: string; name: string; webViewLink?: string }>(
    `https://www.googleapis.com/drive/v3/files/${id}/copy?supportsAllDrives=true&fields=id,name,webViewLink`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ name: `${title} — sauvegarde ${stamp}`, parents: [backupFolderId] }),
    },
  );
}

async function planSpreadsheet(id: string, kind: "main" | "chantiers", token: string) {
  const meta = await metadata(id, token);
  const sheetValues = new Map<string, unknown[][]>();
  await Promise.all(
    meta.sheets.map(async (sheet) => {
      sheetValues.set(sheet.properties.title, await values(id, sheet.properties.title, token));
    }),
  );

  const deletes: SheetMeta[] = [];
  const retained: Array<{
    sheet: SheetMeta;
    headers: string[];
    rows: unknown[][];
    targetRows: number;
  }> = [];
  const unknown: string[] = [];
  const references = new Set<string>();

  for (const sheet of meta.sheets) {
    const title = sheet.properties.title;
    const rows = sheetValues.get(title) ?? [];
    for (const id of driveIdsIn(rows)) references.add(id);
    const schema =
      kind === "main"
        ? MAIN_SCHEMAS.get(title)
        : (CHANTIER_SCHEMAS.get(title) ??
          (title.startsWith("Chantier ") ? CHANTIER_TAB_HEADERS : undefined));
    if (!schema) {
      unknown.push(title);
      continue;
    }
    const populatedDataRows = rows
      .slice(1)
      .filter((row) => row.some((cell) => String(cell ?? "").trim())).length;
    // Un événement Calendar n'a pas besoin d'un onglet de détail tant qu'aucune
    // donnée propre au chantier n'existe. L'app le recréera à la demande.
    const isEmptyChantierTab =
      kind === "chantiers" && title.startsWith("Chantier ") && populatedDataRows === 0;
    if ((title.includes("_conflict") && populatedDataRows === 0) || isEmptyChantierTab) {
      deletes.push(sheet);
      continue;
    }
    retained.push({
      sheet,
      headers: schema,
      rows,
      targetRows: Math.max(100, rows.length + 20),
    });
  }

  return { meta, deletes, retained, unknown, references };
}

async function applySpreadsheetPlan(
  id: string,
  plan: Awaited<ReturnType<typeof planSpreadsheet>>,
  token: string,
) {
  const requests = [
    ...plan.deletes.map((sheet) => ({ deleteSheet: { sheetId: sheet.properties.sheetId } })),
    ...plan.retained.map(({ sheet, headers, targetRows }) => ({
      updateSheetProperties: {
        properties: {
          sheetId: sheet.properties.sheetId,
          gridProperties: { rowCount: targetRows, columnCount: headers.length, frozenRowCount: 1 },
        },
        fields: "gridProperties(rowCount,columnCount,frozenRowCount)",
      },
    })),
  ];
  await google(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  await google(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: plan.retained.map(({ sheet, headers }) => ({
        range: `${quote(sheet.properties.title)}!A1:${columnLetter(headers.length)}1`,
        values: [headers],
      })),
    }),
  });
}

async function listDirectChildren(folderId: string, token: string) {
  return (
    (
      await google<{ files?: FileMeta[] }>(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed = false`)}&fields=files(id,name,mimeType,md5Checksum,parents)&orderBy=name&pageSize=1000`,
        token,
      )
    ).files ?? []
  );
}

async function main() {
  const mainSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!mainSpreadsheetId || !folderId)
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID et GOOGLE_DRIVE_FOLDER_ID sont requis.");

  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ]);
  const chantiersSpreadsheetId = await resolveChantiersSpreadsheet(token);
  const [mainPlan, chantiersPlan, rootFiles] = await Promise.all([
    planSpreadsheet(mainSpreadsheetId, "main", token),
    planSpreadsheet(chantiersSpreadsheetId, "chantiers", token),
    listDirectChildren(folderId, token),
  ]);
  const referenced = new Set([...mainPlan.references, ...chantiersPlan.references]);
  const orphanedRootFiles = rootFiles.filter(
    (file) =>
      file.mimeType !== "application/vnd.google-apps.folder" &&
      file.mimeType !== "application/vnd.google-apps.spreadsheet" &&
      !referenced.has(file.id),
  );

  const plan = {
    mode: apply ? "APPLY" : "DRY_RUN",
    spreadsheets: [
      {
        title: mainPlan.meta.properties.title,
        deleteTabs: mainPlan.deletes.map((sheet) => sheet.properties.title),
        normalizeTabs: mainPlan.retained.map(({ sheet, headers, targetRows }) => ({
          title: sheet.properties.title,
          columns: headers.length,
          rows: targetRows,
        })),
        unknownTabsPreserved: mainPlan.unknown,
      },
      {
        title: chantiersPlan.meta.properties.title,
        deleteTabs: chantiersPlan.deletes.map((sheet) => sheet.properties.title),
        normalizeTabs: chantiersPlan.retained.map(({ sheet, headers, targetRows }) => ({
          title: sheet.properties.title,
          columns: headers.length,
          rows: targetRows,
        })),
        unknownTabsPreserved: chantiersPlan.unknown,
      },
    ],
    trashRecoverableFiles: orphanedRootFiles.map((file) => file.name),
    protectedReferencedFiles: referenced.size,
    calendarOperations: 0,
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!apply) return;

  const backupFolderId = await ensureBackupFolder(folderId, token);
  const backups = await Promise.all([
    backupSpreadsheet(mainSpreadsheetId, mainPlan.meta.properties.title, backupFolderId, token),
    backupSpreadsheet(
      chantiersSpreadsheetId,
      chantiersPlan.meta.properties.title,
      backupFolderId,
      token,
    ),
  ]);
  await Promise.all([
    applySpreadsheetPlan(mainSpreadsheetId, mainPlan, token),
    applySpreadsheetPlan(chantiersSpreadsheetId, chantiersPlan, token),
  ]);
  await Promise.all(
    orphanedRootFiles.map((file) =>
      google(`https://www.googleapis.com/drive/v3/files/${file.id}?supportsAllDrives=true`, token, {
        method: "PATCH",
        body: JSON.stringify({ trashed: true }),
      }),
    ),
  );
  console.log(
    JSON.stringify(
      {
        completed: true,
        backupFolderId,
        backups,
        trashedFiles: orphanedRootFiles.length,
        calendarOperations: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
