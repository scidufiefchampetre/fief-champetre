import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { addChantierTask, addUnplannedChantierTask } from "@/lib/chantier.functions";
import { useDraftStore } from "@/core/store/draft-store";

export function DraftBar() {
  const store = useDraftStore();
  const queryClient = useQueryClient();
  const addUser = useServerFn(addUnplannedChantierTask);
  const addAdmin = useServerFn(addChantierTask);

  const pending = store.items.filter((i) => i.status === "pending");
  const saving = store.items.some((i) => i.status === "saving");

  if (store.items.length === 0) return null;

  async function flush() {
    const toFlush = store.items.filter((i) => i.status === "pending");
    toFlush.forEach((i) => store.setStatus(i.id, "saving"));

    const results = await Promise.allSettled(
      toFlush.map(async (item) => {
        try {
          if (item.type === "task") {
            const p = item.payload;
            if (p.mode === "admin" && p.password) {
              await addAdmin({
                data: {
                  chantierId: p.chantierId,
                  startDate: p.startDate,
                  label: p.label,
                  password: p.password,
                  estimatedDurationMinutes: p.estimatedDurationMinutes,
                  estimatedPeopleCount: p.estimatedPeopleCount,
                  urgency: p.urgency,
                },
              });
            } else {
              await addUser({
                data: {
                  chantierId: p.chantierId,
                  startDate: p.startDate,
                  label: p.label,
                },
              });
            }
          }
          store.setStatus(item.id, "done");
          return { ok: true };
        } catch (e) {
          store.setStatus(item.id, "error");
          return { ok: false, label: item.displayLabel };
        }
      }),
    );

    const errors = results
      .map((r) => (r.status === "fulfilled" ? r.value : { ok: false, label: "?" }))
      .filter((r) => !r.ok);

    queryClient.invalidateQueries({ queryKey: ["chantier-tasks"] });

    if (errors.length === 0) {
      toast.success(
        toFlush.length === 1 ? "Tâche enregistrée." : `${toFlush.length} tâches enregistrées.`,
      );
      store.removeDone();
    } else {
      toast.error(`${errors.length} élément(s) non enregistré(s). Réessaie.`);
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 shadow-lg">
      {store.items.map((item) => (
        <div
          key={item.id}
          className={`flex h-7 max-w-[120px] items-center truncate rounded-full px-2.5 text-[11px] font-semibold transition ${
            item.status === "pending"
              ? "bg-brand-accent/10 text-brand-accent"
              : item.status === "saving"
                ? "bg-secondary text-muted-foreground animate-pulse"
                : item.status === "done"
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
          }`}
        >
          {item.displayLabel}
        </div>
      ))}

      {pending.length > 0 && (
        <button
          onClick={flush}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1.5 text-[12px] font-bold text-brand-accent-foreground transition disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Enregistrer{pending.length > 1 ? ` · ${pending.length}` : ""}
        </button>
      )}

      <button
        onClick={() => store.clear()}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
