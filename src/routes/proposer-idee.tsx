import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/core/components/app-header";
import { useExpenseStore } from "@/core/store/expense-store";
import { submitIdea } from "@/lib/feedback.functions";

export const Route = createFileRoute("/proposer-idee")({
  component: ProposerIdeePage,
  head: () => ({
    meta: [
      { title: "Proposer une fonctionnalité · Fief Champêtre" },
      { name: "description", content: "Une idée pour améliorer l'app ? On est preneurs." },
    ],
  }),
});

const PRIORITE_OPTIONS = [
  { value: "indispensable", label: "Indispensable", description: "Je ne peux pas m'en passer" },
  { value: "utile", label: "Utile", description: "Ça m'aiderait vraiment" },
  { value: "bonus", label: "Bonus", description: "Ce serait sympa d'avoir" },
] as const;

function ProposerIdeePage() {
  const store = useExpenseStore();
  const auteur = store.member?.firstName ?? "";

  const [titre, setTitre] = useState("");
  const [contexte, setContexte] = useState("");
  const [proposition, setProposition] = useState("");
  const [priorite, setPriorite] = useState<"indispensable" | "utile" | "bonus" | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim() || !priorite) {
      toast.error("Remplis le titre et la priorité (*).");
      return;
    }
    setSubmitting(true);
    try {
      await submitIdea({
        data: {
          titre: titre.trim(),
          contexte: contexte.trim(),
          proposition: proposition.trim(),
          priorite,
          auteur: auteur || "Anonyme",
        },
      });
      setDone(true);
    } catch {
      toast.error("Erreur lors de l'envoi. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-dvh w-full bg-background">
        <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-4 sm:py-10">
          <AppHeader variant="back" backTo="/" />
          <div className="animate-rise flex flex-col items-center justify-center flex-1 text-center gap-4">
            <div className="text-4xl">💡</div>
            <h1 className="text-2xl font-bold">Super idée !</h1>
            <p className="text-sm text-muted-foreground">Merci, on va y réfléchir.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh w-full bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-4 sm:py-10">
        <AppHeader variant="back" backTo="/" />
        <div className="animate-rise">
          <h1 className="page-title">Proposer une idée.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Une fonctionnalité qui manque ? Dis-nous ce que tu imagines.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Titre */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Titre <span className="text-brand-accent">*</span>
              </label>
              <input
                type="text"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Ex : Pouvoir exporter la liste des participants"
                maxLength={200}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-secondary"
              />
            </div>

            {/* Contexte */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Dans quel contexte ?</label>
              <textarea
                value={contexte}
                onChange={(e) => setContexte(e.target.value)}
                placeholder="Ce que tu essaies de faire, ce qui te manque aujourd'hui…"
                rows={3}
                maxLength={2000}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-secondary resize-none"
              />
            </div>

            {/* Proposition */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Ta proposition</label>
              <textarea
                value={proposition}
                onChange={(e) => setProposition(e.target.value)}
                placeholder="Comment tu l'imagines, comment ça devrait marcher…"
                rows={3}
                maxLength={2000}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-secondary resize-none"
              />
            </div>

            {/* Priorité */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Priorité pour toi <span className="text-brand-accent">*</span>
              </label>
              <div className="space-y-2">
                {PRIORITE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriorite(opt.value)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      priorite === opt.value
                        ? "border-brand-secondary bg-brand-secondary/10"
                        : "border-border bg-card hover:bg-secondary"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                        priorite === opt.value
                          ? "border-brand-secondary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {priorite === opt.value && (
                        <div className="h-2 w-2 rounded-full bg-brand-secondary" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">{opt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? "Envoi en cours…" : "Envoyer l'idée"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
