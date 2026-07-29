import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Famille tab column indices (0-based):
// A=0: ID enfant, B=1: Créé le, C=2: ID Parent 1, D=3: Prénom, E=4: Naissance, F=5: ID Parent 2

export interface Child {
  id: string;
  firstName: string;
  birthday: string; // ISO YYYY-MM-DD
}

function norm(s: string): string {
  return s.trim().toLocaleLowerCase("fr-FR");
}

function parseFamilleRow(row: string[]): Child | null {
  const id = (row[0] ?? "").trim();
  const firstName = (row[3] ?? "").trim();
  const birthday = (row[4] ?? "").trim();
  if (!id || !firstName) return null;
  return { id, firstName, birthday };
}

async function getMemberIdByName(
  spreadsheetId: string,
  firstName: string,
  lastName: string,
): Promise<string | null> {
  const { getRows, MEMBERS_TAB } = await import("../core/google/google.server");
  const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:J`);
  const row = rows.find(
    (r) => norm(r[2] ?? "") === norm(firstName) && norm(r[3] ?? "") === norm(lastName),
  );
  return row ? (row[0] ?? "").trim() || null : null;
}

// Lazy migration: reads inline-column children from the Membres tab and writes
// them to the Famille tab so existing data is not silently lost.
async function migrateInlineChildren(
  spreadsheetId: string,
  memberId: string,
  memberRowIndex: number,
  memberRow: string[],
  existingChildIds: Set<string>,
): Promise<Child[]> {
  const { appendRow, FAMILLE_TAB, MAX_CHILDREN_PER_MEMBER } =
    await import("../core/google/google.server");

  const CHILD_COLS_START = 10;
  const migrated: Child[] = [];

  for (let i = 0; i < MAX_CHILDREN_PER_MEMBER; i++) {
    const firstName = (memberRow[CHILD_COLS_START + i * 2] ?? "").trim();
    const birthday = (memberRow[CHILD_COLS_START + i * 2 + 1] ?? "").trim();
    if (!firstName) continue;
    // Skip if already in Famille tab (by firstName, case-insensitive)
    const alreadyMigrated = [...existingChildIds].some(
      (key) => key.startsWith(`fn:${norm(firstName)}`),
    );
    if (alreadyMigrated) continue;
    const childId = crypto.randomUUID();
    await appendRow(spreadsheetId, `${FAMILLE_TAB}!A:F`, [
      childId,
      new Date().toISOString(),
      memberId,
      firstName,
      birthday,
      "",
    ]);
    migrated.push({ id: childId, firstName, birthday });
  }
  return migrated;
}

// ── listChildren ──────────────────────────────────────────────────────────────

const ListInput = z.object({
  spreadsheetId: z.string().nullable(),
  parentFirstName: z.string().min(1).max(60),
  parentLastName: z.string().min(1).max(60),
});

export const listChildren = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, FAMILLE_TAB, MEMBERS_TAB, MAX_CHILDREN_PER_MEMBER } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);

    // Get member ID and row for lazy migration
    const memberRows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:V`);
    const memberRowIndex = memberRows.findIndex(
      (r) =>
        norm(r[2] ?? "") === norm(data.parentFirstName) &&
        norm(r[3] ?? "") === norm(data.parentLastName),
    );
    const memberId =
      memberRowIndex !== -1 ? (memberRows[memberRowIndex][0] ?? "").trim() : null;
    if (!memberId) return { children: [] };

    // Read Famille tab
    const familleRows = await getRows(spreadsheetId, `${FAMILLE_TAB}!A2:F`);
    const children = familleRows
      .filter((row) => {
        const p1 = (row[2] ?? "").trim();
        const p2 = (row[5] ?? "").trim();
        return p1 === memberId || p2 === memberId;
      })
      .map(parseFamilleRow)
      .filter((c): c is Child => c !== null);

    // Lazy migration: if no children in Famille tab yet, pull from inline columns
    if (children.length === 0 && memberRowIndex !== -1) {
      const seenKeys = new Set(children.map((c) => `fn:${norm(c.firstName)}`));
      const migrated = await migrateInlineChildren(
        spreadsheetId,
        memberId,
        memberRowIndex,
        memberRows[memberRowIndex],
        seenKeys,
      );
      children.push(...migrated);
    }

    return { children };
  });

