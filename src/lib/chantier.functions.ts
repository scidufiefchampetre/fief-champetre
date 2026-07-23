import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  chantierDisplayName,
  chantierTabTitle,
  type Chantier,
  type ChantierPeriod,
  type ChantierTask,
} from "./chantier-types";
import { CALENDAR_COLOR_BY_TYPE } from "./reservation-types";
import { MOCK_CHANTIERS, MOCK_TASKS } from "./mock-data";

const IS_MOCK = process.env["VITE_USE_MOCK_DATA"] === "true";

// Chantier Overview : A=ID, B=Créé le, C=Réservé par, D=Date début, E=Date fin,
// F=Titre, G=Description, H=Titre fiche, I=Moment début, J=Moment fin,
// K=ID événement Calendar, L=Annulé le
function rowToChantier(row: string[]): Chantier | null {
  const id = (row[0] ?? "").trim();
  if (!id) return null;
  const startDate = row[3] ?? "";
  const endDate = row[4] ?? "";
  return {
    id,
    createdAt: row[1] ?? "",
    reservedBy: row[2] ?? "",
    startDate,
    endDate,
    startPeriod: normalizePeriod(row[8]) || suggestedPeriod(startDate, "start"),
    endPeriod: normalizePeriod(row[9]) || suggestedPeriod(endDate, "end"),
    adults: 0,
    children: 0,
    calendarEventId: row[10] || null,
    cancelledAt: row[11] || null,
  };
}

function normalizePeriod(value: unknown): ChantierPeriod {
  return value === "matin" || value === "apres_midi" || value === "soir" ? value : "";
}

function suggestedPeriod(date: string, edge: "start" | "end"): ChantierPeriod {
  if (!date) return "";
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (edge === "start" && weekday === 5) return "soir";
  if (edge === "end" && weekday === 3) return "apres_midi";
  return "";
}

function chantierToRow(c: Chantier): unknown[] {
  // A=ID, B=Créé le, C=Réservé par, D=Date début, E=Date fin,
  // F=Titre (auto), G=Description, H=Titre fiche, I=Moment début, J=Moment fin,
  // K=ID événement Calendar, L=Annulé le
  return [
    c.id,
    c.createdAt,
    c.reservedBy,
    c.startDate,
    c.endDate,
    chantierDisplayName(c.startDate, c.endDate),
    "", // Description — écrit séparément via updateChantierFiche
    "", // Titre fiche — idem
    c.startPeriod,
    c.endPeriod,
    c.calendarEventId ?? "",
    c.cancelledAt ?? "",
  ];
}

function isChantierEvent(event: { summary: string; colorId: string | null }): boolean {
  return (
    event.colorId === CALENDAR_COLOR_BY_TYPE.chantier ||
    event.summary.toUpperCase().includes("CHANTIER")
  );
}

// Tâches : A=ID Chantier, B=ID, C=Créé le, D=Tâche, E=Urgence, F=Fait,
// G=Note, H=Participants, I=Terminé le, J=Photo résultat, K=Durée (min), L=Nb personnes

function rowToTask(row: string[], chantierId: string): ChantierTask | null {
  if ((row[0] ?? "") !== chantierId) return null;
  const id = (row[1] ?? "").trim();
  if (!id) return null;
  const urgency = (row[4] ?? "").trim();
  return {
    id,
    label: row[3] ?? "",
    urgency:
      urgency === "tres_urgent" ||
      urgency === "urgent" ||
      urgency === "important" ||
      urgency === "must_have"
        ? urgency
        : "",
    done: (row[5] ?? "").trim().toLocaleLowerCase("fr-FR") === "oui",
    note: row[6] ?? "",
    participants: row[7] ?? "",
    completedAt: row[8] ?? "",
    resultPhotoUrl: row[9] ?? "",
    durationMinutes: Math.max(0, Number.parseInt(row[10] ?? "0", 10) || 0),
    peopleCount: Math.max(0, Number.parseFloat(row[11] ?? "0") || 0),
  };
}

function taskToRow(chantierId: string, t: ChantierTask, createdAt: string): unknown[] {
  return [
    chantierId,
    t.id,
    createdAt,
    t.label,
    t.urgency,
    t.done ? "Oui" : "Non",
    t.note,
    t.participants,
    t.completedAt,
    t.resultPhotoUrl,
    t.durationMinutes || "",
    t.peopleCount || "",
  ];
}

// Colonnes D→I (tâche, urgence, fait, note, participants, terminé le) — 0-indexed col 3
function taskFieldsCols(t: ChantierTask): unknown[] {
  return [t.label, t.urgency, t.done ? "Oui" : "Non", t.note, t.participants, t.completedAt];
}

