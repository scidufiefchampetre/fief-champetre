export const TOP_CATEGORIES = [
  "Entretien & Travaux — Maison et Parc",
  "Charges fixes & Administratif — Impôts, assurances, énergie…",
  "Vie quotidienne & Accueil — Courses, événements…",
  "Repas chantier",
  "Activité locative — Revenus + dépenses",
  "Divers / Exceptionnel",
] as const;

export type TopCategory = (typeof TOP_CATEGORIES)[number];

export const PLACES = ["Nanou", "Écuries", "Émile", "Maison", "Parc", "Commun", "Autre"] as const;

export type Place = (typeof PLACES)[number];

export type Side = "SCI" | "Association";
export type PaymentMethod = "Virement" | "Chèque" | "Carte" | "Prélèvement" | "Espèces";
export type PaidBy = "SCI" | "Association" | "Membre";
export type ReimbursementStatus = "À rembourser" | "Remboursé";

export interface ClarificationOption {
  label: string;
  side: Side;
  topCategory: TopCategory;
  comment: string;
}

export interface Expense {
  id?: string;
  supplier: string;
  invoiceDate: string; // ISO
  amountTTC: number;
  vat: number | null;
  detectedObject: string;
  topCategory: TopCategory;
  purchaseDetail: string;
  place: Place;
  paidBy: PaidBy;
  memberName?: string;
  paymentMethod: PaymentMethod;
  ribAvailable?: boolean;
  reimbursementStatus?: ReimbursementStatus;
  reimbursementSide?: Side;
  finalSide: Side;
  comment: string;
  invoiceFileLink?: string;
  chantierId?: string;
  chantierStartDate?: string;
  chantierLabel?: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: ClarificationOption[];
  needsPlaceChoice?: boolean;
}
