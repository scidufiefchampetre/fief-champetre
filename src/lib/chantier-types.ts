import { nightsBetween } from "./pricing";

const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const MOIS_COURT = [
  "jan.",
  "fév.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

/**
 * Nom d'affichage d'un chantier : "WE Chantier / Mois / Année" pour un
 * week-end (moins de 7 nuits), "Semaine Chantier Année" à partir d'une
 * semaine pleine (7 nuits ou plus).
 */
export function chantierDisplayName(startDate: string, endDate: string): string {
  const nights = nightsBetween(startDate, endDate);
  const start = new Date(`${startDate}T00:00:00Z`);
  const year = start.getUTCFullYear();
  if (nights >= 7) return `Semaine Chantier ${year}`;
  const month = MOIS_COURT[start.getUTCMonth()];
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;
}

export interface Chantier {
  id: string;
  createdAt: string; // ISO
  reservedBy: string;
  startDate: string; // ISO date, YYYY-MM-DD
  endDate: string; // ISO date, YYYY-MM-DD — jour du départ (exclu des nuitées, mais on y est présent : repas, missions)
  startPeriod: ChantierPeriod;
  endPeriod: ChantierPeriod;
  adults: number;
  children: number;
  calendarEventId: string | null;
  cancelledAt: string | null;
}

export type ChantierPeriod = "" | "matin" | "apres_midi" | "soir";

export interface ChantierTask {
  id: string;
  label: string;
  urgency: "tres_urgent" | "urgent" | "important" | "must_have" | "";
  // F: Statut
  taskStatus: "À faire" | "En cours" | "Terminé";
  done: boolean; // derived: taskStatus === "Terminé"
  // G: Pourcentage
  percentage: number; // 0-100
  // H: Description
  description: string;
  // I: À acheter (JSON array)
  toBuyItems: string[];
  // J: Photo avant
  photoBeforeUrl: string;
  // K: Photo après
  resultPhotoUrl: string;
  // L: Durée (min)
  durationMinutes: number;
  // M: Nb personnes
  peopleCount: number;
  // N: Participants
  participants: string;
  // O: Terminé le
  completedAt: string;
  // Legacy aliases kept for compatibility with task-item/task-execution-form
  note: string; // alias for description
}

export type TaskPhase = "avant" | "pendant" | "apres";

export function getTaskPhase(startDate: string, endDate: string): TaskPhase {
  const today = new Date().toISOString().slice(0, 10);
  if (today < startDate) return "avant";
  if (today <= endDate) return "pendant";
  return "apres";
}

/**
 * Titre d'onglet déterministe pour un chantier donné — recalculable à partir
 * de la réservation seule (id + date de début), sans rien stocker de plus.
 * Le fragment d'id garantit l'unicité même si deux chantiers tombaient un
 * jour sur la même date.
 */
export function chantierTabTitle(reservationId: string, startDate: string): string {
  return `Chantier ${startDate} (${reservationId.slice(0, 4)})`;
}

