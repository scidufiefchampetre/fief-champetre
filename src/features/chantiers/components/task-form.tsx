import { useRef, useState } from "react";
import { Camera, ChevronDown, Plus, ShoppingCart, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UrgencyPicker } from "@/components/ui/urgency-picker";
import type { ReportUrgency } from "@/lib/chantier-reports.functions";
import { addChantierTask, addUnplannedChantierTask } from "@/lib/chantier.functions";
import { parseDurationToMinutes, durationLabel } from "./task-execution-form";

type LocalPhoto = { name: string; previewUrl: string; dataBase64: string; mimeType: string };

function parseDurationInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  return parseDurationToMinutes(trimmed);
}

function durationHint(raw: string): { minutes: number; label: string } | null {
  const minutes = parseDurationInput(raw);
  if (!raw.trim()) return null;
  if (minutes === 0) return { minutes: 0, label: "Non reconnu" };
  return { minutes, label: durationLabel(minutes) };
}

export function TaskForm({
  chantierId,
  startDate,
  mode = "user",
  password,
  onClose,
  onCreated,
  preview = false,
  initialLabel = "",
}: {
  chantierId: string;
  startDate: string;
  mode?: "user" | "admin";
  password?: string;
  onClose: () => void;
  onCreated?: () => void;
  preview?: boolean;
  initialLabel?: string;
}) {
  const addUser = useServerFn(addUnplannedChantierTask);
  const addAdmin = useServerFn(addChantierTask);
  const queryClient = useQueryClient();

  const [label, setLabel] = useState(initialLabel);
  const [saving, setSaving] = useState(false);
  const [durationRaw, setDurationRaw] = useState("");
  const [peopleCount, setPeopleCount] = useState<number | "">("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [toBuyItems, setToBuyItems] = useState<string[]>([]);
  const [toBuyInput, setToBuyInput] = useState("");
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [urgency, setUrgency] = useState<ReportUrgency | "">("");
  const toBuyRef = useRef<HTMLInputElement>(null);

  const hint = durationHint(durationRaw);
  const durationMinutes = hint?.minutes ?? 0;
  const durationValid = durationMinutes > 0;
  const peopleValid = typeof peopleCount === "number" && peopleCount > 0;
  const canSubmit = label.trim().length > 0 && durationValid && peopleValid;

  function addToBuyItem() {
    const val = toBuyInput.trim();
    if (!val) return;
    setToBuyItems((prev) => [...prev, val]);
    setToBuyInput("");
    toBuyRef.current?.focus();
  }

  async function selectPhoto(file: File | null) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowed.includes(file.type)) return toast.error("Choisis une photo JPG, PNG ou WebP.");
    if (file.size > 8_000_000) return toast.error("La photo dépasse 8 Mo.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Lecture impossible."));
      reader.readAsDataURL(file);
    });
    setPhoto({
      name: file.name,
      mimeType: file.type,
      dataBase64: dataUrl.split(",")[1] ?? "",
      previewUrl: dataUrl,
    });
  }

  async function handleAddToList() {
    if (!canSubmit || saving) return;
    if (preview) {
      toast.success("Aperçu : aucune donnée enregistrée.");
      onCreated?.();
      onClose();
      return;
    }
    setSaving(true);
    try {
      if (mode === "admin" && password) {
        await addAdmin({
          data: {
            chantierId,
            startDate,
            label: label.trim(),
            password,
            estimatedDurationMinutes: durationMinutes || undefined,
            estimatedPeopleCount: typeof peopleCount === "number" ? peopleCount : undefined,
            urgency: urgency || undefined,
          },
        });
      } else {
        await addUser({
          data: {
            chantierId,
            startDate,
            label: label.trim(),
            urgency: urgency || undefined,
            estimatedDurationMinutes: durationMinutes || undefined,
            estimatedPeopleCount: typeof peopleCount === "number" ? peopleCount : undefined,
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["chantier-tasks"] });
      toast.success(`"${label.trim()}" enregistrée.`);
      setLabel("");
      setDurationRaw("");
      setPeopleCount("");
      setDescription("");
      setToBuyItems([]);
      setUrgency("");
      setPhoto(null);
      setDetailsOpen(false);
      onCreated?.();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* ── Nom ── */}
      <div className="pb-4 border-b border-border">
        <div className="label-micro mb-2">Nom</div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddToList()}
          autoFocus
          placeholder="Nom de la tâche *"
          className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/40 leading-snug"
        />
      </div>

      {/* ── Durée + Personnes ── */}
      <div className="flex items-stretch border-b border-border">
        <div className="flex-1 py-4 pr-4">
          <div className="label-micro mb-2 flex items-center gap-1">⏱ Durée *</div>
          <input
            value={durationRaw}
            onChange={(e) => setDurationRaw(e.target.value)}
            placeholder="ex: 2h, 1 jour, 30 min"
            className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground/40"
          />
          <div className="mt-1 h-4 text-[10px] font-semibold">
            {!durationRaw && <span className="text-brand-accent">Requis</span>}
            {durationRaw && durationValid && <span className="text-success-foreground">≈ {hint?.label}</span>}
            {durationRaw && !durationValid && (
              <span className="text-destructive/70">Non reconnu</span>
            )}
          </div>
        </div>
        <div className="w-px bg-border self-stretch my-4" />
        <div className="flex-1 py-4 pl-4">
          <div className="label-micro mb-2 flex items-center gap-1">
            <Users className="h-3 w-3" /> Personnes *
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="1"
              max="20"
              value={peopleCount}
              onChange={(e) =>
                setPeopleCount(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))
              }
              placeholder="0"
              className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground/40"
            />
            <span className="shrink-0 text-[10px] text-muted-foreground">pers.</span>
          </div>
          <div className="mt-1 h-4 text-[10px] font-semibold">
            {(peopleCount === "" || peopleCount === 0) && (
              <span className="text-brand-accent">Requis</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Toggle détails ── */}
      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="tap flex w-full items-center gap-1.5 py-4 text-[11px] font-semibold text-muted-foreground border-b border-border hover:text-foreground transition"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
        />
        {detailsOpen ? "Masquer les détails" : "Détails optionnels"}
      </button>

      {/* ── Détails ── */}
      {detailsOpen && (
        <div>
          {/* Description */}
          <div className="flex items-start gap-3 py-4 border-b border-border">
            <div className="mt-0.5 shrink-0 text-muted-foreground/60 text-[13px]">📋</div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="label-micro">Description</div>
                <div className="text-[9px] text-muted-foreground/50">optionnel</div>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexte, contraintes…"
                rows={3}
                className="w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </div>

          {/* À acheter — chips */}
          <div className="flex items-start gap-3 py-4 border-b border-border">
            <div className="mt-0.5 shrink-0 text-muted-foreground/60">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="label-micro">À acheter</div>
                <div className="text-[9px] text-muted-foreground/50">optionnel</div>
              </div>
              {toBuyItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {toBuyItems.map((item, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => setToBuyItems((prev) => prev.filter((_, idx) => idx !== i))}
                        className="tap ml-0.5 text-muted-foreground hover:text-foreground transition"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 border-t border-border/60 pt-2.5">
                <span className="text-[13px] font-bold text-brand-accent">+</span>
                <input
                  ref={toBuyRef}
                  value={toBuyInput}
                  onChange={(e) => setToBuyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToBuyItem();
                    }
                  }}
                  placeholder="Ajouter un article…"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40"
                />
                {toBuyInput.trim() && (
                  <button
                    type="button"
                    onClick={addToBuyItem}
                    className="tap text-[11px] font-semibold text-brand-accent"
                  >
                    Ajouter
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Photo */}
          <div className="flex items-start gap-3 py-4 border-b border-border">
            <div className="mt-0.5 shrink-0 text-muted-foreground/60">
              <Camera className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="label-micro">Photo avant</div>
                <div className="text-[9px] text-muted-foreground/50">optionnel</div>
              </div>
              {photo ? (
                <div className="relative inline-block">
                  <img
                    src={photo.previewUrl}
                    alt="Avant"
                    className="h-20 w-20 rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="tap absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive transition"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition">
                  <span className="underline underline-offset-2">Joindre une photo…</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => selectPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Urgence */}
          <div className="py-4">
            <div className="label-micro mb-3">Urgence</div>
            <UrgencyPicker
              value={urgency}
              onChange={(v) => setUrgency((prev) => (prev === v ? "" : v))}
            />
          </div>
        </div>
      )}

      {/* ── Actions sticky ── */}
      <div className="sticky bottom-0 mt-2 flex items-center gap-2 bg-background/90 pb-4 pt-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="tap rounded-2xl border border-border bg-card px-4 py-3.5 text-[13px] font-semibold text-muted-foreground hover:bg-secondary transition"
        >
          Fermer
        </button>
        <button
          type="button"
          onClick={handleAddToList}
          disabled={!canSubmit || saving}
          className="tap lift flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-accent px-4 py-3.5 text-[13px] font-semibold text-brand-accent-foreground shadow-card disabled:opacity-40"
        >
          {saving ? "Enregistrement…" : <><Plus className="h-4 w-4" /> Enregistrer</>}
        </button>
      </div>
    </div>
  );
}

export function TaskFormSheet({
  open,
  onOpenChange,
  title = "Nouvelle tâche",
  initialLabel,
  ...formProps
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  initialLabel?: string;
} & Omit<React.ComponentProps<typeof TaskForm>, "onClose" | "initialLabel">) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl px-5 pb-2 pt-6"
      >
        <SheetHeader className="mb-5">
          <SheetTitle className="page-title text-left">{title}.</SheetTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Propose une tâche pour les prochains chantiers. Elle sera visible dans le backlog admin.
          </p>
        </SheetHeader>
        <TaskForm {...formProps} initialLabel={initialLabel} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
