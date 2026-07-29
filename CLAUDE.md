# Fief Champêtre — Guide Claude Code

Lis ce fichier en premier. Il contient tout ce qu'il faut pour modifier et déployer l'app depuis Claude Code.

---

## Projet

**Chemin local :** `/Users/alainbretillot/Documents/New project/fief-factures 23:07:2026`

**URL de production :** `https://tanstack-start-ts-fief-factures.scidufiefchampetre.workers.dev`

Application web SSR pour les membres du Fief Champêtre. Données dans Google Sheets, Calendar et Drive. Analyse de factures par Anthropic.

---

## Credentials (`.env` à la racine)

| Variable | Valeur / Où trouver |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_OAUTH_CLIENT_SECRET` | idem |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Généré via OAuth Playground (scopes : Sheets, Calendar, Drive) |
| `GOOGLE_CALENDAR_ID` | `lesenfantsdufiefchampetre@gmail.com` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Classeur principal (Membres, Réservations, SCI, Asso) |
| `GOOGLE_CHANTIERS_SPREADSHEET_ID` | Classeur chantiers (1 onglet par WE + Tâches types + Jours chantier) |
| `GOOGLE_DRIVE_FOLDER_SCI_ID` | Dossier Drive factures SCI |
| `GOOGLE_DRIVE_FOLDER_ASSO_ID` | Dossier Drive factures Asso |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `ADMIN_SCI_PASSWORD` | Mot de passe espace admin SCI |
| `ADMIN_ASSO_PASSWORD` | Mot de passe espace admin Asso |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → Profile → API Tokens |

Le fichier `.env` contient les valeurs réelles. **Ne jamais le committer ni le partager.**

---

## Commandes essentielles

```bash
# Développement local
bun run dev

# Vérification complète avant déploiement
bun run check         # typecheck + lint + build

# Test des APIs Google (crée + supprime des données temporaires)
bun run test:google
```

---

## Déploiement en production

La configuration Vite utilise `preset: "vercel"` pour le dev local. Pour déployer sur Cloudflare Workers, il faut basculer temporairement sur `"cloudflare-module"` :

```bash
# 1. Basculer sur le preset Cloudflare
sed -i '' 's/preset: "vercel"/preset: "cloudflare-module"/' vite.config.ts

# 2. Builder
bunx vite build

# 3. Restaurer le preset Vercel (pour le dev local)
sed -i '' 's/preset: "cloudflare-module"/preset: "vercel"/' vite.config.ts

# 4. Corriger le nom du Worker dans wrangler.json généré
#    (Nitro génère un nom auto incorrect — il faut forcer le bon nom)
python3 -c "
import json
f = open('.output/server/wrangler.json')
d = json.load(f)
f.close()
d['name'] = 'tanstack-start-ts-fief-factures'
f = open('.output/server/wrangler.json', 'w')
json.dump(d, f, indent=2)
f.close()
"

