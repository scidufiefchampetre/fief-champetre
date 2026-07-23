import { createFileRoute } from "@tanstack/react-router";
import { Building2, Users, Euro } from "lucide-react";
import { AppHeader } from "@/core/components/app-header";

export const Route = createFileRoute("/regles")({
  component: ReglesPage,
  head: () => ({
    meta: [
      { title: "Règles SCI vs Asso · Fief Champêtre" },
      {
        name: "description",
        content: "Comment savoir si une dépense va côté SCI ou côté Association.",
      },
    ],
  }),
});

function ReglesPage() {
  return (
    <main className="min-h-dvh w-full bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-4 sm:py-10">
        <AppHeader variant="back" />

        <div className="animate-rise">
          <h1 className="page-title">SCI ou Asso&nbsp;?</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            La question est simple : qui bénéficie principalement de la dépense ?
          </p>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15">
                  <Building2 className="h-5 w-5 text-brand-secondary" strokeWidth={2} />
                </div>
                <div className="text-xl font-black leading-none">SCI</div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                La SCI porte le bien immobilier et l’activité locative. Tout ce qui sert à louer,
                entretenir ou améliorer le bien loué passe ici.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span>•</span> Draps, linge et produits d’accueil Airbnb
                </li>
                <li className="flex gap-2">
                  <span>•</span> Travaux d’entretien du bâtiment loué
                </li>
                <li className="flex gap-2">
                  <span>•</span> Assurance, taxe foncière, énergie du bien
                </li>
                <li className="flex gap-2">
                  <span>•</span> Mobilier et déco du logement loué
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/15">
                  <Users className="h-5 w-5 text-brand-secondary" strokeWidth={2} />
                </div>
                <div className="text-xl font-black leading-none">ASSO</div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                L’Association porte la vie quotidienne, les membres, les événements et les espaces
                communs hors locatif.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span>•</span> Courses et repas communs entre membres
                </li>
                <li className="flex gap-2">
                  <span>•</span> Événements, apéros et vie du lieu
                </li>
                <li className="flex gap-2">
                  <span>•</span> Mobilier des espaces communs non loués
                </li>
                <li className="flex gap-2">
                  <span>•</span> Entretien de la vie commune
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">En cas de doute</span>, l’application te
            posera la question au moment du scan. Choisis le côté qui bénéficie le plus de l’achat.
            Si c’est vraiment 50/50, mets SCI par défaut.
          </div>

          <h2 className="mt-10 text-2xl font-black leading-none tracking-tight">
            Réserver la maison
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Ce que tu dois savoir avant de bloquer tes dates dans l'Agenda.
          </p>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent/15">
                  <Euro className="h-5 w-5 text-brand-accent" strokeWidth={2} />
                </div>
                <div className="text-lg font-black leading-none">Combien ça coûte</div>
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span>•</span> 5€ par adulte (16 ans et +) et par nuit, enfants gratuits
                </li>
                <li className="flex gap-2">
                  <span>•</span> Privatisation complète : 250€ forfait fixe pour un week-end
                </li>
                <li className="flex gap-2">
                  <span>•</span> Électricité en plus, toujours, y compris en cas de privatisation
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-lg font-black leading-none">Qui paie quoi</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Celui qui réserve porte l'intégralité des coûts de son séjour : nuitées,
                électricité, pré-chauffage éventuel. Il s'arrange ensuite en interne avec ses
                co-séjournants. L'app ne fait pas ce partage à ta place.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Le montant électricité est relevé et saisi par le trésorier après le séjour,
                directement dans le tableau de suivi. Le statut "payé" est coché par le trésorier
                une fois le virement reçu. Suis tout ça sur{" "}
                <span className="font-semibold text-foreground">Mes réservations</span>.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-lg font-black leading-none">Les 3 types de créneaux</div>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-secondary" />
                  <span>
                    <span className="font-semibold text-foreground">Perso</span> : une réservation
                    classique. Plusieurs personnes peuvent réserver sur la même période si personne
                    n'a privatisé.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
                  <span>
                    <span className="font-semibold text-foreground">Airbnb</span> : bloque
                    totalement la période, aucune réservation perso possible dessus.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-accent" />
                  <span>
                    <span className="font-semibold text-foreground">Chantier</span> : même chose,
                    blocage total pendant les travaux.
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Si quelqu'un est déjà là</span> sur
              tes dates (sans privatisation), l'app t'affiche qui, combien de personnes et
              l'ambiance du week-end. À toi de t'aligner. Tu ne peux pas privatiser une période où
              il y a déjà du monde.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
