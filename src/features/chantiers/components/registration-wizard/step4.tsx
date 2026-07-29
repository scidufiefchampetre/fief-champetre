import { Users, Utensils, ShoppingCart, ChefHat, Baby, Loader2, Sun, Moon } from "lucide-react";
import {
  DUTY_ROLE_LABEL,
  type DutyRole,
  type DutySlotKey,
} from "@/lib/chantier-duties.functions";
import type { WizardPerson, DraftDuty, MealsMode } from "./types";
import { parseMealToken, fmtDateShort, isChildPersonType, initials } from "./utils";

const DUTY_ROLES: DutyRole[] = ["courses", "cuisine", "garde"];

const ROLE_ICON: Record<DutyRole, React.ElementType> = {
  courses: ShoppingCart,
  cuisine: ChefHat,
  garde: Baby,
};

const SLOT_CHIP: Record<DutyRole, Record<DutySlotKey, string>> = {
  courses: { matin: "Déjeuner", apres_midi: "Dîner" },
  cuisine: { matin: "Déjeuner", apres_midi: "Dîner" },
  garde: { matin: "Matin", apres_midi: "A-M" },
};

interface Props {
  people: WizardPerson[];
  tokens: string[];
  mealsMode: MealsMode;
  mealAttendees: Record<string, Set<string>>;
  draftDuties: DraftDuty[];
  isPending: boolean;
  myGroup: { groupId: string } | null;
}

export function Step4Summary({ people, tokens, mealsMode, mealAttendees, draftDuties, isPending, myGroup }: Props) {
  const allKeys = new Set(people.map((p) => p.key));

  // Per-person meal slots
  function personMeals(person: WizardPerson): { date: string; meal: string }[] {
    if (mealsMode === "all") {
      return tokens.map((t) => parseMealToken(t));
    }
    return tokens
      .filter((t) => (mealAttendees[t] ?? allKeys).has(person.key))
      .map((t) => parseMealToken(t));
  }

  const allSameMeals = mealsMode === "all" || people.every((p) => {
    const m = personMeals(p);
    return m.length === tokens.length;
  });

  return (
    <div className="space-y-4 py-2">
      {myGroup && (
        <div className="rounded-xl bg-brand-secondary/10 px-4 py-2.5 text-[11px] font-semibold text-brand-secondary">
          Modification de ton inscription existante
        </div>
      )}

      {/* Participants */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-secondary" />
          <span className="text-[12px] font-bold uppercase tracking-wide text-brand-secondary">
            Participants
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <span
              key={p.key}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                isChildPersonType(p.personType)
                  ? "bg-secondary text-muted-foreground"
                  : "bg-brand-secondary/10 text-brand-secondary"
              }`}
            >
              {p.name.split(" ")[0]}
              {isChildPersonType(p.personType) && (
                <span className="ml-1 opacity-50">enfant</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Meals */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Utensils className="h-4 w-4 text-brand-secondary" />
          <span className="text-[12px] font-bold uppercase tracking-wide text-brand-secondary">
            Repas
          </span>
        </div>

        {allSameMeals ? (
          /* All same: single summary line */
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-bold">Tout le monde</span>
            <span className="text-[11px] text-muted-foreground">· {tokens.length} repas</span>
          </div>
        ) : (
          /* Per-person breakdown */
          <div className="space-y-2.5">
            {people.map((p) => {
              const meals = personMeals(p);
              return (
                <div key={p.key} className="flex items-start gap-3">
                  <span className="w-[72px] shrink-0 truncate text-[12px] font-bold">
                    {p.name.split(" ")[0]}
                  </span>
                  {meals.length === 0 ? (
                    <span className="text-[11px] italic text-muted-foreground/50">Aucun repas</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {meals.map(({ date, meal }) => (
                        <span
                          key={`${date}:${meal}`}
                          className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground"
                        >
                          {meal === "dejeuner" ? (
                            <Sun className="h-2.5 w-2.5 text-brand-accent" />
                          ) : (
                            <Moon className="h-2.5 w-2.5 text-brand-secondary" />
                          )}
                          {fmtDateShort(date)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Duties */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-brand-secondary" />
          <span className="text-[12px] font-bold uppercase tracking-wide text-brand-secondary">
            Intendance
          </span>
        </div>
        {draftDuties.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Aucune mission prise.</p>
        ) : (() => {
          // Group by person preserving insertion order
          const byPerson = new Map<string, DraftDuty[]>();
          for (const d of draftDuties) {
            if (!byPerson.has(d.personName)) byPerson.set(d.personName, []);
            byPerson.get(d.personName)!.push(d);
          }
          return (
            <div className="space-y-3">
              {Array.from(byPerson.entries()).map(([personName, duties]) => (
                <div key={personName} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-secondary/10 text-[9px] font-black text-brand-secondary">
                    {initials(personName)}
                  </span>
                  <div className="flex-1">
                    <div className="mb-1.5 text-[12px] font-bold">{personName.split(" ")[0]}</div>
                    <div className="space-y-1">
                      {DUTY_ROLES.filter((role) => duties.some((d) => d.role === role)).map((role) => {
                        const Icon = ROLE_ICON[role];
                        const roleDuties = duties.filter((d) => d.role === role);
                        return (
                          <div key={role} className="flex items-center gap-2">
                            <Icon className="h-3 w-3 shrink-0 text-brand-accent" />
                            <span className="w-14 shrink-0 text-[10px] font-semibold text-muted-foreground">
                              {DUTY_ROLE_LABEL[role]}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {roleDuties.map((d) => (
                                <span
                                  key={`${d.date}-${d.slot}`}
                                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold"
                                >
                                  {fmtDateShort(d.date)} · {SLOT_CHIP[d.role][d.slot]}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {isPending && (
        <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Enregistrement en cours…
        </div>
      )}
    </div>
  );
}
