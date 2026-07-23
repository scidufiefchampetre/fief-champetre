export type ReservationType = "personal" | "airbnb" | "chantier";
export type ReservationStatus = "confirmed" | "cancelled";

export interface Reservation {
  id: string;
  type: ReservationType;
  status: ReservationStatus;
  createdAt: string; // ISO
  reservedBy: string; // prénom
  startDate: string; // ISO date, YYYY-MM-DD
  endDate: string; // ISO date, YYYY-MM-DD (exclusif, comme les événements Calendar "all day")
  adults: number;
  children: number;
  privatized: boolean;
  mood: string;
  preheat: boolean;
  arrivalTime: string; // "HH:MM", optionnel — chaîne vide si non renseigné
  nuiteesAmount: number;
  electricityAmount: number | null; // null tant que pas saisi
  totalAmount: number;
  paid: boolean;
  calendarEventId: string | null;
  cancelledAt: string | null; // ISO, rempli uniquement au moment de l'annulation
}

export interface OverlapInfo {
  reservedBy: string;
  headcount: number;
  mood: string;
}

export interface ConflictResult {
  blocked: boolean;
  reason: string | null;
  overlapping: OverlapInfo[];
}

export const CALENDAR_COLOR_BY_TYPE: Record<ReservationType, string> = {
  // Google Calendar colorId values
  personal: "9", // Blueberry
  airbnb: "11", // Tomato
  chantier: "5", // Banana
};

export const TYPE_LABEL: Record<ReservationType, string> = {
  personal: "Perso",
  airbnb: "Airbnb",
  chantier: "Chantier",
};
