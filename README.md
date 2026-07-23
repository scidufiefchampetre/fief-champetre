# Fief Champêtre

Application web de gestion des dépenses, séjours et chantiers du Fief Champêtre.

**Stack :** TanStack Start · React 19 · TypeScript · Tailwind CSS 4 · Zustand · Google APIs · Anthropic  
**Hébergement :** Cloudflare Workers (SSR — pas un site statique)

---

## Prérequis

- [Bun](https://bun.sh/) ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)
- Un compte Google avec accès aux ressources du Fief (Sheets, Calendar, Drive)
- Un compte [Cloudflare](https://cloudflare.com) (tier gratuit suffit) pour déployer

---

## 1. Installation

```bash
git clone <url-du-repo> fief-champetre
cd fief-champetre
bun install --frozen-lockfile
```

---

## 2. Configuration des variables d'environnement

```bash
cp .env.example .env
```

Ouvrir `.env` et renseigner toutes les variables. Voir le détail dans [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).

### Variables obligatoires

| Variable                          | Comment l'obtenir                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GOOGLE_OAUTH_CLIENT_ID`          | [Google Cloud Console](https://console.cloud.google.com) → Credentials → OAuth 2.0 Client                    |
| `GOOGLE_OAUTH_CLIENT_SECRET`      | Même endroit                                                                                                 |
| `GOOGLE_OAUTH_REFRESH_TOKEN`      | [OAuth Playground](https://developers.google.com/oauthplayground/) avec les scopes Calendar + Sheets + Drive |
| `GOOGLE_CALENDAR_ID`              | Paramètres de l'agenda Google → "Intégrer l'agenda"                                                          |
| `GOOGLE_SHEETS_SPREADSHEET_ID`    | URL du classeur principal : `docs.google.com/spreadsheets/d/**<ID>**/edit`                                   |
| `GOOGLE_CHANTIERS_SPREADSHEET_ID` | Idem, classeur Chantiers                                                                                     |
| `GOOGLE_DRIVE_FOLDER_SCI_ID`      | URL du dossier Drive SCI : `drive.google.com/drive/folders/**<ID>**`                                         |
| `GOOGLE_DRIVE_FOLDER_ASSO_ID`     | Idem, dossier Asso                                                                                           |
| `ADMIN_SCI_PASSWORD`              | Choisir librement (protège l'espace Trésorier SCI)                                                           |
| `ADMIN_ASSO_PASSWORD`             | Choisir librement (protège l'espace Trésorier Asso)                                                          |

### Variables optionnelles

| Variable                         | Usage                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`              | Analyse auto des factures par IA — [console.anthropic.com](https://console.anthropic.com/settings/keys). Sans cette clé, l'interface bascule en saisie manuelle. |
| `GOOGLE_FEEDBACK_SPREADSHEET_ID` | Classeur Bugs/Idées — créé automatiquement au premier retour utilisateur.                                                                                        |
| `VITE_USE_MOCK_DATA`             | `true` pour couper tous les appels Google (dev sans credentials).                                                                                                |

> **Sécurité :** ne jamais préfixer ces variables avec `VITE_` (elles deviendraient publiques), ne jamais committer `.env`, ne jamais l'envoyer dans un chat ou email.

---

## 3. Lancer en développement local

```bash
bun run dev
```

Ouvre `http://localhost:3000`. Les fonctions serveur s'exécutent localement ; les appels Google sont réels sauf si `VITE_USE_MOCK_DATA=true`.

---

## 4. Déployer sur Cloudflare Workers

C'est la cible officielle. Le tier gratuit de Cloudflare suffit.

### 4a. Créer un token Cloudflare

1. Aller sur [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Créer un token → template **"Edit Cloudflare Workers"**
3. Copier la valeur dans `.env` : `CLOUDFLARE_API_TOKEN=<token>`

### 4b. Builder et déployer

```bash
bun run build
set -a && source .env && set +a
bunx wrangler deploy --config .output/server/wrangler.json
```

L'URL de production s'affiche à la fin (format `https://<nom>.workers.dev`).

### 4c. Configurer les variables dans Cloudflare (obligatoire en prod)

Les variables d'environnement doivent être ajoutées dans Cloudflare — elles ne sont **pas** lues depuis `.env` en production.

```bash
# Ajouter chaque variable secrète (une à la fois) :
bunx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
bunx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
bunx wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN
bunx wrangler secret put GOOGLE_CALENDAR_ID
bunx wrangler secret put GOOGLE_SHEETS_SPREADSHEET_ID
bunx wrangler secret put GOOGLE_CHANTIERS_SPREADSHEET_ID
bunx wrangler secret put GOOGLE_DRIVE_FOLDER_SCI_ID
bunx wrangler secret put GOOGLE_DRIVE_FOLDER_ASSO_ID
bunx wrangler secret put ADMIN_SCI_PASSWORD
bunx wrangler secret put ADMIN_ASSO_PASSWORD
# Optionnelles :
bunx wrangler secret put ANTHROPIC_API_KEY
bunx wrangler secret put GOOGLE_FEEDBACK_SPREADSHEET_ID
```

Chaque commande demande la valeur de façon interactive (invisible dans le terminal).

Alternativement, tout configurer via l'interface web : [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → `tanstack-start-ts-fief-factures` → Settings → Variables & Secrets.

### 4d. Redéployer après un changement de code

```bash
bun run build && set -a && source .env && set +a && bunx wrangler deploy --config .output/server/wrangler.json
```

---

## 5. Déployer sur une autre plateforme (Vercel, Render, Fly…)

> ⚠️ La configuration Vite actuelle cible Cloudflare Workers. Adapter la cible Nitro est possible mais non documenté ici.

L'application **nécessite un serveur SSR** — un hébergement statique seul (GitHub Pages, S3…) ne fonctionnera pas.

Pour Vercel :

1. Changer la cible dans `vite.config.ts` : `nitro: { preset: 'vercel' }` (à ajouter dans `defineConfig`)
2. Configurer toutes les variables d'environnement dans le dashboard Vercel
3. Déployer normalement via `vercel deploy`

---

## 6. Vérifications après déploiement

- `GET /` → page d'accueil, sélection du membre
- `GET /chantiers` → liste des chantiers
- `GET /admin` → espace trésorier (demande un mot de passe)
- Créer un membre test → vérifier qu'il apparaît dans le classeur Google
- Supprimer le membre test

---

## 7. Générer une archive de passation

```bash
bun run package:handoff
```

Génère un ZIP propre dans `release/` (sans `.env`, `node_modules`, `.git`, caches). La personne qui reçoit l'archive fait ensuite :

```bash
unzip fief-champetre-source_*.zip -d fief-champetre
cd fief-champetre
bun install --frozen-lockfile
cp .env.example .env
# renseigner .env, puis :
bun run dev
```

---

## Documentation

| Fichier                                                    | Contenu                                             |
| ---------------------------------------------------------- | --------------------------------------------------- |
| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md)             | Google OAuth, Anthropic, toutes les variables       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)             | Organisation du code, flux de données               |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)           | Direction artistique, règles UI/UX                  |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)                 | Déploiement détaillé                                |
| [`docs/PASSATION_COMPLETE.md`](docs/PASSATION_COMPLETE.md) | Document canonique de reprise du projet             |
| [`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md)                 | Contexte à donner à une IA pour reprendre le projet |
