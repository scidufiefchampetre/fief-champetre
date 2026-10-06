import { useState } from "react";
import { ShoppingCart, ChefHat, Baby, X, Sun, Moon, Sunrise, Sunset } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DUTY_ROLE_LABEL,
  type ChantierDuty,
  type DutyRole,
  type DutySlotKey,
} from "@/lib/chantier-duties.functions";
import type { WizardPerson, DraftDuty } from "./types";
import { initials, isChildPersonType } from "./utils";

const DUTY_ROLES: DutyRole[] = ["courses", "cuisine", "garde"];
const DUTY_SLOTS: DutySlotKey[] = ["matin", "apres_midi"];

const ROLE_ICON: Record<DutyRole, React.ElementType> = {
  courses: ShoppingCart,
  cuisine: ChefHat,
  garde: Baby,
};

// Slot visual config per role
const SLOT_CONFIG: Record<DutyRole, Record<DutySlotKey, { icon: React.ElementType; label: string; color: string }>> = {
  courses: {
    matin:     { icon: Sun,     label: "Déjeuner", color: "text-brand-accent" },
    apres_midi: { icon: Moon,    label: "Dîner",    color: "text-brand-secondary" },
  },
  cuisine: {
    matin:     { icon: Sun,     label: "Déjeuner", color: "text-brand-accent" },
    apres_midi: { icon: Moon,    label: "Dîner",    color: "text-brand-secondary" },
  },
  garde: {
    matin:     { icon: Sunrise, label: "Matin",  color: "text-brand-accent" },
    apres_midi: { icon: Sunset,  label: "A-M",    color: "text-brand-accent" },
  },
};

interface SlotTarget { date: string; slot: DutySlotKey; role: DutyRole; }

interface Props {
  people: WizardPerson[];
  days: string[];
  existingDuties: ChantierDuty[];
  draftDuties: DraftDuty[];
  currentUserName: string;
  chantierParticipants: string[];
  onDutiesChange: (duties: DraftDuty[]) => void;
}

function fmtDayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

export function Step3Duties({
  people, days, existingDuties, draftDuties, currentUserName, chantierParticipants, onDutiesChange,
}: Props) {
  const [sheetTarget, setSheetTarget] = useState<SlotTarget | null>(null);

  const myNames = new Set(people.map((p) => p.name));
  const adultPeople = people.filter((p) => !isChildPersonType(p.personType));

  const pickerList: string[] = [];
  if (currentUserName) pickerList.push(currentUserName);
  for (const p of adultPeople) if (p.name !== currentUserName) pickerList.push(p.name);
  for (const name of chantierParticipants) if (!pickerList.includes(name)) pickerList.push(name);

  function existingFor(date: string, slot: DutySlotKey, role: DutyRole): ChantierDuty | undefined {
    return existingDuties.find((d) => d.date === date && d.slot === slot && d.role === role);
  }
  function draftFor(date: string, slot: DutySlotKey, role: DutyRole): DraftDuty | undefined {
    return draftDuties.find((d) => d.date === date && d.slot === slot && d.role === role);
  }
  function assignDuty(target: SlotTarget, personName: string) {
    const filtered = draftDuties.filter(
      (d) => !(d.date === target.date && d.slot === target.slot && d.role === target.role),
    );
    onDutiesChange([...filtered, { ...target, personName }]);
    setSheetTarget(null);
  }
  function releaseDuty(target: SlotTarget) {
    onDutiesChange(draftDuties.filter(
      (d) => !(d.date === target.date && d.slot === target.slot && d.role === target.role),
    ));
  }

  return (
    <div className="space-y-6 py-2">
      <p className="text-xs text-muted-foreground">
        Optionnel · choisis les missions que tu prends en charge.
      </p>

      {DUTY_ROLES.map((role) => {
        const RoleIcon = ROLE_ICON[role];
        return (
          <div key={role}>
            {/* Role header */}
            <div className="mb-3 flex items-center gap-2">
              <RoleIcon className="h-4 w-4 text-brand-secondary" />
              <span className="text-sm font-bold">{DUTY_ROLE_LABEL[role]}</span>
            </div>

            {/* 1 row per day */}
            <div className="space-y-2">
              {days.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  {/* Day label */}
                  <span className="w-[48px] shrink-0 text-2xs font-semibold capitalize text-muted-foreground">
                    {fmtDayShort(day)}
                  </span>

                  {/* Slot chips */}
                  <div className="flex gap-2">
                    {DUTY_SLOTS.map((slot) => {
                      const target: SlotTarget = { date: day, slot, role };
                      const cfg = SLOT_CONFIG[role][slot];
                      const SlotIcon = cfg.icon;
                      const existing = existingFor(day, slot, role);
                      const draft = draftFor(day, slot, role);

                      // Taken by outsider
                      if (existing && !myNames.has(existing.personName) && !draft) {
                        return (
                          <div
                            key={slot}
                            className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 opacity-50"
                          >
                            <SlotIcon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                            <span className="text-xs font-semibold text-muted-foreground">{cfg.label}</span>
                            <span className="text-2xs font-bold text-muted-foreground">
                              {initials(existing.personName)}
                            </span>
                          </div>
                        );
                      }

                      // Draft (mine)
                      if (draft) {
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => releaseDuty(target)}
                            className="tap flex items-center gap-1.5 rounded-xl bg-brand-secondary px-3 py-2 text-white"
                          >
                            <SlotIcon className="h-3.5 w-3.5 shrink-0 text-white/80" />
                            <span className="text-xs font-bold">{cfg.label}</span>
                            <span className="text-2xs font-semibold opacity-75">
                              {draft.personName.split(" ")[0]}
                            </span>
                            <X className="h-3 w-3 opacity-60" />
                          </button>
                        );
                      }

                      // Free
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSheetTarget(target)}
                          className="tap flex items-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-3 py-2 transition hover:border-brand-secondary/40 hover:bg-brand-secondary/5"
                        >
                          <SlotIcon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                          <span className="text-xs font-semibold text-muted-foreground">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Person picker sheet */}
      <Sheet open={!!sheetTarget} onOpenChange={(v) => { if (!v) setSheetTarget(null); }}>
        <SheetContent side="bottom" className="max-h-[70dvh] rounded-t-3xl px-5 pb-10 pt-6">
          {sheetTarget && (() => {
            const cfg = SLOT_CONFIG[sheetTarget.role][sheetTarget.slot];
            const SlotIcon = cfg.icon;
            return (
              <>
                <SheetHeader className="mb-5">
                  <SheetTitle className="flex items-center gap-2 text-left text-lg font-black">
                    <SlotIcon className={`h-5 w-5 ${cfg.color}`} />
                    {DUTY_ROLE_LABEL[sheetTarget.role]} — {cfg.label}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground">{fmtDayShort(sheetTarget.date)}</p>
                </SheetHeader>
                <div className="no-scrollbar max-h-[50vh] space-y-1.5 overflow-y-auto">
                  {pickerList.map((name) => {
                    const isMe = name === currentUserName;
                    const isWizard = adultPeople.some((p) => p.name === name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => assignDuty(sheetTarget, name)}
                        className="tap flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-brand-secondary/40 hover:bg-brand-secondary/5"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${isMe ? "bg-brand-secondary text-white" : "bg-secondary"}`}>
                          {initials(name)}
                        </span>
                        <span className="flex-1 text-sm font-bold">{name.split(" ")[0]}</span>
                        {isMe && <span className="text-2xs font-semibold uppercase tracking-wide text-brand-secondary">Toi</span>}
                        {!isMe && isWizard && <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Inscrit</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