// Colonnes J→L (photo résultat, durée, nb personnes) — 0-indexed col 9
function taskExecutionCols(t: ChantierTask): unknown[] {
  return [t.resultPhotoUrl, t.durationMinutes || "", t.peopleCount || ""];
}

// Fenêtre de réconciliation "miroir" Calendar↔Sheet : volontairement bien
// plus large que la fenêtre d'affichage (agenda/admin), pour ne jamais
// supprimer à tort une ligne Sheet dont l'événement Calendar existe bel et
// bien mais hors de la fenêtre observée.
function mirrorWindow(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const min = new Date(now);
  min.setFullYear(min.getFullYear() - 5);
  const max = new Date(now);
  max.setFullYear(max.getFullYear() + 5);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

let lastChantiersReconcileAt = 0;
const RECONCILE_THROTTLE_MS = 60_000;

/**
 * Miroir exact Calendar↔Sheet pour les chantiers : crée les lignes Sheet
 * manquantes pour les événements Calendar chantier à venir (y compris ceux
 * créés à la main, "adoptés" via un reservationId posé au fil de l'eau), et
 * supprime les lignes Sheet dont l'événement Calendar a été supprimé
 * directement sur Google.
 *
 * Important : seuls les chantiers pas encore terminés (endDate >= aujourd'hui)
 * sont créés/adoptés. Le calendrier partagé porte une pratique familiale de
 * "chantier" bien antérieure à ce module (des années d'événements "Week-end
 * chantier #N" / "Semaine Chantier" créés à la main, sans lien avec l'appli) —
 * il ne faut jamais importer rétroactivement cet historique dans le
 * classeur de suivi (personne n'a besoin d'une liste de tâches pour un
 * chantier déjà passé). La suppression des lignes orphelines, elle, reste
 * sur la fenêtre large (mirrorWindow) : une ligne déjà présente ne doit
 * jamais être perdue à tort, qu'elle soit passée ou future.
 */
async function reconcileChantiersMirror(): Promise<void> {
  if (Date.now() - lastChantiersReconcileAt < RECONCILE_THROTTLE_MS) return;
  lastChantiersReconcileAt = Date.now();

  const { ensureChantiersSpreadsheet, getRows, batchMutateRows, CHANTIER_TAB } =
    await import("../core/google/google.server");
  const { listCalendarEvents, patchCalendarEventExtendedProperties } =
    await import("../core/google/google-calendar.server");

  const spreadsheetId = await ensureChantiersSpreadsheet(null);
  const { timeMin, timeMax } = mirrorWindow();
  const minDate = timeMin.slice(0, 10);
  const maxDate = timeMax.slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [rows, events] = await Promise.all([
    getRows(spreadsheetId, `${CHANTIER_TAB}!A2:L`),
    listCalendarEvents(timeMin, timeMax),
  ]);

  const sheetRows = rows
    .map((row, index) => ({ row, index, chantier: rowToChantier(row) }))
    .filter((x): x is { row: string[]; index: number; chantier: Chantier } => x.chantier !== null);
  const sheetById = new Map(sheetRows.map((x) => [x.chantier.id, x]));

  const seenIds = new Set<string>();
  const toAppend: Chantier[] = [];

  for (const event of events) {
    if (!isChantierEvent(event)) continue;
    const isUpcoming = event.endDate >= todayIso;

    let rid = event.extendedProperties.reservationId;
    if (!rid) {
      if (!isUpcoming) continue; // pas la peine de taguer un chantier déjà passé.
      // Chantier créé à la main sur Calendar (jamais passé par l'app) : on lui
      // attribue un id stable pour pouvoir le mirrorer, sans toucher au reste
      // de l'événement (patch minimal, extendedProperties uniquement).
      rid = crypto.randomUUID();
      try {
        await patchCalendarEventExtendedProperties(event.id, {
          ...event.extendedProperties,
          reservationId: rid,
          type: "chantier",
        });
      } catch (error) {
        console.error("[reconcileChantiersMirror] échec adoption (patch reservationId):", error);
        continue; // on retentera au prochain passage plutôt que de risquer une ligne dupliquée.
      }
    }
    seenIds.add(rid); // protège aussi une ligne déjà existante pour un chantier passé.
    if (!isUpcoming) continue; // ne (re)crée jamais de ligne pour un chantier déjà passé.
    if (sheetById.has(rid)) continue;
    toAppend.push({
      id: rid,
      createdAt: "",
      reservedBy: event.extendedProperties.reservedBy || "Chantier",
      startDate: event.startDate,
      endDate: event.endDate,
      startPeriod: suggestedPeriod(event.startDate, "start"),
      endPeriod: suggestedPeriod(event.endDate, "end"),
      adults: Number(event.extendedProperties.adults ?? "1") || 1,
      children: Number(event.extendedProperties.children ?? "0") || 0,
      calendarEventId: event.id,
      cancelledAt: null,
    });
  }

  // Suppression des lignes orphelines (événement Calendar supprimé à la
  // main) : uniquement les lignes non annulées, avec un id Calendar connu, et
  // dont la date de début tombe dans la fenêtre large scannée ci-dessus.
  // Ordre décroissant d'index pour supprimer sans décaler les lignes restantes.
  const toDelete = sheetRows
    .filter(
      (x) =>
        !x.chantier.cancelledAt &&
        x.chantier.calendarEventId &&
        x.chantier.startDate >= minDate &&
        x.chantier.startDate <= maxDate &&
        !seenIds.has(x.chantier.id),
    )
    .sort((a, b) => b.index - a.index);

  if (toAppend.length || toDelete.length) {
    try {
      await batchMutateRows(spreadsheetId, CHANTIER_TAB, {
        deletes: toDelete.map((entry) => entry.index),
        appends: toAppend.map(chantierToRow),
      });
    } catch (error) {
      console.error("[reconcileChantiersMirror] échec batch miroir:", error);
    }
  }
  // Le miroir global suffit pour afficher la liste des chantiers. Les onglets
  // de détail sont créés à la demande, lorsqu'un chantier est réellement
  // consulté ou modifié. Cela évite de remplir le classeur d'onglets vides au
  // simple passage sur la liste, sans toucher aux événements Calendar.
}

/**
 * Fusionne Sheet + Calendar pour une fenêtre donnée — fonction "brute" (pas
 * un createServerFn) réutilisable par d'autres modules serveur sans passer
 * par le RPC client (voir chantier-registrations.functions.ts::assertChantierEditable).
 */
export async function fetchAllChantiers(timeMin: string, timeMax: string): Promise<Chantier[]> {
  const { ensureChantiersSpreadsheet, getRows, CHANTIER_TAB } =
    await import("../core/google/google.server");
  const { listCalendarEvents } = await import("../core/google/google-calendar.server");

  await reconcileChantiersMirror();
  const spreadsheetId = await ensureChantiersSpreadsheet(null);
  const [rows, events] = await Promise.all([
    getRows(spreadsheetId, `${CHANTIER_TAB}!A2:L`),
    listCalendarEvents(timeMin, timeMax),
  ]);

  const sheetChantiers = new Map<string, Chantier>();
  for (const row of rows) {
    const c = rowToChantier(row);
    if (c) sheetChantiers.set(c.id, c);
  }

  const results: Chantier[] = [];
  const seenIds = new Set<string>();
  for (const event of events) {
    if (!isChantierEvent(event)) continue;
    const rid = event.extendedProperties.reservationId;
    const matched = rid ? sheetChantiers.get(rid) : undefined;
    if (matched) {
      results.push(matched);
      seenIds.add(matched.id);
    } else {
      // Chantier créé hors appli (Calendar direct), ou dont la ligne Sheet
      // a été perdue — reconstruction "best effort" depuis les
      // extendedProperties, comme fallbackReservationFromEvent.
      results.push({
        id: rid || `calendar:${event.id}`,
        createdAt: "",
        reservedBy: event.extendedProperties.reservedBy || "Chantier",
        startDate: event.startDate,
        endDate: event.endDate,
        startPeriod:
          normalizePeriod(event.extendedProperties.startPeriod) ||
          suggestedPeriod(event.startDate, "start"),
        endPeriod:
          normalizePeriod(event.extendedProperties.endPeriod) ||
          suggestedPeriod(event.endDate, "end"),
        adults: Number(event.extendedProperties.adults ?? "1") || 1,
        children: Number(event.extendedProperties.children ?? "0") || 0,
        calendarEventId: event.id,
        cancelledAt: null,
      });
    }
  }
  // Chantiers présents dans le Sheet mais dont l'événement Calendar a été
  // supprimé à la main — on ne veut pas les perdre silencieusement.
  for (const c of sheetChantiers.values()) {
    if (!seenIds.has(c.id) && !c.cancelledAt) results.push(c);
  }

  results.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return results;
}

const ListChantiersInput = z.object({ timeMin: z.string(), timeMax: z.string() });

export const listChantiers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListChantiersInput.parse(d))
  .handler(async ({ data }) => {
    if (IS_MOCK) {
      const chantiers = MOCK_CHANTIERS.filter(
        (c) => c.startDate >= data.timeMin.slice(0, 10) && c.startDate <= data.timeMax.slice(0, 10),
      );
      return { chantiers };
    }
    const chantiers = await fetchAllChantiers(data.timeMin, data.timeMax);
    return { chantiers };
  });

