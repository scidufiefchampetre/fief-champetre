import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import { AppHeader } from "@/core/components/app-header";
import { useExpenseStore } from "@/core/store/expense-store";
import { ReportForm } from "@/features/chantiers/components/report-form";

const SignalerSearch = z.object({
  from: z.enum(["admin"]).optional(),
});

export const Route = createFileRoute("/signaler")({
  component: SignalerPage,
  validateSearch: (search: Record<string, unknown>) => SignalerSearch.parse(search),
  head: () => ({
    meta: [
      { title: "Signaler ou proposer une tâche · Fief Champêtre" },
      {
        name: "description",
        content: "Propose une tâche pour les prochains chantiers.",
      },
    ],
  }),
});

function SignalerPage() {
  const store = useExpenseStore();
  const identifiedName = store.member?.firstName ?? "";
  const { from } = Route.useSearch();
  const navigate = useNavigate();
  const backTarget = from === "admin" ? "/admin" : "/chantiers";

  return (
    <main className="min-h-dvh w-full bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-4 sm:py-10">
        <AppHeader variant="back" backTo={backTarget} />

        <div className="animate-rise">
          <h1 className="page-title">Signaler une tâche.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Une tâche à faire, un truc cassé, une idée pour le prochain chantier ?{" "}
            {identifiedName || "Toi"}, dis-nous.
          </p>

          <div className="mt-6">
            <ReportForm
              identifiedName={identifiedName}
              onSubmitted={() => {
                if (from === "admin") {
                  toast.success("Tâche créée.");
                  navigate({ to: "/admin" });
                  return;
                }
                toast.success("Merci, c'est transmis à l'association.");
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
