import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkConflict } from "./reservation-conflicts";
import { computeNuiteesAmount, nightsBetween } from "./pricing";
import {
  CALENDAR_COLOR_BY_TYPE,
  TYPE_LABEL,
  type Reservation,
  type ReservationType,
} from "./reservation-types";

/** Titre de l'événement Calendar pour une réservation perso : nom + effectif + mood. */
function personalEventSummary(reservedBy: string, headcount: number, mood: string): string {
  const base = `${reservedBy} — ${headcount} pers`;
  return mood ? `${base} — "${mood}"` : base;
}

const TYPE_BY_LABEL: Record<string, ReservationType> = {
  Perso: "personal",
  Airbnb: "airbnb",
  Chantier: "chantier",
};

const TYPE_BY_COLOR: Record<string, ReservationType> = {
  "9": "personal",
  "11": "airbnb",
  "5": "chantier",
};

const RESERVATIONS_RANGE = "A2:S";

function quoteTab(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

function boolFr(v: boolean): string {
  return v ? "Oui" : "Non";
}
function parseBoolFr(v: string | undefined): boolean {
  return (v ?? "").trim().toLocaleLowerCase("fr-FR") === "oui";
}

// Colonnes (A→R, 0-indexed) : id, créé le, type, statut, réservé par,
// début, fin, adultes, enfants, privatisation, mood, pré-chauffage,
// montant nuitées, montant électricité, total, payé, id calendar, annulée le.
function rowToReservation(row: string[]): Reservation | null {
  const id = (row[0] ?? "").trim();
  if (!id) return null;
  const type = TYPE_BY_LABEL[(row[2] ?? "").trim()] ?? "personal";
  const status = (row[3] ?? "").trim() === "Annulée" ? "cancelled" : "confirmed";
  const nuitees = Number((row[12] ?? "0").replace(",", ".")) || 0;
  const electricityRaw = (row[13] ?? "").trim();
  const electricity = electricityRaw ? Number(electricityRaw.replace(",", ".")) || 0 : null;
  return {
    id,
    type,
    status,
    createdAt: row[1] ?? "",
    reservedBy: row[4] ?? "",
    startDate: row[5] ?? "",
    endDate: row[6] ?? "",
    adults: Number(row[7] ?? "0") || 0,
    children: Number(row[8] ?? "0") || 0,
    privatized: parseBoolFr(row[9]),
    mood: row[10] ?? "",
    preheat: parseBoolFr(row[11]),
    nuiteesAmount: nuitees,
    electricityAmount: electricity,
    totalAmount: nuitees + (electricity ?? 0),
    paid: parseBoolFr(row[15]),
    calendarEventId: row[16] || null,
    cancelledAt: row[17] || null,
    arrivalTime: row[18] ?? "",
  };
}

function reservationToRow(r: Reservation): unknown[] {
  return [
    r.id,
    r.createdAt,
    TYPE_LABEL[r.type],
    r.status === "cancelled" ? "Annulée" : "Confirmée",
    r.reservedBy,
    r.startDate,
    r.endDate,
    r.adults,
    r.children,
    boolFr(r.privatized),
    r.mood,
    boolFr(r.preheat),
    r.nuiteesAmount,
    r.electricityAmount ?? "",
    r.totalAmount,
    boolFr(r.paid),
    r.calendarEventId ?? "",
    r.cancelledAt ?? "",
    r.arrivalTime,
  ];
}

/**
 * Reconstruit une Reservation "best effort" pour un événement Calendar créé
 * manuellement (pas via l'app, donc sans ligne dans le Sheet). On utilise la couleur
 * et le titre comme indices, avec des valeurs par défaut prudentes.
 */
function fallbackReservationFromEvent(event: {
  id: string;
  summary: string;
  colorId: string | null;
  startDate: string;
  endDate: string;
  extendedProperties: Record<string, string>;
}): Reservation {
  const summaryUpper = event.summary.toUpperCase();
  let type: ReservationType = (event.colorId && TYPE_BY_COLOR[event.colorId]) || "personal";
  if (summaryUpper.includes("AIRBNB")) type = "airbnb";
  if (summaryUpper.includes("CHANTIER")) type = "chantier";
  return {
    id: event.extendedProperties.reservationId || `calendar:${event.id}`,
    type,
    status: "confirmed",
    createdAt: "",
    reservedBy: event.extendedProperties.reservedBy || event.summary || "Quelqu'un",
    startDate: event.startDate,
    endDate: event.endDate,
    adults: Number(event.extendedProperties.adults ?? "1") || 1,
    children: Number(event.extendedProperties.children ?? "0") || 0,
    privatized: parseBoolFr(event.extendedProperties.privatized),
    mood: event.extendedProperties.mood ?? "",
    preheat: false,
    nuiteesAmount: 0,
    electricityAmount: null,
    totalAmount: 0,
    paid: false,
    calendarEventId: event.id,
    cancelledAt: null,
    arrivalTime: event.extendedProperties.arrivalTime ?? "",
  };
}

export async function fetchAllReservations(
  spreadsheetId: string | null,
  timeMin: string,
  timeMax: string,
): Promise<Reservation[]> {
  const { ensureSpreadsheet, getRows, RESERVATIONS_TAB } =
    await import("../core/google/google.server");
  const { listCalendarEvents } = await import("../core/google/google-calendar.server");

  const resolvedSpreadsheetId = await ensureSpreadsheet(spreadsheetId);
  const [rows, events] = await Promise.all([
    getRows(resolvedSpreadsheetId, `${quoteTab(RESERVATIONS_TAB)}!${RESERVATIONS_RANGE}`),
    listCalendarEvents(timeMin, timeMax),
  ]);

  const sheetReservations = new Map<string, Reservation>();
  for (const row of rows) {
    const r = rowToReservation(row);
    if (r) sheetReservations.set(r.id, r);
  }

  const results: Reservation[] = [];
  const seenIds = new Set<string>();
  for (const event of events) {
    const reservationId = event.extendedProperties.reservationId;
    const matched = reservationId ? sheetReservations.get(reservationId) : undefined;
    if (matched) {
      results.push(matched);
      seenIds.add(matched.id);
    } else {
      results.push(fallbackReservationFromEvent(event));
    }
  }
  // Résa présentes dans le Sheet mais dont l'événement Calendar a été supprimé
  // à la main (rare, mais on ne veut pas les perdre silencieusement).
  for (const r of sheetReservations.values()) {
    if (!seenIds.has(r.id) && r.status === "confirmed") results.push(r);
  }

  return results.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// Fenêtre de réconciliation "miroir" Calendar↔Sheet : volontairement bien
// plus large que la fenêtre d'affichage (agenda) ou de vérification de
// conflit (conflictWindow), pour ne jamais supprimer à tort une ligne Sheet
// dont l'événement Calendar existe bel et bien mais hors de la fenêtre
// observée.
function mirrorWindow(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const min = new Date(now);
  min.setFullYear(min.getFullYear() - 5);
  const max = new Date(now);
  max.setFullYear(max.getFullYear() + 5);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

let lastReservationsReconcileAt = 0;
const RECONCILE_THROTTLE_MS = 60_000;

/**
 * Miroir exact Calendar↔Sheet pour l'onglet Réservations — perso
 * uniquement (Airbnb/Chantier ne sont jamais écrits ici, voir leurs modules
 * respectifs). Crée les lignes manquantes pour les événements Calendar
 * perso sans ligne Sheet (y compris "adoption" d'un événement créé à la
 * main, en lui posant un reservationId), et supprime les lignes Sheet
 * confirmées dont l'événement Calendar a été supprimé directement sur
 * Google. Ne touche jamais aux lignes cancelled (historique de paiement) ni
 * à celles hors de mirrorWindow.
 */
async function reconcileReservationsMirror(spreadsheetId: string | null): Promise<void> {
  if (Date.now() - lastReservationsReconcileAt < RECONCILE_THROTTLE_MS) return;
  lastReservationsReconcileAt = Date.now();

  const { ensureSpreadsheet, getRows, batchMutateRows, RESERVATIONS_TAB } =
    await import("../core/google/google.server");
  const { listCalendarEvents, patchCalendarEventExtendedProperties } =
    await import("../core/google/google-calendar.server");

  const resolvedSpreadsheetId = await ensureSpreadsheet(spreadsheetId);
  const { timeMin, timeMax } = mirrorWindow();
  const minDate = timeMin.slice(0, 10);
  const maxDate = timeMax.slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [rows, events] = await Promise.all([
    getRows(resolvedSpreadsheetId, `${quoteTab(RESERVATIONS_TAB)}!${RESERVATIONS_RANGE}`),
    listCalendarEvents(timeMin, timeMax),
  ]);

  const sheetRows = rows
    .map((row, index) => ({ row, index, reservation: rowToReservation(row) }))
    .filter(
      (x): x is { row: string[]; index: number; reservation: Reservation } =>
        x.reservation !== null,
    );
  const sheetById = new Map(sheetRows.map((x) => [x.reservation.id, x]));

  const seenIds = new Set<string>();
  const toAppend: Reservation[] = [];

  for (const event of events) {
    const summaryUpper = event.summary.toUpperCase();
    let type: ReservationType = (event.colorId && TYPE_BY_COLOR[event.colorId]) || "personal";
    if (summaryUpper.includes("AIRBNB")) type = "airbnb";
    if (summaryUpper.includes("CHANTIER")) type = "chantier";
    if (type !== "personal") continue; // l'onglet Réservations ne contient que le perso.

    const isUpcoming = event.endDate >= todayIso;
    let reservationId = event.extendedProperties.reservationId;
    if (!reservationId) {
      // On n'adopte automatiquement (pose d'un id + future ligne Sheet) que
      // les événements pas encore terminés. Le calendrier partagé porte des
      // années d'événements personnels (mariages, anniversaires, baptêmes...)
      // sans lien avec une réservation de la maison — on ne les importe
      // jamais rétroactivement en masse (voir l'incident équivalent côté
      // chantiers). Pour un événement passé précis à rattacher au Sheet, un
      // backfill ciblé (comme pour les 3 événements déjà traités) reste la
      // bonne voie.
      if (!isUpcoming) continue;
      // Événement perso créé à la main sur Calendar : on lui attribue un id
      // stable pour pouvoir le mirrorer, sans toucher au reste de
      // l'événement (patch minimal, extendedProperties uniquement).
      reservationId = crypto.randomUUID();
      try {
        await patchCalendarEventExtendedProperties(event.id, {
          ...event.extendedProperties,
          reservationId,
          type: "personal",
        });
      } catch (error) {
        console.error("[reconcileReservationsMirror] échec adoption (patch reservationId):", error);
        continue; // on retentera au prochain passage plutôt que de risquer une ligne dupliquée.
      }
    }
    seenIds.add(reservationId); // protège aussi une ligne déjà existante pour une résa passée.
    // Le miroir ne s'applique "qu'à partir de maintenant" (demande explicite) :
    // on ne recrée jamais de ligne pour un événement déjà terminé, même s'il
    // était auparavant suivi (ligne supprimée volontairement lors du nettoyage
    // de l'historique) — sinon la ligne réapparaîtrait au prochain passage.
    if (!isUpcoming) continue;
    if (sheetById.has(reservationId)) continue;

    toAppend.push(
      fallbackReservationFromEvent({
        ...event,
        extendedProperties: { ...event.extendedProperties, reservationId },
      }),
    );
  }

  // Suppression des lignes orphelines (événement Calendar supprimé à la
  // main) : uniquement les lignes confirmées de type perso, avec un id
  // Calendar connu, et dont la date de début tombe dans la fenêtre large
  // scannée ci-dessus. Les lignes "Annulée" (annulation via l'app, qui
  // supprime déjà l'événement Calendar) restent en historique, jamais
  // supprimées ici. Ordre décroissant d'index pour ne pas décaler les
  // lignes restantes pendant la suppression.
  const toDelete = sheetRows
    .filter(
      (x) =>
        x.reservation.status === "confirmed" &&
        x.reservation.type === "personal" &&
        x.reservation.calendarEventId &&
        x.reservation.startDate >= minDate &&
        x.reservation.startDate <= maxDate &&
        !seenIds.has(x.reservation.id),
    )
    .sort((a, b) => b.index - a.index);

  if (toAppend.length || toDelete.length) {
    try {
      await batchMutateRows(resolvedSpreadsheetId, RESERVATIONS_TAB, {
        deletes: toDelete.map((entry) => entry.index),
        appends: toAppend.map(reservationToRow),
      });
    } catch (error) {
      console.error("[reconcileReservationsMirror] échec batch miroir:", error);
    }
  }
}

const ListInput = z.object({
  spreadsheetId: z.string().nullable(),
  timeMin: z.string(),
  timeMax: z.string(),
});

export const listReservations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }) => {
    await reconcileReservationsMirror(data.spreadsheetId);
    const reservations = await fetchAllReservations(data.spreadsheetId, data.timeMin, data.timeMax);
    return { reservations };
  });

