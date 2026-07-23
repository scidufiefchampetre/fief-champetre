import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Check,
  UserPlus,
  X,
  Laptop,
  ShoppingCart,
  ChefHat,
  Baby,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Hammer,
  Sun,
  Moon,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/core/components/app-header";
import { PageShell } from "@/components/ui/page-shell";
import { Toggle } from "@/core/components/toggle";
import { useExpenseStore } from "@/core/store/expense-store";
import { ChantierBriefCard, PersonPill } from "@/features/chantiers/components/chantier-brief-card";
import { TaskItem, AddTaskButton } from "@/features/chantiers/components/task-item";
import { TaskFormSheet } from "@/features/chantiers/components/task-form";
import { listChantiers, getChantierFiche, listChantierTasks } from "@/lib/chantier.functions";
import { getTaskPhase } from "@/lib/chantier-types";
import {
  listChantierRegistrations,
  saveChantierParticipation,
  cancelChantierRegistration,
  isChildType,
  type RegistrationPersonType,
  type AttendedMeal,
  type MealType,
} from "@/lib/chantier-registrations.functions";
import { listChildren } from "@/lib/children.functions";
import { listMembers } from "@/lib/members.functions";
import {
  listChantierDuties,
  syncChantierDuties,
  DUTY_ROLE_LABEL,
  DUTY_ROLE_SLOTS,
  DUTY_SLOT_LABEL,
  type DutyRole,
  type DutySlotKey,
} from "@/lib/chantier-duties.functions";
import { MEAL_PRICE_PER_ADULT } from "@/lib/pricing";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { REPORT_URGENCY_LABEL, type ReportUrgency } from "@/lib/chantier-reports.functions";

export const Route = createFileRoute("/chantier/$id")({
  component: ChantierPage,
  validateSearch: (search: Record<string, unknown>) => ({
    startDate: typeof search.startDate === "string" ? search.startDate : "",
    demo:
      search.demo === "1" || search.demo === 1 || search.demo === "true" || search.demo === true,
    signupDemo:
      search.signupDemo === "1" ||
      search.signupDemo === 1 ||
      search.signupDemo === "true" ||
      search.signupDemo === true,
    focus: search.focus === "intendance" ? ("intendance" as const) : undefined,
  }),
  head: () => ({
    meta: [{ title: "Chantier · Fief Champêtre" }],
  }),
});

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
function fmtEur(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}
function fmtMonthYear(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
function fmtDateRange(startIso: string, endIso: string) {
  if (!startIso || !endIso) return "";
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
  const startLabel = start.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const endLabel = end.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return `${startLabel} → ${endLabel}`;
}

interface DaySlot {
  date: string;
}
function enumerateDays(startDate: string, endDate: string): DaySlot[] {
  const days: DaySlot[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return days;
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push({ date: d.toISOString().slice(0, 10) });
  }
  return days;
}
function fmtSlotDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
}

function mealToken(date: string, meal: MealType): string {
  return `${date}:${meal}`;
}
function allMealsForDays(days: DaySlot[]): Set<string> {
  const s = new Set<string>();
  for (const d of days) {
    s.add(mealToken(d.date, "dejeuner"));
    s.add(mealToken(d.date, "diner"));
  }
  return s;
}
function setToMeals(s: Set<string>): AttendedMeal[] {
  return [...s].map((token) => {
    const [date, meal] = token.split(":");
    return { date, meal: meal as MealType };
  });
}
function mealsToSet(meals: AttendedMeal[]): Set<string> {
  return new Set(meals.map((m) => mealToken(m.date, m.meal)));
}

function demoRegistrationGroups(startDate: string, endDate: string): RegistrationGroupLite[] {
  if (!startDate || !endDate) return [];
  const demoDays = enumerateDays(startDate, endDate);
  const people: Array<[string, RegistrationPersonType, string]> = [
    ["Alain", "member", "Alain"],
    ["Camille", "member", "Camille"],
    ["Jean", "member", "Jean"],
    ["Marie", "member", "Marie"],
    ["Luc", "member", "Luc"],
    ["Sophie", "member", "Sophie"],
    ["Thomas", "member", "Thomas"],
    ["Claire", "member", "Claire"],
    ["Nicolas", "member", "Nicolas"],
    ["Élodie", "member", "Élodie"],
    ["Baptiste", "member", "Baptiste"],
    ["Juliette", "member", "Juliette"],
    ["Maxime", "member", "Maxime"],
    ["Anaïs", "member", "Anaïs"],
    ["Romain", "member", "Romain"],
    ["Pauline", "member", "Pauline"],
    ["Antoine", "member", "Antoine"],
    ["Manon", "member", "Manon"],
    ["Hugo", "guest_adult", "Alain"],
    ["Léa", "guest_adult", "Camille"],
    ["Sam", "guest_adult", "Jean"],
    ["Inès", "guest_adult", "Marie"],
    ["Victor", "guest_adult", "Luc"],
    ["Chloé", "guest_adult", "Sophie"],
    ["Noah", "guest_adult", "Thomas"],
    ["Sarah", "guest_adult", "Claire"],
    ["Léo", "child", "Alain"],
    ["Nina", "child", "Camille"],
    ["Zoé", "guest_child", "Jean"],
    ["Jules", "child", "Marie"],
    ["Mila", "child", "Luc"],
    ["Arthur", "child", "Sophie"],
    ["Lou", "guest_child", "Thomas"],
    ["Gabriel", "child", "Claire"],
    ["Rose", "child", "Élodie"],
    ["Maël", "guest_child", "Baptiste"],
  ];
  const demoMembers = people.map(([personName, personType, registeredBy], index) => {
    const attendedDays = demoDays.filter((_, dayIndex) => {
      if (index % 4 === 0 && dayIndex === 0) return false;
      if (index % 5 === 0 && dayIndex === demoDays.length - 1) return false;
      if (index % 9 === 0 && dayIndex > 2) return false;
      return true;
    });
    const meals = setToMeals(allMealsForDays(attendedDays));
    return {
      id: `demo-person-${index}`,
      personName,
      personType,
      registeredBy,
      meals,
      mode: personName === "Antoine" ? "teletravail" : "chantier",
    };
  });
  const byRegistrant = new Map<string, typeof demoMembers>();
  for (const member of demoMembers) {
    const family = byRegistrant.get(member.registeredBy) ?? [];
    family.push(member);
    byRegistrant.set(member.registeredBy, family);
  }
  return Array.from(byRegistrant.entries()).map(([registeredBy, members], index) => ({
    groupId: `demo-group-${index}-${registeredBy}`,
    members,
  }));
}

