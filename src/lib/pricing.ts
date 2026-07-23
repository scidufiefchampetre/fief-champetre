export const NUIT_PRICE_PER_ADULT = 5;
export const PRIVATIZATION_FLAT_PRICE = 250;
export const ADULT_MIN_AGE = 16;
export const MEAL_PRICE_PER_ADULT = 6;
export const MEAL_PRICE_PER_CHILD = 0; // repas gratuits pour les enfants
export const MEALS_PER_DAY = 2; // déjeuner + dîner (jamais le petit-déj)
// Réduction accordée aux membres Asso qui viennent bosser (mode "chantier",
// pas "teletravail"/"woofer") sur leurs jours de chantier effectués. Purement
// informatif dans l'app (affiché au trésorier), pas de suivi payé/pas payé
// dédié pour l'instant — voir chantier-registrations.functions.ts.
export const ASSO_CHANTIER_DAILY_REDUCTION = 10;

export interface ChantierMealBudgetInput {
  adults: number;
  children: number;
  /** Nombre de nuits du chantier (nightsBetween) — un repas midi+soir est compté par nuit passée sur place. */
  nights: number;
}

/**
 * Budget repas ESTIMÉ d'un chantier (vue admin agrégée, avant inscription
 * détaillée) : 6€/repas/adulte, enfants gratuits, 2 repas par jour (déjeuner
 * + dîner), pour chaque nuit du week-end. Convention : une nuit = une
 * "journée pleine" de 2 repas. Une fois les inscriptions individuelles
 * ouvertes (chantier-registrations.functions.ts), le total réel se calcule
 * plutôt personne par personne depuis les repas cochés — ce budget agrégé
 * reste utile comme estimation avant que les gens se soient inscrits.
 */
export function computeChantierMealBudget({
  adults,
  children,
  nights,
}: ChantierMealBudgetInput): number {
  const meals = MEALS_PER_DAY * Math.max(0, nights);
  return (
    (MEAL_PRICE_PER_ADULT * Math.max(0, adults) + MEAL_PRICE_PER_CHILD * Math.max(0, children)) *
    meals
  );
}

export function chantierMealBudgetDetail({
  adults,
  children,
  nights,
}: ChantierMealBudgetInput): string {
  const meals = MEALS_PER_DAY * Math.max(0, nights);
  const parts = [`${adults} adulte${adults > 1 ? "s" : ""}`];
  if (children > 0) parts.push(`${children} enfant${children > 1 ? "s" : ""}`);
  return `${parts.join(" + ")} × ${meals} repas (${nights} nuit${nights > 1 ? "s" : ""} × 2/jour)`;
}

/**
 * Nombre de nuits entre deux dates ISO (YYYY-MM-DD). endDate est exclusive,
 * comme une date de fin de séjour classique (ex: arrivée vendredi, départ dimanche = 2 nuits).
 */
export function nightsBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, nights);
}

export interface NuiteesInput {
  adults: number;
  nights: number;
  privatized: boolean;
}

export function computeNuiteesAmount({ adults, nights, privatized }: NuiteesInput): number {
  if (privatized) return PRIVATIZATION_FLAT_PRICE;
  return NUIT_PRICE_PER_ADULT * Math.max(0, adults) * Math.max(0, nights);
}

export interface PriceBreakdown {
  nuiteesAmount: number;
  nuiteesDetail: string; // ex: "5€ × 3 adultes × 2 nuits" ou "Privatisation complète (forfait)"
  electricityAmount: number | null;
  total: number;
}

export type PaymentStatus = "upcoming" | "awaiting_treasurer" | "due" | "paid";

export interface PaymentStatusInfo {
  status: PaymentStatus;
  label: string;
}

/**
 * Détermine où en est une réservation perso dans son cycle de paiement :
 * - upcoming : le séjour n'a pas encore eu lieu (rien à régler pour l'instant)
 * - awaiting_treasurer : le séjour est passé mais le trésorier n'a pas encore
 *   saisi le montant d'électricité, donc le total final n'est pas connu
 * - due : le montant total est connu mais pas encore réglé
 * - paid : réglé
 */
export const PAYMENT_BADGE_STYLE: Record<PaymentStatus, string> = {
  upcoming: "bg-secondary text-muted-foreground",
  awaiting_treasurer: "bg-secondary text-muted-foreground",
  due: "bg-brand-accent/15 text-brand-accent",
  paid: "bg-success/60 text-success-foreground",
};

export function getPaymentStatus(
  reservation: { endDate: string; electricityAmount: number | null; paid: boolean },
  today: Date = new Date(),
): PaymentStatusInfo {
  if (reservation.paid) return { status: "paid", label: "Réglé" };
  const todayIso = today.toISOString().slice(0, 10);
  if (todayIso < reservation.endDate) return { status: "upcoming", label: "En attente du séjour" };
  if (reservation.electricityAmount === null) {
    return { status: "awaiting_treasurer", label: "En attente du trésorier" };
  }
  return { status: "due", label: "Paiement dû" };
}

export function computePriceBreakdown(input: {
  adults: number;
  nights: number;
  privatized: boolean;
  electricityAmount: number | null;
}): PriceBreakdown {
  const nuiteesAmount = computeNuiteesAmount(input);
  const nuiteesDetail = input.privatized
    ? "Privatisation complète (forfait fixe)"
    : `5€ × ${input.adults} adulte${input.adults > 1 ? "s" : ""} × ${input.nights} nuit${input.nights > 1 ? "s" : ""}`;
  const electricity = input.electricityAmount ?? 0;
  return {
    nuiteesAmount,
    nuiteesDetail,
    electricityAmount: input.electricityAmount,
    total: nuiteesAmount + electricity,
  };
}
