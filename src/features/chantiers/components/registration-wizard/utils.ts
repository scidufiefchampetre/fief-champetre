import type { AttendedMeal, MealType } from "@/lib/chantier-registrations.functions";

export function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return days;
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
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
  return allMealTokens(days).filter((t) => {
    const { date, meal } = parseMealToken(t);
    // No lunch on arrival day if arriving in the evening
    if (meal === "dejeuner" && date === days[0] && startPeriod === "soir") return false;
    // No dinner on departure day if leaving in the morning
    if (meal === "diner" && date === days[days.length - 1] && endPeriod === "matin") return false;
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