// ── listChildrenByMemberId ────────────────────────────────────────────────────

const ListByIdInput = z.object({
  spreadsheetId: z.string().nullable(),
  memberId: z.string().min(1).max(36),
});

export const listChildrenByMemberId = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListByIdInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, FAMILLE_TAB, MEMBERS_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);

    const [familleRows, memberRows] = await Promise.all([
      getRows(spreadsheetId, `${FAMILLE_TAB}!A2:F`),
      getRows(spreadsheetId, `${MEMBERS_TAB}!A2:V`),
    ]);

    const children = familleRows
      .filter((row) => {
        const p1 = (row[2] ?? "").trim();
        const p2 = (row[5] ?? "").trim();
        return p1 === data.memberId || p2 === data.memberId;
      })
      .map(parseFamilleRow)
      .filter((c): c is Child => c !== null);

    // Lazy migration: if no children in Famille tab, pull from inline columns on member row
    if (children.length === 0) {
      const memberRowIndex = memberRows.findIndex((r) => (r[0] ?? "").trim() === data.memberId);
      if (memberRowIndex !== -1) {
        const seenKeys = new Set<string>();
        const migrated = await migrateInlineChildren(
          spreadsheetId,
          data.memberId,
          memberRowIndex,
          memberRows[memberRowIndex],
          seenKeys,
        );
        children.push(...migrated);
      }
    }

    return { children };
  });

// ── addChild ──────────────────────────────────────────────────────────────────

const AddInput = z.object({
  spreadsheetId: z.string().nullable(),
  parent1Id: z.string().min(1).max(36),
  firstName: z.string().min(1).max(60),
  birthday: z.string().max(20),
  parent2Id: z.string().max(36).optional(),
});

export const addChild = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AddInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, appendRow, FAMILLE_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const childId = crypto.randomUUID();
    const firstName = data.firstName.trim();
    const birthday = data.birthday.trim();
    try {
      await appendRow(spreadsheetId, `${FAMILLE_TAB}!A:F`, [
        childId,
        new Date().toISOString(),
        data.parent1Id,
        firstName,
        birthday,
        (data.parent2Id ?? "").trim(),
      ]);
    } catch (error) {
      throw new Error(
        `Échec de l'écriture Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { ok: true as const, child: { id: childId, firstName, birthday } };
  });

// ── deleteChild ───────────────────────────────────────────────────────────────

const DeleteInput = z.object({
  spreadsheetId: z.string().nullable(),
  childId: z.string().min(1).max(36),
});

export const deleteChild = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, deleteRow, FAMILLE_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(spreadsheetId, `${FAMILLE_TAB}!A2:F`);
    const rowIndex = rows.findIndex((r) => (r[0] ?? "").trim() === data.childId);
    if (rowIndex === -1) throw new Error("Enfant introuvable.");
    try {
      await deleteRow(spreadsheetId, FAMILLE_TAB, rowIndex);
    } catch (error) {
      throw new Error(
        `Échec de la suppression Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { ok: true as const };
  });

// ── linkSpouseChildren ────────────────────────────────────────────────────────
// When a new member selects a spouse, links the spouse's existing children
// (those with empty Parent 2) to the new member as Parent 2.

const LinkInput = z.object({
  spreadsheetId: z.string().nullable(),
  spouseMemberId: z.string().min(1).max(36),
  newMemberId: z.string().min(1).max(36),
});

export const linkSpouseChildren = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LinkInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, updateRange, FAMILLE_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(spreadsheetId, `${FAMILLE_TAB}!A2:F`);

    let linked = 0;
    for (const [i, row] of rows.entries()) {
      const p1 = (row[2] ?? "").trim();
      const p2 = (row[5] ?? "").trim();
      if (p1 === data.spouseMemberId && !p2) {
        const sheetRow = i + 2;
        await updateRange(spreadsheetId, `${FAMILLE_TAB}!F${sheetRow}`, [data.newMemberId]);
        linked++;
      }
    }
    return { ok: true as const, linked };
  });
