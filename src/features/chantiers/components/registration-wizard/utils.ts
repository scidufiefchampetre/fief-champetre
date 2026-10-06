import type { AttendedMeal, MealType } from "@/lib/chantier-registrations.functions";

/**
 * Jours de présence du chantier, jour d'arrivée ET jour de départ inclus :
 * `endDate` est le jour du départ (ex. sam. → dim. = 2 jours). Les repas
 * réellement proposés ce jour-là sont filtrés par `validMealTokens`.
 */
export function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return days;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export function mealToken(date: string, meal: MealType): string {
  return `${date}:${meal}`;
}

export function parseMealToken(token: string): { date: string; meal: MealType } {
  const [date, meal] = token.split(":");
  return { date, meal: meal as MealType };
}

export function allMealTokens(days: string[]): string[] {
  return days.flatMap((d) => [mealToken(d, "dejeuner"), mealToken(d, "diner")]);
}

export function validMealTokens(
  days: string[],
  startPeriod?: string | null,
  endPeriod?: string | null,
): string[] {
  // Moments par défaut identiques à l'affichage (arrivée le matin, départ
  // l'après-midi) quand le chantier n'en précise pas.
  const arrival = startPeriod || "matin";
  const departure = endPeriod || "apres_midi";
  return allMealTokens(days).filter((t) => {
    const { date, meal } = parseMealToken(t);
    // Arrival day: no lunch if arriving in the afternoon or evening
    if (date === days[0] && meal === "dejeuner" && arrival !== "matin") return false;
    // Departure day: lunch only if leaving after it, dinner only if leaving in the evening
    if (date === days[days.length - 1]) {
      if (meal === "dejeuner" && departure === "matin") return false;
      if (meal === "diner" && departure !== "soir") return false;
    }
    return true;
  });
}

export function setToMeals(tokens: Set<string>): AttendedMeal[] {
  return [...tokens].map((t) => parseMealToken(t));
}

export function mealsToSet(meals: AttendedMeal[]): Set<string> {
  return new Set(meals.map((m) => mealToken(m.date, m.meal)));
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function fmtDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function isChildPersonType(type: string): boolean {
  return type === "child" || type === "guest_child";
}