// L'effectif n'est plus estimé par l'admin à la création : il n'existe qu'au
// réel, calculé depuis les inscriptions (voir chantier-registrations.functions.ts).
// adults/children démarrent donc toujours à 0 et ne sont plus exposés dans le
// formulaire de création (admin.tsx) — gardés côté schéma pour compat Calendar.
const CreateChantierInput = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startPeriod: z.enum(["", "matin", "apres_midi", "soir"]).optional().default(""),
  endPeriod: z.enum(["", "matin", "apres_midi", "soir"]).optional().default(""),
  password: z.string().min(1),
});

export const createChantier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateChantierInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }
    if (data.endDate <= data.startDate) {
      throw new Error("La date de fin doit être après la date de début.");
    }

    const { fetchAllReservations } = await import("./reservations.functions");
    const { checkConflict } = await import("./reservation-conflicts");
    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setMonth(timeMin.getMonth() - 6);
    const timeMax = new Date(now);
    timeMax.setMonth(timeMax.getMonth() + 18);
    const existing = await fetchAllReservations(null, timeMin.toISOString(), timeMax.toISOString());
    const conflict = checkConflict(
      { startDate: data.startDate, endDate: data.endDate, privatized: false },
      existing,
    );
    if (conflict.blocked) {
      throw new Error(conflict.reason || "Impossible de créer ce chantier (conflit de dates).");
    }

    const { insertCalendarEvent, deleteCalendarEvent } =
      await import("../core/google/google-calendar.server");
    const { ensureChantiersSpreadsheet, appendRow, getRows, deleteRow, CHANTIER_TAB } =
      await import("../core/google/google.server");

    const id = crypto.randomUUID();
    const reservedBy = "Chantier collectif";
    let calendarEvent: Awaited<ReturnType<typeof insertCalendarEvent>>;
    try {
      calendarEvent = await insertCalendarEvent({
        summary: chantierDisplayName(data.startDate, data.endDate),
        colorId: CALENDAR_COLOR_BY_TYPE.chantier,
        startDate: data.startDate,
        endDate: data.endDate,
        privateExtendedProperties: {
          reservationId: id,
          type: "chantier",
          reservedBy,
          adults: "0",
          children: "0",
          startPeriod: data.startPeriod,
          endPeriod: data.endPeriod,
          privatized: "false",
        },
      });
    } catch (error) {
      console.error("[createChantier] échec insertCalendarEvent:", error);
      throw new Error(
        `Échec de l'écriture Google Calendar : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const chantier: Chantier = {
      id,
      createdAt: new Date().toISOString(),
      reservedBy,
      startDate: data.startDate,
      endDate: data.endDate,
      startPeriod: data.startPeriod || suggestedPeriod(data.startDate, "start"),
      endPeriod: data.endPeriod || suggestedPeriod(data.endDate, "end"),
      adults: 0,
      children: 0,
      calendarEventId: calendarEvent.id,
      cancelledAt: null,
    };

    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    let sheetRowWritten = false;
    try {
      await appendRow(spreadsheetId, `${CHANTIER_TAB}!A:L`, chantierToRow(chantier));
      sheetRowWritten = true;
    } catch (error) {
      console.error("[createChantier] échec Sheets, rollback de la création:", error);
      if (sheetRowWritten) {
        try {
          const rows = await getRows(spreadsheetId, `${CHANTIER_TAB}!A2:L`);
          const rowIndex = rows.findIndex((row) => row[0] === id);
          if (rowIndex >= 0) await deleteRow(spreadsheetId, CHANTIER_TAB, rowIndex);
        } catch (rollbackError) {
          console.error("[createChantier] rollback ligne Sheets échoué:", rollbackError);
        }
      }
      try {
        await deleteCalendarEvent(calendarEvent.id);
      } catch (rollbackError) {
        console.error("[createChantier] rollback Calendar échoué:", rollbackError);
      }
      throw new Error(
        `Échec de l'écriture Google Sheets, la création a été annulée : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return { ok: true as const, chantier };
  });

