import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Baby,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  LogIn,
  LogOut,
  Moon,
  ShoppingCart,
  Sun,
  User,
  Users,
  Utensils,
  ReceiptText,
} from "lucide-react";

import {
  getChantierFiche,
  listChantierExpenses,
  listChantierTasks,
} from "@/lib/chantier.functions";
import {
  listChantierDuties,
  DUTY_ROLE_LABEL,
  DUTY_ROLE_SLOTS,
  DUTY_SLOT_LABEL,
  type DutyRole,
  type DutySlotKey,
} from "@/lib/chantier-duties.functions";
import {
  isChildType,
  type AttendedMeal,
  type MealType,
  type RegistrationPersonType,
} from "@/lib/chantier-registrations.functions";
import { MEAL_PRICE_PER_ADULT } from "@/lib/pricing";
import { getTaskPhase, type ChantierPeriod } from "@/lib/chantier-types";
import type { ChantierTask } from "@/lib/chantier-types";
import { TaskItem, AddTaskButton } from "./task-item";
import { TaskFormSheet } from "./task-form";

interface RegistrationGroup {
  groupId: string;
  members: {
    id: string;
    personName: string;
    personType: RegistrationPersonType;
    registeredBy: string;
    meals: AttendedMeal[];
    mode?: string;
  }[];
}

interface ChantierBriefCardProps {
  chantierId: string;
  startDate: string;
  endDate: string;
  groups: RegistrationGroup[];
  loading: boolean;
  demo?: boolean;
  startPeriod?: ChantierPeriod;
  endPeriod?: ChantierPeriod;
  onDutyVacancyClick?: (target: { role: DutyRole; date?: string; slot?: DutySlotKey }) => void;
}

export function PersonPill({
  name,
  kind = "member",
}: {
  name: string;
  kind?: "member" | "guest" | "child";
}) {
  const style = {
    member: "bg-brand-secondary/10 text-foreground",
    guest: "border border-border bg-card text-foreground",
    child: "bg-secondary text-foreground",
  }[kind];
  return (
    <span
      title={name}
      className={`inline-flex h-6 w-[76px] shrink-0 items-center justify-center rounded-full px-2 text-[10px] font-semibold ${style}`}
    >
      <span className="block min-w-0 truncate">{name}</span>
    </span>
  );
}

function DutyVacancyPill({ onClick }: { onClick?: () => void }) {
  const className =
    "inline-flex h-6 w-[76px] shrink-0 items-center justify-center rounded-full border border-brand-accent/25 bg-brand-accent/15 px-2 text-[10px] font-semibold text-brand-accent transition-colors hover:bg-brand-accent/25";
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={className}>
        + À prendre
      </button>
    );
  return <span className={className}>+ À prendre</span>;
}

