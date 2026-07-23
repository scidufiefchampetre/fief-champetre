// Connexion Google Calendar via OAuth "compte perso" — indépendante de la
// passerelle Lovable (comme Sheets/Drive, voir google.server.ts et
// google-oauth.server.ts). Variable d'env supplémentaire, propre à Calendar :
//   GOOGLE_CALENDAR_ID  (défaut : lesenfantsdufiefchampetre@gmail.com)
// Comme l'app agit avec le compte Google d'Alain, aucun partage n'est requis
// tant que ce compte a déjà accès au calendrier visé.

import { getGoogleAccessToken } from "./google-oauth.server";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export function getCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || "lesenfantsdufiefchampetre@gmail.com";
}

async function calendarFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getGoogleAccessToken([CALENDAR_SCOPE]);
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  return res;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  colorId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD, exclusif (format all-day Google Calendar)
  privateExtendedProperties: Record<string, string>;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  colorId: string | null;
  startDate: string;
  endDate: string;
  extendedProperties: Record<string, string>;
}

const CALENDAR_READ_TTL_MS = 5_000;
const calendarReadCache = new Map<
  string,
  { expiresAt: number; promise: Promise<CalendarEvent[]> }
>();

function invalidateCalendarReadCache() {
  calendarReadCache.clear();
}

function extractDate(d?: { date?: string; dateTime?: string }): string {
  if (!d) return "";
  if (d.date) return d.date;
  if (d.dateTime) return d.dateTime.slice(0, 10);
  return "";
}

function toCalendarEvent(raw: {
  id: string;
  summary?: string;
  colorId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}): CalendarEvent {
  return {
    id: raw.id,
    summary: raw.summary ?? "",
    colorId: raw.colorId ?? null,
    startDate: extractDate(raw.start),
    endDate: extractDate(raw.end),
    extendedProperties: raw.extendedProperties?.private ?? {},
  };
}

export async function listCalendarEvents(
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const cacheKey = `${getCalendarId()}::${new Date(timeMin).toISOString()}::${new Date(timeMax).toISOString()}`;
  const cached = calendarReadCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = listCalendarEventsUncached(timeMin, timeMax);
  calendarReadCache.set(cacheKey, {
    expiresAt: Date.now() + CALENDAR_READ_TTL_MS,
    promise,
  });
  try {
    return await promise;
  } catch (error) {
    calendarReadCache.delete(cacheKey);
    throw error;
  }
}

async function listCalendarEventsUncached(
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const calendarId = encodeURIComponent(getCalendarId());
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  // Pagination indispensable : sans elle, une fenêtre large (miroir Calendar↔Sheet)
  // tronquerait silencieusement au-delà de 250 événements, ce qui ferait
  // interpréter des événements simplement "hors page" comme supprimés.
  do {
    const params = new URLSearchParams({
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await calendarFetch(`/calendars/${calendarId}/events?${params}`);
    if (!res.ok) throw new Error(`Calendar list failed [${res.status}]: ${await res.text()}`);
    const json = (await res.json()) as { items?: unknown[]; nextPageToken?: string };
    events.push(
      ...(json.items ?? []).map((item) =>
        toCalendarEvent(item as Parameters<typeof toCalendarEvent>[0]),
      ),
    );
    pageToken = json.nextPageToken;
  } while (pageToken);
  return events;
}

export async function insertCalendarEvent(input: CalendarEventInput): Promise<CalendarEvent> {
  const calendarId = encodeURIComponent(getCalendarId());
  const res = await calendarFetch(`/calendars/${calendarId}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      colorId: input.colorId,
      start: { date: input.startDate },
      end: { date: input.endDate },
      extendedProperties: { private: input.privateExtendedProperties },
    }),
  });
  if (!res.ok) throw new Error(`Calendar insert failed [${res.status}]: ${await res.text()}`);
  const event = toCalendarEvent(await res.json());
  invalidateCalendarReadCache();
  return event;
}

export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const calendarId = encodeURIComponent(getCalendarId());
  const res = await calendarFetch(`/calendars/${calendarId}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      colorId: input.colorId,
      start: { date: input.startDate },
      end: { date: input.endDate },
      extendedProperties: { private: input.privateExtendedProperties },
    }),
  });
  if (!res.ok) throw new Error(`Calendar update failed [${res.status}]: ${await res.text()}`);
  const event = toCalendarEvent(await res.json());
  invalidateCalendarReadCache();
  return event;
}

/**
 * PATCH minimal qui ne touche QUE extendedProperties.private, en laissant
 * summary/colorId/dates intacts (contrairement à updateCalendarEvent qui
 * réécrit tout l'événement). Utilisé pour "adopter" dans le miroir Sheet un
 * événement créé à la main sur Calendar (sans reservationId), sans risquer
 * de le recolorer ou de le renommer.
 */
export async function patchCalendarEventExtendedProperties(
  eventId: string,
  properties: Record<string, string>,
): Promise<void> {
  const calendarId = encodeURIComponent(getCalendarId());
  const res = await calendarFetch(`/calendars/${calendarId}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ extendedProperties: { private: properties } }),
  });
  if (!res.ok) {
    throw new Error(
      `Calendar patch (extendedProperties) failed [${res.status}]: ${await res.text()}`,
    );
  }
  invalidateCalendarReadCache();
}

/** PATCH minimal qui ne touche QUE summary, en laissant colorId/dates/extendedProperties intacts. */
export async function patchCalendarEventSummary(eventId: string, summary: string): Promise<void> {
  const calendarId = encodeURIComponent(getCalendarId());
  const res = await calendarFetch(`/calendars/${calendarId}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ summary }),
  });
  if (!res.ok) {
    throw new Error(`Calendar patch (summary) failed [${res.status}]: ${await res.text()}`);
  }
  invalidateCalendarReadCache();
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const calendarId = encodeURIComponent(getCalendarId());
  const res = await calendarFetch(`/calendars/${calendarId}/events/${eventId}`, {
    method: "DELETE",
  });
  // 410 Gone = déjà supprimé côté Calendar, on considère ça comme un succès.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`Calendar delete failed [${res.status}]: ${await res.text()}`);
  }
  invalidateCalendarReadCache();
}