const UpdateDatesInput = z.object({
  id: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startPeriod: z.enum(["", "matin", "apres_midi", "soir"]).optional().default(""),
  endPeriod: z.enum(["", "matin", "apres_midi", "soir"]).optional().default(""),
  password: z.string().min(1),
});

export const updateChantierDates = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateDatesInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }
    if (data.endDate <= data.startDate) {
      throw new Error("La date de fin doit être après la date de début.");
    }

    const { ensureChantiersSpreadsheet, getRows, updateRange, CHANTIER_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${CHANTIER_TAB}!A2:L`);
    const rowIndex = rows.findIndex((r) => (r[0] ?? "").trim() === data.id);
    if (rowIndex === -1) throw new Error("Chantier introuvable.");
    const current = rowToChantier(rows[rowIndex]);
    if (!current) throw new Error("Chantier introuvable.");

    const updated: Chantier = {
      ...current,
      startDate: data.startDate,
      endDate: data.endDate,
      startPeriod: data.startPeriod,
      endPeriod: data.endPeriod,
    };
    const { updateCalendarEvent } = await import("../core/google/google-calendar.server");
    if (current.calendarEventId) {
      try {
        await updateCalendarEvent(current.calendarEventId, {
          summary: chantierDisplayName(data.startDate, data.endDate),
          colorId: CALENDAR_COLOR_BY_TYPE.chantier,
          startDate: data.startDate,
          endDate: data.endDate,
          privateExtendedProperties: {
            reservationId: current.id,
            type: "chantier",
            reservedBy: current.reservedBy,
            adults: "0",
            children: "0",
            startPeriod: data.startPeriod,
            endPeriod: data.endPeriod,
            privatized: "false",
          },
        });
      } catch (error) {
        console.error("[updateChantierDates] échec updateCalendarEvent:", error);
        throw new Error(
          `Échec de la mise à jour Google Calendar : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const sheetRow = rowIndex + 2;
    try {
      await updateRange(
        spreadsheetId,
        `${CHANTIER_TAB}!A${sheetRow}:L${sheetRow}`,
        chantierToRow(updated),
      );
    } catch (error) {
      console.error("[updateChantierDates] échec Sheets, rollback:", error);
      try {
        await updateRange(
          spreadsheetId,
          `${CHANTIER_TAB}!A${sheetRow}:L${sheetRow}`,
          chantierToRow(current),
        );
      } catch (rollbackError) {
        console.error("[updateChantierDates] rollback ligne Sheets échoué:", rollbackError);
      }
      if (current.calendarEventId) {
        try {
          await updateCalendarEvent(current.calendarEventId, {
            summary: chantierDisplayName(current.startDate, current.endDate),
            colorId: CALENDAR_COLOR_BY_TYPE.chantier,
            startDate: current.startDate,
            endDate: current.endDate,
            privateExtendedProperties: {
              reservationId: current.id,
              type: "chantier",
              reservedBy: current.reservedBy,
              adults: String(current.adults),
              children: String(current.children),
              startPeriod: current.startPeriod,
              endPeriod: current.endPeriod,
              privatized: "false",
            },
          });
        } catch (rollbackError) {
          console.error("[updateChantierDates] rollback Calendar échoué:", rollbackError);
        }
      }
      throw error;
    }

    return { ok: true as const, chantier: updated };
  });

