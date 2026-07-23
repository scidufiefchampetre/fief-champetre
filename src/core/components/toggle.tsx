interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

/** Contrôle binaire unique de l'application : un rond coloré avec un point central. */
export function Toggle({ checked, onChange, disabled, label, compact = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`group flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 active:scale-90 ${compact ? "h-5 w-5" : "h-7 w-7"} ${
        checked
          ? "border-brand-secondary bg-brand-secondary shadow-sm"
          : "border-muted-foreground/30 bg-card hover:border-brand-secondary/60 hover:bg-brand-secondary/5"
      }`}
    >
      <span
        aria-hidden="true"
        className={`${compact ? "h-1.5 w-1.5" : "h-2.5 w-2.5"} rounded-full bg-brand-secondary-foreground transition-all duration-200 ease-out ${
          checked ? "scale-100 opacity-100" : "scale-0 opacity-0"
        }`}
      />
    </button>
  );
}
