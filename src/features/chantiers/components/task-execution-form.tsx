/* eslint-disable react-refresh/only-export-components -- options partagées par la fiche chantier */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Clock, ExternalLink, Users } from "lucide-react";
import { toast } from "sonner";

import { Toggle } from "@/core/components/toggle";
import { updateChantierTaskExecution } from "@/lib/chantier.functions";
import type { ChantierTask } from "@/lib/chantier-types";

type TaskPhoto = {
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
  dataBase64: string;
  previewUrl: string;
};

export const HALF_HOUR_OPTIONS = Array.from({ length: 33 }, (_, index) => index * 30);
/** Normalise une durée saisie en texte libre vers une notation courte : "demi-journée" → "1/2 j.", "2 journées" → "2 j." */
export function shortDurationLabel(text: string) {
  const t = text.trim().toLowerCase();
  if (!t) return "";
  if (/demi|1\/2/.test(t)) return "1/2 j.";
  if (/journ|jour/.test(t)) {
    const m = t.match(/(\d+(?:[.,]\d+)?)/);
    return `${m ? m[1] : "1"} j.`;
  }
  return text;
}

/** Convertit une durée saisie en texte libre vers des minutes (1 j. = 8 h). Retourne 0 si illisible. */
export function parseDurationToMinutes(text: string) {
  const t = text.trim().toLowerCase();
  if (!t) return 0;
  if (/demi|1\/2/.test(t)) return 240;
  const m = t.match(/(\d+(?:[.,]\d+)?)/);
  const n = m ? parseFloat(m[1].replace(",", ".")) : NaN;
  if (Number.isNaN(n)) return 0;
  if (/journ|jour|\bj\b|j\./.test(t)) return Math.round(n * 480);
  if (/min/.test(t)) return Math.round(n);
  if (/h/.test(t)) return Math.round(n * 60);
  return 0;
}

export function durationLabel(minutes: number) {
  if (minutes === 0) return "Non renseigné";
  if (minutes >= 240 && minutes % 240 === 0) {
    const days = minutes / 480;
    if (days === 0.5) return "1/2 j.";
    return `${Number.isInteger(days) ? days : `${Math.floor(days)} 1/2`} j.`;
  }
  if (minutes === 30) return "30 min";
  const hours = Math.floor(minutes / 60);
  const half = minutes % 60 === 30;
  return `${hours ? `${hours} h` : ""}${half ? `${hours ? " " : ""}30` : ""}`;
}

export function TaskExecutionForm({
  task,
  chantierId,
  startDate,
  participantNames,
  onClose,
  preview = false,
}: {
  task: ChantierTask;
  chantierId: string;
  startDate: string;
  participantNames: string[];
  onClose: () => void;
  preview?: boolean;
}) {
  const queryClient = useQueryClient();
  const saveExecution = useServerFn(updateChantierTaskExecution);
  const [done, setDone] = useState(task.done);
  const [note, setNote] = useState(task.note);
  const [participants, setParticipants] = useState(
    () =>
      new Set(
        task.participants
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
      ),
  );
  const [duration, setDuration] = useState(String(task.durationMinutes || 0));
  const [peopleCount, setPeopleCount] = useState(String(task.peopleCount || 0));
  const [photo, setPhoto] = useState<TaskPhoto | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleParticipant(name: string) {
    setParticipants((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      const count = Number.parseInt(peopleCount, 10) || 0;
      if (count === current.size || count === 0) setPeopleCount(String(next.size));
      return next;
    });
  }

  async function selectPhoto(file: File | null) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
    if (!allowed.includes(file.type as (typeof allowed)[number]))
      return toast.error("Choisis une photo JPG, PNG, WebP ou HEIC.");
    if (file.size > 8_000_000) return toast.error("La photo dépasse 8 Mo.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Lecture de la photo impossible."));
      reader.readAsDataURL(file);
    });
    setPhoto({
      name: file.name,
      mimeType: file.type as TaskPhoto["mimeType"],
      dataBase64: dataUrl.split(",")[1] ?? "",
      previewUrl: dataUrl,
    });
  }

  async function save() {
    if (preview) {
      toast.success("Aperçu validé : aucune donnée enregistrée.");
      onClose();
      return;
    }
    setSaving(true);
    try {
      await saveExecution({
        data: {
          chantierId,
          startDate,
          taskId: task.id,
          done,
          note,
          participants: Array.from(participants),
          durationMinutes: Math.max(0, Number.parseInt(duration, 10) || 0),
          peopleCount: Math.max(0, Number.parseInt(peopleCount, 10) || 0),
          photo: photo
            ? { name: photo.name, mimeType: photo.mimeType, dataBase64: photo.dataBase64 }
            : undefined,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["chantier-tasks", chantierId, startDate] });
      toast.success("Mission mise à jour.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’enregistrer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-2 rounded-xl border border-brand-secondary/20 bg-brand-secondary/5 p-3">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[11px] font-bold">Mission terminée</span>
          <span className="block text-[9px] text-muted-foreground">
            Compte-rendu facultatif, mais recommandé.
          </span>
        </span>
        <Toggle
          compact
          checked={done}
          onChange={() => setDone((value) => !value)}
          label="Mission terminée"
        />
      </label>

      <div className="mt-3">
        <div className="mb-1.5 text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
          Participants
        </div>
        <div className="flex flex-wrap gap-1.5">
          {participantNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleParticipant(name)}
              className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${participants.has(name) ? "border-brand-secondary bg-brand-secondary/10 text-brand-secondary" : "border-border bg-card text-muted-foreground"}`}
            >
              {participants.has(name) ? "✓ " : ""}
              {name}
            </button>
          ))}
          {!participantNames.length && (
            <span className="text-[9px] text-muted-foreground">Aucun adulte inscrit.</span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-card p-2">
          <div className="mb-1 flex items-center gap-1 text-[8px] font-bold uppercase text-muted-foreground">
            <Clock className="h-3 w-3" />
            Temps passé
          </div>
          <select
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            className="w-full rounded-md bg-secondary/50 px-2 py-1.5 text-[10px] font-semibold outline-none"
          >
            {HALF_HOUR_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {durationLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <label className="rounded-lg border border-border bg-card p-2">
          <span className="mb-1 flex items-center gap-1 text-[8px] font-bold uppercase text-muted-foreground">
            <Users className="h-3 w-3" />
            Effectif réel
          </span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              value={peopleCount}
              onChange={(event) => setPeopleCount(event.target.value)}
              className="w-full rounded-md bg-secondary/50 px-1.5 py-1 text-center text-[10px]"
            />
            <span className="text-[8px]">pers.</span>
          </span>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-brand-secondary/30 bg-card px-2 py-1.5 text-[9px] font-semibold text-brand-secondary">
          {photo ? (
            <img src={photo.previewUrl} alt="Aperçu" className="h-7 w-7 rounded-md object-cover" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {photo ? "Changer" : task.resultPhotoUrl ? "Remplacer" : "Photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            className="sr-only"
            onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
          />
        </label>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Précision sur le résultat…"
          className="min-w-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] outline-none focus:border-ring"
        />
      </div>
      {task.resultPhotoUrl && !photo && (
        <a
          href={task.resultPhotoUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-[8px] font-semibold text-brand-secondary"
        >
          Voir la photo actuelle <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1.5 text-[9px] font-semibold text-muted-foreground"
        >
          Fermer
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand-secondary px-3 py-1.5 text-[9px] font-semibold text-brand-secondary-foreground disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