const CancelChantierInput = z.object({
  id: z.string().min(1),
  password: z.string().min(1),
});

export const cancelChantier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CancelChantierInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }

    const { ensureChantiersSpreadsheet, getRows, updateRange, CHANTIER_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${CHANTIER_TAB}!A2:L`);
    const rowIndex = rows.findIndex((r) => (r[0] ?? "").trim() === data.id);
    if (rowIndex === -1) throw new Error("Chantier introuvable.");
    const current = rowToChantier(rows[rowIndex]);
    if (!current) throw new Error("Chantier introuvable.");

    const cancelled: Chantier = { ...current, cancelledAt: new Date().toISOString() };
    const sheetRow = rowIndex + 2;
    await updateRange(
      spreadsheetId,
      `${CHANTIER_TAB}!A${sheetRow}:L${sheetRow}`,
      chantierToRow(cancelled),
    );

    if (current.calendarEventId) {
      try {
        const { deleteCalendarEvent } = await import("../core/google/google-calendar.server");
        await deleteCalendarEvent(current.calendarEventId);
      } catch (error) {
        console.error("[cancelChantier] échec deleteCalendarEvent, rollback Sheets:", error);
        try {
          await updateRange(
            spreadsheetId,
            `${CHANTIER_TAB}!A${sheetRow}:L${sheetRow}`,
            chantierToRow(current),
          );
        } catch (rollbackError) {
          console.error("[cancelChantier] rollback Sheets échoué:", rollbackError);
        }
        throw new Error(
          `Échec de la suppression Google Calendar : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { ok: true as const };
  });

// --- Fiche chantier : cols M (index 12) et N (index 13) sur l'onglet "Chantiers" -----
// Texte libre (description) + titre de fiche — portés directement sur la ligne du chantier,
// pas dans un onglet dédié par chantier.

const GetFicheInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getChantierFiche = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GetFicheInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, getRows, CHANTIER_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${CHANTIER_TAB}!A2:H`);
    const row = rows.find((r) => (r[0] ?? "").trim() === data.chantierId);
    return { description: row?.[6] ?? "", title: row?.[7] ?? "" };
  });

const UpdateFicheInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(200).optional(),
  description: z.string().max(4000),
  password: z.string().min(1),
});

export const updateChantierFiche = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateFicheInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }

    const { ensureChantiersSpreadsheet, getRows, updateRange, CHANTIER_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${CHANTIER_TAB}!A2:H`);
    const rowIndex = rows.findIndex((r) => (r[0] ?? "").trim() === data.chantierId);
    if (rowIndex === -1) throw new Error("Chantier introuvable.");

    const description = data.description.trim();
    const title = (data.title ?? "").trim();
    const sheetRow = rowIndex + 2;
    // cols G (Description, index 6) et H (Titre fiche, index 7)
    await updateRange(spreadsheetId, `${CHANTIER_TAB}!G${sheetRow}:H${sheetRow}`, [
      description,
      title,
    ]);
    return { ok: true as const, description, title };
  });

// --- Tâches (Type="tache", colonnes E→I) -----------------------------------

const ListTasksInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface ChantierExpense {
  id: string;
  invoiceDate: string;
  supplier: string;
  amountTTC: number;
  fileLink: string;
  depositor: string;
  category: string;
}

const ListChantierExpensesInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listChantierExpenses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListChantierExpensesInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, SCI_TAB, ASSO_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(null);
    // EXPENSE_HEADERS : col 17=ID, col 18=ID chantier, col 2=Date facture,
    // col 1=Fournisseur, col 3=Montant TTC, col 15=Lien facture, col 16=Déposé par, col 5=Catégorie
    const [sciRows, assoRows] = await Promise.all([
      getRows(spreadsheetId, `${SCI_TAB}!A2:U`).catch(() => [] as string[][]),
      getRows(spreadsheetId, `${ASSO_TAB}!A2:U`).catch(() => [] as string[][]),
    ]);
    const expenses: ChantierExpense[] = [...sciRows, ...assoRows]
      .filter((row) => (row[18] ?? "").trim() === data.chantierId && (row[17] ?? "").trim())
      .map((row) => ({
        id: row[17] ?? "",
        invoiceDate: row[2] ?? "",
        supplier: row[1] ?? "",
        amountTTC: Number((row[3] ?? "0").replace(",", ".")) || 0,
        fileLink: row[15] ?? "",
        depositor: row[16] ?? "",
        category: row[5] ?? "",
      }));
    return {
      expenses,
      total: expenses.reduce((sum, e) => sum + e.amountTTC, 0),
    };
  });

export const listChantierTasks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListTasksInput.parse(d))
  .handler(async ({ data }) => {
    if (IS_MOCK) {
      const tasks = MOCK_TASKS[data.chantierId] ?? [];
      return { tasks };
    }
    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      getRows,
      TACHES_TAB,
      TACHE_HEADERS,
      TACHE_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, TACHES_TAB, TACHE_HEADERS, TACHE_LAST_COL);
    const rows = await getRows(spreadsheetId, `${TACHES_TAB}!A2:${TACHE_LAST_COL}`);
    const tasks = rows
      .map((r) => rowToTask(r, data.chantierId))
      .filter((t): t is ChantierTask => t !== null);
    return { tasks };
  });

const AddTaskInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(200),
  password: z.string().min(1),
  // Estimation posée par l'admin à la planification — les mêmes colonnes sont
  // ensuite écrasées par la durée/l'effectif réels une fois la tâche exécutée.
  estimatedDurationMinutes: z.number().int().min(0).max(1440).optional(),
  estimatedPeopleCount: z.number().min(0).max(200).optional(),
  urgency: z.enum(["tres_urgent", "urgent", "important", "must_have"]).optional(),
});

export const addChantierTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AddTaskInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }

    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      appendRow,
      TACHES_TAB,
      TACHE_HEADERS,
      TACHE_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, TACHES_TAB, TACHE_HEADERS, TACHE_LAST_COL);

    const task: ChantierTask = {
      id: crypto.randomUUID(),
      label: data.label.trim(),
      done: false,
      note: "",
      participants: "",
      completedAt: "",
      resultPhotoUrl: "",
      durationMinutes: data.estimatedDurationMinutes || 0,
      peopleCount: data.estimatedPeopleCount || 0,
      urgency: data.urgency ?? "",
    };
    await appendRow(
      spreadsheetId,
      `${TACHES_TAB}!A:${TACHE_LAST_COL}`,
      taskToRow(data.chantierId, task, new Date().toISOString()),
    );
    return { ok: true as const, task };
  });

const AddUnplannedTaskInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(200),
});

