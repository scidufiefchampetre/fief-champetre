import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/core/components/app-header";
import { useExpenseStore } from "@/core/store/expense-store";
import { submitBug } from "@/lib/feedback.functions";

export const Route = createFileRoute("/signaler-bug")({
  component: SignalerBugPage,
  head: () => ({
    meta: [
      { title: "Signaler un problème · Fief Champêtre" },
      {
        name: "description",
        content: "Quelque chose ne marche pas ? Dis-nous ce qui s'est passé.",
      },
    ],
  }),
});

const OU_OPTIONS = ["Accueil", "Réservations", "Chantiers", "Mon profil", "Admin", "Autre"];

const GRAVITE_OPTIONS = [
  { value: "bloquant", label: "Bloquant", description: "J'ai pas pu continuer" },
  { value: "genant", label: "Gênant", description: "J'ai contourné" },
  { value: "cosmetique", label: "Cosmétique", description: "C'est juste moche" },
] as const;

function SignalerBugPage() {
  const store = useExpenseStore();
  const auteur = store.member?.firstName ?? "";

  const [quoi, setQuoi] = useState("");
  const [ou, setOu] = useState("");
  const [description, setDescription] = useState("");
  const [gravite, setGravite] = useState<"bloquant" | "genant" | "cosmetique" | "">("");
  const [screenshot, setScreenshot] = useState<{
    dataBase64: string;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Fichier trop lourd (max 5 Mo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [prefix, dataBase64] = dataUrl.split(",");
      const mimeType = prefix.split(":")[1].split(";")[0];
      setScreenshot({ dataBase64, mimeType, fileName: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quoi.trim() || !ou || !gravite || !screenshot) {
      toast.error("Remplis tous les champs obligatoires (*).");
      return;
    }
    setSubmitting(true);
    try {
      await submitBug({
        data: {
          quoi: quoi.trim(),
          ou,
          description: description.trim(),
          gravite,
          auteur: auteur || "Anonyme",
          urlPage: window.location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          screenshot,
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
            <div className="text-4xl">✅</div>
            <h1 className="text-2xl font-bold">Merci !</h1>
            <p className="text-sm text-muted-foreground">
              Ton rapport a été transmis. On va regarder ça.
            </p>
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
          <h1 className="page-title">Signaler un problème.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Quelque chose ne marche pas ? Décris-nous ce qui s'est passé.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Quoi */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Résume le bug en 1 phrase <span className="text-brand-accent">*</span>
              </label>
              <input
                type="text"
                value={quoi}
                onChange={(e) => setQuoi(e.target.value)}
                placeholder="Ex : Le bouton Réserver ne répond pas"
                maxLength={200}
                className="input-field"
              />
            </div>

            {/* Où */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Où ça se passe <span className="text-brand-accent">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {OU_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setOu(opt)}
                    className={`tap rounded-full px-3 py-1.5 text-[13px] font-semibold border transition ${
                      ou === opt
                        ? "bg-brand-secondary text-white border-brand-secondary"
                        : "bg-card border-border text-foreground hover:bg-secondary"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Ce qui s'est passé</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ce que tu faisais, ce qui a planté, les étapes pour reproduire…"
                rows={4}
                maxLength={2000}
                className="input-field py-3 resize-none"
              />
            </div>

            {/* Gravité */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Gravité <span className="text-brand-accent">*</span>
              </label>
              <div className="space-y-2">
                {GRAVITE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGravite(opt.value)}
                    className={`tap flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      gravite === opt.value
                        ? "border-brand-secondary bg-brand-secondary/10"
                        : "border-border bg-card hover:bg-secondary"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                        gravite === opt.value ? "border-brand-secondary" : "border-muted-foreground"
                      }`}
                    >
                      {gravite === opt.value && (
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

            {/* Screenshot */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Capture d'écran <span className="text-brand-accent">*</span>
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/heic,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              {screenshot ? (
                <div className="flex items-center gap-3 rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 px-4 py-3">
                  <span className="text-sm font-semibold text-brand-secondary truncate flex-1">
                    {screenshot.fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshot(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card py-4 text-sm text-muted-foreground hover:bg-secondary transition"
                >
                  📎 Joindre une capture (JPG/PNG/HEIC ≤ 5 Mo)
                </button>
              )}
            </div>

            <div className="sticky bottom-0 pb-4 pt-2 bg-background/90 backdrop-blur-md z-10">
              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? "Envoi en cours…" : "Envoyer le rapport"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
