import { useState } from "react";
import { ChevronDown, Send } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { reportChantierIssue, type ReportUrgency } from "@/lib/chantier-reports.functions";
import { UrgencyPicker } from "@/components/ui/urgency-picker";
import {
  NumberStepper,
  PhotoField,
  DurationSelect,
  DURATION_OPTIONS,
  type LocalPhoto,
} from "@/components/ui/form-primitives";

export function ReportForm({
  identifiedName,
  onSubmitted,
}: {
  identifiedName: string;
  onSubmitted?: () => void;
}) {
  const call = useServerFn(reportChantierIssue);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [peopleCount, setPeopleCount] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<ReportUrgency | "">("");
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showLocation = title.trim().length > 0;
  const showMain = showLocation && location.trim().length > 0;

  function resetForm() {
    setTitle("");
    setLocation("");
    setDurationMinutes(0);
    setPeopleCount(0);
    setDetailsOpen(false);
    setDescription("");
    setUrgency("");
    setPhoto(null);
  }

  async function handleSubmit() {
    if (!identifiedName) {
      toast.error("Identifie-toi d'abord.");
      return;
    }
    if (!title.trim()) {
      toast.error("Donne un nom à la tâche.");
      return;
    }
    if (!location.trim()) {
      toast.error("Précise le lieu.");
      return;
    }
    setSubmitting(true);
    try {
      const timeEstimateLabel = durationMinutes
        ? DURATION_OPTIONS.find((o) => o.value === durationMinutes)?.label
        : undefined;
      await call({
        data: {
          reportedBy: identifiedName,
          title: title.trim(),
          category: "tache",
          location: location.trim(),
          timeEstimate: timeEstimateLabel,
          personDaysEstimate: peopleCount || undefined,
          description: description.trim(),
          urgency: urgency || "important",
          photo: photo
            ? { name: photo.name, mimeType: photo.mimeType, dataBase64: photo.dataBase64 }
            : undefined,
        },
      });
      resetForm();
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'envoi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* ── Nom ── */}
      <div className="pb-4 border-b border-border">
        <div className="label-micro mb-2">Nom</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder="Nom de la tâche *"
          className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/40 leading-snug"
        />
      </div>

      {/* ── Lieu ── */}
      {showLocation && (
        <div className="py-4 border-b border-border">
          <div className="label-micro mb-2">Lieu *</div>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ex : toit de la grange, cabane à outils…"
            className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/40 leading-snug"
          />
        </div>
      )}

      {/* ── Corps du formulaire ── */}
      {showMain && (
        <>
          {/* Durée */}
          <div className="py-4 border-b border-border">
            <div className="label-micro mb-2">⏱ Durée estimée</div>
            <DurationSelect value={durationMinutes} onChange={setDurationMinutes} placeholder="Optionnel…" />
          </div>

          {/* Personnes */}
          <div className="py-4 border-b border-border">
            <div className="label-micro mb-2">👥 Personnes estimées</div>
            <NumberStepper value={peopleCount} onChange={setPeopleCount} min={0} max={20} />
          </div>

          {/* Toggle détails */}
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

              {/* Photo */}
              <div className="flex items-start gap-3 py-4 border-b border-border">
                <div className="mt-0.5 shrink-0 text-muted-foreground/60 text-[13px]">📸</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="label-micro">Photo</div>
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

          {/* Action sticky */}
          <div className="sticky bottom-0 mt-2 bg-background/90 pb-4 pt-3 backdrop-blur-md">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="tap lift flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-accent px-4 py-3.5 text-sm font-bold text-brand-accent-foreground shadow-card disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
