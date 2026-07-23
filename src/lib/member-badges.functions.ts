import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type BadgeMetric =
  | "personalStays"
  | "groupGuests"
  | "consecutiveChantiers"
  | "chantierDays"
  | "missions"
  | "missionHours"
  | "teamMissions"
  | "domains"
  | "casperMonths"
  | "cuisine"
  | "courses"
  | "garde"
  | "quartermaster"
  | "photos"
  | "issues"
  | "plannedIdeas"
  | "documentedMissions"
  | "expenses"
  | "mealExpenses"
  | "grandSlam";

export interface MemberBadgeStats {
  seasonStartYear: number;
  season: Record<BadgeMetric, number>;
}

const Input = z.object({
  spreadsheetId: z.string().nullable(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
});

const METRICS: BadgeMetric[] = [
  "personalStays",
  "groupGuests",
  "consecutiveChantiers",
  "chantierDays",
  "missions",
  "missionHours",
  "teamMissions",
  "domains",
  "casperMonths",
  "cuisine",
  "courses",
  "garde",
  "quartermaster",
  "photos",
  "issues",
  "plannedIdeas",
  "documentedMissions",
  "expenses",
  "mealExpenses",
  "grandSlam",
];

function emptyMetrics(): Record<BadgeMetric, number> {
  return Object.fromEntries(METRICS.map((metric) => [metric, 0])) as Record<BadgeMetric, number>;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR");
}

function quoteTab(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

function seasonStartYear(dateValue: string): number | null {
  const match = dateValue.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || !month) return null;
  return month >= 7 ? year : year - 1;
}

function currentSeasonStartYear() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function isPerson(value: string, firstName: string, fullName: string) {
  const normalized = normalize(value);
  return normalized === firstName || normalized === fullName;
}

function includesPerson(value: string, firstName: string, fullName: string) {
  return value
    .split(",")
    .map(normalize)
    .some((name) => name === firstName || name === fullName);
}

function numeric(value: string | undefined) {
  return Number(String(value ?? "0").replace(",", ".")) || 0;
}

const FIRST_UNLOCK: Partial<Record<BadgeMetric, number>> = {
  personalStays: 1,
  groupGuests: 1,
  consecutiveChantiers: 2,
  chantierDays: 1,
  missions: 1,
  missionHours: 2,
  teamMissions: 1,
  domains: 4,
  casperMonths: 6,
  cuisine: 1,
  courses: 1,
  garde: 1,
  quartermaster: 3,
  photos: 1,
  issues: 1,
  plannedIdeas: 1,
  documentedMissions: 1,
  expenses: 1,
  mealExpenses: 1,
};

export const getMemberBadgeStats = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => Input.parse(value))
  .handler(async ({ data }) => {
    const {
      ASSO_TAB,
      RESERVATIONS_TAB,
      SCI_TAB,
      batchGetRows,
      ensureChantiersSpreadsheet,
      ensureSpreadsheet,
      fetchSheetTitles,
    } = await import("../core/google/google.server");

    const [mainSpreadsheetId, chantiersSpreadsheetId] = await Promise.all([
      ensureSpreadsheet(data.spreadsheetId),
      ensureChantiersSpreadsheet(null),
    ]);
    const titles = await fetchSheetTitles(chantiersSpreadsheetId);
    const chantierTabs = [...titles].filter((title) => title.startsWith("Chantier ")).sort();

    const mainRanges = [`${RESERVATIONS_TAB}!A2:S`, `${SCI_TAB}!A2:U`, `${ASSO_TAB}!A2:U`];
    const chantierRanges: string[] = [];
    let contributionsIndex = -1;
    let reportsIndex = -1;
    const tabIndexes = new Map<string, number>();
    if (titles.has("Jours chantier")) {
      contributionsIndex = chantierRanges.push("'Jours chantier'!A2:F") - 1;
    }
    if (titles.has("Tâches chantier")) {
      reportsIndex = chantierRanges.push("'Tâches chantier'!A2:M") - 1;
    }
    for (const title of chantierTabs) {
      tabIndexes.set(title, chantierRanges.push(`${quoteTab(title)}!A2:AE`) - 1);
    }

    const [mainBlocks, chantierBlocks] = await Promise.all([
      batchGetRows(mainSpreadsheetId, mainRanges),
      chantierRanges.length > 0
        ? batchGetRows(chantiersSpreadsheetId, chantierRanges)
        : Promise.resolve([]),
    ]);

    const firstName = normalize(data.firstName);
    const fullName = normalize(`${data.firstName} ${data.lastName}`);
    const today = new Date().toISOString().slice(0, 10);
    const currentSeason = currentSeasonStartYear();
    const season = emptyMetrics();
    const domains = new Set<"mission" | "cuisine" | "courses" | "garde">();
    const intendanceRoles = new Set<"cuisine" | "courses" | "garde">();
    let intendanceTotal = 0;
    const registeredChantiers: Array<{ date: string; registered: boolean }> = [];
    const historicalRegisteredDates: string[] = [];
    const add = (metric: BadgeMetric, amount: number, dateValue: string) => {
      if (seasonStartYear(dateValue) !== currentSeason || dateValue > today || amount <= 0) return;
      season[metric] += amount;
    };

    for (const row of mainBlocks[0] ?? []) {
      const isMine = isPerson(row[4] ?? "", firstName, fullName);
      if (row[2] !== "personal" || row[3] !== "confirmed" || !isMine || row[17]) continue;
      const startDate = row[5] ?? "";
      add("personalStays", 1, startDate);
      add("groupGuests", Math.max(0, numeric(row[7]) + numeric(row[8]) - 1), startDate);
    }

    for (const row of [...(mainBlocks[1] ?? []), ...(mainBlocks[2] ?? [])]) {
      const depositor = row[16] ?? "";
      const paidBy = row[8] ?? "";
      const mine =
        isPerson(depositor, firstName, fullName) || isPerson(paidBy, firstName, fullName);
      const complete =
        Boolean((row[1] ?? "").trim()) &&
        Boolean((row[2] ?? "").trim()) &&
        numeric(row[3]) > 0 &&
        Boolean((row[15] ?? "").trim());
      if (!mine || !complete) continue;
      const date = row[2] || row[0] || "";
      add("expenses", 1, date);
      const category = normalize(row[5] ?? "");
      if ((row[18] ?? "").trim() && category.includes("repas")) {
        add("mealExpenses", 1, date);
      }
    }

    if (contributionsIndex >= 0) {
      for (const row of chantierBlocks[contributionsIndex] ?? []) {
        if (isPerson(row[3] ?? "", firstName, fullName)) {
          add("chantierDays", numeric(row[5]), row[1] ?? "");
        }
      }
    }

    for (const title of chantierTabs) {
      const tabDate = title.match(/^Chantier (\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
      const blockIndex = tabIndexes.get(title);
      const rows = blockIndex === undefined ? [] : (chantierBlocks[blockIndex] ?? []);
      const activeRegistrations = rows.filter((row) => row[0] === "inscription" && !row[16]);
      const registered = activeRegistrations.some((row) =>
        isPerson(row[10] ?? "", firstName, fullName),
      );
      registeredChantiers.push({ date: tabDate, registered });
      if (registered && tabDate <= today) {
        historicalRegisteredDates.push(tabDate);
      }
      if (seasonStartYear(tabDate) === currentSeason && tabDate <= today) {
        const guests = activeRegistrations.filter(
          (row) =>
            isPerson(row[11] ?? "", firstName, fullName) &&
            !isPerson(row[10] ?? "", firstName, fullName),
        ).length;
        season.groupGuests += guests;
      }

      for (const row of rows) {
        if (row[0] === "intendance") {
          if (!isPerson(row[20] ?? "", firstName, fullName)) continue;
          const role = row[19] as "cuisine" | "courses" | "garde";
          if (role !== "cuisine" && role !== "courses" && role !== "garde") continue;
          const date = row[17] || tabDate;
          add(role, 1, date);
          if (seasonStartYear(date) === currentSeason && date <= today) {
            domains.add(role);
            intendanceRoles.add(role);
            intendanceTotal += 1;
          }
        }
        if (row[0] !== "tache" || normalize(row[5] ?? "") !== "oui") continue;
        if (!includesPerson(row[7] ?? "", firstName, fullName)) continue;
        const completedAt = row[8] || tabDate;
        add("missions", 1, completedAt);
        add("missionHours", numeric(row[22]) / 60, completedAt);
        const participantCount = Math.max(
          numeric(row[23]),
          (row[7] ?? "")
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean).length,
        );
        if (participantCount >= 3) add("teamMissions", 1, completedAt);
        if ((row[21] ?? "").trim()) add("photos", 1, completedAt);
        if ((row[6] ?? "").trim() && numeric(row[22]) > 0 && participantCount > 0) {
          add("documentedMissions", 1, completedAt);
        }
        if (seasonStartYear(completedAt) === currentSeason && completedAt <= today) {
          domains.add("mission");
        }
      }
    }

    if (reportsIndex >= 0) {
      for (const row of chantierBlocks[reportsIndex] ?? []) {
        if (!isPerson(row[2] ?? "", firstName, fullName)) continue;
        const date = row[1] ?? "";
        const category = row[3] ?? "";
        if (category === "dysfonctionnement" || category === "casse") add("issues", 1, date);
        if (category === "tache" && row[10] === "planifie") add("plannedIdeas", 1, date);
        if ((row[12] ?? "").trim()) add("photos", 1, date);
      }
    }

    let currentStreak = 0;
    let longestStreak = 0;
    for (const chantier of registeredChantiers.filter(
      (entry) => seasonStartYear(entry.date) === currentSeason && entry.date <= today,
    )) {
      currentStreak = chantier.registered ? currentStreak + 1 : 0;
      longestStreak = Math.max(longestStreak, currentStreak);
    }
    season.consecutiveChantiers = longestStreak;
    season.domains = domains.size;
    season.quartermaster =
      intendanceRoles.size + (intendanceRoles.size === 3 && intendanceTotal >= 10 ? 1 : 0);

    const lastChantierDate = historicalRegisteredDates.sort().at(-1);
    if (lastChantierDate) {
      const elapsedMs = Date.now() - new Date(`${lastChantierDate}T12:00:00`).getTime();
      season.casperMonths = Math.max(0, Math.floor(elapsedMs / (30.44 * 24 * 60 * 60 * 1000)));
    }

    season.grandSlam = Object.entries(FIRST_UNLOCK).filter(
      ([metric, threshold]) => season[metric as BadgeMetric] >= (threshold ?? Infinity),
    ).length;

    for (const metric of METRICS) {
      season[metric] = Math.round(season[metric] * 10) / 10;
    }

    return { seasonStartYear: currentSeason, season } satisfies MemberBadgeStats;
  });