# 5. Déployer
bunx wrangler deploy --config .output/server/wrangler.json
```

**Compte Cloudflare :** `scidufiefchampetre@gmail.com`  
**Nom du Worker :** `tanstack-start-ts-fief-factures`  
**Ne jamais déployer sans l'étape 4** — sinon ça déploie sur un Worker fantôme.

---

## Architecture

```
src/routes/          pages (routage fichier TanStack)
src/features/        blocs métier complexes (chantiers, home)
src/components/      composants partagés
src/lib/             types, règles, fonctions serveur (.functions.ts)
src/core/google/     OAuth et primitives Sheets/Calendar/Drive
src/core/ai/         client Anthropic
src/core/store/      état local persistant (Zustand)
src/styles.css       design system complet (tokens, utilitaires)
```

**Principe clé :** Les `*.functions.ts` contiennent les `createServerFn` — c'est côté serveur uniquement. Les secrets Google ne touchent jamais le navigateur.

---

## Stack

- **TanStack Start** + routage fichier (ne pas convertir vers Next.js/Remix)
- **React 19** + TypeScript strict
- **TanStack Query** pour le cache des lectures Google
- **Tailwind CSS 4** + Radix + Lucide
- **Bun** (pas npm, pas pnpm)
- **Cloudflare Workers** via Nitro

Ne jamais éditer `src/routeTree.gen.ts` à la main — il est auto-généré.

---

## Google Sheets — structure

### Classeur principal (`GOOGLE_SHEETS_SPREADSHEET_ID`)

| Onglet | Contenu |
|---|---|
| `Membres` | Identité, coordonnées, conjoint, enfants |
| `Réservations` | Dates, effectifs, prix, paiement, ID Calendar (colonnes A–S) |
| `SCI` | Dépenses SCI (21 colonnes) |
| `Asso` | Dépenses Asso (21 colonnes) |

### Classeur chantiers (`GOOGLE_CHANTIERS_SPREADSHEET_ID`)

| Onglet | Contenu |
|---|---|
| `Chantiers` | Registre des périodes et IDs Calendar |
| `Chantier YYYY-MM-DD (xxxx)` | 1 onglet par chantier, colonnes A–AE |
| `Tâches types` | Catalogue de tâches réutilisables |
| `Jours chantier` | Contributions personnelles (résa perso + WE chantier) |
| `Signalements chantier` | Propositions, statuts, photos |

**Règle :** Ajouter les nouvelles colonnes uniquement en fin de contrat. Ne jamais supprimer ni réordonner les colonnes existantes.

---

## Design system

Palette **60–30–10** :
- `Cloud Dancer #F0EEE9` — base (60 %)
- `Blue Violet #685BC7` — secondaire, CTAs principaux (30 %)
- `Exuberant Orange #FF582D` — accent, actions importantes (10 %)
- Mode sombre : base `#242226`

Classes Tailwind : `bg-brand-secondary`, `bg-brand-accent`, `text-brand-secondary-foreground`, etc.

**CTA principal (règle absolue) :**
```tsx
<div className="sticky bottom-0 bg-background/90 pb-4 pt-3 backdrop-blur-md">
  <button
    className="tap lift flex w-full items-center justify-center rounded-2xl bg-brand-secondary px-4 py-3.5 text-sm font-semibold text-brand-secondary-foreground shadow-card disabled:opacity-50"
  >
    Texte du bouton
  </button>
</div>
```

Ne jamais utiliser `btn-primary` sur un CTA pleine largeur en bas de page.

---

## Routes principales

| Route | Fonction |
|---|---|
| `/` | Accueil, identification, dépôt facture |
| `/agenda` | Agenda + réservation séjour |
| `/chantiers` | Liste chantiers |
| `/chantier/:id` | Fiche, inscription, missions, intendance |
| `/depenses` | Dépenses et remboursements |
| `/profil` | Synthèse personnelle |
| `/admin` | Administration (ouvert sans MDP dans la version actuelle) |
| `/signaler-bug` | Signaler un bug |
| `/proposer-idee` | Proposer une idée |

---

## Fonctions serveur clés

| Fichier | Fonctions |
|---|---|
| `src/lib/reservations.functions.ts` | `createReservation`, `cancelReservation`, `listReservations` |
| `src/lib/chantier-contributions.functions.ts` | `logChantierContribution`, `listTaskCatalog` |
| `src/lib/chantier.functions.ts` | `listChantiers`, `getChantierFiche`, `listChantierTasks`, `addUnplannedChantierTask` |
| `src/lib/members.functions.ts` | `listMembers`, `saveMember` |
| `src/lib/expenses.functions.ts` | `listExpenses`, `saveExpense` |

---

## Règles de code

1. **Pas un appel Google par clic** — les formulaires restent locaux, l'écriture part au submit final.
2. **Fonctions serveur uniquement dans `*.functions.ts`** — jamais dans les composants.
3. **`bun run check` avant tout déploiement.**
4. **États vide / chargement / erreur** distincts sur toute interface qui lit des données.
5. Mobile d'abord, pas de défilement horizontal.

---

## Pour modifier l'app

1. Ouvrir le projet dans Claude Code avec le chemin ci-dessus.
2. Lire ce fichier + `docs/PASSATION_COMPLETE.md` + le fichier concerné.
3. Modifier les sources dans `src/`.
4. Tester en local : `bun run dev` (port 3000 ou 5173).
5. Vérifier : `bun run check`.
6. Déployer avec la procédure exacte de la section **Déploiement** ci-dessus.
7. Vérifier sur `https://tanstack-start-ts-fief-factures.scidufiefchampetre.workers.dev`.