function ChantierPage() {
  const { id } = Route.useParams();
  const { startDate: searchStartDate, demo, signupDemo, focus } = Route.useSearch();
  const store = useExpenseStore();
  const identifiedName = store.member?.firstName ?? "";

  const listChantiersList = useServerFn(listChantiers);

  const { timeMin, timeMax } = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setFullYear(min.getFullYear() - 2);
    const max = new Date(now);
    max.setFullYear(max.getFullYear() + 2);
    return { timeMin: min.toISOString(), timeMax: max.toISOString() };
  }, []);

  const { data: chantiersData } = useQuery({
    queryKey: ["chantiers-for-detail", id],
    queryFn: () => listChantiersList({ data: { timeMin, timeMax } }),
  });
  const reservation = (chantiersData?.chantiers ?? []).find((c) => c.id === id) ?? null;
  const startDate = reservation?.startDate || searchStartDate;
  const endDate = reservation?.endDate ?? "";

  const todayIso = new Date().toISOString().slice(0, 10);
  const isPastChantier = !!endDate && endDate < todayIso;

  const listRegs = useServerFn(listChantierRegistrations);
  const { data: regsData, isLoading: regsLoading } = useQuery({
    queryKey: ["chantier-registrations", id],
    queryFn: () => listRegs({ data: { chantierId: id, startDate } }),
    enabled: !!startDate,
  });
  const groups = useMemo(() => regsData?.groups ?? [], [regsData?.groups]);
  const displayedGroups = useMemo(
    () => (demo ? demoRegistrationGroups(startDate, endDate) : groups),
    [demo, endDate, groups, startDate],
  );
  const totals = regsData?.totals;
  const effectiveAdults = totals?.adults ?? 0;
  const effectiveChildren = totals?.children ?? 0;
  const mealBudget = (totals?.totalMealCost ?? 0) - (totals?.totalReduction ?? 0);

  const myGroup = groups.find((g) => g.members[0]?.registeredBy === identifiedName);
  const [wizardOpen, setWizardOpen] = useState(signupDemo);
  const [dutiesOpen, setDutiesOpen] = useState(false);
  const [dutyTarget, setDutyTarget] = useState<{
    role: DutyRole;
    date?: string;
    slot?: DutySlotKey;
  } | null>(null);

  useEffect(() => {
    if (focus !== "intendance" || !myGroup || dutiesOpen) return;
    setDutiesOpen(true);
    window.setTimeout(
      () =>
        document
          .getElementById("chantier-duty-signup")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80,
    );
  }, [dutiesOpen, focus, myGroup]);

  function openDutySignup(target: { role: DutyRole; date?: string; slot?: DutySlotKey }) {
    if (demo) {
      toast.info("En version réelle, ce clic ouvre directement l’inscription à ce créneau.");
      return;
    }
    if (!myGroup) {
      toast.info("Inscris-toi d’abord au chantier, puis choisis ce créneau.");
      setWizardOpen(true);
      return;
    }
    setDutyTarget(target);
    setDutiesOpen(true);
    window.setTimeout(
      () =>
        document
          .getElementById("chantier-duty-signup")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }

  return (
    <PageShell>
      <AppHeader variant="back" backTo="/chantiers" />

      <div className="animate-rise">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-secondary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-brand-secondary">
          <Hammer className="h-3 w-3" /> Chantier
        </span>
        {demo && (
          <span className="ml-2 inline-flex rounded-full border border-border px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Démo max · {displayedGroups.reduce((total, group) => total + group.members.length, 0)}{" "}
            personnes
          </span>
        )}
        <ChantierBriefCard
          chantierId={id}
          startDate={startDate}
          endDate={endDate}
          groups={displayedGroups}
          loading={demo ? false : regsLoading}
          demo={demo}
          startPeriod={reservation?.startPeriod}
          endPeriod={reservation?.endPeriod}
          onDutyVacancyClick={isPastChantier ? undefined : openDutySignup}
        />

        {!demo && !isPastChantier && !wizardOpen && !myGroup && (
          <button
            onClick={() => setWizardOpen(true)}
            className="tap lift mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-secondary px-4 py-2.5 text-[13px] font-semibold text-brand-secondary-foreground shadow-card"
          >
            <Plus className="h-4 w-4" /> S'inscrire à ce chantier
          </button>
        )}

        {!demo && !isPastChantier && !wizardOpen && myGroup && (
          <div className="mt-3 rounded-2xl border border-success/30 bg-success/10 p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/60 text-success-foreground">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">Tu es inscrit·e</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {myGroup.members.map((member) => (
                    <PersonPill
                      key={member.id}
                      name={member.personName}
                      kind={
                        member.personType.startsWith("guest")
                          ? "guest"
                          : isChildType(member.personType)
                            ? "child"
                            : "member"
                      }
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1.5 text-[10px] font-semibold text-brand-secondary"
              >
                <Pencil className="h-3 w-3" /> Modifier
              </button>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setDutiesOpen((value) => !value)}
                className="tap lift w-full rounded-2xl bg-brand-secondary px-2.5 py-2.5 text-[11px] font-semibold text-brand-secondary-foreground shadow-card"
              >
                {dutiesOpen ? "Fermer l'intendance" : "S'inscrire à l'intendance"}
              </button>
            </div>
          </div>
        )}
        {!demo && isPastChantier && (
          <p className="mt-4 text-[11px] text-muted-foreground">
            Ce chantier est terminé, l'inscription est fermée.
          </p>
        )}

        {!demo && wizardOpen && (
          <RegistrationWizard
            chantierId={id}
            startDate={startDate}
            chantierEndDate={endDate}
            myGroup={signupDemo ? null : (myGroup ?? null)}
            onClose={() => setWizardOpen(false)}
            preview={signupDemo}
          />
        )}

        {!demo && dutiesOpen && myGroup && (
          <div
            id="chantier-duty-signup"
            className="scroll-mt-3 mt-3 rounded-2xl border border-border bg-card p-3.5"
          >
            <div className="mb-3">
              <h2 className="text-base font-bold">Comment tu participes à l'intendance ?</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Ton inscription est déjà confirmée. Tu peux prendre une mission entière ou quelques
                créneaux.
              </p>
            </div>
            <WizardDuties
              chantierId={id}
              startDate={startDate}
              chantierEndDate={endDate}
              myFamilyNames={myGroup.members
                .filter((member) => !isChildType(member.personType))
                .map((member) => member.personName)}
              initialTarget={dutyTarget}
            />
            <button
              type="button"
              onClick={() => setDutiesOpen(false)}
              className="tap mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-[12px] font-semibold text-muted-foreground hover:bg-secondary transition"
            >
              J'aiderai une prochaine fois
            </button>
          </div>
        )}
      </div>
    </PageShell>
  );
}

// --------------------------------------------------------------------------
// Fiche chantier : lecture seule (créée/modifiée depuis /admin). Résumé
// toujours visible en aperçu + bouton "Voir plus" pour le détail.
// --------------------------------------------------------------------------

