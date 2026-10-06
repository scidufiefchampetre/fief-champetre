import { useState, useMemo } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useExpenseStore } from "@/core/store/expense-store";
import { Button } from "@/components/ui/button";
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
import {
  saveChantierParticipation,
  cancelChantierRegistration,
  type RegistrationPersonType,
  type AttendedMeal,
} from "@/lib/chantier-registrations.functions";
import { listChildren } from "@/lib/children.functions";
import { listMembers } from "@/lib/members.functions";
import { listChantierDuties } from "@/lib/chantier-duties.functions";

import type { WizardPerson, DraftDuty, MealsMode, WizardStep } from "./types";
import { STEP_LABELS } from "./types";
import { enumerateDays, allMealTokens, validMealTokens, setToMeals, mealsToSet } from "./utils";
import { Step1Participants } from "./step1";
import { Step2Meals } from "./step2";
import { Step3Duties } from "./step3";
import { Step4Summary } from "./step4";

interface RegistrationWizardProps {
  chantierId: string;
  startDate: string;
  chantierEndDate: string;
  chantierParticipants?: string[];
  startPeriod?: string | null;
  endPeriod?: string | null;
  myGroup: {
    groupId: string;
    members: {
      id: string;
      personName: string;
      personType: RegistrationPersonType;
      mode: string;
      meals: AttendedMeal[];
    }[];
  } | null;
  onClose: () => void;
  onOpenDays?: () => void;
}

