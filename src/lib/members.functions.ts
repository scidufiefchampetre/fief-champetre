import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MOCK_MEMBERS } from "./mock-data";

const IS_MOCK = process.env["VITE_USE_MOCK_DATA"] === "true";

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  iban: string;
  bankName: string;
  birthday: string; // ISO YYYY-MM-DD
  email: string;
  spouseId: string; // ID du membre conjoint, vide si non renseigné
}

const ListInput = z.object({ spreadsheetId: z.string().nullable() });
const AddInput = z.object({
  spreadsheetId: z.string().nullable(),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  iban: z.string().min(10).max(60),
  bankName: z.string().min(1).max(80),
  birthday: z.string().min(1).max(20),
  email: z.string().email().max(120),
  spouseId: z.string().max(36).optional(),
});

export const listMembers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }) => {
    if (IS_MOCK) {
      return { spreadsheetId: "mock", members: MOCK_MEMBERS };
    }
    const { ensureSpreadsheet, getRows, updateRange, MEMBERS_TAB } =
      await import("../core/google/google.server");

    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    console.log(
      `[listMembers] classeur résolu : ${spreadsheetId} (reçu du client : ${data.spreadsheetId ?? "null"})`,
    );
    // Colonnes fixes, garanties par ensureSpreadsheet : A=ID, B=Inscrit le,
    // C=Prénom, D=Nom, E=IBAN, F=Banque, G=Naissance, H=Email, I=Conjoint
    // prénom, J=Conjoint nom, puis les paires Enfant N (voir
    // children.functions.ts) — pas besoin de les lire ici.
    const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:J`);

    const byName = new Map<string, Member>();
    for (const [index, row] of rows.entries()) {
      const firstName = (row[2] ?? "").trim();
      const lastName = (row[3] ?? "").trim();
      if (!firstName || !lastName) continue; // ligne vide ou résiduelle, ignorée
      let id = (row[0] ?? "").trim();
      if (!id) {
        // Backfill : les lignes d'avant la colonne ID s'en voient attribuer
        // un au premier chargement — pas de script de migration à lancer.
        id = crypto.randomUUID();
        await updateRange(spreadsheetId, `${MEMBERS_TAB}!A${index + 2}:A${index + 2}`, [id]);
      }
      const member: Member = {
        id,
        firstName,
        lastName,
        iban: (row[4] ?? "").trim(),
        bankName: (row[5] ?? "").trim(),
        birthday: (row[6] ?? "").trim(),
        email: (row[7] ?? "").trim(),
        spouseId: (row[8] ?? "").trim(),
      };
      byName.set(
        `${firstName.toLocaleLowerCase("fr-FR")}:${lastName.toLocaleLowerCase("fr-FR")}`,
        member,
      );
    }

    const members = [...byName.values()].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "fr"),
    );

    return { spreadsheetId, members };
  });

// Lecture légère destinée à l'accueil : adultes et enfants sont ramenés dans
// une liste commune afin de pouvoir afficher les anniversaires des personnes
// effectivement inscrites à un chantier.
export const listPeopleBirthdays = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, MEMBERS_TAB, MAX_CHILDREN_PER_MEMBER } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:V`);
    const people: Array<{ firstName: string; birthday: string; kind: "adult" | "child" }> = [];
    for (const row of rows) {
      const adultName = (row[2] ?? "").trim();
      const adultBirthday = (row[6] ?? "").trim();
      if (adultName && adultBirthday)
        people.push({ firstName: adultName, birthday: adultBirthday, kind: "adult" });
      for (let index = 0; index < MAX_CHILDREN_PER_MEMBER; index++) {
        const firstName = (row[10 + index * 2] ?? "").trim();
        const birthday = (row[11 + index * 2] ?? "").trim();
        if (firstName && birthday) people.push({ firstName, birthday, kind: "child" });
      }
    }
    return { spreadsheetId, people };
  });