interface RegistrationGroupLite {
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
interface DutyLite {
  date: string;
  slot: DutySlotKey;
  role: DutyRole;
  personName: string;
}

function FicheChantierCard({
  chantierId,
  startDate,
  endDate,
  effectiveAdults,
  effectiveChildren,
  mealBudget,
  groups,
  regsLoading,
}: {
  chantierId: string;
  startDate: string;
  endDate: string;
  effectiveAdults: number;
  effectiveChildren: number;
  mealBudget: number;
  groups: RegistrationGroupLite[];
  regsLoading: boolean;
}) {
  const daysUntilStart = startDate
    ? Math.ceil((new Date(`${startDate}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const [expanded, setExpanded] = useState(daysUntilStart >= 0 && daysUntilStart <= 7);
  const [selectedDay, setSelectedDay] = useState(0);

  const getFiche = useServerFn(getChantierFiche);
  const { data: ficheData } = useQuery({
    queryKey: ["chantier-fiche", chantierId, startDate],
    queryFn: () => getFiche({ data: { chantierId, startDate } }),
    enabled: !!startDate,
  });

  const listDuties = useServerFn(listChantierDuties);
  const { data: dutiesData } = useQuery({
    queryKey: ["chantier-duties", chantierId, startDate],
    queryFn: () => listDuties({ data: { chantierId, startDate } }),
    enabled: expanded && !!startDate,
  });
  const duties = dutiesData?.duties ?? [];

  const days = useMemo(
    () => (startDate && endDate ? enumerateDays(startDate, endDate) : []),
    [startDate, endDate],
  );

  function mealHeadcount(date: string, meal: MealType) {
    let adults = 0;
    let children = 0;
    for (const g of groups) {
      for (const m of g.members) {
        if (!m.meals.some((x) => x.date === date && x.meal === meal)) continue;
        if (isChildType(m.personType)) children += 1;
        else adults += 1;
      }
    }
    return { adults, children };
  }

  function dutyFor(date: string, role: DutyRole, slot: DutySlotKey) {
    return (
      duties.find((d) => d.date === date && d.role === role && d.slot === slot)?.personName || ""
    );
  }

  function DutyAvatar({ personName }: { personName: string }) {
    return personName ? (
      <span
        title={personName}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/60 text-[11px] font-bold text-success-foreground"
      >
        {personName.charAt(0).toUpperCase()}
      </span>
    ) : (
      <span
        title="à prendre"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-brand-accent/50 text-[10px] font-bold text-brand-accent"
      >
        ?
      </span>
    );
  }

  // Les courses couvrent tout le week-end (un seul engagement), pas un
  // créneau par jour — on les affiche donc une fois, agrégées sur tous les
  // jours du chantier, plutôt que répétées dans chaque carte journalière.
  const courseNames = Array.from(
    new Set(days.map((d) => dutyFor(d.date, "courses", "matin")).filter(Boolean)),
  );
  const courseMissingDays = days.some((d) => !dutyFor(d.date, "courses", "matin"));

  function renderDayCard(day: DaySlot) {
    const dej = mealHeadcount(day.date, "dejeuner");
    const din = mealHeadcount(day.date, "diner");
    const mealLabel = (m: { adults: number; children: number }) =>
      `${m.adults} adulte${m.adults > 1 ? "s" : ""}${m.children > 0 ? ` + ${m.children} enfant${m.children > 1 ? "s" : ""}` : ""}`;
    return (
      <div key={day.date} className="mt-2 rounded-2xl border border-border/60 bg-card p-3.5">
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-[12px] text-muted-foreground">
            Déjeuner · {mealLabel(dej)}
          </span>
          <span className="text-[12px] font-semibold">
            {fmtEur(dej.adults * MEAL_PRICE_PER_ADULT)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between pl-6">
          <span className="text-[11px] text-muted-foreground">Cuisine</span>
          <DutyAvatar personName={dutyFor(day.date, "cuisine", "matin")} />
        </div>

        <div className="mt-2.5 flex items-center gap-2 border-t border-border/40 pt-2.5">
          <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-[12px] text-muted-foreground">Dîner · {mealLabel(din)}</span>
          <span className="text-[12px] font-semibold">
            {fmtEur(din.adults * MEAL_PRICE_PER_ADULT)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between pl-6">
          <span className="text-[11px] text-muted-foreground">Cuisine</span>
          <DutyAvatar personName={dutyFor(day.date, "cuisine", "apres_midi")} />
        </div>

        {effectiveChildren > 0 && (
          <div className="mt-2.5 space-y-1.5 border-t border-border/40 pt-2.5">
            <div className="flex items-center gap-2">
              <Baby className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">Garde d'enfants</span>
            </div>
            <div className="flex items-center justify-between pl-6">
              <span className="text-[11px] text-muted-foreground">Matin</span>
              <DutyAvatar personName={dutyFor(day.date, "garde", "matin")} />
            </div>
            <div className="flex items-center justify-between pl-6">
              <span className="text-[11px] text-muted-foreground">Après-midi</span>
              <DutyAvatar personName={dutyFor(day.date, "garde", "apres_midi")} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {daysUntilStart >= 0 && daysUntilStart <= 7 ? "Briefing du week-end" : "L'essentiel"}
            </div>
            <p className="mt-1.5 text-sm font-medium leading-snug">
              {ficheData?.description || "Le programme sera précisé prochainement."}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2.5">
          <div className="text-sm font-bold">
            {regsLoading ? (
              "…"
            ) : (
              <>
                {effectiveAdults} adulte{effectiveAdults > 1 ? "s" : ""}
                {effectiveChildren > 0
                  ? ` + ${effectiveChildren} enfant${effectiveChildren > 1 ? "s" : ""}`
                  : ""}{" "}
                inscrits
              </>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Repas</div>
            <div className="text-[12px] font-bold">{fmtEur(mealBudget)}</div>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="tap mt-3 flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[12px] font-semibold hover:bg-secondary transition"
        >
          <span>{expanded ? "Masquer l'organisation" : "Voir l'organisation du week-end"}</span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-5">
          {days.length > 0 && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Repas &amp; intendance
              </span>

              <div
                className={`mt-2 flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 ${
                  courseNames.length > 0 && !courseMissingDays
                    ? "border-success/30 bg-success/10"
                    : "border-brand-accent/30 bg-brand-accent/10"
                }`}
              >
                <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold">Courses</div>
                  <div className="text-[10px] text-muted-foreground">tout le week-end</div>
                </div>
                {courseNames.length > 0 ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${courseMissingDays ? "bg-brand-accent/20 text-brand-accent" : "bg-success/60 text-success-foreground"}`}
                  >
                    {courseNames.join(", ")}
                    {courseMissingDays ? " · à compléter" : ""}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-brand-accent/20 px-2.5 py-1 text-[11px] font-bold text-brand-accent">
                    à prendre
                  </span>
                )}
              </div>

              {days.length > 1 && (
                <div className="mt-2 flex gap-1.5 sm:hidden">
                  {days.map((day, i) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedDay(i)}
                      className={`flex-1 rounded-xl px-2 py-2 text-[12px] font-semibold capitalize transition ${
                        selectedDay === i
                          ? "bg-brand-secondary text-brand-secondary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {fmtSlotDate(day.date).split(" ").slice(0, 2).join(" ")}
                    </button>
                  ))}
                </div>
              )}

              {/* Mobile : un seul jour à la fois via les onglets ci-dessus. */}
              <div className="sm:hidden">
                {days[selectedDay] && renderDayCard(days[selectedDay])}
              </div>

              {/* Écrans plus larges : les jours côte à côte, plus besoin d'onglets. */}
              {days.length > 1 ? (
                <div className="mt-2 hidden gap-2 sm:grid sm:grid-cols-2">
                  {days.map((day) => renderDayCard(day))}
                </div>
              ) : (
                <div className="mt-2 hidden sm:block">{days[0] && renderDayCard(days[0])}</div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Qui vient
              </h3>
            </div>
            {groups.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">
                Personne d'inscrit pour l'instant.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60">
                {groups.map((g) => (
                  <div key={g.groupId} className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="flex -space-x-1.5">
                      {g.members.slice(0, 4).map((m) => (
                        <div
                          key={m.id}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold ${
                            isChildType(m.personType)
                              ? "bg-secondary text-muted-foreground"
                              : "bg-brand-secondary text-brand-secondary-foreground"
                          }`}
                        >
                          {m.personName.charAt(0).toUpperCase()}
                        </div>
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold">
                        {g.members
                          .map(
                            (m) =>
                              m.personName +
                              (m.personType === "guest_adult" || m.personType === "guest_child"
                                ? " (invité)"
                                : isChildType(m.personType)
                                  ? " (enfant)"
                                  : ""),
                          )
                          .join(", ")}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        via {g.members[0]?.registeredBy}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Tâches côté utilisateur : lecture seule pour la liste (gérée depuis
// /admin), mais chacun peut cocher, annoter, ou ajouter une tâche imprévue.
// --------------------------------------------------------------------------

function FicheTasksUser({
  chantierId,
  startDate,
  endDate,
  groups,
}: {
  chantierId: string;
  startDate: string;
  endDate: string;
  groups: RegistrationGroupLite[];
}) {
  const listTasks = useServerFn(listChantierTasks);

  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [allTasksOpen, setAllTasksOpen] = useState(false);

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["chantier-tasks", chantierId, startDate],
    queryFn: () => listTasks({ data: { chantierId, startDate } }),
    enabled: open && !!startDate,
  });

  const URGENCY_RANK: Record<string, number> = {
    tres_urgent: 0,
    urgent: 1,
    important: 2,
    must_have: 3,
    "": 4,
  };

  const tasks = [...(tasksData?.tasks ?? [])].sort(
    (a, b) => (URGENCY_RANK[a.urgency ?? ""] ?? 4) - (URGENCY_RANK[b.urgency ?? ""] ?? 4),
  );
  const visibleTasks = tasks.slice(0, 3);
  const hiddenCount = Math.max(0, tasks.length - 3);

  const phase = getTaskPhase(startDate, endDate || startDate);

  const participantNames = useMemo(
    () =>
      Array.from(
        new Set(
          groups
            .flatMap((g) => g.members)
            .filter((m) => !isChildType(m.personType))
            .map((m) => m.personName),
        ),
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [groups],
  );

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold">Tâches du chantier</span>
        <span className="text-[11px] font-semibold text-brand-secondary">
          {open ? "Fermer" : "Voir"}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border p-4">
          {tasksLoading && (
            <div className="animate-pulse space-y-2">
              <div className="h-8 rounded-lg bg-secondary" />
              <div className="h-8 rounded-lg bg-secondary/60" />
            </div>
          )}
          {!tasksLoading && tasks.length === 0 && (
            <div className="rounded-2xl bg-secondary/50 p-4 text-sm text-muted-foreground">
              Aucune tâche pour l’instant.
            </div>
          )}
          <div className="divide-y divide-border/40">
            {visibleTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                chantierId={chantierId}
                startDate={startDate}
                phase={phase}
                participantNames={participantNames}
              />
            ))}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setAllTasksOpen(true)}
              className="tap mt-3 w-full rounded-xl bg-secondary py-2.5 text-[13px] font-semibold text-brand-secondary hover:brightness-95 transition"
            >
              Voir plus ({hiddenCount} tâche{hiddenCount > 1 ? "s" : ""})
            </button>
          )}

