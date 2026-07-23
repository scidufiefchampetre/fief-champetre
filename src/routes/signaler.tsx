import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AppHeader } from "@/core/components/app-header";
import { TaskForm } from "@/features/chantiers/components/task-form";

const SignalerSearch = z.object({
  from: z.enum(["admin"]).optional(),
});

export const Route = createFileRoute("/signaler")({
  component: SignalerPage,
  validateSearch: (search: Record<string, unknown>) => SignalerSearch.parse(search),
  head: () => ({
    meta: [
      { title: "Proposer une tâche · Fief Champêtre" },
      {
        name: "description",
        content: "Propose une tâche pour les prochains chantiers.",
      },
    ],
  }),
});

function SignalerPage() {
  const { from } = Route.useSearch();
  const backTarget = from === "admin" ? "/admin" : "/chantiers";

  return (
    <main className="min-h-dvh w-full bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-4 sm:py-10">
        <AppHeader variant="back" backTo={backTarget} />

        <div className="animate-rise">
          <h1 className="page-title">Nouvelle tâche.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Propose une tâche pour les prochains chantiers. Elle sera visible dans le backlog admin.
          </p>

          <div className="mt-6">
            <TaskForm
              chantierId=""
              startDate=""
              mode="user"
              onClose={() => history.back()}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