export function RegistrationWizard({
  chantierId,
  startDate,
  chantierEndDate,
  chantierParticipants = [],
  startPeriod,
  endPeriod,
  myGroup,
  onClose,
  onOpenDays,
}: RegistrationWizardProps) {
  const store = useExpenseStore();
  const queryClient = useQueryClient();
  const identifiedName = store.member?.firstName ?? "";

  const saveParticipation = useServerFn(saveChantierParticipation);
  const cancelReg = useServerFn(cancelChantierRegistration);
  const listKids = useServerFn(listChildren);
  const listAllMembers = useServerFn(listMembers);
  const listDuties = useServerFn(listChantierDuties);

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

  const { data: dutiesData } = useQuery({
    queryKey: ["chantier-duties", chantierId, startDate],
    queryFn: () => listDuties({ data: { chantierId, startDate } }),
    enabled: !!startDate,
  });

  const myChildren = kidsData?.children ?? [];
  const allMembers = membersData?.members ?? [];
  const existingDuties = dutiesData?.duties ?? [];

  const days = useMemo(
    () => (startDate && chantierEndDate ? enumerateDays(startDate, chantierEndDate) : []),
    [startDate, chantierEndDate],
  );

  const tokens = useMemo(
    () => validMealTokens(days, startPeriod, endPeriod),
    [days, startPeriod, endPeriod],
  );

  // ── Step 1 state: People ──────────────────────────────────────────────────
  const [people, setPeople] = useState<WizardPerson[]>(() => {
    if (myGroup) {
      return myGroup.members.map((m) => ({
        key: m.id,
        name: m.personName,
        personType: m.personType,
        teletravail: m.mode === "teletravail",
      }));
    }
    if (identifiedName) {
      return [
        { key: "self", name: identifiedName, personType: "member", teletravail: false },
      ];
    }
    return [];
  });

  // ── Step 2 state: Meals ───────────────────────────────────────────────────
  const [mealsMode, setMealsMode] = useState<MealsMode>(() => {
    // Edit mode: check if all meals match "all meals"
    if (myGroup) return "custom";
    return "all";
  });

  const [mealAttendees, setMealAttendees] = useState<Record<string, Set<string>>>(() => {
    if (!myGroup) return {};
    const initTokens = allMealTokens(days);
    const result: Record<string, Set<string>> = {};
    for (const t of initTokens) result[t] = new Set();
    for (const m of myGroup.members) {
      const mSet = mealsToSet(m.meals);
      for (const t of mSet) {
        if (result[t]) result[t].add(m.id);
      }
    }
    return result;
  });

  // ── Step 3 state: Duties ─────────────────────────────────────────────────
  const myPeopleNames = useMemo(() => new Set(people.map((p) => p.name)), [people]);

  // Initial duties (for 3-way merge): duties that belonged to this group before wizard opened
  const initialDuties = useMemo(() => {
    if (!myGroup) return [];
    return existingDuties
      .filter((d) => myPeopleNames.has(d.personName))
      .map((d) => ({ date: d.date, slot: d.slot, role: d.role, personName: d.personName }));
  }, [existingDuties, myGroup, myPeopleNames]);

  const [draftDuties, setDraftDuties] = useState<DraftDuty[]>(initialDuties);

  // ── Navigation ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const canAdvance: Record<WizardStep, boolean> = {
    1: people.length > 0,
    2: true,
    3: true,
    4: true,
  };

  function goBack() {
    if (step === 1) onClose();
    else setStep((s) => (s - 1) as WizardStep);
  }

  function goNext() {
    if (step < 4) setStep((s) => (s + 1) as WizardStep);
    else void handleConfirm();
  }

  function updateMealAttendees(token: string, attendees: Set<string>) {
    setMealAttendees((prev) => ({ ...prev, [token]: attendees }));
  }

  async function handleCancel() {
    if (!myGroup) return;
    setSubmitting(true);
    try {
      await cancelReg({
        data: {
          chantierId,
          startDate,
          groupId: myGroup.groupId,
          memberNames: myGroup.members.map((m) => m.personName),
        },
      });
      toast.success("Inscription annulée.");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chantier-registrations", chantierId] }),
        queryClient.invalidateQueries({ queryKey: ["chantier-duties", chantierId, startDate] }),
        queryClient.invalidateQueries({ queryKey: ["chantier-tasks", chantierId, startDate] }),
      ]);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'annulation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!identifiedName) {
      toast.error("Identifie-toi d'abord pour t'inscrire.");
      return;
    }
    setSubmitting(true);
    try {
      const allKeys = new Set(people.map((p) => p.key));
      await saveParticipation({
        data: {
          chantierId,
          startDate,
          registeredBy: identifiedName,
          groupId: myGroup?.groupId,
          people: people.map((p) => {
            let meals: AttendedMeal[];
            if (mealsMode === "all") {
              meals = tokens.map((t) => { const [date, meal] = t.split(":"); return { date, meal: meal as "dejeuner" | "diner" }; });
            } else {
              meals = [];
              for (const [token, attendees] of Object.entries(mealAttendees)) {
                if (attendees.has(p.key)) {
                  const [date, meal] = token.split(":");
                  meals.push({ date, meal: meal as "dejeuner" | "diner" });
                }
              }
            }
            return {
              name: p.name,
              personType: p.personType,
              mode: (p.teletravail ? "teletravail" : "chantier") as "teletravail" | "chantier",
              isAssoMember: false,
              meals,
            };
          }),
          initialDuties,
          currentDuties: draftDuties,
        },
      });

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chantier-registrations", chantierId] }),
        queryClient.invalidateQueries({ queryKey: ["chantier-duties", chantierId, startDate] }),
        queryClient.invalidateQueries({ queryKey: ["chantier-fiche", chantierId, startDate] }),
        queryClient.invalidateQueries({ queryKey: ["chantier-tasks", chantierId, startDate] }),
      ]);

      toast.success(myGroup ? "Inscription mise à jour !" : "Inscription confirmée !");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer.");
    } finally {
      setSubmitting(false);
    }
  }

  const progressPct = (step / 4) * 100;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex max-h-[96dvh] flex-col">
      {/* ── Header ── */}
      <div className="shrink-0 px-5 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            className="tap flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            {step === 1 ? (
              <>
                <X className="h-4 w-4" />
                Annuler
              </>
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" />
                Retour
              </>
            )}
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            Étape {step} sur 4
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-brand-secondary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <h2 className="mt-4 text-xl font-black">{STEP_LABELS[step]}</h2>
      </div>

      {/* ── Scrollable step content ── */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5">
        {step === 1 && (
          <Step1Participants
            people={people}
            currentUserName={identifiedName}
            myChildren={myChildren}
            availableMembers={allMembers.filter(
              (m) =>
                m.firstName !== identifiedName &&
                !people.some((p) => p.name === m.firstName),
            )}
            onChange={setPeople}
          />
        )}
        {step === 2 && (
          <Step2Meals
            people={people}
            days={days}
            tokens={tokens}
            mealsMode={mealsMode}
            mealAttendees={mealAttendees}
            onModeChange={setMealsMode}
            onAttendeesChange={updateMealAttendees}
          />
        )}
        {step === 3 && (
          <Step3Duties
            people={people}
            days={days}
            existingDuties={existingDuties}
            draftDuties={draftDuties}
            currentUserName={identifiedName}
            chantierParticipants={chantierParticipants}
            onDutiesChange={setDraftDuties}
          />
        )}
        {step === 4 && (
          <Step4Summary
            people={people}
            tokens={tokens}
            mealsMode={mealsMode}
            mealAttendees={mealAttendees}
            draftDuties={draftDuties}
            isPending={submitting}
            myGroup={myGroup}
          />
        )}
      </div>

      {/* ── Fixed bottom CTA ── */}
      <div className="shrink-0 border-t border-border bg-background/95 px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-4 backdrop-blur-sm">
        <Button
          className="w-full"
          onClick={goNext}
          disabled={!canAdvance[step] || submitting}
          isLoading={submitting && step === 4}
        >
          {step === 4
            ? myGroup
              ? "Mettre à jour mon inscription"
              : "Confirmer mon inscription"
            : "Suivant →"}
        </Button>
        {myGroup && step === 1 && (
          <button
            type="button"
            onClick={() => setCancelConfirm(true)}
            className="mt-3 w-full text-center text-xs font-semibold text-muted-foreground/60 underline-offset-2 transition hover:text-destructive hover:underline"
          >
            Annuler mon inscription
          </button>
        )}
      </div>

      <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler ton inscription ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu seras retiré de ce chantier. Tu pourras te réinscrire si des places sont encore disponibles.
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