export const addMember = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AddInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, appendRow, MEMBERS_TAB } =
      await import("../core/google/google.server");

    const capitalizeFirst = (s: string) => {
      const lower = s.trim().toLocaleLowerCase("fr-FR");
      if (!lower) return "";
      return lower.charAt(0).toLocaleUpperCase("fr-FR") + lower.slice(1);
    };
    const firstName = data.firstName
      .trim()
      .split(/(\s|-)/)
      .map((p) => (p === "-" || p.trim() === "" ? p : capitalizeFirst(p)))
      .join("");
    const lastName = data.lastName.trim().toLocaleUpperCase("fr-FR");
    const iban = data.iban.replace(/\s+/g, "").toUpperCase();
    const bankName = data.bankName.trim();
    const birthday = data.birthday.trim();
    const email = data.email.trim().toLocaleLowerCase("fr-FR");

    let spreadsheetId: string;
    try {
      spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    } catch (error) {
      console.error("[addMember] échec ensureSpreadsheet:", error);
      throw new Error(
        `Impossible d'accéder au classeur Google : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    console.log(
      `[addMember] classeur résolu : ${spreadsheetId} (reçu du client : ${data.spreadsheetId ?? "null"})`,
    );

    const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:J`);
    const exists = rows.some(
      (r) =>
        (r[2] ?? "").toLocaleLowerCase("fr-FR") === firstName.toLocaleLowerCase("fr-FR") &&
        (r[3] ?? "").toLocaleUpperCase("fr-FR") === lastName,
    );
    const memberId = crypto.randomUUID();
    if (exists) {
      console.log(
        `[addMember] ${firstName} ${lastName} existe déjà dans ${MEMBERS_TAB}, pas de doublon créé.`,
      );
    } else {
      try {
        // On écrit seulement A..J : les colonnes enfants (K et suivantes)
        // restent vides par défaut (voir children.functions.ts).
        await appendRow(spreadsheetId, `${MEMBERS_TAB}!A:J`, [
          memberId,
          new Date().toISOString(),
          firstName,
          lastName,
          iban,
          bankName,
          birthday,
          email,
          (data.spouseId ?? "").trim(),
          "",
        ]);
        console.log(
          `[addMember] ligne ajoutée pour ${firstName} ${lastName} dans ${MEMBERS_TAB} (classeur ${spreadsheetId}).`,
        );
      } catch (error) {
        console.error("[addMember] échec appendRow (Sheets):", error);
        throw new Error(
          `Échec de l'écriture Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const existingId = exists
      ? (
          rows.find(
            (r) =>
              (r[2] ?? "").toLocaleLowerCase("fr-FR") === firstName.toLocaleLowerCase("fr-FR") &&
              (r[3] ?? "").toLocaleUpperCase("fr-FR") === lastName,
          )?.[0] ?? ""
        ).trim()
      : "";
    return {
      spreadsheetId,
      member: {
        id: existingId || memberId,
        firstName,
        lastName,
        iban,
        bankName,
        birthday,
        email,
        spouseId: "",
      },
    };
  });

const UpdateInput = z.object({
  spreadsheetId: z.string().nullable(),
  // Prénom/Nom servent de clé d'identité (ce sont eux qui relient une personne
  // à ses réservations et dépenses passées) : on ne les rend pas modifiables
  // ici pour ne pas casser ce lien silencieusement.
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  iban: z.string().min(10).max(60),
  bankName: z.string().min(1).max(80),
  birthday: z.string().min(1).max(20),
  email: z.string().email().max(120),
  spouseId: z.string().max(36).optional(),
});

export const updateMember = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, updateRange, MEMBERS_TAB } =
      await import("../core/google/google.server");

    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const iban = data.iban.replace(/\s+/g, "").toUpperCase();
    const bankName = data.bankName.trim();
    const birthday = data.birthday.trim();
    const email = data.email.trim().toLocaleLowerCase("fr-FR");
    const spouseId = (data.spouseId ?? "").trim();

    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:J`);
    const rowIndex = rows.findIndex(
      (r) =>
        (r[2] ?? "").toLocaleLowerCase("fr-FR") === firstName.toLocaleLowerCase("fr-FR") &&
        (r[3] ?? "").toLocaleUpperCase("fr-FR") === lastName.toLocaleUpperCase("fr-FR"),
    );
    if (rowIndex === -1) throw new Error("Fiche membre introuvable.");

    const id = (rows[rowIndex][0] ?? "").trim() || crypto.randomUUID();
    const createdAt = rows[rowIndex][1] ?? "";
    const sheetRow = rowIndex + 2; // +2 : en-tête ligne 1, index 0-based -> ligne 1-based.
    try {
      // Important : la plage s'arrête à J (jamais au-delà) — les colonnes
      // enfants qui suivent sur cette même ligne ne doivent jamais être
      // touchées par une simple mise à jour de profil.
      await updateRange(spreadsheetId, `${MEMBERS_TAB}!A${sheetRow}:J${sheetRow}`, [
        id,
        createdAt,
        firstName,
        lastName.toLocaleUpperCase("fr-FR"),
        iban,
        bankName,
        birthday,
        email,
        spouseId,
        "",
      ]);
    } catch (error) {
      console.error("[updateMember] échec updateRange (Sheets):", error);
      throw new Error(
        `Échec de la mise à jour Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      spreadsheetId,
      member: {
        id,
        firstName,
        lastName: lastName.toLocaleUpperCase("fr-FR"),
        iban,
        bankName,
        birthday,
        email,
        spouseId,
      },
    };
  });

const DeleteInput = z.object({
  spreadsheetId: z.string().nullable(),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
});

export const deleteMember = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, deleteRow, MEMBERS_TAB } =
      await import("../core/google/google.server");

    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();

    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(spreadsheetId, `${MEMBERS_TAB}!A2:J`);
    const rowIndex = rows.findIndex(
      (r) =>
        (r[2] ?? "").toLocaleLowerCase("fr-FR") === firstName.toLocaleLowerCase("fr-FR") &&
        (r[3] ?? "").toLocaleUpperCase("fr-FR") === lastName.toLocaleUpperCase("fr-FR"),
    );
    if (rowIndex === -1) throw new Error("Fiche membre introuvable.");

    try {
      // On supprime bien la ligne dans le classeur Google Drive — pas juste un
      // marquage local. Ses réservations et dépenses passées restent dans les
      // autres onglets (historique/comptabilité), seule sa fiche membre part
      // (avec les enfants qu'elle portait sur cette même ligne).
      await deleteRow(spreadsheetId, MEMBERS_TAB, rowIndex);
    } catch (error) {
      console.error("[deleteMember] échec deleteRow (Sheets):", error);
      throw new Error(
        `Échec de la suppression Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { ok: true as const };
  });
