import { useRef, useState } from "react";
import { ChevronDown, Plus, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UrgencyPicker } from "@/components/ui/urgency-picker";
import type { ReportUrgency } from "@/lib/chantier-reports.functions";
import { addChantierTask, addUnplannedChantierTask } from "@/lib/chantier.functions";
import {
  NumberStepper,
  PhotoField,
  DurationInput,
  type LocalPhoto,
} from "@/components/ui/form-primitives";

export function TaskForm({
  chantierId,
  startDate,
  mode = "user",
  password,
  onClose,
  onCreated,
  onConfirmed,
  preview = false,
  initialLabel = "",
}: {
  chantierId?: string;
  startDate?: string;
  mode?: "user" | "admin";
  password?: string;
  onClose: () => void;
  onCreated?: () => void;
  onConfirmed?: (label: string, durationMinutes: number, peopleCount: number) => void;
  preview?: boolean;
  initialLabel?: string;
}) {
  const addUser = useServerFn(addUnplannedChantierTask);
  const addAdmin = useServerFn(addChantierTask);
  const queryClient = useQueryClient();

  const [label, setLabel] = useState(initialLabel);
  const [saving, setSaving] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [peopleCount, setPeopleCount] = useState(1);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [toBuyItems, setToBuyItems] = useState<string[]>([]);
  const [toBuyInput, setToBuyInput] = useState("");
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [urgency, setUrgency] = useState<ReportUrgency | "">("");
  const toBuyRef = useRef<HTMLInputElement>(null);

  const canSubmit = label.trim().length > 0 && durationMinutes > 0 && peopleCount > 0;

  function addToBuyItem() {
    const val = toBuyInput.trim();
    if (!val) return;
    setToBuyItems((prev) => [...prev, val]);
    setToBuyInput("");
    toBuyRef.current?.focus();
  }

  async function handleAddToList() {
    if (!canSubmit || saving) return;
    if (onConfirmed) {
      onConfirmed(label.trim(), durationMinutes, peopleCount);
      onCreated?.();
      onClose();
      return;
    }
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
            chantierId: chantierId!,
            startDate: startDate!,
            label: label.trim(),
            password,
            estimatedDurationMinutes: durationMinutes || undefined,
            estimatedPeopleCount: peopleCount || undefined,
            urgency: urgency || undefined,
          },
        });
      } else {
        await addUser({
          data: {
            chantierId: chantierId!,
            startDate: startDate!,
            label: label.trim(),
            urgency: urgency || undefined,
            estimatedDurationMinutes: durationMinutes || undefined,
            estimatedPeopleCount: peopleCount || undefined,
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["chantier-tasks"] });
      toast.success(`"${label.trim()}" enregistrée.`);
      setLabel("");
      setDurationMinutes(0);
      setPeopleCount(1);
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

      {/* ── Durée ── */}
      <div className="py-4 border-b border-border">
        <div className="label-micro mb-2">⏱ Durée *</div>
        <DurationInput value={durationMinutes} onChange={setDurationMinutes} />
        {!durationMinutes && (
          <p className="mt-1.5 text-[10px] font-semibold text-brand-accent">Requis</p>
        )}
      </div>

      {/* ── Personnes ── */}
      <div className="py-4 border-b border-border">
        <div className="label-micro mb-2">👥 Personnes *</div>
        <NumberStepper value={peopleCount} onChange={setPeopleCount} min={1} max={20} />
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

          {/* À acheter */}
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
            <div className="mt-0.5 shrink-0 text-muted-foreground/60 text-[13px]">📸</div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="label-micro">Photo avant</div>
                <div className="text-[9px] text-muted-foreground/50">optionnel</div>
              </div>
              <PhotoField photo={photo} onChange={setPhoto} onError={(msg) => toast.error(msg)} />
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
  subtitle,
  initialLabel,
  ...formProps
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  subtitle?: string;
  initialLabel?: string;
} & Omit<React.ComponentProps<typeof TaskForm>, "onClose" | "initialLabel">) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] flex-col rounded-t-3xl px-5 pb-2 pt-6"
      >
        <SheetHeader className="mb-5 shrink-0">
          <SheetTitle className="page-title text-left">{title}.</SheetTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            {subtitle ?? "Propose une tâche pour les prochains chantiers. Elle sera visible dans le backlog admin."}
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <TaskForm {...formProps} initialLabel={initialLabel} onClose={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
