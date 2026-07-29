import type { RegistrationPersonType } from "@/lib/chantier-registrations.functions";
import type { DutyRole, DutySlotKey } from "@/lib/chantier-duties.functions";

export interface WizardPerson {
  key: string;
  name: string;
  personType: RegistrationPersonType;
  teletravail: boolean;
}

export interface DraftDuty {
  date: string;
  slot: DutySlotKey;
  role: DutyRole;
  personName: string;
}

export type MealsMode = "all" | "custom";

export type WizardStep = 1 | 2 | 3 | 4;

export const STEP_LABELS: Record<WizardStep, string> = {
  1: "Qui vient ?",
  2: "Les repas",
  3: "L'intendance",
  4: "Récapitulatif",
};