          <AddTaskButton onClick={() => setFormOpen(true)} label="Nouvelle tâche" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            La liste des tâches planifiées se gère depuis l’espace admin.
          </p>
        </div>
      )}

      <TaskFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Nouvelle tâche"
        chantierId={chantierId}
        startDate={startDate}
        mode="user"
      />

      <Sheet open={allTasksOpen} onOpenChange={setAllTasksOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-3xl px-5 pb-10 pt-5"
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="text-left text-[17px] font-bold">
              Toutes les tâches ({tasks.length})
            </SheetTitle>
          </SheetHeader>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(["tres_urgent", "urgent", "important", "must_have"] as ReportUrgency[]).map((u) => {
              const count = tasks.filter((t) => t.urgency === u).length;
              if (count === 0) return null;
              return (
                <span
                  key={u}
                  className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                >
                  {REPORT_URGENCY_LABEL[u]} · {count}
                </span>
              );
            })}
          </div>
          <div className="divide-y divide-border/40">
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                chantierId={chantierId}
                startDate={startDate}
                phase={phase}
                participantNames={participantNames}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// --------------------------------------------------------------------------
// Assistant d'inscription en 2 étapes : 1) qui vient + dates par personne
// (uniquement l'option télétravail), 2) intendance.
// --------------------------------------------------------------------------

interface DraftPerson {
  key: string;
  name: string;
  personType: RegistrationPersonType;
  teletravail: boolean;
  ownMeals: Set<string>; // authoritative pour l'inscrit (index 0) ; pour les autres, utilisé seulement si useSharedMeals=false
  useSharedMeals: boolean; // ignoré pour l'inscrit (index 0)
}

