import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Check,
  CalendarDays,
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
import { ChantierBriefCard } from "@/features/chantiers/components/chantier-brief-card";
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
  claimChantierDuty,
  DUTY_ROLE_LABEL,
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
import { RegistrationWizard } from "@/features/chantiers/components/registration-wizard";
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
  const claimDuty = useServerFn(claimChantierDuty);
  const queryClient = useQueryClient();
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
  const allAdultNames = useMemo(
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

  const [wizardOpen, setWizardOpen] = useState(signupDemo);
  const [openDaysSignal, setOpenDaysSignal] = useState(0);
  const [dutyPickerOpen, setDutyPickerOpen] = useState(false);
  const [dutyPickerTarget, setDutyPickerTarget] = useState<{
    role: DutyRole;
    date: string;
    slot: DutySlotKey;
  } | null>(null);
  const [dutyPickerSaving, setDutyPickerSaving] = useState(false);

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
    if (target.date && target.slot) {
      setDutyPickerTarget({ role: target.role, date: target.date, slot: target.slot });
      setDutyPickerOpen(true);
    }
  }

  async function claimDutyAs(personName: string) {
    if (!dutyPickerTarget) return;
    setDutyPickerSaving(true);
    try {
      await claimDuty({
        data: {
          chantierId: id,
          startDate,
          date: dutyPickerTarget.date,
          slot: dutyPickerTarget.slot,
          role: dutyPickerTarget.role,
          personName,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["chantier-duties", id, startDate] });
      toast.success(`Créneau pris pour ${personName} !`);
      setDutyPickerOpen(false);
      setDutyPickerTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de prendre ce créneau.");
    } finally {
      setDutyPickerSaving(false);
    }
  }

  return (
    <PageShell>
      <AppHeader variant="back" backTo="/chantiers" />

      {/* ── Sticky bottom CTA ── */}
      {!demo && !isPastChantier && (
        <div className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
          {/* Gradient fade so content beneath doesn't cut off abruptly */}
          <div className="pointer-events-none absolute inset-x-0 top-[-32px] h-8 bg-gradient-to-b from-transparent to-background" />
          <div className="bg-background">
            {myGroup ? (
              <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/50 text-success-foreground">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="truncate text-[11px] font-bold text-success-foreground">
                    Inscrit·e ·{" "}
                    {myGroup.members.map((m) => m.personName.split(" ")[0]).join(", ")}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOpenDaysSignal((s) => s + 1); setTimeout(() => document.getElementById("chantier-intendance")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}
                    className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-brand-secondary"
                  >
                    <CalendarDays className="h-3 w-3" /> Planning intendance
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setWizardOpen(true)}
                  className="tap shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold text-brand-secondary"
                >
                  <Pencil className="h-3 w-3 inline -mt-0.5 mr-1" />Modifier
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="tap lift flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-secondary py-4 text-[14px] font-bold text-brand-secondary-foreground shadow-float"
              >
                <Plus className="h-4 w-4" /> S'inscrire à ce chantier
              </button>
            )}
          </div>
        </div>
      )}

      <div className="animate-rise pb-28">
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
          openDaysSection={openDaysSignal}
        />

        {!demo && isPastChantier && (
          <p className="mt-4 text-[11px] text-muted-foreground">
            Ce chantier est terminé, l'inscription est fermée.
          </p>
        )}

        {/* Picker direct pour "À prendre" */}
        <Sheet open={dutyPickerOpen} onOpenChange={(v) => { if (!v) { setDutyPickerOpen(false); setDutyPickerTarget(null); } }}>
          <SheetContent side="bottom" className="max-h-[75dvh] overflow-y-auto rounded-t-3xl px-5 pb-10 pt-6">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-left text-xl font-black">
                {dutyPickerTarget
                  ? `${DUTY_ROLE_LABEL[dutyPickerTarget.role]} · ${DUTY_SLOT_LABEL[dutyPickerTarget.role][dutyPickerTarget.slot]}`
                  : "Qui prend ce créneau ?"}
              </SheetTitle>
              <p className="text-[12px] text-muted-foreground">Choisis le participant qui s'en charge.</p>
            </SheetHeader>
            <div className="space-y-2">
              {allAdultNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={dutyPickerSaving}
                  onClick={() => claimDutyAs(name)}
                  className="tap flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-[13px] font-semibold hover:bg-secondary transition disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-secondary/15 text-[12px] font-black text-brand-secondary">
                    {name.charAt(0).toUpperCase()}
                  </span>
                  {name}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        {!demo && (
          <Sheet open={wizardOpen} onOpenChange={(v) => { if (!v) setWizardOpen(false); }}>
            <SheetContent side="bottom" className="overflow-hidden rounded-t-3xl p-0 sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-3xl">
              <RegistrationWizard
                chantierId={id}
                startDate={startDate}
                chantierEndDate={endDate}
                myGroup={signupDemo ? null : (myGroup ?? null)}
                chantierParticipants={allAdultNames}
                startPeriod={reservation?.startPeriod}
                endPeriod={reservation?.endPeriod}
                onClose={() => setWizardOpen(false)}
                onOpenDays={() => { setOpenDaysSignal((s) => s + 1); setWizardOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              />
            </SheetContent>
          </Sheet>
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

