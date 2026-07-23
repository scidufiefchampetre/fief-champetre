import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { TaskFormSheet } from "@/features/chantiers/components/task-form";

const SignalerSearch = z.object({
  from: z.enum(["admin"]).optional(),
});

export const Route = createFileRoute("/signaler")({
  component: SignalerPage,
  validateSearch: (search: Record<string, unknown>) => SignalerSearch.parse(search),
  head: () => ({
    meta: [
      { title: "Proposer une tâche · Fief Champêtre" },
      { name: "description", content: "Propose une tâche pour les prochains chantiers." },
    ],
  }),
});

function SignalerPage() {
  const navigate = useNavigate();
  const { from } = Route.useSearch();
  const backTarget = from === "admin" ? "/admin" : "/chantiers";

  const [open, setOpen] = useState(false);

  // Auto-open on mount
  useEffect(() => {
    setOpen(true);
  }, []);

  function handleClose() {
    setOpen(false);
    void navigate({ to: backTarget });
  }

  return (
    <TaskFormSheet
      open={open}
      onOpenChange={(v) => { if (!v) handleClose(); }}
      chantierId=""
      startDate=""
      mode="user"
      onCreated={handleClose}
    />
  );
}
