import { Check, Clock, Trash2, User } from "lucide-react";
import type { ChantierTask } from "@/lib/chantier-types";
import { durationLabel } from "./task-execution-form";
import type { ReportUrgency } from "@/lib/chantier-reports.functions";

const URGENCY_DOT: Record<ReportUrgency, string> = {
  tres_urgent: "bg-foreground",
  urgent: "bg-foreground/55",
  important: "bg-foreground/30",
  must_have: "bg-foreground/15",
};

export function TaskRow({
  task,
  onToggle,
  onDelete,
  toggling = false,
}: {
  task: ChantierTask & { estimatedPeopleCount?: number; estimatedDurationMinutes?: number };
  onToggle?: () => void;
  onDelete?: () => void;
  toggling?: boolean;
}) {
  const peopleCount = task.peopleCount || task.estimatedPeopleCount || 0;
  const duration = task.durationMinutes || task.estimatedDurationMinutes || 0;

  return (
    <div className="group flex items-center gap-2.5 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={toggling || !onToggle}
        aria-pressed={task.done}
        aria-label={task.done ? "Marquer non terminée" : "Marquer terminée"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-50 ${
          task.done
            ? "border-brand-secondary bg-brand-secondary text-brand-secondary-foreground"
            : "border-foreground/20 bg-background"
        } ${!onToggle ? "cursor-default" : ""}`}
      >
        {task.done && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      {task.urgency && URGENCY_DOT[task.urgency as ReportUrgency] && (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${URGENCY_DOT[task.urgency as ReportUrgency]}`}
        />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${task.done ? "line-through text-muted-foreground/60" : "text-foreground"}`}
      >
        {task.label}
      </span>
      {peopleCount > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
          <User className="h-3 w-3" />
          {peopleCount}
        </span>
      )}
      {duration > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {durationLabel(duration)}
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Supprimer la tâche"
          className="shrink-0 p-1 text-muted-foreground/40 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function PendingTaskRow({
  task,
  onRemove,
}: {
  task: {
    label: string;
    urgency: string;
    estimatedPeopleCount?: number;
    estimatedDurationMinutes?: number;
  };
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-dashed border-brand-accent/50 bg-brand-accent/5" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{task.label}</span>
      {(task.estimatedPeopleCount ?? 0) > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
          <User className="h-3 w-3" />
          {task.estimatedPeopleCount}
        </span>
      )}
      {(task.estimatedDurationMinutes ?? 0) > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {durationLabel(task.estimatedDurationMinutes!)}
        </span>
      )}
      <span className="shrink-0 rounded-full bg-brand-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-accent">
        À valider
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Retirer la tâche en attente"
          className="shrink-0 p-1 text-muted-foreground/40 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