// Pas de mot de passe requis ici (contrairement à addChantierTask, réservé à
// l'admin pour planifier en amont) : n'importe quel participant peut ajouter
// une tâche imprévue pendant le chantier lui-même.
export const addUnplannedChantierTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AddUnplannedTaskInput.parse(d))
  .handler(async ({ data }) => {
    const {
      ensureChantiersSpreadsheet,
      ensureTabExists,
      appendRow,
      TACHES_TAB,
      TACHE_HEADERS,
      TACHE_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    await ensureTabExists(spreadsheetId, TACHES_TAB, TACHE_HEADERS, TACHE_LAST_COL);

    const task: ChantierTask = {
      id: crypto.randomUUID(),
      label: data.label.trim(),
      done: false,
      note: "",
      participants: "",
      completedAt: "",
      resultPhotoUrl: "",
      durationMinutes: 0,
      peopleCount: 0,
      urgency: "",
    };
    await appendRow(
      spreadsheetId,
      `${TACHES_TAB}!A:${TACHE_LAST_COL}`,
      taskToRow(data.chantierId, task, new Date().toISOString()),
    );
    return { ok: true as const, task };
  });

const RenameTaskInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskId: z.string().min(1),
  label: z.string().min(1).max(200),
  password: z.string().min(1),
});

export const renameChantierTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RenameTaskInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }

    const { ensureChantiersSpreadsheet, getRows, updateRange, TACHES_TAB, TACHE_LAST_COL } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${TACHES_TAB}!A2:${TACHE_LAST_COL}`);
    const rowIndex = rows.findIndex(
      (r) => (r[0] ?? "") === data.chantierId && (r[1] ?? "").trim() === data.taskId,
    );
    if (rowIndex === -1) throw new Error("Tâche introuvable.");
    const current = rowToTask(rows[rowIndex], data.chantierId);
    if (!current) throw new Error("Tâche introuvable.");

    const updated: ChantierTask = { ...current, label: data.label.trim() };
    const sheetRow = rowIndex + 2;
    // cols D→I (label, urgence, fait, note, participants, terminé le) → col D = 4th col
    await updateRange(
      spreadsheetId,
      `${TACHES_TAB}!D${sheetRow}:I${sheetRow}`,
      taskFieldsCols(updated),
    );
    return { ok: true as const, task: updated };
  });

const DeleteTaskInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskId: z.string().min(1),
  password: z.string().min(1),
});

export const deleteChantierTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DeleteTaskInput.parse(d))
  .handler(async ({ data }) => {
    const { checkPassword } = await import("./admin.functions");
    if (!checkPassword("Association", data.password)) {
      throw new Error("Mot de passe admin invalide.");
    }

    const { ensureChantiersSpreadsheet, getRows, deleteRow, TACHES_TAB, TACHE_LAST_COL } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${TACHES_TAB}!A2:${TACHE_LAST_COL}`);
    const rowIndex = rows.findIndex(
      (r) => (r[0] ?? "") === data.chantierId && (r[1] ?? "").trim() === data.taskId,
    );
    if (rowIndex === -1) throw new Error("Tâche introuvable.");

    await deleteRow(spreadsheetId, TACHES_TAB, rowIndex);
    return { ok: true as const };
  });

const ToggleTaskInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskId: z.string().min(1),
  done: z.boolean(),
  note: z.string().max(2000),
});

// Pas de mot de passe requis ici : n'importe quel membre peut cocher une
// tâche comme faite (décision produit — seule la liste des tâches elle-même
// est réservée à l'admin Asso).
export const toggleChantierTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ToggleTaskInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, getRows, updateRange, TACHES_TAB, TACHE_LAST_COL } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${TACHES_TAB}!A2:${TACHE_LAST_COL}`);
    const rowIndex = rows.findIndex(
      (r) => (r[0] ?? "") === data.chantierId && (r[1] ?? "").trim() === data.taskId,
    );
    if (rowIndex === -1) throw new Error("Tâche introuvable.");
    const current = rowToTask(rows[rowIndex], data.chantierId);
    if (!current) throw new Error("Tâche introuvable.");

    const updated: ChantierTask = {
      ...current,
      done: data.done,
      completedAt: data.done ? new Date().toISOString() : "",
    };
    const sheetRow = rowIndex + 2;
    await updateRange(
      spreadsheetId,
      `${TACHES_TAB}!D${sheetRow}:I${sheetRow}`,
      taskFieldsCols(updated),
    );
    return { ok: true as const, task: updated };
  });

const UpdateTaskNoteInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskId: z.string().min(1),
  note: z.string().max(2000).optional(),
  participants: z.string().max(300).optional(),
});

// Pas de mot de passe requis ici non plus : annoter une tâche (note,
// participants) est ouvert à tout le monde, comme le fait de la cocher.
export const updateChantierTaskNote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateTaskNoteInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureChantiersSpreadsheet, getRows, updateRange, TACHES_TAB, TACHE_LAST_COL } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${TACHES_TAB}!A2:${TACHE_LAST_COL}`);
    const rowIndex = rows.findIndex(
      (r) => (r[0] ?? "") === data.chantierId && (r[1] ?? "").trim() === data.taskId,
    );
    if (rowIndex === -1) throw new Error("Tâche introuvable.");
    const current = rowToTask(rows[rowIndex], data.chantierId);
    if (!current) throw new Error("Tâche introuvable.");

    const updated: ChantierTask = {
      ...current,
      note: data.note !== undefined ? data.note.trim() : current.note,
      participants:
        data.participants !== undefined ? data.participants.trim() : current.participants,
    };
    const sheetRow = rowIndex + 2;
    await updateRange(
      spreadsheetId,
      `${TACHES_TAB}!D${sheetRow}:I${sheetRow}`,
      taskFieldsCols(updated),
    );
    return { ok: true as const, task: updated };
  });