function CompactPersonPill({
  name,
  personType,
}: {
  name: string;
  personType: RegistrationPersonType;
}) {
  const style = isChildType(personType)
    ? "bg-secondary text-foreground"
    : personType.startsWith("guest")
      ? "border border-border bg-card text-foreground"
      : "bg-brand-secondary/10 text-foreground";
  return (
    <span
      title={name}
      className={`inline-flex h-[18px] w-[58px] shrink-0 items-center justify-center rounded-full px-1.5 text-[7px] font-semibold ${style}`}
    >
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

type BriefSection = "missions" | "people" | "days" | "duties";

function BriefSectionHeader({
  icon: Icon,
  title,
  summary,
  alert,
  open,
  onClick,
}: {
  icon: typeof Users;
  title: string;
  summary: string;
  alert?: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 py-2.5 text-left"
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${open ? "bg-brand-secondary text-brand-secondary-foreground" : "bg-brand-secondary/10 text-brand-secondary"}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold">{title}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{summary}</span>
      </span>
      {!open && alert && (
        <span className="shrink-0 rounded-full bg-brand-accent/15 px-2 py-1 text-[8px] font-bold text-brand-accent">
          {alert}
        </span>
      )}
      {open ? (
        <ChevronDown className="h-4 w-4 shrink-0 text-brand-secondary" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function enumerateDays(startDate: string, endDate: string) {
  const days: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let day = new Date(start); day < end; day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

interface PresenceSpanModel {
  start: number;
  end: number;
  startLabel?: string;
  endLabel?: string;
}

function PresenceTrack({
  days,
  span,
  compact = false,
}: {
  days: string[];
  span: PresenceSpanModel | null;
  compact?: boolean;
}) {
  return (
    <span className={`relative block border-l border-border/55 ${compact ? "h-7" : "h-9"}`}>
      <span className="absolute inset-y-0 left-5 right-5 sm:left-8 sm:right-8">
        <span
          className="absolute inset-0 grid overflow-hidden"
          style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}
        >
          {days.map((date, index) => (
            <span
              key={date}
              className={`grid grid-cols-2 border-r border-border/55 last:border-r-0 ${index % 2 === 0 ? "bg-secondary/10" : "bg-secondary/30"}`}
            >
              <i className="border-r border-border/25" />
              <i />
            </span>
          ))}
        </span>
        {span && (
          <>
            <span
              className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-brand-secondary/80 ${compact ? "h-px" : "h-1"}`}
              style={{ left: `${span.start}%`, width: `${Math.max(span.end - span.start, 1.5)}%` }}
            />
            <span
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-card bg-brand-secondary ${compact ? "h-1.5 w-1.5 border" : "h-2.5 w-2.5 border-2"}`}
              style={{ left: `${span.start}%` }}
            />
            <span
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-card bg-brand-secondary ${compact ? "h-1.5 w-1.5 border" : "h-2.5 w-2.5 border-2"}`}
              style={{ left: `${span.end}%` }}
            />
            {span.startLabel && (
              <span
                className={`absolute top-1/2 -translate-x-full -translate-y-1/2 whitespace-nowrap pr-1 font-semibold leading-none text-brand-secondary ${compact ? "text-[5.5px]" : "text-[6.5px]"}`}
                style={{ left: `${span.start}%` }}
              >
                {span.startLabel}
              </span>
            )}
            {span.endLabel && (
              <span
                className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1 font-semibold leading-none text-brand-secondary ${compact ? "text-[5.5px]" : "text-[6.5px]"}`}
                style={{ left: `${span.end}%` }}
              >
                {span.endLabel}
              </span>
            )}
          </>
        )}
      </span>
    </span>
  );
}

function formatMonthYear(startDate: string) {
  const label = new Date(`${startDate}T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const PERIOD_LABEL: Record<Exclude<ChantierPeriod, "">, string> = {
  matin: "matin",
  apres_midi: "après-midi",
  soir: "soir",
};

function formatExactDate(date: string) {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatEuro(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

export function ChantierBriefCard({
  chantierId,
  startDate,
  endDate,
  groups,
  loading,
  demo = false,
  startPeriod = "",
  endPeriod = "",
  onDutyVacancyClick,
}: ChantierBriefCardProps) {
  const daysUntilStart = startDate
    ? Math.ceil((new Date(`${startDate}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState("");
  const [openDutyRole, setOpenDutyRole] = useState<DutyRole | null>(null);
  const [activeSection, setActiveSection] = useState<BriefSection | null>(null);
  const [presenceFilter, setPresenceFilter] = useState<"all" | "children">("all");
  const [expandedPresenceGroup, setExpandedPresenceGroup] = useState<string | null>(null);
  const [objectiveOpen, setObjectiveOpen] = useState(false);

  const getFiche = useServerFn(getChantierFiche);
  const listTasks = useServerFn(listChantierTasks);
  const listDuties = useServerFn(listChantierDuties);
  const listExpenses = useServerFn(listChantierExpenses);
  const phase = getTaskPhase(startDate, endDate || startDate);

  const { data: ficheData } = useQuery({
    queryKey: ["chantier-fiche", chantierId, startDate],
    queryFn: () => getFiche({ data: { chantierId, startDate } }),
    enabled: !demo && !!startDate,
  });
  const { data: tasksData } = useQuery({
    queryKey: ["chantier-tasks", chantierId, startDate],
    queryFn: () => listTasks({ data: { chantierId, startDate } }),
    enabled: !demo && !!startDate,
  });
  const { data: dutiesData } = useQuery({
    queryKey: ["chantier-duties", chantierId, startDate],
    queryFn: () => listDuties({ data: { chantierId, startDate } }),
    enabled: !demo && !!startDate,
  });
  const { data: expensesData, isLoading: expensesLoading } = useQuery({
    queryKey: ["chantier-expenses", chantierId, startDate],
    queryFn: () => listExpenses({ data: { chantierId, startDate } }),
    enabled: !demo && !!startDate,
  });

  const people = groups.flatMap((group) => group.members);
  const members = people.filter((person) => person.personType === "member");
  const guests = people.filter((person) => person.personType === "guest_adult");
  const children = people.filter((person) => isChildType(person.personType));
  const taskParticipantNames = Array.from(
    new Set(
      people.filter((person) => !isChildType(person.personType)).map((person) => person.personName),
    ),
  ).sort((a, b) => a.localeCompare(b, "fr"));
  const days = useMemo(
    () => (startDate && endDate ? enumerateDays(startDate, endDate) : []),
    [startDate, endDate],
  );
  const presenceDayBands = useMemo(() => {
    const bands: string[][] = [];
    for (let index = 0; index < days.length; index += 5) bands.push(days.slice(index, index + 5));
    return bands.length ? bands : [[]];
  }, [days]);

  function mealCount(date: string, meal: MealType) {
    let adults = 0;
    let childrenCount = 0;
    for (const person of people) {
      if (!person.meals.some((entry) => entry.date === date && entry.meal === meal)) continue;
      if (isChildType(person.personType)) childrenCount += 1;
      else adults += 1;
    }
    return { adults, children: childrenCount, budget: adults * MEAL_PRICE_PER_ADULT };
  }

  function adultNames(date: string) {
    return people
      .filter(
        (person) =>
          !isChildType(person.personType) && person.meals.some((meal) => meal.date === date),
      )
      .map((person) => person.personName);
  }

  function childrenCount(date: string) {
    return people.filter(
      (person) => isChildType(person.personType) && person.meals.some((meal) => meal.date === date),
    ).length;
  }

  const totalAdults = people.filter(
    (person) => !isChildType(person.personType) && person.meals.length > 0,
  ).length;
  const totalChildren = people.filter(
    (person) => isChildType(person.personType) && person.meals.length > 0,
  ).length;

  function dayMovement(date: string) {
    const index = days.indexOf(date);
    const current = adultNames(date);
    const previous = index > 0 ? adultNames(days[index - 1]) : [];
    const next = index < days.length - 1 ? adultNames(days[index + 1]) : [];
    return {
      adults: current,
      arrivals: current.filter((name) => !previous.includes(name)),
      departures: current.filter((name) => !next.includes(name)),
    };
  }

  function compactNames(names: string[]) {
    if (!names.length) return "Aucun";
    const visible = names.slice(0, 4).join(", ");
    return names.length > 4 ? `${visible} +${names.length - 4}` : visible;
  }

  function presenceWindow(meals: AttendedMeal[]) {
    if (!meals.length) return "Aucun repas sélectionné";
    const ordered = [...meals].sort(
      (a, b) => a.date.localeCompare(b.date) || (a.meal === "dejeuner" ? -1 : 1),
    );
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const shortDate = (date: string) =>
      new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
      });
    const arrival = first.meal === "dejeuner" ? "avant déj." : "avant dîner";
    const departure = last.meal === "diner" ? "après dîner" : "après déj.";
    return first.date === last.date
      ? `${shortDate(first.date)} · ${arrival} → ${departure}`
      : `${shortDate(first.date)} ${arrival} → ${shortDate(last.date)} ${departure}`;
  }

  function presenceSpan(meals: AttendedMeal[], visibleDays = days) {
    if (!meals.length || !visibleDays.length) return null;
    const ordered = [...meals].sort(
      (a, b) => a.date.localeCompare(b.date) || (a.meal === "dejeuner" ? -1 : 1),
    );
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const visibleStart = visibleDays[0];
    const visibleEnd = visibleDays[visibleDays.length - 1];
    if (last.date < visibleStart || first.date > visibleEnd) return null;
    const startsBefore = first.date < visibleStart;
    const endsAfter = last.date > visibleEnd;
    const firstDay = startsBefore ? 0 : Math.max(0, visibleDays.indexOf(first.date));
    const lastDay = endsAfter
      ? visibleDays.length - 1
      : Math.max(firstDay, visibleDays.indexOf(last.date));
    const totalSlots = visibleDays.length * 2;
    const startPoint = startsBefore ? 0 : firstDay * 2 + (first.meal === "dejeuner" ? 0.25 : 1);
    const endPoint = endsAfter ? totalSlots : lastDay * 2 + (last.meal === "diner" ? 1.75 : 1);
    return {
      start: (startPoint / totalSlots) * 100,
      end: (endPoint / totalSlots) * 100,
      startLabel: startsBefore
        ? undefined
        : first.meal === "dejeuner"
          ? "Avant déj."
          : "Après déj.",
      endLabel: endsAfter ? undefined : last.meal === "diner" ? "Après dîner" : "Après déj.",
    };
  }

  const totalBudget = days.reduce(
    (total, date) => total + mealCount(date, "dejeuner").budget + mealCount(date, "diner").budget,
    0,
  );
  const totalAdultMeals = days.reduce(
    (total, date) => total + mealCount(date, "dejeuner").adults + mealCount(date, "diner").adults,
    0,
  );
  const expensesTotal = demo ? Math.round(totalBudget * 0.72) : (expensesData?.total ?? 0);
  const expensesCount = demo ? 6 : (expensesData?.expenses.length ?? 0);
  const budgetDifference = totalBudget - expensesTotal;
  // Le scénario démo sert volontairement de stress-test « aucune intendance
  // prise » : on vérifie ainsi l'alerte, la jauge à 0 % et tous les appels à
  // contribution sans toucher aux données réelles.
  const duties = demo ? [] : (dutiesData?.duties ?? []);
  const tasks: ChantierTask[] = demo
    ? [
        { id: "demo-task-1", label: "Finir les cloisons de la chambre nord", done: false },
        { id: "demo-task-2", label: "Préparer et peindre le salon", done: false },
        { id: "demo-task-3", label: "Reprendre l'évacuation de la cuisine", done: false },
        { id: "demo-task-4", label: "Ranger le bois et nettoyer la cour", done: false },
        { id: "demo-task-5", label: "Poser les plinthes du couloir", done: false },
        { id: "demo-task-6", label: "Réparer les deux volets côté jardin", done: false },
        { id: "demo-task-7", label: "Trier le matériel dans l'atelier", done: true },
        { id: "demo-task-8", label: "Installer les nouvelles étagères", done: false },
        { id: "demo-task-9", label: "Préparer le mur de la salle commune", done: false },
        { id: "demo-task-10", label: "Débroussailler autour du verger", done: false },
        { id: "demo-task-11", label: "Faire l'inventaire des outils", done: true },
        { id: "demo-task-12", label: "Évacuer les gravats à la déchetterie", done: false },
      ].map((task) => ({
        ...task,
        note: "",
        participants: "",
        completedAt: "",
        resultPhotoUrl: "",
        durationMinutes: 0,
        peopleCount: 0,
        urgency: "" as const,
      }))
    : (tasksData?.tasks ?? []);
  const applicableDutyRoles = [
    "courses",
    "cuisine",
    ...(children.length ? ["garde"] : []),
  ] as DutyRole[];
  const expectedDutySlots =
    days.length *
    applicableDutyRoles.reduce((total, role) => total + DUTY_ROLE_SLOTS[role].length, 0);
  const coveredDutySlots = new Set(
    duties
      .filter((duty) => applicableDutyRoles.includes(duty.role) && duty.personName)
      .map((duty) => `${duty.role}-${duty.date}-${duty.slot}`),
  ).size;
  const missingDutySlots = Math.max(0, expectedDutySlots - coveredDutySlots);
  const dutyCoverage =
    expectedDutySlots > 0 ? Math.round((coveredDutySlots / expectedDutySlots) * 100) : 0;

  function roleStatus(role: DutyRole) {
    const names = Array.from(
      new Set(
        duties
          .filter((duty) => duty.role === role)
          .map((duty) => duty.personName)
          .filter(Boolean),
      ),
    );
    const expected = days.length * DUTY_ROLE_SLOTS[role].length;
    const covered = duties.filter((duty) => duty.role === role).length;
    return { names, complete: expected > 0 && covered >= expected };
  }

  const roleIcons: Record<DutyRole, typeof ShoppingCart> = {
    courses: ShoppingCart,
    cuisine: ChefHat,
    garde: Baby,
  };
  const description = demo
    ? "Objectif principal : terminer la chambre nord et préparer le salon. Plusieurs équipes avanceront aussi sur la cuisine, les volets, l'atelier et les extérieurs selon la météo et les compétences disponibles."
    : ficheData?.description ||
      "Les missions principales seront précisées prochainement par l'équipe d'organisation.";
  const cleanDescription = description.replace(/^Objectif principal\s*:\s*/i, "");
  const firstSentenceEnd = cleanDescription.indexOf(". ");
  const mainObjective =
    firstSentenceEnd >= 0 ? cleanDescription.slice(0, firstSentenceEnd + 1) : cleanDescription;
  const displayedObjective = mainObjective.charAt(0).toUpperCase() + mainObjective.slice(1);
  const objectiveDetails =
    firstSentenceEnd >= 0 ? cleanDescription.slice(firstSentenceEnd + 2) : "";

  function openParticipants() {
    setActiveSection("people");
    window.setTimeout(() => {
      document
        .getElementById("chantier-participants")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function vacancyAction(target: { role: DutyRole; date?: string; slot?: DutySlotKey }) {
    return onDutyVacancyClick ? () => onDutyVacancyClick(target) : undefined;
  }

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-brand-secondary/20 bg-card shadow-card">
      <div className="bg-brand-secondary/5 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-secondary">
          {daysUntilStart >= 0 && daysUntilStart <= 7 ? "Briefing chantier" : "Fiche chantier"}
        </div>
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
          <h1 className="min-w-0 text-[22px] font-black leading-[1.1] sm:text-[24px]">
            {formatMonthYear(startDate)}
          </h1>
          {daysUntilStart > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-accent/10 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.08em] text-brand-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
              Prévision à date
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] font-semibold text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-brand-secondary" />
          <span className="text-foreground">{formatExactDate(startDate)}</span>
          {startPeriod && (
            <span className="inline-flex items-center gap-0.5 text-brand-secondary">
              {startPeriod === "soir" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              {PERIOD_LABEL[startPeriod]}
            </span>
          )}
          <ChevronRight className="h-3 w-3 shrink-0 text-brand-secondary" />
          <span className="text-foreground">{formatExactDate(endDate)}</span>
          {endPeriod && (
            <span className="inline-flex items-center gap-0.5 text-brand-secondary">
              {endPeriod === "soir" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              {PERIOD_LABEL[endPeriod]}
            </span>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-brand-secondary/15 bg-card/75 p-3">
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-brand-secondary">
              Objectif principal
            </div>
            <p className="mt-1 text-[17px] font-extrabold leading-[1.22] tracking-[-0.015em] text-foreground">
              {displayedObjective}
            </p>
            {objectiveDetails && (
              <>
                <p
                  className={`mt-1 text-[10px] leading-4 text-muted-foreground ${objectiveOpen ? "" : "line-clamp-2"}`}
                >
                  {objectiveDetails}
                </p>
                {objectiveDetails.length > 100 && (
                  <button
                    type="button"
                    onClick={() => setObjectiveOpen((value) => !value)}
                    className="mt-1 text-[8px] font-bold text-brand-secondary"
                  >
                    {objectiveOpen ? "Réduire" : "Lire la suite"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex min-h-[142px] flex-col rounded-2xl border border-brand-secondary/10 bg-card/90 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-secondary/10 text-brand-secondary">
                <Users className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">Participants</span>
            </div>
            {loading ? (
              <div
                className="mt-3 space-y-2 animate-pulse"
                aria-label="Chargement des participants"
              >
                <span className="block h-6 w-16 rounded-md bg-secondary" />
                <span className="block h-3 w-28 rounded bg-secondary/80" />
              </div>
            ) : (
              <>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-[24px] font-black leading-none">{people.length}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">personnes</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-2.5 w-2.5 text-brand-secondary" />
                    {members.length + guests.length} adultes
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Baby className="h-2.5 w-2.5 text-brand-accent" />
                    {children.length} enfants
                  </span>
                </div>
              </>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={openParticipants}
              className="mt-auto flex items-center gap-1 pt-2 text-[9px] font-bold text-brand-secondary disabled:opacity-30"
            >
              Voir le détail <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="flex min-h-[142px] flex-col rounded-2xl border border-brand-secondary/10 bg-card/90 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-accent/15 text-brand-accent">
                <Utensils className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                Budget &amp; dépenses
              </span>
            </div>
            {loading || expensesLoading ? (
              <div
                className="mt-3 space-y-2 animate-pulse"
                aria-label="Chargement du budget chantier"
              >
                <span className="block h-6 w-24 rounded-md bg-secondary" />
                <span className="block h-3 w-28 rounded bg-secondary/80" />
              </div>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[7px] font-bold uppercase tracking-wide text-muted-foreground">
                      Prévu
                    </div>
                    <div className="mt-0.5 text-[16px] font-black leading-none tabular-nums">
                      {formatEuro(totalBudget)}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wide text-muted-foreground">
                      <ReceiptText className="h-2.5 w-2.5" />
                      Engagé
                    </div>
                    <div className="mt-0.5 text-[16px] font-black leading-none tabular-nums">
                      {formatEuro(expensesTotal)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[8px] text-muted-foreground">
                  {expensesCount} facture{expensesCount > 1 ? "s" : ""} ·{" "}
                  {budgetDifference >= 0
                    ? `${formatEuro(budgetDifference)} disponibles`
                    : `${formatEuro(Math.abs(budgetDifference))} au-dessus`}
                </div>
              </>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => setActiveSection("days")}
              className="mt-auto flex items-center gap-1 pt-2 text-[9px] font-bold text-brand-secondary disabled:opacity-30"
            >
              {totalAdultMeals} repas prévus <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-border p-4">
        <section className="rounded-xl border border-border bg-card px-3">
          <BriefSectionHeader
            icon={ClipboardList}
            title="Missions à cocher"
            summary={`${tasks.length} mission${tasks.length > 1 ? "s" : ""} · ${tasks.filter((task) => task.done).length} terminée${tasks.filter((task) => task.done).length > 1 ? "s" : ""}`}
            alert={tasks.length === 0 ? "À compléter" : undefined}
            open={activeSection === "missions"}
            onClick={() =>
              setActiveSection((current) => (current === "missions" ? null : "missions"))
            }
          />
          {activeSection === "missions" && (
            <div className="border-t border-border/60 pb-3 pt-2.5">
              {tasks.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Aucune mission détaillée pour l'instant.
                </p>
              ) : (
                <div className="mt-2 divide-y divide-border/60">
                  {(missionsOpen ? tasks : tasks.slice(0, 3)).map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      chantierId={chantierId}
                      startDate={startDate}
                      phase={phase}
                      participantNames={taskParticipantNames}
                      preview={demo}
                    />
                  ))}
                </div>
              )}
              {tasks.length > 3 && (
                <button
                  type="button"
                  onClick={() => setMissionsOpen((v) => !v)}
                  className="mt-2 text-[12px] font-semibold text-brand-secondary"
                >
                  {missionsOpen
                    ? "Réduire"
                    : `+ ${tasks.length - 3} autre${tasks.length - 3 > 1 ? "s" : ""} mission${tasks.length - 3 > 1 ? "s" : ""}`}
                </button>
              )}
              <AddTaskButton onClick={() => setFormOpen(true)} label="Nouvelle tâche" />
              <TaskFormSheet
                open={formOpen}
                onOpenChange={setFormOpen}
                title="Nouvelle tâche"
                chantierId={chantierId}
                startDate={startDate}
                mode="user"
                preview={demo}
              />
            </div>
          )}
        </section>

        <section
          id="chantier-participants"
          className="scroll-mt-3 rounded-xl border border-border bg-card px-3"
        >
          <BriefSectionHeader
            icon={Users}
            title="Participants"
            summary={
              loading
                ? "Chargement des inscrits…"
                : `${people.length} personnes · ${members.length + guests.length} adultes · ${children.length} enfants`
            }
            open={activeSection === "people"}
            onClick={() =>
              !loading && setActiveSection((current) => (current === "people" ? null : "people"))
            }
          />
          {activeSection === "people" && (
            <div className="border-t border-border/60 pb-3 pt-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex rounded-lg bg-secondary/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPresenceFilter("all")}
                    className={`rounded-md px-2.5 py-1 text-[9px] font-semibold ${presenceFilter === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    Tous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresenceFilter("children")}
                    className={`rounded-md px-2.5 py-1 text-[9px] font-semibold ${presenceFilter === "children" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    Enfants · {children.length}
                  </button>
                </div>
                <span className="text-[9px] text-muted-foreground">Arrivée → départ</span>
              </div>
              <div className="mt-2 space-y-2">
                {presenceDayBands.map((visibleDays, bandIndex) => (
                  <div
                    key={visibleDays[0] || bandIndex}
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    <div
                      className="grid items-stretch bg-secondary/25"
                      style={{ gridTemplateColumns: `clamp(96px, 32vw, 132px) minmax(0, 1fr)` }}
                    >
                      <span className="flex items-center px-2 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                        {presenceFilter === "children" ? "Enfants" : "Inscrits"}
                      </span>
                      <span className="relative h-9 border-l border-border/70">
                        <span
                          className="absolute inset-y-0 left-5 right-5 grid sm:left-8 sm:right-8"
                          style={{
                            gridTemplateColumns: `repeat(${Math.max(visibleDays.length, 1)}, minmax(0, 1fr))`,
                          }}
                        >
                          {visibleDays.map((date, dayIndex) => {
                            const parsed = new Date(`${date}T00:00:00`);
                            return (
                              <span
                                key={date}
                                className={`border-r border-border/70 py-1 text-center text-[8px] font-bold uppercase text-muted-foreground last:border-r-0 ${dayIndex % 2 === 0 ? "bg-card/65" : "bg-secondary/40"}`}
                              >
                                {parsed.toLocaleDateString("fr-FR", { weekday: "short" })}
                                <span className="block text-[10px] text-foreground">
                                  {parsed.getDate()}
                                </span>
                              </span>
                            );
                          })}
                        </span>
                      </span>
                    </div>
                    <div className="divide-y divide-border/60">
                      {presenceFilter === "children"
                        ? children.map((child) => (
                            <div
                              key={child.id}
                              className="grid min-h-9 items-stretch bg-card"
                              style={{
                                gridTemplateColumns: `clamp(96px, 32vw, 132px) minmax(0, 1fr)`,
                              }}
                              title={`${child.personName} — ${presenceWindow(child.meals)}`}
                            >
                              <span className="flex items-center bg-card px-2">
                                <CompactPersonPill
                                  name={child.personName}
                                  personType={child.personType}
                                />
                              </span>
                              <PresenceTrack
                                days={visibleDays}
                                span={presenceSpan(child.meals, visibleDays)}
                              />
                            </div>
                          ))
                        : groups.map((group) => {
                            const relevantMembers = group.members;
                            const registrant =
                              group.members[0]?.registeredBy ||
                              group.members[0]?.personName ||
                              "Groupe";
                            const bookingMember =
                              group.members.find(
                                (member) =>
                                  member.personName.trim().toLocaleLowerCase("fr-FR") ===
                                  registrant.trim().toLocaleLowerCase("fr-FR"),
                              ) || group.members[0];
                            const rowKey = `${group.groupId}-${bandIndex}`;
                            const expanded = expandedPresenceGroup === rowKey;
                            return (
                              <div key={group.groupId} className="bg-card">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedPresenceGroup((current) =>
                                      current === rowKey ? null : rowKey,
                                    )
                                  }
                                  className="grid min-h-9 w-full items-stretch text-left"
                                  style={{
                                    gridTemplateColumns: `clamp(96px, 32vw, 132px) minmax(0, 1fr)`,
                                  }}
                                >
                                  <span className="flex min-w-0 items-center gap-1 bg-card px-2 py-1.5">
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-1">
                                        <CompactPersonPill
                                          name={registrant}
                                          personType={bookingMember.personType}
                                        />
                                        {group.members.length > 1 && (
                                          <span className="shrink-0 text-[7px] font-semibold text-muted-foreground">
                                            +{group.members.length - 1}
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                    <ChevronDown
                                      className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                                    />
                                  </span>
                                  <PresenceTrack
                                    days={visibleDays}
                                    span={presenceSpan(bookingMember.meals, visibleDays)}
                                  />
                                </button>
                                {expanded && (
                                  <div className="border-t border-border/45 bg-secondary/15 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className="shrink-0 text-[7px] font-semibold text-muted-foreground">
                                        Participants
                                      </span>
                                      <div className="flex min-w-0 flex-wrap gap-1.5">
                                        {relevantMembers.map((member) => (
                                          <CompactPersonPill
                                            key={member.id}
                                            name={member.personName}
                                            personType={member.personType}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[8px] text-muted-foreground">
                {presenceFilter === "children"
                  ? "Une ligne par enfant"
                  : "Une ligne par inscription"}{" "}
                · horaires estimés d’après les repas sélectionnés.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card px-3">
          <BriefSectionHeader
            icon={CalendarDays}
            title="Le chantier jour par jour"
            summary={
              loading
                ? "Chargement des présences…"
                : `${days.length} jours · ${totalAdults} adultes · ${totalChildren} enfants · ${formatEuro(totalBudget)}`
            }
            alert={
              !loading && people.length > 0 && totalBudget === 0 ? "Budget à compléter" : undefined
            }
            open={activeSection === "days"}
            onClick={() =>
              !loading && setActiveSection((current) => (current === "days" ? null : "days"))
            }
          />
          {activeSection === "days" && (
            <div className="border-t border-border/60 pb-3 pt-2.5">
              <div className="space-y-1.5">
                {days.map((date) => {
                  const movement = dayMovement(date);
                  const children = childrenCount(date);
                  const active = selectedDay === date;
                  const parsed = new Date(`${date}T00:00:00`);
                  const lunch = mealCount(date, "dejeuner");
                  const dinner = mealCount(date, "diner");
                  const courseDuty = duties.find(
                    (duty) => duty.role === "courses" && duty.date === date,
                  );
                  const kitchenLunch = duties.find(
                    (duty) =>
                      duty.role === "cuisine" && duty.date === date && duty.slot === "matin",
                  );
                  const kitchenDinner = duties.find(
                    (duty) =>
                      duty.role === "cuisine" && duty.date === date && duty.slot === "apres_midi",
                  );
                  const childcareMorning = duties.find(
                    (duty) => duty.role === "garde" && duty.date === date && duty.slot === "matin",
                  );
                  const childcareAfternoon = duties.find(
                    (duty) =>
                      duty.role === "garde" && duty.date === date && duty.slot === "apres_midi",
                  );
                  return (
                    <div
                      key={date}
                      className={`overflow-hidden rounded-xl border transition-colors ${active ? "border-brand-secondary/50 bg-brand-secondary/5" : "border-border bg-card"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDay((current) => (current === date ? "" : date))}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left active:scale-[0.99]"
                      >
                        <div className="w-12 shrink-0">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            {parsed.toLocaleDateString("fr-FR", { weekday: "short" })}
                          </div>
                          <div className="text-[14px] font-black">
                            {parsed.getDate()}{" "}
                            <span className="text-[9px] font-semibold text-muted-foreground">
                              {parsed.toLocaleDateString("fr-FR", { month: "short" })}
                            </span>
                          </div>
                        </div>
                        <div className="grid min-w-0 flex-1 grid-cols-3 divide-x divide-border/70 rounded-lg bg-secondary/35 py-1.5 text-center">
                          <div className="flex flex-col items-center px-1">
                            <User className="mb-0.5 h-3 w-3 text-brand-secondary" />
                            <span className="text-[15px] font-black leading-none text-brand-secondary">
                              {movement.adults.length}
                            </span>
                            <span className="mt-0.5 text-[8px] font-medium text-muted-foreground">
                              adultes
                            </span>
                          </div>
                          <div className="flex flex-col items-center px-1">
                            <Baby className="mb-0.5 h-3 w-3 text-muted-foreground" />
                            <span className="text-[15px] font-black leading-none">{children}</span>
                            <span className="mt-0.5 text-[8px] font-medium text-muted-foreground">
                              enfants
                            </span>
                          </div>
                          <div className="flex flex-col items-center px-1">
                            <Users className="mb-0.5 h-3 w-3 text-muted-foreground" />
                            <span className="text-[15px] font-black leading-none">
                              {movement.adults.length + children}
                            </span>
                            <span className="mt-0.5 text-[8px] font-semibold text-muted-foreground">
                              total
                            </span>
                          </div>
                        </div>
                        {active ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-brand-secondary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                      {active && (
                        <div className="border-t border-border/70 px-3 pb-3 pt-2.5">
                          <div className="grid grid-cols-2 gap-2 text-[10px] leading-4">
                            <div>
                              <span className="flex items-center gap-1 font-bold text-success-foreground">
                                <LogIn className="h-3 w-3" /> {movement.arrivals.length} arrivent
                              </span>
                              <div
                                className="truncate text-muted-foreground"
                                title={movement.arrivals.join(", ")}
                              >
                                {compactNames(movement.arrivals)}
                              </div>
                            </div>
                            <div>
                              <span className="flex items-center gap-1 font-bold text-brand-accent">
                                <LogOut className="h-3 w-3" /> {movement.departures.length}{" "}
                                repartent
                              </span>
                              <div
                                className="truncate text-muted-foreground"
                                title={movement.departures.join(", ")}
                              >
                                {compactNames(movement.departures)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2 rounded-lg bg-secondary/35 px-2.5 py-1.5">
                            <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="flex-1 text-[10px] font-semibold">
                              Courses · ce jour
                            </span>
                            {courseDuty ? (
                              <PersonPill name={courseDuty.personName} />
                            ) : (
                              <DutyVacancyPill
                                onClick={vacancyAction({ role: "courses", date, slot: "matin" })}
                              />
                            )}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {(
                              [
                                ["Déjeuner", lunch],
                                ["Dîner", dinner],
                              ] as const
                            ).map(([label, meal]) => (
                              <div
                                key={label}
                                className="rounded-lg bg-card px-2.5 py-2 shadow-sm ring-1 ring-border/60"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1 text-[11px] font-bold">
                                    {label === "Déjeuner" ? (
                                      <Sun className="h-3 w-3 text-brand-accent" />
                                    ) : (
                                      <Moon className="h-3 w-3 text-brand-secondary" />
                                    )}
                                    {label}
                                  </span>
                                  <span className="text-[11px] font-black text-brand-secondary">
                                    {formatEuro(meal.budget)}
                                  </span>
                                </div>
                                <div className="mt-1 text-[13px] font-black">
                                  {meal.adults + meal.children}{" "}
                                  <span className="text-[9px] font-medium text-muted-foreground">
                                    personnes
                                  </span>
                                </div>
                                <div className="text-[9px] text-muted-foreground">
                                  {meal.adults} adultes · {meal.children} enfants
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-1 border-t border-border/60 pt-1.5">
                                  <span className="flex items-center gap-1 text-[8px] font-semibold text-muted-foreground">
                                    <ChefHat className="h-2.5 w-2.5" /> Cuisine
                                  </span>
                                  {label === "Déjeuner" ? (
                                    kitchenLunch ? (
                                      <PersonPill name={kitchenLunch.personName} />
                                    ) : (
                                      <DutyVacancyPill
                                        onClick={vacancyAction({
                                          role: "cuisine",
                                          date,
                                          slot: "matin",
                                        })}
                                      />
                                    )
                                  ) : kitchenDinner ? (
                                    <PersonPill name={kitchenDinner.personName} />
                                  ) : (
                                    <DutyVacancyPill
                                      onClick={vacancyAction({
                                        role: "cuisine",
                                        date,
                                        slot: "apres_midi",
                                      })}
                                    />
                                  )}
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-1">
                                  <span className="flex items-center gap-1 text-[8px] font-semibold text-muted-foreground">
                                    <Baby className="h-2.5 w-2.5" /> Garde{" "}
                                    {label === "Déjeuner" ? "matin" : "après-midi"}
                                  </span>
                                  {label === "Déjeuner" ? (
                                    childcareMorning ? (
                                      <PersonPill name={childcareMorning.personName} />
                                    ) : (
                                      <DutyVacancyPill
                                        onClick={vacancyAction({
                                          role: "garde",
                                          date,
                                          slot: "matin",
                                        })}
                                      />
                                    )
                                  ) : childcareAfternoon ? (
                                    <PersonPill name={childcareAfternoon.personName} />
                                  ) : (
                                    <DutyVacancyPill
                                      onClick={vacancyAction({
                                        role: "garde",
                                        date,
                                        slot: "apres_midi",
                                      })}
                                    />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card px-3">
          <BriefSectionHeader
            icon={ChefHat}
            title="Intendance"
            summary={`${coveredDutySlots}/${expectedDutySlots} créneaux couverts`}
            alert={missingDutySlots > 0 ? `${missingDutySlots} à prendre` : undefined}
            open={activeSection === "duties"}
            onClick={() => setActiveSection((current) => (current === "duties" ? null : "duties"))}
          />
          {activeSection === "duties" && (
            <div className="divide-y divide-border border-t border-border/60 pb-2 pt-1">
              <div className="py-2">
                <div className="flex items-center justify-between text-[9px] font-semibold">
                  <span className="text-muted-foreground">Couverture de l’intendance</span>
                  <span className="text-brand-secondary">{dutyCoverage}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-brand-secondary transition-[width]"
                    style={{ width: `${dutyCoverage}%` }}
                  />
                </div>
              </div>
              {applicableDutyRoles.map((role) => {
                const Icon = roleIcons[role];
                const status = roleStatus(role);
                return (
                  <div key={role}>
                    <button
                      type="button"
                      onClick={() => setOpenDutyRole((current) => (current === role ? null : role))}
                      className="flex w-full items-center gap-3 py-2 text-left"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-[13px] font-semibold">
                        {DUTY_ROLE_LABEL[role]}
                      </span>
                      {status.names.length ? (
                        <div className="flex max-w-[55%] items-center justify-end gap-1">
                          {status.names.slice(0, 2).map((name) => (
                            <PersonPill key={name} name={name} />
                          ))}
                          {status.names.length > 2 && (
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              +{status.names.length - 2}
                            </span>
                          )}
                          {openDutyRole === role ? (
                            <ChevronDown className="ml-0.5 h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                          )}
                        </div>
                      ) : (
                        <DutyVacancyPill />
                      )}
                    </button>
                    {openDutyRole === role && (
                      <div className="mb-2 rounded-xl bg-secondary/35 px-3 py-2">
                        {role === "cuisine" || role === "garde" ? (
                          <div>
                            <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border/70 pb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              <span>Jour</span>
                              <span className="w-[82px] text-center">
                                {role === "cuisine" ? "Déjeuner" : "Matin"}
                              </span>
                              <span className="w-[82px] text-center">
                                {role === "cuisine" ? "Dîner" : "Après-midi"}
                              </span>
                            </div>
                            <div className="divide-y divide-border/60">
                              {days.map((date) => {
                                const lunch = duties.find(
                                  (duty) =>
                                    duty.role === role &&
                                    duty.date === date &&
                                    duty.slot === "matin",
                                );
                                const dinner = duties.find(
                                  (duty) =>
                                    duty.role === role &&
                                    duty.date === date &&
                                    duty.slot === "apres_midi",
                                );
                                const day = new Date(`${date}T00:00:00`);
                                return (
                                  <div
                                    key={date}
                                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5"
                                  >
                                    <span className="min-w-0 truncate text-[10px] font-semibold capitalize text-muted-foreground">
                                      {day.toLocaleDateString("fr-FR", {
                                        weekday: "short",
                                        day: "numeric",
                                      })}
                                    </span>
                                    <div className="flex w-[82px] justify-center">
                                      {lunch ? (
                                        <PersonPill name={lunch.personName} />
                                      ) : (
                                        <DutyVacancyPill
                                          onClick={vacancyAction({ role, date, slot: "matin" })}
                                        />
                                      )}
                                    </div>
                                    <div className="flex w-[82px] justify-center">
                                      {dinner ? (
                                        <PersonPill name={dinner.personName} />
                                      ) : (
                                        <DutyVacancyPill
                                          onClick={vacancyAction({
                                            role,
                                            date,
                                            slot: "apres_midi",
                                          })}
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          days.map((date) => {
                            const duty = duties.find(
                              (entry) =>
                                entry.role === role &&
                                entry.date === date &&
                                entry.slot === "matin",
                            );
                            return (
                              <div
                                key={date}
                                className="flex items-center gap-2 border-b border-border/60 py-1.5 last:border-0"
                              >
                                <span className="min-w-0 flex-1 truncate text-[10px] capitalize text-muted-foreground">
                                  {formatDay(date)} · journée
                                </span>
                                {duty ? (
                                  <PersonPill name={duty.personName} />
                                ) : (
                                  <DutyVacancyPill
                                    onClick={vacancyAction({ role, date, slot: "matin" })}
                                  />
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