const CreateInput = z.object({
  spreadsheetId: z.string().nullable(),
  // "chantier" n'est plus créable via ce flux générique — les chantiers ont
  // leur propre création dédiée (voir chantier.functions.ts::createChantier),
  // qui écrit dans un classeur Google Sheet séparé.
  type: z.enum(["personal", "airbnb"]),
  reservedBy: z.string().min(1).max(60),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(0).max(50),
  children: z.number().int().min(0).max(50),
  privatized: z.boolean(),
  mood: z.string().max(200),
  preheat: z.boolean(),
  arrivalTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

// Fenêtre de vérification des conflits : 6 mois en arrière, 18 mois en avant.
function conflictWindow(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const min = new Date(now);
  min.setMonth(min.getMonth() - 6);
  const max = new Date(now);
  max.setMonth(max.getMonth() + 18);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

export const createReservation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    if (data.endDate <= data.startDate) {
      throw new Error("La date de fin doit être après la date de début.");
    }

    const { timeMin, timeMax } = conflictWindow();
    let existing: Reservation[];
    try {
      existing = await fetchAllReservations(data.spreadsheetId, timeMin, timeMax);
    } catch (error) {
      console.error("[createReservation] échec fetchAllReservations (vérif conflit):", error);
      throw new Error(
        `Échec de la lecture Google Calendar/Sheets (vérification des conflits) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const conflict = checkConflict(
      { startDate: data.startDate, endDate: data.endDate, privatized: data.privatized },
      existing,
    );
    if (conflict.blocked) {
      return { ok: false as const, reason: conflict.reason!, overlapping: [] };
    }

    const { ensureSpreadsheet, appendRow, RESERVATIONS_TAB } =
      await import("../core/google/google.server");
    const { insertCalendarEvent, deleteCalendarEvent } =
      await import("../core/google/google-calendar.server");

    const nights = nightsBetween(data.startDate, data.endDate);
    const nuiteesAmount =
      data.type === "personal"
        ? computeNuiteesAmount({ adults: data.adults, nights, privatized: data.privatized })
        : 0;

    const id = crypto.randomUUID();
    const summary =
      data.type === "airbnb"
        ? "AIRBNB"
        : personalEventSummary(data.reservedBy, data.adults + data.children, data.mood);

    let calendarEvent: Awaited<ReturnType<typeof insertCalendarEvent>>;
    try {
      calendarEvent = await insertCalendarEvent({
        summary,
        colorId: CALENDAR_COLOR_BY_TYPE[data.type],
        startDate: data.startDate,
        endDate: data.endDate,
        privateExtendedProperties: {
          reservationId: id,
          type: data.type,
          reservedBy: data.reservedBy,
          adults: String(data.adults),
          children: String(data.children),
          privatized: String(data.privatized),
          mood: data.mood,
          arrivalTime: data.arrivalTime ?? "",
        },
      });
    } catch (error) {
      // Logué en direct (synchronement catché) pour être SÛR de voir le vrai
      // message dans le terminal `bun run dev`, même si h3 avale ensuite
      // l'erreur plus haut dans la pile en un générique "HTTPError".
      console.error("[createReservation] échec insertCalendarEvent:", error);
      throw new Error(
        `Échec de l'écriture Google Calendar : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const reservation: Reservation = {
      id,
      type: data.type,
      status: "confirmed",
      createdAt: new Date().toISOString(),
      reservedBy: data.reservedBy,
      startDate: data.startDate,
      endDate: data.endDate,
      adults: data.adults,
      children: data.children,
      privatized: data.privatized,
      mood: data.mood,
      preheat: data.preheat,
      nuiteesAmount,
      electricityAmount: null,
      totalAmount: nuiteesAmount,
      paid: false,
      calendarEventId: calendarEvent.id,
      cancelledAt: null,
      arrivalTime: data.arrivalTime ?? "",
    };

    // L'onglet Réservations ne contient que le perso — Airbnb est géré en
    // dehors de l'app (voir agenda.tsx), directement depuis Calendar, jamais
    // écrit dans ce Sheet.
    if (data.type === "personal") {
      try {
        const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
        await appendRow(
          spreadsheetId,
          `${quoteTab(RESERVATIONS_TAB)}!A:R`,
          reservationToRow(reservation),
        );
      } catch (error) {
        console.error(
          "[createReservation] échec appendRow (Sheets), événement Calendar déjà créé:",
          error,
        );
        try {
          await deleteCalendarEvent(calendarEvent.id);
        } catch (rollbackError) {
          console.error("[createReservation] rollback Calendar échoué:", rollbackError);
        }
        throw new Error(
          `Échec de l'écriture Google Sheets, la création a été annulée : ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // NB pré-chauffage : le déclenchement effectif via l'API Netatmo n'est pas encore
    // câblé (nécessite l'enregistrement d'une app développeur Netatmo côté Alain).
    // L'intention est enregistrée (colonne "Pré-chauffage"), à brancher en V1.1.

    return { ok: true as const, reservation };
  });

const CancelInput = z.object({ spreadsheetId: z.string().nullable(), id: z.string().min(1) });

export const cancelReservation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CancelInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, updateRange, RESERVATIONS_TAB } =
      await import("../core/google/google.server");
    const { deleteCalendarEvent } = await import("../core/google/google-calendar.server");

    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(
      spreadsheetId,
      `${quoteTab(RESERVATIONS_TAB)}!${RESERVATIONS_RANGE}`,
    );
    const rowIndex = rows.findIndex((row) => (row[0] ?? "").trim() === data.id);

    if (rowIndex === -1) {
      // Pas de ligne Sheet correspondante — cas d'un événement Calendar créé
      // à la main, ou dont la ligne Sheet a été perdue depuis. On retrouve
      // l'événement Calendar par son id direct ("calendar:<eventId>", cas
      // fallbackReservationFromEvent sans reservationId) ou en cherchant
      // l'événement dont extendedProperties.reservationId correspond, et on
      // annule quand même en supprimant l'événement Calendar.
      let calendarEventId = data.id.startsWith("calendar:")
        ? data.id.slice("calendar:".length)
        : null;
      if (!calendarEventId) {
        const { timeMin, timeMax } = conflictWindow();
        const { listCalendarEvents } = await import("../core/google/google-calendar.server");
        const events = await listCalendarEvents(timeMin, timeMax);
        calendarEventId =
          events.find((e) => e.extendedProperties.reservationId === data.id)?.id ?? null;
      }
      if (!calendarEventId) throw new Error("Réservation introuvable.");
      try {
        await deleteCalendarEvent(calendarEventId);
      } catch (error) {
        console.error("[cancelReservation] échec deleteCalendarEvent (fallback):", error);
        throw new Error(
          `Échec de la suppression Google Calendar : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return { ok: true as const };
    }

    const reservation = rowToReservation(rows[rowIndex]);
    if (!reservation) throw new Error("Réservation introuvable.");

    const cancelled: Reservation = {
      ...reservation,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
    };
    // +2 : header en ligne 1, index de tableau 0-based -> ligne Sheet 1-based.
    const sheetRow = rowIndex + 2;
    try {
      await updateRange(
        spreadsheetId,
        `${quoteTab(RESERVATIONS_TAB)}!A${sheetRow}:R${sheetRow}`,
        reservationToRow(cancelled),
      );
    } catch (error) {
      console.error("[cancelReservation] échec updateRange (Sheets):", error);
      throw new Error(
        `Échec de la mise à jour Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (reservation.calendarEventId) {
      try {
        await deleteCalendarEvent(reservation.calendarEventId);
      } catch (error) {
        console.error("[cancelReservation] échec deleteCalendarEvent, rollback Sheets:", error);
        try {
          await updateRange(
            spreadsheetId,
            `${quoteTab(RESERVATIONS_TAB)}!A${sheetRow}:R${sheetRow}`,
            reservationToRow(reservation),
          );
        } catch (rollbackError) {
          console.error("[cancelReservation] rollback Sheets échoué:", rollbackError);
        }
        throw new Error(
          `Échec de la suppression Google Calendar : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { ok: true as const };
  });

const UpdateInput = z.object({
  spreadsheetId: z.string().nullable(),
  id: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(0).max(50),
  children: z.number().int().min(0).max(50),
  privatized: z.boolean(),
  mood: z.string().max(200),
});

export const updateReservation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data }) => {
    if (data.endDate <= data.startDate) {
      throw new Error("La date de fin doit être après la date de début.");
    }

    const { ensureSpreadsheet, getRows, updateRange, RESERVATIONS_TAB } =
      await import("../core/google/google.server");
    const { updateCalendarEvent } = await import("../core/google/google-calendar.server");

    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(
      spreadsheetId,
      `${quoteTab(RESERVATIONS_TAB)}!${RESERVATIONS_RANGE}`,
    );
    const rowIndex = rows.findIndex((row) => (row[0] ?? "").trim() === data.id);
    if (rowIndex === -1) throw new Error("Réservation introuvable.");
    const current = rowToReservation(rows[rowIndex]);
    if (!current) throw new Error("Réservation introuvable.");
    if (current.type !== "personal") {
      throw new Error("Seules les réservations personnelles se modifient depuis l'app.");
    }

    const { timeMin, timeMax } = conflictWindow();
    const existing = await fetchAllReservations(data.spreadsheetId, timeMin, timeMax);
    const conflict = checkConflict(
      {
        startDate: data.startDate,
        endDate: data.endDate,
        privatized: data.privatized,
        excludeId: data.id,
      },
      existing,
    );
    if (conflict.blocked) {
      return { ok: false as const, reason: conflict.reason! };
    }

    const nights = nightsBetween(data.startDate, data.endDate);
    const nuiteesAmount = computeNuiteesAmount({
      adults: data.adults,
      nights,
      privatized: data.privatized,
    });

    const updated: Reservation = {
      ...current,
      startDate: data.startDate,
      endDate: data.endDate,
      adults: data.adults,
      children: data.children,
      privatized: data.privatized,
      mood: data.mood,
      nuiteesAmount,
      totalAmount: nuiteesAmount + (current.electricityAmount ?? 0),
    };

    if (current.calendarEventId) {
      try {
        await updateCalendarEvent(current.calendarEventId, {
          summary: personalEventSummary(
            updated.reservedBy,
            updated.adults + updated.children,
            updated.mood,
          ),
          colorId: CALENDAR_COLOR_BY_TYPE.personal,
          startDate: updated.startDate,
          endDate: updated.endDate,
          privateExtendedProperties: {
            reservationId: updated.id,
            type: "personal",
            reservedBy: updated.reservedBy,
            adults: String(updated.adults),
            children: String(updated.children),
            privatized: String(updated.privatized),
            mood: updated.mood,
            arrivalTime: updated.arrivalTime,
          },
        });
      } catch (error) {
        console.error("[updateReservation] échec updateCalendarEvent:", error);
        throw new Error(
          `Échec de la mise à jour Google Calendar : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const sheetRow = rowIndex + 2;
    try {
      await updateRange(
        spreadsheetId,
        `${quoteTab(RESERVATIONS_TAB)}!A${sheetRow}:R${sheetRow}`,
        reservationToRow(updated),
      );
    } catch (error) {
      console.error("[updateReservation] échec updateRange (Sheets):", error);
      if (current.calendarEventId) {
        try {
          await updateCalendarEvent(current.calendarEventId, {
            summary: personalEventSummary(
              current.reservedBy,
              current.adults + current.children,
              current.mood,
            ),
            colorId: CALENDAR_COLOR_BY_TYPE.personal,
            startDate: current.startDate,
            endDate: current.endDate,
            privateExtendedProperties: {
              reservationId: current.id,
              type: "personal",
              reservedBy: current.reservedBy,
              adults: String(current.adults),
              children: String(current.children),
              privatized: String(current.privatized),
              mood: current.mood,
              arrivalTime: current.arrivalTime,
            },
          });
        } catch (rollbackError) {
          console.error("[updateReservation] rollback Calendar échoué:", rollbackError);
        }
      }
      throw new Error(
        `Échec de la mise à jour Google Sheets : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { ok: true as const, reservation: updated };
  });

// NB : updateChantierHeadcount a déménagé dans chantier.functions.ts — les
// chantiers vivent désormais dans leur propre classeur Google Sheet.

const SetElectricityInput = z.object({
  spreadsheetId: z.string().nullable(),
  id: z.string().min(1),
  electricityAmount: z.number().min(0).max(5000),
});

export const setElectricityAmount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SetElectricityInput.parse(d))
  .handler(async ({ data }) => {
    const { ensureSpreadsheet, getRows, updateRange, RESERVATIONS_TAB } =
      await import("../core/google/google.server");

    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const rows = await getRows(
      spreadsheetId,
      `${quoteTab(RESERVATIONS_TAB)}!${RESERVATIONS_RANGE}`,
    );
    const rowIndex = rows.findIndex((row) => (row[0] ?? "").trim() === data.id);
    if (rowIndex === -1) throw new Error("Réservation introuvable.");
    const current = rowToReservation(rows[rowIndex]);
    if (!current) throw new Error("Réservation introuvable.");

    const updated: Reservation = {
      ...current,
      electricityAmount: data.electricityAmount,
      totalAmount: current.nuiteesAmount + data.electricityAmount,
    };

    const sheetRow = rowIndex + 2;
    await updateRange(
      spreadsheetId,
      `${quoteTab(RESERVATIONS_TAB)}!A${sheetRow}:R${sheetRow}`,
      reservationToRow(updated),
    );

    return { ok: true as const, reservation: updated };
  });
