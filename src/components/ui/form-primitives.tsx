import { useState } from "react";
import type { ReactNode } from "react";
import { X, ImagePlus } from "lucide-react";
import { Toggle } from "@/core/components/toggle";
import { nightsBetween } from "@/lib/pricing";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── FormField ────────────────────────────────────────────────────────────────
// Section avec label-micro et séparateur bas. Wrapper universel pour un champ.

export function FormField({
  label,
  required,
  hint,
  children,
  last,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`py-4 ${last ? "" : "border-b border-border"}`}>
      <div className="field-label mb-2">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── DateRangeField ───────────────────────────────────────────────────────────
// Deux champs date empilés. La date de fin est contrainte >= date de début + 1j.
// La durée en nuits s'affiche dès que les deux dates sont renseignées.

export function DateRangeField({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  startLabel = "Arrivée",
  endLabel = "Départ",
}: {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  startLabel?: string;
  endLabel?: string;
}) {
  const nights = startDate && endDate ? nightsBetween(startDate, endDate) : 0;

  function handleStartChange(v: string) {
    onStartChange(v);
    // Si la date de fin devient invalide, on la pousse d'un jour.
    if (endDate && endDate <= v) {
      onEndChange(addDays(v, 1));
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <div className="mb-1.5 text-2xs font-medium uppercase tracking-widest text-muted-foreground">
          {startLabel} *
        </div>
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleStartChange(e.target.value)}
          className="input-field"
        />
      </label>
      <label className="block">
        <div className="mb-1.5 text-2xs font-medium uppercase tracking-widest text-muted-foreground">
          {endLabel} *
        </div>
        <input
          type="date"
          value={endDate}
          min={startDate ? addDays(startDate, 1) : undefined}
          onChange={(e) => onEndChange(e.target.value)}
          className="input-field"
        />
        {nights > 0 && (
          <p className="mt-1.5 text-2xs font-semibold text-brand-secondary">
            {nights} nuit{nights > 1 ? "s" : ""}
          </p>
        )}
      </label>
    </div>
  );
}

// ─── NumberStepper ────────────────────────────────────────────────────────────
// Stepper +/− natif, aucun clavier numérique. Remplace <input type="number">.

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="tap flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-bold transition hover:bg-secondary/70 disabled:opacity-30"
      >
        −
      </button>
      <span className="text-base font-bold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
        disabled={max !== undefined && value >= max}
        className="tap flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-bold transition hover:bg-secondary/70 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

// ─── TimePicker ───────────────────────────────────────────────────────────────
// Select natif avec tranches de 30 min — roue iOS, aucun clavier.

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Choisir…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">
      <option value="">{placeholder}</option>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

// ─── ToggleField ──────────────────────────────────────────────────────────────
// Toggle avec label + description optionnelle. Accepte un children qui s'anime
// à l'ouverture (contenu expand quand checked = true).

export function ToggleField({
  label,
  description,
  checked,
  onChange,
  children,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{label}</div>
          {description && (
            <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
          )}
        </div>
        <Toggle checked={checked} onChange={onChange} label={label} />
      </div>
      {children && (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            checked ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DurationInput ────────────────────────────────────────────────────────────
// Champ texte libre pour les durées. Accepte "1h", "2h30", "30min", "1j", etc.
// Retourne des minutes (0 = non défini / invalide).

export const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1h" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2h" },
  { value: 180, label: "3h" },
  { value: 240, label: "Demi-journée (4h)" },
  { value: 480, label: "Journée (8h)" },
  { value: 960, label: "2 jours" },
] as const;

const QUICK_DURATIONS = [
  { label: "30min", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "4h", value: 240 },
  { label: "1j", value: 480 },
  { label: "2j", value: 960 },
];

export function parseDuration(text: string): number {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return 0;
  // Jours : "2j", "2jours", "0.5j"
  const jMatch = t.match(/^(\d+(?:[.,]\d+)?)\s*j(?:our)?s?$/);
  if (jMatch) return Math.round(parseFloat(jMatch[1].replace(",", ".")) * 480);
  // Demi-journée
  if (/^(demi[\s-]?journ[eé]e|dj)$/.test(t)) return 240;
  // Heures + minutes : "1h30", "1h30min"
  const hmMatch = t.match(/^(\d+)h(\d{1,2})(?:min)?$/);
  if (hmMatch) return parseInt(hmMatch[1]) * 60 + parseInt(hmMatch[2]);
  // Heures : "1h", "1.5h", "2h"
  const hMatch = t.match(/^(\d+(?:[.,]\d+)?)h(?:eure)?s?$/);
  if (hMatch) return Math.round(parseFloat(hMatch[1].replace(",", ".")) * 60);
  // Minutes : "30min", "30m"
  const minMatch = t.match(/^(\d+)m(?:in)?$/);
  if (minMatch) return parseInt(minMatch[1]);
  return 0;
}

export function formatDuration(minutes: number): string {
  if (!minutes) return "";
  if (minutes % 480 === 0) {
    const j = minutes / 480;
    return `${j} jour${j > 1 ? "s" : ""}`;
  }
  if (minutes === 240) return "Demi-journée";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
}

// Kept for backward compat (used by DurationSelect callers)
export function DurationSelect({
  value,
  onChange,
  placeholder = "Durée estimée…",
}: {
  value: number;
  onChange: (minutes: number) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 0)}
      className="input-field"
    >
      <option value="">{placeholder}</option>
      {DURATION_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DurationInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const [text, setText] = useState(value ? formatDuration(value) : "");
  const parsed = parseDuration(text);
  const isValid = parsed > 0;

  function commit(raw: string) {
    const m = parseDuration(raw);
    onChange(m);
  }

  return (
    <div>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseDuration(e.target.value));
        }}
        onBlur={(e) => commit(e.target.value)}
        placeholder="ex. 1h, 2h30, 30min, 1j…"
        className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/40 leading-snug"
      />
      {text && (
        <p className={`mt-1 text-xs font-semibold ${isValid ? "text-brand-secondary" : "text-brand-accent"}`}>
          {isValid ? `= ${formatDuration(parsed)}` : "Format non reconnu"}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {QUICK_DURATIONS.map((q) => (
          <button
            key={q.value}
            type="button"
            onClick={() => { setText(q.label); onChange(q.value); }}
            className={`tap rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              value === q.value
                ? "border-brand-secondary bg-brand-secondary/10 text-brand-secondary"
                : "border-border bg-secondary text-muted-foreground hover:border-brand-secondary/50 hover:text-foreground"
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PhotoField + helper ──────────────────────────────────────────────────────
// Champ photo partagé entre TaskForm, ReportForm, etc.

export type LocalPhoto = {
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
  dataBase64: string;
  previewUrl: string;
};

const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export async function readPhotoFile(file: File): Promise<LocalPhoto> {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    throw new Error("Format non supporté. Choisis une photo JPG, PNG, WebP ou HEIC.");
  }
  if (file.size > 8_000_000) {
    throw new Error("La photo dépasse 8 Mo.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture impossible."));
    reader.readAsDataURL(file);
  });
  return {
    name: file.name,
    mimeType: file.type as LocalPhoto["mimeType"],
    dataBase64: dataUrl.split(",")[1] ?? "",
    previewUrl: dataUrl,
  };
}

export function PhotoField({
  photo,
  onChange,
  onError,
}: {
  photo: LocalPhoto | null;
  onChange: (p: LocalPhoto | null) => void;
  onError?: (msg: string) => void;
}) {
  return photo ? (
    <div className="relative inline-block">
      <img src={photo.previewUrl} alt="Aperçu" className="h-20 w-20 rounded-xl object-cover" />
      <button
        type="button"
        onClick={() => onChange(null)}
        className="tap absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive transition"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  ) : (
    <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
      <ImagePlus className="h-3.5 w-3.5" />
      <span className="underline underline-offset-2">Joindre une photo…</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0] ?? null;
          e.currentTarget.value = "";
          if (!file) return;
          try {
            onChange(await readPhotoFile(file));
          } catch (err) {
            onError?.(err instanceof Error ? err.message : "Erreur lors du chargement.");
          }
        }}
      />
    </label>
  );
}
