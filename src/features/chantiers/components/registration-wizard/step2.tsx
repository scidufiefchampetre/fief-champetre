import { useState } from "react";
import { Check, Sun, Moon, Home } from "lucide-react";
import type { WizardPerson, MealsMode } from "./types";
import { parseMealToken, fmtDate, initials } from "./utils";

interface Props {
  people: WizardPerson[];
  days: string[];
  tokens: string[];
  mealsMode: MealsMode;
  mealAttendees: Record<string, Set<string>>;
  onModeChange: (mode: MealsMode) => void;
  onAttendeesChange: (token: string, attendees: Set<string>) => void;
}

const MEAL_ICON: Record<string, React.ElementType> = { dejeuner: Sun, diner: Moon };
const MEAL_LABEL: Record<string, string> = { dejeuner: "Déjeuner", diner: "Dîner" };

export function Step2Meals({ people, days, tokens, mealsMode, mealAttendees, onModeChange, onAttendeesChange }: Props) {
  const allKeys = new Set(people.map((p) => p.key));
  const validSet = new Set(tokens);

  function switchToCustom() {
    for (const t of tokens) {
      if (!mealAttendees[t]) onAttendeesChange(t, new Set(allKeys));
    }
    onModeChange("custom");
  }

  function togglePerson(token: string, personKey: string) {
    const current = new Set(mealAttendees[token] ?? allKeys);
    if (current.has(personKey)) current.delete(personKey);
    else current.add(personKey);
    onAttendeesChange(token, current);
  }

  return (
    <div className="space-y-5 py-2">
      {/* Master card */}
      <button
        type="button"
        onClick={() => onModeChange("all")}
        className={`tap w-full rounded-2xl border-2 p-4 text-left transition ${
          mealsMode === "all"
            ? "border-brand-secondary bg-brand-secondary/5"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-foreground">
              Tout le monde, tous les repas
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {people.length} participant{people.length > 1 ? "s" : ""} · {tokens.length} repas au total
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {people.map((p) => (
                <span
                  key={p.key}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-secondary/10 px-2 py-0.5 text-2xs font-semibold text-brand-secondary"
                >
                  {p.name.split(" ")[0]}
                  {p.teletravail && <Home className="h-2.5 w-2.5 opacity-60" />}
                </span>
              ))}
            </div>
          </div>
          <span
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              mealsMode === "all"
                ? "bg-brand-secondary text-white"
                : "border-2 border-border"
            }`}
          >
            {mealsMode === "all" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
        </div>
      </button>

      {/* Custom mode toggle */}
      {mealsMode === "all" ? (
        <button
          type="button"
          onClick={switchToCustom}
          className="tap w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground transition hover:border-brand-secondary/30 hover:text-brand-secondary"
        >
          Personnaliser les repas
        </button>
      ) : (
        <div className="space-y-4">
          <div className="label-micro">Repas par créneau · tap pour retirer/ajouter</div>

          {days.map((day) => {
            const daySlots = (["dejeuner", "diner"] as const).filter((m) =>
              validSet.has(`${day}:${m}`),
            );
            if (daySlots.length === 0) return null;
            return (
              <div key={day}>
                <div className="mb-2 text-xs font-bold capitalize text-muted-foreground">
                  {fmtDate(day)}
                </div>
                <div className="space-y-2">
                  {daySlots.map((meal) => {
                    const token = `${day}:${meal}`;
                    const attendingKeys = mealAttendees[token] ?? allKeys;
                    const Icon = MEAL_ICON[meal];
                    return (
                      <div
                        key={meal}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${meal === "dejeuner" ? "text-brand-accent" : "text-brand-secondary"}`}
                        />
                        <span className="w-8 shrink-0 text-xs font-bold">
                          {MEAL_LABEL[meal]}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {people.map((p) => {
                            const present = attendingKeys.has(p.key);
                            return (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => togglePerson(token, p.key)}
                                className={`tap inline-flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-bold transition ${
                                  present
                                    ? p.teletravail
                                      ? "border border-dashed border-brand-secondary/50 bg-brand-secondary/8 text-brand-secondary"
                                      : "bg-brand-secondary/15 text-brand-secondary"
                                    : "bg-secondary text-muted-foreground/40 line-through"
                                }`}
                              >
                                {p.name.split(" ")[0]}
                                {p.teletravail && present && (
                                  <Home className="h-2.5 w-2.5 opacity-70" />
                                )}
                              </button>
                            );
                          })}
                        </div>
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
}