const UpdateTaskExecutionInput = z.object({
  chantierId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskId: z.string().min(1),
  done: z.boolean(),
  note: z.string().trim().max(2_000).default(""),
  participants: z.array(z.string().trim().min(1).max(80)).max(80),
  durationMinutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60),
  peopleCount: z.number().min(0).max(200),
  photo: z
    .object({
      name: z.string().min(1).max(180),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
      dataBase64: z.string().min(1).max(12_000_000),
    })
    .optional(),
});

// Compte-rendu facultatif d'une mission : toutes les informations sont
// enregistrées ensemble. Une éventuelle photo est classée dans
// Fief/Chantier AAAA-MM-JJ (id)/Photos missions.
export const updateChantierTaskExecution = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateTaskExecutionInput.parse(d))
  .handler(async ({ data }) => {
    const {
      ensureChantiersSpreadsheet,
      getRows,
      batchUpdateRanges,
      ensureDriveFolder,
      ensureDriveSubfolder,
      uploadFileToDrive,
      TACHES_TAB,
      TACHE_LAST_COL,
    } = await import("../core/google/google.server");
    const spreadsheetId = await ensureChantiersSpreadsheet(null);
    const rows = await getRows(spreadsheetId, `${TACHES_TAB}!A2:${TACHE_LAST_COL}`);
    const rowIndex = rows.findIndex(
      (r) => (r[0] ?? "") === data.chantierId && (r[1] ?? "").trim() === data.taskId,
    );
    if (rowIndex === -1) throw new Error("Mission introuvable.");
    const current = rowToTask(rows[rowIndex], data.chantierId);
    if (!current) throw new Error("Mission introuvable.");

    let resultPhotoUrl = current.resultPhotoUrl;
    if (data.photo) {
      const folderLabel = chantierTabTitle(data.chantierId, data.startDate);
      const rootFolderId = await ensureDriveFolder("Asso");
      const chantierFolderId = await ensureDriveSubfolder(rootFolderId, folderLabel);
      const photoFolderId = await ensureDriveSubfolder(chantierFolderId, "Photos missions");
      const extension = data.photo.mimeType.includes("png")
        ? "png"
        : data.photo.mimeType.includes("webp")
          ? "webp"
          : data.photo.mimeType.includes("hei")
            ? "heic"
            : "jpg";
      const safeLabel =
        current.label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "mission";
      const uploaded = await uploadFileToDrive(photoFolderId, {
        name: `${data.startDate}-${safeLabel}-${Date.now()}.${extension}`,
        mimeType: data.photo.mimeType,
        dataBase64: data.photo.dataBase64,
      });
      resultPhotoUrl = uploaded.webViewLink;
    }

    const updated: ChantierTask = {
      ...current,
      done: data.done,
      note: data.note.trim(),
      completedAt: data.done ? current.completedAt || new Date().toISOString() : "",
      participants: data.participants.join(", "),
      durationMinutes: data.durationMinutes,
      peopleCount: data.peopleCount,
      resultPhotoUrl,
    };
    const sheetRow = rowIndex + 2;
    // cols D\u2192I (label\u2192termin\u00e9 le) et J\u2192L (photo, dur\u00e9e, nb personnes)
    await batchUpdateRanges(spreadsheetId, [
      { range: `${TACHES_TAB}!D${sheetRow}:I${sheetRow}`, row: taskFieldsCols(updated) },
      { range: `${TACHES_TAB}!J${sheetRow}:L${sheetRow}`, row: taskExecutionCols(updated) },
    ]);
    return { ok: true as const, task: updated };
  });