function RegistrationWizard({
  chantierId,
  startDate,
  chantierEndDate,
  myGroup,
  onClose,
  preview = false,
}: {
  chantierId: string;
  startDate: string;
  chantierEndDate: string;
  myGroup: {
    groupId: string;
    members: {
      id: string;
      personName: string;
      personType: RegistrationPersonType;
      mode: string;
      meals: AttendedMeal[];
      registeredBy: string;
    }[];
  } | null;
  onClose: () => void;
  preview?: boolean;
}) {
  const store = useExpenseStore();
  const queryClient = useQueryClient();
  const identifiedName = store.member?.firstName ?? "";
  const identifiedFullName = store.member
    ? `${store.member.firstName} ${store.member.lastName}`
    : "";

  const listKids = useServerFn(listChildren);
  const listAllMembers = useServerFn(listMembers);
  const saveParticipation = useServerFn(saveChantierParticipation);
  const cancelReg = useServerFn(cancelChantierRegistration);

  const { data: kidsData } = useQuery({
    queryKey: ["my-children", store.member?.firstName, store.member?.lastName],
    queryFn: () =>
      listKids({
        data: {
          spreadsheetId: store.spreadsheetId,
          parentFirstName: store.member!.firstName,
          parentLastName: store.member!.lastName,
        },
      }),
    enabled: !!store.member,
  });
  const { data: membersData } = useQuery({
    queryKey: ["all-members-for-registration"],
    queryFn: () => listAllMembers({ data: { spreadsheetId: store.spreadsheetId } }),
  });

  const myChildren = kidsData?.children ?? [];
  const allMembers = membersData?.members ?? [];

  const days = useMemo(
    () => (startDate && chantierEndDate ? enumerateDays(startDate, chantierEndDate) : []),
    [startDate, chantierEndDate],
  );

  function defaultPerson(
    name: string,
    personType: RegistrationPersonType,
    key: string,
    isRegistrant: boolean,
  ): DraftPerson {
    return {
      key,
      name,
      personType,
      teletravail: false,
      ownMeals: isRegistrant ? allMealsForDays(days) : new Set(),
      useSharedMeals: !isRegistrant,
    };
  }

  const [people, setPeople] = useState<DraftPerson[]>(() => {
    if (preview) {
      const adultName = identifiedName || "Lucas-Test";
      return [
        defaultPerson(adultName, "member", "preview-adult", true),
        defaultPerson("Léa-Test", "child", "preview-child", false),
      ];
    }
    if (myGroup) {
      // À la réouverture pour modification, on traite tout le monde en "cas
      // par cas" (avec ses propres repas déjà enregistrés) — on ne sait pas
      // fiablement si c'était initialement "mêmes repas que" ou une
      // coïncidence.
      return myGroup.members.map((m) => ({
        key: m.id,
        name: m.personName,
        personType: m.personType,
        teletravail: m.mode === "teletravail",
        ownMeals: mealsToSet(m.meals),
        useSharedMeals: false,
      }));
    }
    return identifiedName ? [defaultPerson(identifiedName, "member", "self", true)] : [];
  });
  const [editingPersonKey, setEditingPersonKey] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestIsChild, setGuestIsChild] = useState(false);
  const [otherMemberPick, setOtherMemberPick] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [dutyChanges, setDutyChanges] = useState<{
    initial: DraftDuty[];
    current: DraftDuty[];
  } | null>(null);

  function addChild(childName: string) {
    if (people.some((p) => p.personType === "child" && p.name === childName)) return;
    setPeople((prev) => [...prev, defaultPerson(childName, "child", `child-${childName}`, false)]);
  }
  function addOtherMember() {
    if (!otherMemberPick) return;
    if (people.some((p) => p.name === otherMemberPick)) return;
    setPeople((prev) => [
      ...prev,
      defaultPerson(otherMemberPick, "member", `member-${otherMemberPick}-${Date.now()}`, false),
    ]);
    setOtherMemberPick("");
  }
  function addGuest() {
    if (!guestName.trim()) {
      toast.error("Prénom de l'invité requis.");
      return;
    }
    setPeople((prev) => [
      ...prev,
      defaultPerson(
        guestName.trim(),
        guestIsChild ? "guest_child" : "guest_adult",
        `guest-${Date.now()}`,
        false,
      ),
    ]);
    setGuestName("");
    setGuestIsChild(false);
  }
  function removePerson(key: string) {
    setPeople((prev) => prev.filter((p) => p.key !== key));
    if (editingPersonKey === key) setEditingPersonKey(null);
  }
  function updatePerson(key: string, patch: Partial<DraftPerson>) {
    setPeople((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }
  function toggleMeal(key: string, token: string) {
    setPeople((prev) =>
      prev.map((p) => {
        if (p.key !== key) return p;
        const next = new Set(p.ownMeals);
        if (next.has(token)) next.delete(token);
        else next.add(token);
        return { ...p, ownMeals: next };
      }),
    );
  }
  function enableCustomMeals(key: string) {
    setPeople((prev) => {
      const registrantMeals = prev[0]?.ownMeals ?? new Set<string>();
      return prev.map((p) =>
        p.key === key ? { ...p, useSharedMeals: false, ownMeals: new Set(registrantMeals) } : p,
      );
    });
  }
  function effectiveMeals(p: DraftPerson, idx: number): Set<string> {
    if (idx === 0 || !p.useSharedMeals) return p.ownMeals;
    return people[0]?.ownMeals ?? new Set();
  }

  // Les corvées (courses/cuisine/garde) sont réservées aux adultes — un enfant
  // n'est jamais un choix valide pour "qui s'en occupe".
  function handleSubmitStep1() {
    if (!identifiedName && !preview) {
      toast.error("Identifie-toi d'abord pour t'inscrire.");
      return;
    }
    if (people.length === 0) {
      toast.error("Ajoute au moins une personne.");
      return;
    }
    setStep(2);
  }

  async function handleCancel() {
    if (!myGroup) return;
    setSubmitting(true);
    try {
      await cancelReg({ data: { chantierId, startDate, groupId: myGroup.groupId } });
      toast.success("Inscription annulée.");
      queryClient.invalidateQueries({ queryKey: ["chantier-registrations", chantierId] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'annulation.");
    } finally {
      setSubmitting(false);
    }
  }

  const availableChildren = myChildren.filter(
    (c) => !people.some((p) => p.personType === "child" && p.name === c.firstName),
  );
  const availableMembers = allMembers
    .filter((m) => `${m.firstName} ${m.lastName}` !== identifiedFullName)
    .filter((m) => !people.some((p) => p.name === m.firstName));
  const myFamilyNames = people
    .filter((person) => !isChildType(person.personType))
    .map((person) => person.name);
  const editingPersonIndex = people.findIndex((person) => person.key === editingPersonKey);
  const editingPerson = editingPersonIndex >= 0 ? people[editingPersonIndex] : null;

  async function finishRegistration() {
    if (submitting) return;
    if (preview) {
      toast.success("Aperçu validé : aucune donnée n’a été enregistrée.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        chantierId,
        startDate,
        registeredBy: identifiedName,
        people: people.map((p, idx) => ({
          name: p.name,
          personType: p.personType,
          mode: (p.teletravail ? "teletravail" : "chantier") as "teletravail" | "chantier",
          isAssoMember: false,
          meals: setToMeals(effectiveMeals(p, idx)),
        })),
      };
      await saveParticipation({
        data: {
          ...payload,
          groupId: myGroup?.groupId,
          initialDuties: dutyChanges?.initial ?? [],
          currentDuties: dutyChanges?.current ?? [],
        },
      });

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chantier-registrations", chantierId] }),
        queryClient.invalidateQueries({ queryKey: ["chantier-duties", chantierId, startDate] }),
        queryClient.invalidateQueries({ queryKey: ["chantier-fiche", chantierId, startDate] }),
        queryClient.invalidateQueries({ queryKey: ["chantier-tasks", chantierId, startDate] }),
      ]);
      toast.success("Ta participation est confirmée.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de valider la participation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 space-y-3.5 rounded-2xl border border-border bg-card p-3.5">
      {preview && (
        <div className="inline-flex rounded-full bg-brand-accent/15 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-brand-accent">
          Aperçu · un adulte + un enfant
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
        {["Inscription", "Intendance et validation"].map((label, index) => {
          const number = (index + 1) as 1 | 2;
          return (
            <div
              key={label}
              className={`flex items-center gap-1.5 ${step === number ? "text-brand-secondary" : ""}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= number ? "bg-brand-secondary text-brand-secondary-foreground" : "bg-secondary"}`}
              >
                {number}
              </span>
              <span className="hidden xs:inline">{label}</span>
              {number < 2 && <ChevronRight className="h-3 w-3" />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <>
          <div>
            <h2 className="text-base font-bold">Qui vient ?</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Ajoute tes proches. Les mêmes dates et repas s’appliquent à tout le monde par défaut.
            </p>
            <p className="mt-1.5 text-[9px] font-medium text-brand-secondary">
              Tu pourras tout modifier jusqu’à la fin du chantier.
            </p>
          </div>

          <div className="space-y-3">
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {people.map((p, idx) => {
                const isChild = p.personType === "child" || p.personType === "guest_child";
                const isRegistrant = idx === 0;
                const isEditing = editingPersonKey === p.key;
                const selectedMeals = effectiveMeals(p, idx).size;
                const allMealsSelected = selectedMeals === days.length * 2;
                const selectedDays = new Set(
                  Array.from(effectiveMeals(p, idx)).map((token) => token.slice(0, 10)),
                ).size;
                return (
                  <div
                    key={p.key}
                    className={`flex min-w-0 items-center gap-2 px-3 py-2 ${isEditing ? "bg-brand-secondary/5" : "bg-card"}`}
                  >
                    <span className="flex min-w-0 shrink items-center gap-1.5 truncate text-[12px] font-semibold">
                      <span className="truncate">{p.name}</span>
                      {isChild && (
                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[7px] font-semibold text-muted-foreground">
                          Enfant
                        </span>
                      )}
                      {p.personType.startsWith("guest") && (
                        <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[7px] font-semibold text-muted-foreground">
                          Invité·e
                        </span>
                      )}
                      {p.teletravail && (
                        <span className="shrink-0 rounded-full bg-brand-secondary/10 px-1.5 py-0.5 text-[7px] font-semibold text-brand-secondary">
                          Télétravail
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right text-[9px] text-muted-foreground">
                      {selectedDays} j ·{" "}
                      {allMealsSelected ? "tous les repas" : `${selectedMeals} repas`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          setEditingPersonKey(null);
                          return;
                        }
                        if (!isRegistrant && p.useSharedMeals) enableCustomMeals(p.key);
                        setEditingPersonKey(p.key);
                      }}
                      className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${isEditing ? "bg-brand-secondary text-brand-secondary-foreground" : "bg-brand-secondary/10 text-brand-secondary"}`}
                    >
                      {isEditing ? "Terminer" : "Adapter"}
                    </button>
                    {!isRegistrant && (
                      <button
                        onClick={() => removePerson(p.key)}
                        aria-label={`Retirer ${p.name}`}
                        className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {editingPerson && (
              <div className="overflow-hidden rounded-xl border border-brand-secondary/20 bg-brand-secondary/5">
                <div className="flex items-center justify-between gap-2 border-b border-brand-secondary/10 px-3 py-2">
                  <div>
                    <div className="text-[8px] font-bold uppercase tracking-wider text-brand-secondary">
                      Repas de
                    </div>
                    <div className="text-[12px] font-bold">{editingPerson.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPersonKey(null)}
                    className="rounded-full bg-card px-2 py-1 text-[9px] font-semibold text-brand-secondary"
                  >
                    Terminer
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center px-3 py-1.5 text-center text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span className="text-left">Jour</span>
                  <span>Déjeuner</span>
                  <span>Dîner</span>
                </div>
                <div className="divide-y divide-border/60 border-t border-border/60">
                  {days.map((day) => (
                    <div
                      key={day.date}
                      className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center px-3 py-2 text-[10px]"
                    >
                      <span className="truncate capitalize text-muted-foreground">
                        {fmtSlotDate(day.date)}
                      </span>
                      <span className="flex justify-center">
                        <Toggle
                          checked={editingPerson.ownMeals.has(mealToken(day.date, "dejeuner"))}
                          onChange={() =>
                            toggleMeal(editingPerson.key, mealToken(day.date, "dejeuner"))
                          }
                          label={`Déjeuner du ${fmtSlotDate(day.date)}`}
                          compact
                        />
                      </span>
                      <span className="flex justify-center">
                        <Toggle
                          checked={editingPerson.ownMeals.has(mealToken(day.date, "diner"))}
                          onChange={() =>
                            toggleMeal(editingPerson.key, mealToken(day.date, "diner"))
                          }
                          label={`Dîner du ${fmtSlotDate(day.date)}`}
                          compact
                        />
                      </span>
                    </div>
                  ))}
                </div>
                {!isChildType(editingPerson.personType) && (
                  <div className="flex items-center justify-between gap-2 border-t border-brand-secondary/10 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Laptop className="h-3 w-3" /> Télétravail
                    </span>
                    <Toggle
                      compact
                      checked={editingPerson.teletravail}
                      onChange={() =>
                        updatePerson(editingPerson.key, { teletravail: !editingPerson.teletravail })
                      }
                      label="Télétravail"
                    />
                  </div>
                )}
              </div>
            )}

            {availableChildren.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availableChildren.map((c) => (
                  <button
                    key={c.firstName}
                    type="button"
                    onClick={() => addChild(c.firstName)}
                    className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-[9px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> {c.firstName} (mon enfant)
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <select
                value={otherMemberPick}
                onChange={(e) => setOtherMemberPick(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-[12px] outline-none focus:border-ring"
              >
                <option value="">Ajouter un autre membre (conjoint…)</option>
                {availableMembers.map((m) => (
                  <option key={`${m.firstName}-${m.lastName}`} value={m.firstName}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addOtherMember}
                disabled={!otherMemberPick}
                className="tap flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value.slice(0, 60))}
                placeholder="Nom d'un invité…"
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-[12px] outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={() => setGuestIsChild((v) => !v)}
                className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold ${guestIsChild ? "border-brand-secondary bg-brand-secondary/10 text-brand-secondary" : "border-border text-muted-foreground"}`}
              >
                Enfant
              </button>
              <button
                type="button"
                onClick={addGuest}
                className="tap flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="px-3 py-2 text-[10px] font-semibold text-muted-foreground"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmitStep1}
                disabled={submitting}
                className="tap rounded-2xl bg-brand-secondary px-5 py-2 text-[11px] font-semibold text-brand-secondary-foreground disabled:opacity-50"
              >
                {submitting ? "Enregistrement…" : "Continuer"}
              </button>
            </div>

            {myGroup && (
              <button
                onClick={() => setCancelConfirmOpen(true)}
                disabled={submitting}
                className="tap flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-destructive hover:underline"
              >
                Annuler mon inscription
              </button>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <div>
          <div className="mb-3">
            <h2 className="text-base font-bold">L’intendance</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Choisis une mission ou un moment encore libre. Tu peux aussi confirmer sans mission.
            </p>
          </div>
          <WizardDuties
            chantierId={chantierId}
            startDate={startDate}
            chantierEndDate={chantierEndDate}
            myFamilyNames={myFamilyNames}
            hasChildren={people.some((person) => isChildType(person.personType))}
            deferred
            onDraftChange={(initial, current) => setDutyChanges({ initial, current })}
          />
          <div className="mt-3 rounded-xl bg-secondary/35 p-2.5">
            <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
              Ton inscription
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {people.map((person) => (
                <PersonPill
                  key={person.key}
                  name={person.name}
                  kind={
                    person.personType.startsWith("guest")
                      ? "guest"
                      : isChildType(person.personType)
                        ? "child"
                        : "member"
                  }
                />
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-2 py-2 text-[10px] font-semibold text-muted-foreground"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={finishRegistration}
              disabled={submitting}
              className="tap lift rounded-2xl bg-brand-secondary px-4 py-2 text-[11px] font-semibold text-brand-secondary-foreground shadow-card disabled:opacity-60"
            >
              {submitting ? "Validation…" : "Confirmer mon inscription"}
            </button>
          </div>
        </div>
      )}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler ton inscription ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu seras retiré de ce chantier. Tu pourras te réinscrire si des places sont encore
              disponibles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "Annulation…" : "Annuler mon inscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const DUTY_ROLE_ICON: Record<DutyRole, typeof ShoppingCart> = {
  courses: ShoppingCart,
  cuisine: ChefHat,
  garde: Baby,
};

interface DraftDuty {
  date: string;
  slot: DutySlotKey;
  role: DutyRole;
  personName: string;
}

function dutyKey(duty: Pick<DraftDuty, "date" | "slot" | "role">) {
  return `${duty.date}-${duty.slot}-${duty.role}`;
}

function WizardDuties({
  chantierId,
  startDate,
  chantierEndDate,
  myFamilyNames,
  hasChildren,
  deferred = false,
  onDraftChange,
  initialTarget,
}: {
  chantierId: string;
  startDate: string;
  chantierEndDate: string;
  myFamilyNames: string[];
  hasChildren?: boolean;
  deferred?: boolean;
  onDraftChange?: (initial: DraftDuty[], current: DraftDuty[]) => void;
  initialTarget?: { role: DutyRole; date?: string; slot?: DutySlotKey } | null;
}) {
  const store = useExpenseStore();
  const queryClient = useQueryClient();
  const identifiedName = store.member?.firstName ?? "";

  const listRegs = useServerFn(listChantierRegistrations);
  const listDuties = useServerFn(listChantierDuties);
  const syncDuties = useServerFn(syncChantierDuties);

  const { data: regsData } = useQuery({
    queryKey: ["chantier-registrations", chantierId],
    queryFn: () => listRegs({ data: { chantierId, startDate } }),
  });
  const { data: dutiesData, isLoading: dutiesLoading } = useQuery({
    queryKey: ["chantier-duties", chantierId, startDate],
    queryFn: () => listDuties({ data: { chantierId, startDate } }),
    enabled: !!startDate,
  });

  const groups = regsData?.groups ?? [];
  const [initialDuties, setInitialDuties] = useState<DraftDuty[]>([]);
  const [duties, setDuties] = useState<DraftDuty[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState<Record<DutyRole, boolean>>({
    courses: false,
    cuisine: false,
    garde: false,
  });
  const [appliedTargetKey, setAppliedTargetKey] = useState("");

  const days = useMemo(
    () => (startDate && chantierEndDate ? enumerateDays(startDate, chantierEndDate) : []),
    [startDate, chantierEndDate],
  );

  useEffect(() => {
    if (initialized || !dutiesData) return;
    const snapshot = dutiesData.duties.map(({ date, slot, role, personName }) => ({
      date,
      slot,
      role,
      personName,
    }));
    setInitialDuties(snapshot);
    setDuties(snapshot);
    setInitialized(true);
    onDraftChange?.(snapshot, snapshot);
  }, [dutiesData, initialized, onDraftChange]);

  function updateDraft(updater: (current: DraftDuty[]) => DraftDuty[]) {
    setDuties((current) => {
      const next = updater(current);
      onDraftChange?.(initialDuties, next);
      return next;
    });
  }

  function claimAs(date: string, role: DutyRole, slot: DutySlotKey, personName: string) {
    const key = `${date}-${slot}-${role}`;
    setPickerKey(null);
    updateDraft((current) => [
      ...current.filter((duty) => dutyKey(duty) !== key),
      { date, slot, role, personName },
    ]);
  }

  function claimAllAs(role: DutyRole, dates: string[], personName: string) {
    setPickerKey(null);
    updateDraft((current) => {
      const next = [...current];
      for (const date of dates) {
        for (const slot of DUTY_ROLE_SLOTS[role]) {
          if (
            !next.some((duty) => duty.date === date && duty.slot === slot && duty.role === role)
          ) {
            next.push({ date, slot, role, personName });
          }
        }
      }
      return next;
    });
  }

  useEffect(() => {
    if (!initialized || !initialTarget) return;
    const targetKey = `${initialTarget.role}-${initialTarget.date ?? "all"}-${initialTarget.slot ?? "all"}`;
    if (appliedTargetKey === targetKey) return;
    setDetailOpen((current) => ({ ...current, [initialTarget.role]: true }));
    if (initialTarget.date && initialTarget.slot) {
      const occupied = duties.some(
        (duty) =>
          duty.date === initialTarget.date &&
          duty.slot === initialTarget.slot &&
          duty.role === initialTarget.role,
      );
      if (!occupied) {
        if (myFamilyNames.length > 1)
          setPickerKey(`${initialTarget.date}-${initialTarget.slot}-${initialTarget.role}`);
        else
          claimAs(
            initialTarget.date,
            initialTarget.role,
            initialTarget.slot,
            myFamilyNames[0] ?? identifiedName,
          );
      }
    }
    setAppliedTargetKey(targetKey);
    // `claimAs` est volontairement omis : sa référence change à chaque rendu,
    // alors que l'effet ne doit appliquer la cible initiale qu'une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedTargetKey, duties, identifiedName, initialTarget, initialized, myFamilyNames]);

  function handleSlotClick(date: string, role: DutyRole, slot: DutySlotKey, current: string) {
    if (!identifiedName) {
      toast.error("Identifie-toi d'abord.");
      return;
    }
    const key = `${date}-${slot}-${role}`;
    if (current) {
      if (!myFamilyNames.includes(current)) return;
      updateDraft((entries) => entries.filter((duty) => dutyKey(duty) !== key));
      return;
    }
    if (myFamilyNames.length > 1) {
      setPickerKey(pickerKey === key ? null : key);
      return;
    }
    claimAs(date, role, slot, myFamilyNames[0] ?? identifiedName);
  }

  function handleClaimAllClick(role: DutyRole, dates: string[]) {
    if (!identifiedName) {
      toast.error("Identifie-toi d'abord.");
      return;
    }
    const key = `all-${role}-${dates.join(",")}`;
    if (myFamilyNames.length > 1) {
      setPickerKey(pickerKey === key ? null : key);
      return;
    }
    claimAllAs(role, dates, myFamilyNames[0] ?? identifiedName);
  }

  async function saveStandalone() {
    setSaving(true);
    try {
      await syncDuties({
        data: { chantierId, startDate, initial: initialDuties, current: duties },
      });
      setInitialDuties(duties);
      void queryClient.invalidateQueries({ queryKey: ["chantier-duties", chantierId, startDate] });
      toast.success("Intendance mise à jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de valider l'intendance.");
    } finally {
      setSaving(false);
    }
  }

  if (!startDate || !chantierEndDate) return null;

  // On ne propose la garde d'enfants que si des enfants sont réellement inscrits.
  const showChildcare =
    hasChildren ??
    groups.some((g) => g.members.some((m) => isChildType(m.personType) && m.meals.length > 0));
  const roles = (["courses", "cuisine", "garde"] as DutyRole[]).filter(
    (r) => r !== "garde" || showChildcare,
  );
  const changed = JSON.stringify(initialDuties) !== JSON.stringify(duties);

  function roleStatus(role: DutyRole) {
    const slots = DUTY_ROLE_SLOTS[role];
    const taken = days.flatMap((day) =>
      slots.map(
        (slot) =>
          duties.find((d) => d.date === day.date && d.slot === slot && d.role === role)
            ?.personName || "",
      ),
    );
    const totalSlots = taken.length;
    const freeCount = taken.filter((n) => !n).length;
    const uniqueNames = Array.from(new Set(taken.filter(Boolean)));
    const mineFullyCovers = totalSlots > 0 && taken.every((n) => !!n && myFamilyNames.includes(n));
    return { totalSlots, freeCount, uniqueNames, mineFullyCovers };
  }

  return (
    <div>
      <div className="space-y-2">
        {(dutiesLoading || !initialized) && (
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Chargement…
          </div>
        )}
        {initialized &&
          roles.map((role) => {
            const Icon = DUTY_ROLE_ICON[role];
            const slots = DUTY_ROLE_SLOTS[role];
            const { totalSlots, freeCount, uniqueNames, mineFullyCovers } = roleStatus(role);
            const allDates = days.map((d) => d.date);
            const allKey = `all-${role}-${allDates.join(",")}`;

            return (
              <div
                key={role}
                className={`overflow-hidden rounded-xl border bg-card transition-colors ${detailOpen[role] ? "border-brand-secondary/35" : "border-border"}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setDetailOpen((current) => ({ ...current, [role]: !current[role] }))
                  }
                  aria-expanded={detailOpen[role]}
                  className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-secondary/35"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{DUTY_ROLE_LABEL[role]}</div>
                    <div
                      className={`text-[11px] font-medium ${freeCount === 0 ? "text-success-foreground" : "text-brand-accent"}`}
                    >
                      {freeCount === 0
                        ? `Couvert${uniqueNames.length ? " : " + uniqueNames.join(", ") : ""}`
                        : freeCount === totalSlots
                          ? "Personne pour l'instant"
                          : `${totalSlots - freeCount}/${totalSlots} pris`}
                    </div>
                  </div>
                  {mineFullyCovers && (
                    <span className="shrink-0 rounded-full bg-success/60 px-2.5 py-1 text-[11px] font-semibold text-success-foreground">
                      Toi ✓
                    </span>
                  )}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${detailOpen[role] ? "rotate-180 text-brand-secondary" : ""}`}
                  />
                </button>
                {freeCount > 0 && (
                  <div className="flex gap-2 px-2.5 pb-2.5">
                    <button
                      type="button"
                      onClick={() => handleClaimAllClick(role, allDates)}
                      className="tap flex-1 rounded-xl bg-brand-secondary px-3 py-2 text-[11px] font-semibold text-brand-secondary-foreground transition-all active:scale-[0.97]"
                    >
                      {role === "courses" ? "Prendre les courses" : `Tout prendre (${freeCount})`}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDetailOpen((current) => ({ ...current, [role]: !current[role] }))
                      }
                      className="tap flex-1 rounded-xl border border-border px-3 py-2 text-[11px] font-semibold"
                    >
                      {detailOpen[role] ? "Fermer" : "Sélectionner"}
                    </button>
                  </div>
                )}

                {myFamilyNames.length > 1 && pickerKey === allKey && (
                  <div className="mx-2.5 mb-2.5 space-y-1 rounded-xl border border-border bg-card p-1.5">
                    <p className="px-2 py-1 text-[10px] text-muted-foreground">
                      Qui prend cette mission ?
                    </p>
                    {myFamilyNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => claimAllAs(role, allDates, name)}
                        className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-secondary"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}

                {detailOpen[role] && (
                  <div className="mx-2.5 mb-2.5 space-y-2 border-t border-border pt-2">
                    {days.map((day) => {
                      const actionableSlots = slots.filter((slot) => {
                        const personName =
                          duties.find(
                            (d) => d.date === day.date && d.slot === slot && d.role === role,
                          )?.personName ?? "";
                        return !personName || myFamilyNames.includes(personName);
                      });
                      if (actionableSlots.length === 0) return null;
                      return (
                        <div
                          key={day.date}
                          className="border-b border-border/60 pb-2 last:border-0 last:pb-0"
                        >
                          <div className="text-[11px] font-semibold capitalize text-muted-foreground">
                            {fmtSlotDate(day.date)}
                          </div>
                          <div className="mt-1 space-y-1">
                            {actionableSlots.map((slot) => {
                              const duty = duties.find(
                                (d) => d.date === day.date && d.slot === slot && d.role === role,
                              );
                              const personName = duty?.personName ?? "";
                              const isMine = !!personName && myFamilyNames.includes(personName);
                              const key = `${day.date}-${slot}-${role}`;
                              const isPickerOpen = pickerKey === key;
                              return (
                                <div key={slot}>
                                  <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/30 px-2.5 py-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[12px] font-medium">
                                        {DUTY_SLOT_LABEL[role][slot]}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {personName || "à prendre"}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSlotClick(day.date, role, slot, personName)
                                      }
                                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-200 active:scale-95 ${
                                        isMine
                                          ? "bg-success/60 text-success-foreground"
                                          : "border border-foreground/20 bg-background"
                                      }`}
                                    >
                                      {isMine ? "Retirer" : "Choisir"}
                                    </button>
                                  </div>
                                  {isPickerOpen && (
                                    <div className="mt-1 space-y-1 rounded-lg border border-border bg-card p-1.5">
                                      {myFamilyNames.map((name) => (
                                        <button
                                          key={name}
                                          type="button"
                                          onClick={() => claimAs(day.date, role, slot, name)}
                                          className="block w-full rounded-md px-2 py-1 text-left text-[11px] hover:bg-secondary"
                                        >
                                          {name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
      {!deferred && changed && (
        <button
          type="button"
          onClick={saveStandalone}
          disabled={saving}
          className="tap lift mt-3 w-full rounded-2xl bg-brand-secondary px-3 py-3 text-[12px] font-semibold text-brand-secondary-foreground shadow-card disabled:opacity-60"
        >
          {saving ? "Validation…" : "Valider l'intendance"}
        </button>
      )}
    </div>
  );
}
