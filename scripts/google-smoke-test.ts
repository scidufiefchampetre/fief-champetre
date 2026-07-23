import {
  addTab,
  appendRows,
  batchAppendRowsByTab,
  batchMutateRows,
  batchUpdateRanges,
  deleteDriveFile,
  deleteSheetTab,
  ensureChantiersSpreadsheet,
  ensureDriveFolder,
  ensureSpreadsheet,
  getRows,
  uploadFileToDrive,
} from "../src/core/google/google.server";
import {
  deleteCalendarEvent,
  insertCalendarEvent,
  listCalendarEvents,
} from "../src/core/google/google-calendar.server";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const suffix = `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
const mainTab = `__CODEX_TEST_${suffix}`;
const chantierTabA = `__CODEX_CA_${suffix}`;
const chantierTabB = `__CODEX_CB_${suffix}`;
let mainSpreadsheetId = "";
let chantierSpreadsheetId = "";
let calendarEventId = "";
let driveFileId = "";

async function cleanup() {
  const errors: string[] = [];
  for (const [spreadsheetId, tab] of [
    [mainSpreadsheetId, mainTab],
    [chantierSpreadsheetId, chantierTabA],
    [chantierSpreadsheetId, chantierTabB],
  ] as const) {
    if (!spreadsheetId) continue;
    try {
      await deleteSheetTab(spreadsheetId, tab);
    } catch (error) {
      errors.push(`onglet ${tab}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (calendarEventId) {
    try {
      await deleteCalendarEvent(calendarEventId);
    } catch (error) {
      errors.push(`événement Calendar: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (driveFileId) {
    try {
      await deleteDriveFile(driveFileId);
    } catch (error) {
      errors.push(`fichier Drive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length) throw new Error(`Nettoyage incomplet — ${errors.join(" ; ")}`);
}

async function run() {
  try {
    mainSpreadsheetId = await ensureSpreadsheet(null);
    await addTab(mainSpreadsheetId, mainTab, ["ID", "Valeur", "État"], "C");
    await appendRows(mainSpreadsheetId, `'${mainTab}'!A:C`, [
      ["test-1", "alpha", "brouillon"],
      ["test-2", "beta", "brouillon"],
    ]);
    let rows = await getRows(mainSpreadsheetId, `'${mainTab}'!A2:C`);
    assert(rows.length === 2, "L'ajout groupé de lignes a échoué.");

    await batchUpdateRanges(mainSpreadsheetId, [
      { range: `'${mainTab}'!B2:C2`, row: ["alpha-validé", "validé"] },
      { range: `'${mainTab}'!C3`, row: ["validé"] },
    ]);
    rows = await getRows(mainSpreadsheetId, `'${mainTab}'!A2:C`);
    assert(rows[0]?.[1] === "alpha-validé", "La mise à jour groupée a échoué.");
    assert(rows[1]?.[2] === "validé", "La seconde plage du batch n'a pas été écrite.");

    await batchMutateRows(mainSpreadsheetId, mainTab, {
      updates: [{ rowIndex0Based: 0, startColumn0Based: 2, values: ["archivé"] }],
      deletes: [1],
      appends: [["test-3", "gamma", "validé"]],
    });
    rows = await getRows(mainSpreadsheetId, `'${mainTab}'!A2:C`);
    assert(rows.length === 2, "La mutation atomique n'a pas conservé deux lignes.");
    assert(rows[0]?.[2] === "archivé", "La mutation atomique n'a pas mis à jour la ligne.");
    assert(rows[1]?.[0] === "test-3", "La mutation atomique n'a pas ajouté la ligne.");

    chantierSpreadsheetId = await ensureChantiersSpreadsheet(null);
    await addTab(chantierSpreadsheetId, chantierTabA, ["ID", "Valeur"], "B");
    await addTab(chantierSpreadsheetId, chantierTabB, ["ID", "Valeur"], "B");
    await batchAppendRowsByTab(chantierSpreadsheetId, [
      { tabTitle: chantierTabA, rows: [["a", "courses"]] },
      { tabTitle: chantierTabB, rows: [["b", "cuisine"]] },
    ]);
    const [rowsA, rowsB] = await Promise.all([
      getRows(chantierSpreadsheetId, `'${chantierTabA}'!A2:B`),
      getRows(chantierSpreadsheetId, `'${chantierTabB}'!A2:B`),
    ]);
    assert(rowsA[0]?.[1] === "courses", "Le batch multi-onglets A a échoué.");
    assert(rowsB[0]?.[1] === "cuisine", "Le batch multi-onglets B a échoué.");

    const calendarEvent = await insertCalendarEvent({
      summary: `TEST CODEX ${suffix}`,
      colorId: "8",
      startDate: "2031-01-10",
      endDate: "2031-01-11",
      privateExtendedProperties: { codexTest: suffix },
    });
    calendarEventId = calendarEvent.id;
    const events = await listCalendarEvents("2031-01-09T00:00:00.000Z", "2031-01-12T00:00:00.000Z");
    assert(
      events.some((event) => event.id === calendarEventId),
      "L'échange Calendar a échoué.",
    );

    const driveFolderId = await ensureDriveFolder(null);
    const uploaded = await uploadFileToDrive(driveFolderId, {
      name: `__CODEX_TEST_${suffix}.txt`,
      mimeType: "text/plain",
      dataBase64: Buffer.from("test temporaire supprimé automatiquement").toString("base64"),
    });
    driveFileId = uploaded.id;
    assert(Boolean(uploaded.webViewLink), "L'upload Drive n'a pas renvoyé de lien.");

    console.log("Google Sheets, Calendar et Drive : tests d'écriture réussis.");
  } finally {
    await cleanup();
    console.log("Nettoyage : onglets, événement et fichier de test supprimés.");
  }
}

await run();
