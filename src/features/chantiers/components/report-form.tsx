import { useState } from "react";
import { Users, Camera, ChevronDown, Send, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { reportChantierIssue, type ReportUrgency } from "@/lib/chantier-reports.functions";
import { UrgencyPicker } from "@/components/ui/urgency-picker";

type ReportPhoto = {
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
  dataBase64: string;
  previewUrl: string;
};

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
  const [timeEstimate, setTimeEstimate] = useState("");
  const [peopleCount, setPeopleCount] = useState<number | "">("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<ReportUrgency | "">("");
  const [photo, setPhoto] = useState<ReportPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Progressive : le reste n'apparaît qu'une fois les champs clés remplis
  const showLocation = title.trim().length > 0;
  const showMain = showLocation && location.trim().length > 0;

  function resetForm() {
    setTitle("");
    setLocation("");
    setTimeEstimate("");
    setPeopleCount("");
    setDetailsOpen(false);
    setDescription("");
    setUrgency("");
    setPhoto(null);
  }

  async function selectPhoto(file: File | null) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
    if (!allowed.includes(file.type as (typeof allowed)[number])) {
      toast.error("Choisis une photo JPG, PNG, WebP ou HEIC.");
      return;
    }
    if (file.size > 8_000_000) {
      toast.error("La photo dépasse 8 Mo.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Lecture impossible."));
      reader.readAsDataURL(file);
    });
    setPhoto({
      name: file.name,
      mimeType: file.type as ReportPhoto["mimeType"],
      dataBase64: dataUrl.split(",")[1] ?? "",
      previewUrl: dataUrl,
    });
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
      await call({
        data: {
          reportedBy: identifiedName,
          title: title.trim(),
          category: "tache",
          location: location.trim(),
          timeEstimate: timeEstimate.trim() || undefined,
          personDaysEstimate: typeof peopleCount === "number" ? peopleCount : undefined,
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
    <div>
      {/* ── Nom ── */}
      <div className="pb-3 border-b border-border">
        <div className="label-micro mb-1">Nom</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder="Nom de la tâche *"
          className="w-full bg-transparent text-[15px] font-medium outline-none placeholder:text-muted-foreground/40"
        />
      </div>

      {/* ── Lieu (spécifique au signalement) ── */}
      {showLocation && (
        <div className="pb-3 border-b border-border pt-3">
          <div className="label-micro mb-1">Lieu *</div>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ex : toit de la grange, cabane à outils…"
            className="w-full bg-transparent text-[15px] font-medium outline-none placeholder:text-muted-foreground/40"
            autoFocus
          />
        </div>
      )}

      {/* ── Durée + Personnes ── */}
      {showMain && (
        <>
          <div className="flex items-stretch border-b border-border">
            <div className="flex-1 py-3 pr-3">
              <div className="label-micro mb-1 flex items-center gap-1">⏱ Durée</div>
              <input
                value={timeEstimate}
                onChange={(e) => setTimeEstimate(e.target.value)}
                placeholder="ex: 2h, 1 jour, 30 min"
                className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground/40"
              />
              <div className="mt-0.5 h-3.5 text-[10px] font-medium">
                {!timeEstimate && <span className="text-muted-foreground/50">optionnel</span>}
              </div>
            </div>
            <div className="w-px bg-border self-stretch my-3" />
            <div className="flex-1 py-3 pl-3">
              <div className="label-micro mb-1 flex items-center gap-1">
                <Users className="h-3 w-3" /> Personnes
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
              <div className="mt-0.5 h-3.5 text-[10px] font-medium">
                <span className="text-muted-foreground/50">optionnel</span>
              </div>
            </div>
          </div>

          {/* ── Toggle détails ── */}
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 py-3 text-[11px] font-semibold text-muted-foreground border-b border-border"
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
              <div className="flex items-start gap-3 py-3 border-b border-border">
                <div className="mt-0.5 shrink-0 text-muted-foreground/60 text-[13px]">📋</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="label-micro">Description</div>
                    <div className="text-[9px] text-muted-foreground/50">optionnel</div>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Contexte, contraintes…"
                    rows={2}
                    className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>

              {/* Photo */}
              <div className="flex items-start gap-3 py-3 border-b border-border">
                <div className="mt-0.5 shrink-0 text-muted-foreground/60">
                  <Camera className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="label-micro">Photo</div>
                    <div className="text-[9px] text-muted-foreground/50">optionnel</div>
                  </div>
                  {photo ? (
                    <div className="relative inline-block">
                      <img
                        src={photo.previewUrl}
                        alt="Aperçu"
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPhoto(null)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive transition"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition">
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span className="underline underline-offset-2">Joindre une photo…</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => {
                          void selectPhoto(e.target.files?.[0] ?? null);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Urgence */}
              <div className="py-3">
                <div className="label-micro mb-2">Urgence</div>
                <UrgencyPicker
                  value={urgency}
                  onChange={(v) => setUrgency((prev) => (prev === v ? "" : v))}
                />
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="pt-4 pb-6">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="tap lift flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-accent px-4 py-3.5 text-sm font-semibold text-brand-accent-foreground disabled:opacity-50 shadow-card"
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
