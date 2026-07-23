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
  const month = MOIS_FR[start.getUTCMonth()];
  return `WE Chantier / ${month.charAt(0).toUpperCase()}${month.slice(1)} / ${year}`;
}

export interface Chantier {
  id: string;
  createdAt: string; // ISO
  reservedBy: string;
  startDate: string; // ISO date, YYYY-MM-DD
  endDate: string; // ISO date, YYYY-MM-DD (exclusif, comme les événements Calendar all-day)
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
  done: boolean;
  note: string;
  participants: string; // noms séparés par virgule, ex: "Jean, Marie" — saisie libre
  completedAt: string; // ISO, vide si pas fait
  resultPhotoUrl: string; // lien Drive vers la photo du résultat (phase Après)
  photoBefore?: string; // URL ou data-URL locale de la photo "avant" (phase Avant, draft uniquement)
  description?: string; // description de ce qu'il faut faire (contexte pré-tâche)
  toBuy?: string; // liste de courses / matériel à acheter
  durationMinutes: number; // temps réellement passé, facultatif
  peopleCount: number; // effectif réel (jours-homme), facultatif
  urgency: "tres_urgent" | "urgent" | "important" | "must_have" | ""; // reprise du signalement d'origine, vide si tâche saisie à la main
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

// --- Onglet unifié par chantier -------------------------------------------
// Un seul onglet par chantier (voir chantierTabTitle) regroupe tout : la
// fiche admin, les tâches, les inscriptions et l'intendance. Une colonne
// "Type" distingue le genre de chaque ligne ; chaque type a son propre bloc
// de colonnes dédiées (le reste de la ligne est vide), pour que chaque
// colonne garde un sens fixe quel que soit le type de ligne lu.
export type ChantierRowType = "fiche" | "tache" | "inscription" | "intendance" | "depense";

export const CHANTIER_TAB_HEADERS = [
  "Type", // A
  "ID", // B
  "Créé le", // C
  "Description (fiche)", // D
  "Tâche", // E
  "Fait", // F
  "Note tâche", // G
  "Participants tâche", // H
  "Terminé le", // I
  "Groupe ID", // J
  "Nom inscrit", // K
  "Inscrit par", // L
  "Type personne", // M
  "Mode", // N
  "Membre asso", // O
  "Repas", // P — liste "date:repas" séparée par virgules, ex "2026-09-12:dejeuner,2026-09-12:diner"
  "Annulé le", // Q
  "Date intendance", // R
  "Créneau", // S
  "Rôle", // T
  "Personne intendance", // U
  "Photo résultat", // V
  "Durée réelle (min)", // W
  "Nombre de personnes", // X
  "Dépense ID", // Y
  "Date facture", // Z
  "Fournisseur", // AA
  "Montant TTC (€)", // AB
  "Lien facture", // AC
  "Déposé par", // AD
  "Catégorie dépense", // AE
  "Urgence tâche", // AF — reprise du signalement d'origine
];
export const CHANTIER_TAB_LAST_COL = "AF";

// ID fixe : il n'y a qu'une seule ligne "fiche" par onglet (upsert).
export const CHANTIER_FICHE_ROW_ID = "fiche";

/** Ligne vide de la largeur de l'onglet unifié — chaque module ne remplit que son propre bloc de colonnes. */
export function emptyChantierRow(): string[] {
  return new Array(CHANTIER_TAB_HEADERS.length).fill("");
}
