import { useState } from "react";
import { Camera, Check, Clock, Image, Plus, Trash2, User, X } from "lucide-react";
import type { ChantierTask, TaskPhase } from "@/lib/chantier-types";
import { TaskExecutionForm } from "./task-execution-form";

export type TaskItemTask = ChantierTask & {
  estimatedPeopleCount?: number;
  estimatedDurationMinutes?: number;
  isPending?: boolean;
};

const PHASE_BUTTON: Record<TaskPhase, string> = {
  avant: "Préparer",
  pendant: "Renseigner",
  apres: "Compléter",
};

export function TaskItem({
  task,
  chantierId,
  startDate,
  phase = "pendant",
  participantNames = [],
  onDelete,
  toggling = false,
  preview = false,
}: {
  task: TaskItemTask;
  chantierId: string;
  startDate: string;
  phase?: TaskPhase;
  participantNames?: string[];
  onDelete?: () => void;
  toggling?: boolean;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [photoBefore, setPhotoBefore] = useState<string | null>(task.photoBefore ?? null);

  const isPending = task.isPending ?? false;
  const isReal = task.done && !isPending;

  const people = task.peopleCount || task.estimatedPeopleCount || 0;
  const duration = task.durationMinutes || task.estimatedDurationMinutes || 0;

  const hasPhoto = !!task.resultPhotoUrl || !!photoBefore;

  async function selectPhotoBefore(file: File | null) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Lecture impossible."));
      reader.readAsDataURL(file);
    });
    setPhotoBefore(dataUrl);
  }

  const showActionButton = !task.done && !isPending;
  const buttonLabel = showActionButton ? (open ? "Fermer" : PHASE_BUTTON[phase]) : null;

  return (
    <div>
      <div className="flex items-center gap-2.5 py-2">
        {/* Statut */}
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
            isPending
              ? "border-dashed border-brand-accent/40 bg-brand-accent/5"
              : task.done
                ? "border-brand-secondary bg-brand-secondary text-brand-secondary-foreground"
                : "border-foreground/20 bg-background"
          } ${toggling ? "opacity-40" : ""}`}
        >
          {task.done && !isPending && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>

        {/* Label */}
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            task.done ? "line-through text-muted-foreground/60" : "text-foreground"
          }`}
        >
          {task.label}
        </span>

        {/* Badge photo discret */}
        {hasPhoto && !open && (
          <span className="shrink-0 text-muted-foreground/40">
            <Image className="h-3 w-3" />
          </span>
        )}

        {/* Personnes */}
        {people > 0 && (
          <span
            className={`flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums ${
              isReal ? "font-medium text-brand-secondary" : "text-muted-foreground"
            }`}
          >
            <User className="h-3 w-3" />
            {!isReal && "~"}
            {people}
          </span>
        )}

        {/* Durée */}
        {duration > 0 && (
          <span
            className={`flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums ${
              isReal ? "font-medium text-brand-secondary" : "text-muted-foreground"
            }`}
          >
            <Clock className="h-3 w-3" />
            {!isReal && "~"}
            {durationLabelShort(duration)}
          </span>
        )}

        {/* Badge "À valider" */}
        {isPending && (
          <span className="shrink-0 rounded-full bg-brand-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-accent">
            À valider
          </span>
        )}

        {/* Bouton dynamique selon phase — DA unifié */}
        {buttonLabel && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 text-[11px] font-semibold text-brand-secondary"
          >
            {buttonLabel}
          </button>
        )}

        {/* Suppression */}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Supprimer la tâche"
            className="shrink-0 p-1 text-muted-foreground/40 hover:text-destructive transition"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Panneau déployé — contenu adapté à la phase */}
      {open && !isPending && !task.done && (
        <div className="mb-1 ml-7">
          {phase === "avant" ? (
            <AvantPanel
              photoBefore={photoBefore}
              onSelectPhoto={selectPhotoBefore}
              onClear={() => setPhotoBefore(null)}
              onClose={() => setOpen(false)}
            />
          ) : (
            <TaskExecutionForm
              task={task}
              chantierId={chantierId}
              startDate={startDate}
              participantNames={participantNames}
              onClose={() => setOpen(false)}
              preview={preview}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AvantPanel({
  photoBefore,
  onSelectPhoto,
  onClear,
  onClose,
}: {
  photoBefore: string | null;
  onSelectPhoto: (file: File) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mb-2 rounded-xl border border-border/60 bg-secondary/30 p-3">
      <p className="text-[11px] text-muted-foreground">
        Documente l'état <span className="font-semibold text-foreground">avant</span> le chantier,
        utile pour mesurer le résultat.
      </p>

      <div className="mt-2.5">
        {photoBefore ? (
          <div className="relative inline-block">
            <img src={photoBefore} alt="Avant" className="h-24 rounded-xl object-cover" />
            <button
              type="button"
              onClick={onClear}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition">
            <Camera className="h-3.5 w-3.5" />
            Photo "avant" (optionnelle)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSelectPhoto(f);
              }}
            />
          </label>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

function durationLabelShort(minutes: number): string {
  if (minutes === 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const half = minutes % 60 === 30;
  if (minutes >= 480 && minutes % 480 === 0) return `${minutes / 480} j.`;
  if (minutes === 240) return "1/2 j.";
  return `${h}${half ? " h 30" : " h"}`;
}

export function AddTaskButton({
  onClick,
  label = "Ajouter une tâche",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
