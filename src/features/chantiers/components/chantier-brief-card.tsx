import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Pencil,
  ShoppingCart,
  Sun,
  User,
  Users,
  Utensils,
  ReceiptText,
  Wallet,
} from "lucide-react";

import {
  getChantierFiche,
  listChantierExpenses,
  listChantierTasks,
  updateChantierFiche,
} from "@/lib/chantier.functions";
import { listTaskCatalog } from "@/lib/chantier-contributions.functions";
import {
  listChantierDuties,
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
import { getTaskPhase, chantierDisplayName, type ChantierPeriod } from "@/lib/chantier-types";
import type { ChantierTask } from "@/lib/chantier-types";
import { TaskItem, AddTaskButton } from "./task-item";
import { TaskFormSheet } from "./task-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
  openDaysSection?: number;
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
      className={`inline-flex h-6 w-[76px] min-w-0 items-center justify-center rounded-full px-2 text-[10px] font-semibold ${style}`}
    >
      <span className="block min-w-0 truncate">{name}</span>
    </span>
  );
}

function DutyVacancyPill({ onClick }: { onClick?: () => void }) {
  const className =
    "inline-flex h-6 w-[76px] min-w-0 items-center justify-center whitespace-nowrap rounded-full border border-brand-accent/25 bg-brand-accent/15 px-2 text-[9px] font-semibold text-brand-accent transition-colors hover:bg-brand-accent/25";
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

type BriefSection = "missions" | "people" | "days";

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

function formatShortDate(date: string) {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  const label = d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function computeArrival(meals: AttendedMeal[]): string | null {
  if (!meals.length) return null;
  const sorted = [...meals].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.meal === "dejeuner" ? -1 : 1),
  );
  const first = sorted[0];
  const day = new Date(`${first.date}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const when = first.meal === "dejeuner" ? "avant déjeuner" : "avant dîner";
  return `${capitalize(day)}, ${when}`;
}

function computeDeparture(meals: AttendedMeal[]): string | null {
  if (!meals.length) return null;
  const sorted = [...meals].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.meal === "dejeuner" ? -1 : 1),
  );
  const last = sorted[sorted.length - 1];
  const day = new Date(`${last.date}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const when = last.meal === "diner" ? "après dîner" : "après déjeuner";
  return `${capitalize(day)}, ${when}`;
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
  openDaysSection = 0,
}: ChantierBriefCardProps) {
  const queryClient = useQueryClient();
  const daysUntilStart = startDate
    ? Math.ceil((new Date(`${startDate}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitialLabel, setFormInitialLabel] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [activeSection, setActiveSection] = useState<BriefSection | null>(null);
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  useEffect(() => {
    if (openDaysSection > 0) setActiveSection("days");
  }, [openDaysSection]);

  type PersonWithFamily = RegistrationGroup["members"][0] & {
    family: RegistrationGroup["members"];
  };
  const [selectedPerson, setSelectedPerson] = useState<PersonWithFamily | null>(null);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [ficheEditOpen, setFicheEditOpen] = useState(false);
  const [ficheEditText, setFicheEditText] = useState("");
  const [ficheEditPassword, setFicheEditPassword] = useState("");
  const [ficheEditSaving, setFicheEditSaving] = useState(false);
  const [ficheEditError, setFicheEditError] = useState("");

  const enrichedPeople = useMemo(
    () =>
      groups.flatMap((group) =>
        group.members.map((member) => ({
          ...member,
          family: group.members.filter((m) => m.id !== member.id),
        })),
      ),
    [groups],
  );

  const getFiche = useServerFn(getChantierFiche);
  const saveFiche = useServerFn(updateChantierFiche);
  const listTasks = useServerFn(listChantierTasks);
  const getCatalog = useServerFn(listTaskCatalog);
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
  const { data: catalogData } = useQuery({
    queryKey: ["task-catalog"],
    queryFn: () => getCatalog(),
    enabled: catalogOpen,
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
        taskStatus: (task.done ? "Terminé" : "À faire") as "À faire" | "En cours" | "Terminé",
        percentage: 0,
        description: "",
        note: "",
        toBuyItems: [] as string[],
        photoBeforeUrl: "",
        participants: "",
        completedAt: "",
        resultPhotoUrl: "",
        durationMinutes: 0,
        peopleCount: 0,
        urgency: "" as const,
      }))
    : (tasksData?.tasks ?? []);
  const missingDutySlots = (() => {
    const roles = ["courses", "cuisine", ...(children.length > 0 ? ["garde"] : [])];
    let count = 0;
    for (const date of days) {
      for (const role of roles) {
        for (const slot of ["matin", "apres_midi"]) {
          if (!duties.some((d) => d.role === role && d.date === date && d.slot === slot && d.personName)) count++;
        }
      }
    }
    return count;
  })();
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
            {chantierDisplayName(startDate, endDate)}
          </h1>
          {daysUntilStart > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-accent/10 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.08em] text-brand-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
              Prévision à date
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5 text-[10px]">
            <LogIn className="h-3.5 w-3.5 shrink-0 text-success-foreground" />
            <span className="font-bold text-muted-foreground">Arrivée</span>
            <span className="font-semibold text-foreground">{formatShortDate(startDate)}</span>
            {startPeriod && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-brand-secondary">
                {startPeriod === "soir" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                <span>{PERIOD_LABEL[startPeriod]}</span>
              </span>
            )}
          </div>
          {formatShortDate(endDate) && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <LogOut className="h-3.5 w-3.5 shrink-0 text-brand-accent" />
              <span className="font-bold text-muted-foreground">Départ</span>
              <span className="font-semibold text-foreground">{formatShortDate(endDate)}</span>
              {endPeriod && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-brand-secondary">
                  {endPeriod === "soir" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                  <span>{PERIOD_LABEL[endPeriod]}</span>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-brand-secondary/15 bg-card/75 p-3">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-brand-secondary">
                Objectif principal
              </div>
              {!demo && (
                <button
                  type="button"
                  onClick={() => { setFicheEditText(description); setFicheEditPassword(""); setFicheEditError(""); setFicheEditOpen(true); }}
                  className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition hover:bg-brand-secondary/10 hover:text-brand-secondary"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
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

        <Sheet open={ficheEditOpen} onOpenChange={setFicheEditOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl px-5 pb-10 pt-6">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-left text-[17px] font-bold">Objectif principal</SheetTitle>
            </SheetHeader>
            <div className="space-y-3">
              <textarea
                value={ficheEditText}
                onChange={(e) => setFicheEditText(e.target.value)}
                placeholder="Décris l'objectif principal du chantier. La première phrase sera affichée en titre, le reste en détail."
                rows={6}
                className="w-full resize-none rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-[13px] leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
              />
              <p className="text-[9px] text-muted-foreground">
                La première phrase (jusqu'au premier point) sera affichée en titre. Le reste apparaîtra dans "Lire la suite".
              </p>
              <input
                type="password"
                value={ficheEditPassword}
                onChange={(e) => { setFicheEditPassword(e.target.value); setFicheEditError(""); }}
                placeholder="Mot de passe admin"
                className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
              />
              {ficheEditError && (
                <p className="text-[11px] font-semibold text-destructive">{ficheEditError}</p>
              )}
              <button
                type="button"
                disabled={ficheEditSaving || !ficheEditText.trim() || !ficheEditPassword}
                onClick={async () => {
                  setFicheEditSaving(true);
                  setFicheEditError("");
                  try {
                    await saveFiche({ data: { chantierId, startDate, description: ficheEditText.trim(), password: ficheEditPassword } });
                    void queryClient.invalidateQueries({ queryKey: ["chantier-fiche", chantierId, startDate] });
                    setFicheEditOpen(false);
                  } catch (err) {
                    setFicheEditError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.");
                  } finally {
                    setFicheEditSaving(false);
                  }
                }}
                className="tap w-full rounded-xl bg-brand-secondary py-3 text-[13px] font-bold text-brand-secondary-foreground disabled:opacity-40"
              >
                {ficheEditSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </SheetContent>
        </Sheet>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex min-h-[142px] flex-col rounded-2xl border border-brand-secondary/10 bg-card/90 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-secondary/10 text-brand-secondary">
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
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <User className="h-2.5 w-2.5 shrink-0 text-brand-secondary" />
                    {members.length + guests.length} adultes
                  </span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <Baby className="h-2.5 w-2.5 shrink-0 text-brand-accent" />
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
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 text-brand-accent">
                <Utensils className="h-4 w-4" />
              </span>
              <span className="min-w-0 truncate text-[11px] font-semibold text-muted-foreground">
                Budget
              </span>
            </div>
            {loading ? (
              <div
                className="mt-3 space-y-2 animate-pulse"
                aria-label="Chargement du budget chantier"
              >
                <span className="block h-6 w-24 rounded-md bg-secondary" />
                <span className="block h-3 w-28 rounded bg-secondary/80" />
              </div>
            ) : (
              <>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="whitespace-nowrap text-[24px] font-black leading-none tabular-nums">
                    {Math.round(totalBudget)} €
                  </span>
                  <span className="whitespace-nowrap text-[10px] font-medium text-muted-foreground">total</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <ReceiptText className="h-2.5 w-2.5 shrink-0 text-brand-accent" />
                    {Math.round(expensesTotal)} € dép.
                  </span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <Wallet className="h-2.5 w-2.5 shrink-0 text-brand-secondary" />
                    {Math.round(Math.abs(budgetDifference))} € {budgetDifference >= 0 ? "rest." : "dépass."}
                  </span>
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
            title="Tâches"
            summary={`${tasks.length} tâche${tasks.length > 1 ? "s" : ""} · ${tasks.filter((task) => task.done).length} terminée${tasks.filter((task) => task.done).length > 1 ? "s" : ""}`}
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
              <AddTaskButton onClick={() => setCatalogOpen(true)} label="Nouvelle tâche" />
              {/* Step 1: Catalog picker — pick from existing or create new */}
              <Sheet open={catalogOpen} onOpenChange={setCatalogOpen}>
                <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl px-5 pb-10 pt-5">
                  <SheetHeader className="mb-4">
                    <SheetTitle className="text-left text-[17px] font-bold">Ajouter une tâche</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-3">
                    <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
                      Choisir dans le catalogue
                    </div>
                    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                      {(catalogData?.tasks ?? []).length === 0 && (
                        <div className="px-4 py-3 text-[13px] text-muted-foreground">Chargement…</div>
                      )}
                      {(catalogData?.tasks ?? []).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setFormInitialLabel(t.label);
                            setCatalogOpen(false);
                            setFormOpen(true);
                          }}
                          className="flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-medium hover:bg-secondary/50 transition"
                        >
                          {t.label}
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormInitialLabel("");
                        setCatalogOpen(false);
                        setFormOpen(true);
                      }}
                      className="tap lift w-full rounded-2xl border border-border bg-card px-4 py-3 text-left text-[14px] font-semibold text-muted-foreground hover:text-foreground transition"
                    >
                      + Créer une nouvelle tâche
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
              {/* Step 2: Task creation form (with optional pre-filled label) */}
              <TaskFormSheet
                open={formOpen}
                onOpenChange={(v) => { setFormOpen(v); if (!v) setFormInitialLabel(""); }}
                title={formInitialLabel ? `Tâche : ${formInitialLabel}` : "Nouvelle tâche"}
                chantierId={chantierId}
                startDate={startDate}
                mode="user"
                preview={demo}
                initialLabel={formInitialLabel}
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
            <div className="border-t border-border/60 pb-3 pt-3">
              {enrichedPeople.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Aucun inscrit pour le moment.</p>
              ) : (() => {
                const MAX_VISIBLE = 18;
                const visible = showAllPeople ? enrichedPeople : enrichedPeople.slice(0, MAX_VISIBLE);
                const overflow = enrichedPeople.length - MAX_VISIBLE;
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {visible.map((person) => {
                      const isChild = isChildType(person.personType);
                      const isGuest = person.personType.startsWith("guest");
                      const firstName = person.personName.split(" ")[0];
                      const pillStyle = isChild
                        ? "bg-secondary text-muted-foreground"
                        : isGuest
                          ? "border border-border bg-card text-foreground"
                          : "bg-brand-secondary/15 text-brand-secondary";
                      return (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => setSelectedPerson(person)}
                          className={`tap inline-flex h-7 items-center gap-1 rounded-full px-3 text-[11px] font-semibold ${pillStyle}`}
                        >
                          {firstName}
                          {isChild && (
                            <span className="text-[8px] font-medium opacity-60">enfant</span>
                          )}
                          {isGuest && !isChild && (
                            <span className="text-[8px] font-medium opacity-60">woofer</span>
                          )}
                        </button>
                      );
                    })}
                    {!showAllPeople && overflow > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllPeople(true)}
                        className="tap inline-flex h-7 items-center rounded-full border border-border bg-secondary px-3 text-[11px] font-bold text-muted-foreground"
                      >
                        +{overflow} autres
                      </button>
                    )}
                  </div>
                );
              })()}
              <p className="mt-3 text-[8px] text-muted-foreground">
                Clique sur un participant pour voir ses horaires d’arrivée et de départ.
              </p>

              <Sheet open={!!selectedPerson} onOpenChange={(open) => { if (!open) setSelectedPerson(null); }}>
                <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl px-5 pb-10 pt-6">
                  {selectedPerson && (() => {
                    const isChild = isChildType(selectedPerson.personType);
                    const isGuest = selectedPerson.personType.startsWith("guest");
                    const initials =
                      selectedPerson.personName
                        .split(" ")
                        .map((w) => w[0] ?? "")
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "?";
                    const avatarBg = isChild
                      ? "bg-secondary text-foreground"
                      : isGuest
                        ? "border border-border bg-card text-foreground"
                        : "bg-brand-secondary/15 text-brand-secondary";
                    const arrival = computeArrival(selectedPerson.meals);
                    const departure = computeDeparture(selectedPerson.meals);
                    return (
                      <div>
                        <div className="flex items-center gap-4">
                          <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-black ${avatarBg}`}>
                            {initials}
                          </span>
                          <div>
                            <div className="text-2xl font-black">{selectedPerson.personName}</div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {isChild ? (
                                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold">Enfant</span>
                              ) : isGuest ? (
                                <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[10px] font-semibold">Woofer</span>
                              ) : (
                                <span className="rounded-full bg-brand-secondary/15 px-2.5 py-0.5 text-[10px] font-semibold text-brand-secondary">Membre</span>
                              )}
                              {selectedPerson.mode === "teletravail" && (
                                <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">💻 Télétravail</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {selectedPerson.registeredBy !== selectedPerson.personName && (
                          <p className="mt-3 text-[11px] text-muted-foreground">
                            Inscrit·e par <strong className="text-foreground">{selectedPerson.registeredBy}</strong>
                          </p>
                        )}

                        <div className="mt-4 space-y-3 rounded-2xl bg-secondary/35 p-4">
                          {!arrival ? (
                            <p className="text-[12px] text-muted-foreground">Aucun repas renseigné.</p>
                          ) : (
                            <>
                              <div className="flex items-start gap-3">
                                <LogIn className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground" />
                                <div>
                                  <div className="label-micro mb-0.5">Arrivée</div>
                                  <div className="text-[13px] font-semibold">{arrival}</div>
                                </div>
                              </div>
                              {departure && (
                                <div className="flex items-start gap-3">
                                  <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />
                                  <div>
                                    <div className="label-micro mb-0.5">Départ</div>
                                    <div className="text-[13px] font-semibold">{departure}</div>
                                  </div>
                                </div>
                              )}
                              {selectedPerson.meals.length > 0 && (
                                <div className="border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                                  {selectedPerson.meals.length} repas prévu{selectedPerson.meals.length > 1 ? "s" : ""}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {selectedPerson.family.length > 0 && (
                          <div className="mt-4">
                            <div className="label-micro mb-2">Vient avec</div>
                            <div className="flex flex-wrap gap-2">
                              {selectedPerson.family.map((fm) => (
                                <PersonPill
                                  key={fm.id}
                                  name={fm.personName}
                                  kind={
                                    isChildType(fm.personType)
                                      ? "child"
                                      : fm.personType.startsWith("guest")
                                        ? "guest"
                                        : "member"
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </SheetContent>
              </Sheet>
            </div>
          )}
        </section>

        <section id="chantier-intendance" className="rounded-xl border border-border bg-card px-3">
          <BriefSectionHeader
            icon={CalendarDays}
            title="Intendance"
            summary={
              loading
                ? "Chargement des présences…"
                : `${days.length} jour${days.length > 1 ? "s" : ""} · ${Math.round(totalBudget)} € repas`
            }
            alert={
              !loading && people.length > 0
                ? missingDutySlots > 0
                  ? `${missingDutySlots} créneau${missingDutySlots > 1 ? "x" : ""} libre${missingDutySlots > 1 ? "s" : ""}`
                  : totalBudget === 0
                    ? "Budget à compléter"
                    : undefined
                : undefined
            }
            open={activeSection === "days"}
            onClick={() =>
              !loading && setActiveSection((current) => (current === "days" ? null : "days"))
            }
          />
          {activeSection === "days" && (
            <div className="border-t border-border/60 pb-3 pt-2.5">
              {missingDutySlots > 0 && onDutyVacancyClick && (
                <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-brand-accent/10 px-3 py-2.5">
                  <ChefHat className="h-4 w-4 shrink-0 text-brand-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold text-brand-accent">
                      {missingDutySlots} créneau{missingDutySlots > 1 ? "x" : ""} d'intendance à prendre
                    </div>
                    <div className="text-[9px] text-brand-accent/70">
                      Déplie un jour et clique sur « ↗ À prendre » pour t'inscrire
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {days.map((date) => {
                  const movement = dayMovement(date);
                  const children = childrenCount(date);
                  const active = selectedDay === date;
                  const parsed = new Date(`${date}T00:00:00`);
                  const lunch = mealCount(date, "dejeuner");
                  const dinner = mealCount(date, "diner");
                  const courseLunch = duties.find(
                    (duty) => duty.role === "courses" && duty.date === date && duty.slot === "matin",
                  );
                  const courseDinner = duties.find(
                    (duty) =>
                      duty.role === "courses" && duty.date === date && duty.slot === "apres_midi",
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
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {(
                              [
                                ["Déjeuner", lunch, courseLunch, kitchenLunch, childcareMorning, "matin"] as const,
                                ["Dîner", dinner, courseDinner, kitchenDinner, childcareAfternoon, "apres_midi"] as const,
                              ]
                            ).map(([label, meal, courseSlot, kitchenSlot, childcareSlot, slot]) => (
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
                                  <span className="whitespace-nowrap text-[11px] font-black text-brand-secondary">
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
                                <div className="mt-2 space-y-1 border-t border-border/60 pt-1.5">
                                  <div className="flex min-w-0 items-center justify-between gap-1">
                                    <span className="flex shrink-0 items-center gap-1 text-[8px] font-semibold text-muted-foreground">
                                      <ShoppingCart className="h-2.5 w-2.5" /> Courses
                                    </span>
                                    {courseSlot ? (
                                      <PersonPill name={courseSlot.personName} />
                                    ) : (
                                      <DutyVacancyPill
                                        onClick={vacancyAction({ role: "courses", date, slot })}
                                      />
                                    )}
                                  </div>
                                  <div className="flex min-w-0 items-center justify-between gap-1">
                                    <span className="flex shrink-0 items-center gap-1 text-[8px] font-semibold text-muted-foreground">
                                      <ChefHat className="h-2.5 w-2.5" /> Cuisine
                                    </span>
                                    {kitchenSlot ? (
                                      <PersonPill name={kitchenSlot.personName} />
                                    ) : (
                                      <DutyVacancyPill
                                        onClick={vacancyAction({ role: "cuisine", date, slot })}
                                      />
                                    )}
                                  </div>
                                  {children > 0 && (
                                    <div className="flex min-w-0 items-center justify-between gap-1">
                                      <span className="flex shrink-0 items-center gap-1 text-[8px] font-semibold text-muted-foreground">
                                        <Baby className="h-2.5 w-2.5" /> Garde {DUTY_SLOT_LABEL.garde[slot]}
                                      </span>
                                      {childcareSlot ? (
                                        <PersonPill name={childcareSlot.personName} />
                                      ) : (
                                        <DutyVacancyPill
                                          onClick={vacancyAction({ role: "garde", date, slot })}
                                        />
                                      )}
                                    </div>
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

      </div>
    </section>
  );
}
