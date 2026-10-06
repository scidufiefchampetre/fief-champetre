import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Check, Clock, Image, Pencil, Plus, ShoppingCart, Trash2, User, X } from "lucide-react";
import { toast } from "sonner";
import { updateChantierTaskNote } from "@/lib/chantier.functions";
import type { ChantierTask, TaskPhase } from "@/lib/chantier-types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TaskExecutionForm } from "./task-execution-form";

const URGENCY_LABEL: Record<string, string> = {
  tres_urgent: "🔴 Très urgent",
  urgent: "🟠 Urgent",
  important: "🟡 Important",
  must_have: "🔵 Must-have",
};

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
  const [detailOpen, setDetailOpen] = useState(false);
  const [photoBefore, setPhotoBefore] = useState<string | null>(task.photoBeforeUrl ?? null);
  const queryClient = useQueryClient();
  const saveTask = useServerFn(updateChantierTaskNote);
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(task.label);
  const [editDescription, setEditDescription] = useState(task.description);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setEditLabel(task.label);
    setEditDescription(task.description);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editLabel.trim()) {
      toast.error("L'intitulé ne peut pas être vide.");
      return;
    }
    setSaving(true);
    try {
      await saveTask({
        data: {
          chantierId,
          startDate,
          taskId: task.id,
          label: editLabel.trim(),
          note: editDescription,
        },
      });
      await queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          ["chantier-tasks", "all-chantier-tasks", "task-catalog"].includes(q.queryKey[0]),
      });
      toast.success("Tâche modifiée.");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La modification a échoué.");
    } finally {
      setSaving(false);
    }
  }

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

        {/* Label — tap to see details */}
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className={`min-w-0 flex-1 truncate text-left text-sm ${
            task.done ? "line-through text-muted-foreground/60" : "text-foreground"
          }`}
        >
          {task.label}
        </button>

        {/* Badge photo discret */}
        {hasPhoto && !open && (
          <span className="shrink-0 text-muted-foreground/40">
            <Image className="h-3 w-3" />
          </span>
        )}

        {/* Personnes */}
        {people > 0 && (
          <span
            className={`flex shrink-0 items-center gap-0.5 text-xs tabular-nums ${
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
            className={`flex shrink-0 items-center gap-0.5 text-xs tabular-nums ${
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
          <span className="shrink-0 rounded-full bg-brand-accent/10 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-brand-accent">
            À valider
          </span>
        )}

        {/* Bouton dynamique selon phase — DA unifié */}
        {buttonLabel && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 text-xs font-semibold text-brand-secondary"
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

      {/* Sheet de détail — clic sur le label */}
      <Sheet
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v);
          if (!v) setEditing(false);
        }}
      >
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl px-5 pb-10 pt-6">
          <SheetHeader className="mb-4">
            <div className="flex items-start gap-3">
              <span
                className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  task.done
                    ? "border-brand-secondary bg-brand-secondary text-brand-secondary-foreground"
                    : "border-foreground/20 bg-background"
                }`}
              >
                {task.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <SheetTitle className={`text-left text-xl font-black leading-snug ${task.done ? "line-through text-muted-foreground/60" : ""}`}>
                {task.label}
              </SheetTitle>
            </div>
            <div className="ml-8 mt-2 flex flex-wrap gap-1.5">
              {task.taskStatus && (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-2xs font-semibold text-muted-foreground">
                  {task.taskStatus}
                </span>
              )}
              {task.urgency && URGENCY_LABEL[task.urgency] && (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-2xs font-semibold">
                  {URGENCY_LABEL[task.urgency]}
                </span>
              )}
              {people > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-2xs font-semibold text-muted-foreground">
                  <User className="h-2.5 w-2.5" /> ~{people} pers.
                </span>
              )}
              {duration > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-2xs font-semibold text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" /> ~{durationLabelShort(duration)}
                </span>
              )}
            </div>
          </SheetHeader>

          {editing ? (
            <div className="space-y-3">
              <label className="block">
                <div className="label-micro mb-1.5">Intitulé</div>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  maxLength={200}
                  className="input-field"
                />
              </label>
              <label className="block">
                <div className="label-micro mb-1.5">Description</div>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="input-field resize-none py-3"
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="tap flex-1 rounded-2xl border border-border px-4 py-3.5 text-sm font-semibold disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="tap lift flex-1 rounded-2xl bg-brand-secondary px-4 py-3.5 text-sm font-semibold text-brand-secondary-foreground shadow-card disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          ) : (
          <div className="space-y-4">
            {task.description && (
              <div>
                <div className="label-micro mb-1.5">Description</div>
                <p className="text-sm leading-relaxed text-muted-foreground">{task.description}</p>
              </div>
            )}

            {task.toBuyItems && task.toBuyItems.length > 0 && (
              <div>
                <div className="label-micro mb-1.5 flex items-center gap-1">
                  <ShoppingCart className="h-2.5 w-2.5" /> À acheter
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {task.toBuyItems.map((item, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(task.photoBeforeUrl || photoBefore) && (
              <div>
                <div className="label-micro mb-1.5">Photo avant</div>
                <img
                  src={task.photoBeforeUrl || photoBefore || ""}
                  alt="Photo avant"
                  className="max-h-48 w-full rounded-xl object-cover"
                />
              </div>
            )}

            {task.resultPhotoUrl && (
              <div>
                <div className="label-micro mb-1.5">Photo résultat</div>
                <img
                  src={task.resultPhotoUrl}
                  alt="Photo résultat"
                  className="max-h-48 w-full rounded-xl object-cover"
                />
              </div>
            )}

            {!task.description && !task.toBuyItems?.length && !task.photoBeforeUrl && !photoBefore && (
              <p className="text-sm text-muted-foreground">
                Aucun détail supplémentaire pour cette tâche.
              </p>
            )}

            {!task.done && buttonLabel && (
              <button
                type="button"
                onClick={() => { setDetailOpen(false); setOpen(true); }}
                className="tap lift mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-secondary px-4 py-3.5 text-sm font-semibold text-brand-secondary-foreground shadow-card"
              >
                {buttonLabel}
              </button>
            )}
            {!isPending && !preview && (
              <button
                type="button"
                onClick={startEditing}
                className="tap mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
              >
                <Pencil className="h-3.5 w-3.5" /> Modifier la tâche
              </button>
            )}
          </div>
          )}
        </SheetContent>
      </Sheet>
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
      <p className="text-xs text-muted-foreground">
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
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition">
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
          className="text-2xs font-semibold text-muted-foreground hover:text-foreground transition"
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
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
