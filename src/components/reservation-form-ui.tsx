import type { ReactNode } from "react";

// Petits blocs UI partagés entre le formulaire de création (agenda.tsx) et le
// formulaire d'édition (mes-reservations.tsx), pour ne pas dupliquer le style.

export function FormSection({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
          {step}
        </span>
        <h3 className="text-[13px] font-bold uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function ReservationField({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </div>
      {children}
    </label>
  );
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm font-bold transition active:scale-90 hover:bg-secondary/70"
      >
        −
      </button>
      <span className="text-base font-bold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm font-bold transition active:scale-90 hover:bg-secondary/70"
      >
        +
      </button>
    </div>
  );
}
