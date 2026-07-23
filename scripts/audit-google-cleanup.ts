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

const expectedChantiers = new Map<string, string[]>([
  [CHANTIER_TAB, CHANTIER_HEADERS],
  ["Tâches types", TASK_CATALOG_HEADERS],
  ["Jours chantier", CONTRIBUTIONS_HEADERS],
  ["Signalements chantier", REPORTS_HEADERS],
]);

type SheetMeta = {
  properties: {
    sheetId: number;
    title: string;
    index: number;
    hidden?: boolean;
    gridProperties?: { rowCount?: number; columnCount?: number; frozenRowCount?: number };
  };
};

type SpreadsheetMeta = {
  spreadsheetId: string;
  properties: { title: string };
  sheets: SheetMeta[];
};

const expectedMain = new Map<string, string[]>([
  [SCI_TAB, EXPENSE_HEADERS],
  [ASSO_TAB, EXPENSE_HEADERS],
  [MEMBERS_TAB, MEMBER_HEADERS],
  [RESERVATIONS_TAB, RESERVATION_HEADERS],
]);

function quoted(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

async function googleJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

async function readValues(spreadsheetId: string, title: string, token: string) {
  const range = encodeURIComponent(`${quoted(title)}!A:ZZ`);
  const result = await googleJson<{ values?: unknown[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    token,
  );
  return result.values ?? [];
}

function normalizeRow(row: unknown[]) {
  return row.map((cell) => String(cell ?? "").trim());
}

async function inspectSpreadsheet(
  spreadsheetId: string,
  kind: "main" | "chantiers",
  token: string,
) {
  const metadata = await googleJson<SpreadsheetMeta>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`,
    token,
  );

  const sheets = [];
  const referencedDriveIds = new Set<string>();
  for (const sheet of metadata.sheets.sort((a, b) => a.properties.index - b.properties.index)) {
    const title = sheet.properties.title;
    const values = await readValues(spreadsheetId, title, token);
    for (const row of values) {
      for (const cell of row) {
        const text = String(cell ?? "");
        for (const match of text.matchAll(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{15,})/g)) {
          if (match[1]) referencedDriveIds.add(match[1]);
        }
      }
    }
    const header = normalizeRow(values[0] ?? []);
    const dataRows = values.slice(1);
    const emptyRows = dataRows
      .map((row, index) => ({ row: index + 2, empty: normalizeRow(row).every((cell) => !cell) }))
      .filter((entry) => entry.empty)
      .map((entry) => entry.row);
    const expected =
      kind === "main"
        ? expectedMain.get(title)
        : (expectedChantiers.get(title) ??
          (title.startsWith("Chantier ") ? CHANTIER_TAB_HEADERS : undefined));
    const extraHeaders = expected ? header.slice(expected.length).filter(Boolean) : header;
    const missingHeaders = expected
      ? expected.filter((value, index) => header[index] !== value)
      : [];

    sheets.push({
      sheetId: sheet.properties.sheetId,
      title,
      hidden: Boolean(sheet.properties.hidden),
      gridRows: sheet.properties.gridProperties?.rowCount ?? 0,
      gridColumns: sheet.properties.gridProperties?.columnCount ?? 0,
      usedRows: values.length,
      usedColumns: Math.max(0, ...values.map((row) => row.length)),
      dataRows: dataRows.length - emptyRows.length,
      emptyRows,
      expectedColumns: expected?.length ?? null,
      extraHeaders,
      missingHeaders,
      classification:
        expectedChantiers.has(title) || (kind === "main" && expected)
          ? "attendu"
          : kind === "chantiers" && title.startsWith("Chantier ")
            ? "chantier-dynamique"
            : "inconnu",
    });
  }

  return {
    id: metadata.spreadsheetId,
    title: metadata.properties.title,
    kind,
    sheets,
    referencedDriveIds: [...referencedDriveIds],
  };
}

async function main() {
  const mainSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!mainSpreadsheetId || !folderId) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID et GOOGLE_DRIVE_FOLDER_ID sont requis.");
  }

  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
  ]);
  let chantiersSpreadsheetId = process.env.GOOGLE_CHANTIERS_SPREADSHEET_ID;
  if (!chantiersSpreadsheetId) {
    const found = await googleJson<{ files?: Array<{ id: string }> }>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name = '${CHANTIERS_SPREADSHEET_NAME.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`)}&fields=files(id)&orderBy=modifiedTime desc&pageSize=10`,
      token,
    );
    chantiersSpreadsheetId = found.files?.[0]?.id;
  }
  if (!chantiersSpreadsheetId) throw new Error("Classeur Chantiers introuvable.");
  const [mainSheet, chantiersSheet, drive] = await Promise.all([
    inspectSpreadsheet(mainSpreadsheetId, "main", token),
    inspectSpreadsheet(chantiersSpreadsheetId, "chantiers", token),
    googleJson<{
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        createdTime?: string;
        modifiedTime?: string;
        size?: string;
        md5Checksum?: string;
      }>;
    }>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed = false`)}&fields=files(id,name,mimeType,createdTime,modifiedTime,size,md5Checksum)&orderBy=name&pageSize=1000`,
      token,
    ),
  ]);
  const rootFiles = drive.files ?? [];
  const folders = rootFiles.filter(
    (file) => file.mimeType === "application/vnd.google-apps.folder",
  );
  const childrenByFolder = new Map<
    string,
    Array<{
      id: string;
      name: string;
      mimeType: string;
      createdTime?: string;
      modifiedTime?: string;
      size?: string;
      md5Checksum?: string;
    }>
  >();
  await Promise.all(
    folders.map(async (folder) => {
      const children = await googleJson<{ files?: typeof rootFiles }>(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folder.id}' in parents and trashed = false`)}&fields=files(id,name,mimeType,createdTime,modifiedTime,size,md5Checksum)&orderBy=name&pageSize=1000`,
        token,
      );
      childrenByFolder.set(folder.id, children.files ?? []);
    }),
  );
  const allDriveFiles = [
    ...rootFiles.map((file) => ({ ...file, location: "/" })),
    ...folders.flatMap((folder) =>
      (childrenByFolder.get(folder.id) ?? []).map((file) => ({
        ...file,
        location: `/${folder.name}/`,
      })),
    ),
  ];

  console.log(
    JSON.stringify(
      {
        spreadsheets: [mainSheet, chantiersSheet],
        driveFiles: allDriveFiles.map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size ? Number(file.size) : null,
          md5Checksum: file.md5Checksum ?? null,
          referenced:
            mainSheet.referencedDriveIds.includes(file.id) ||
            chantiersSheet.referencedDriveIds.includes(file.id),
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          location: file.location,
        })),
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
