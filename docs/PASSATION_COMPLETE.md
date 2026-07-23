# Passation complète — Fief Champêtre

Document de référence pour reprendre, exécuter, modifier et déployer le projet.
État vérifié le **21 juillet 2026**. Commencer ici, puis utiliser les documents
spécialisés du dossier `docs/` pour le détail.

## 1. Ce qu’est le produit

Fief Champêtre est une application web SSR pour les membres d’un lieu partagé.
Elle centralise :

- l’identification d’un membre et de sa famille ;
- le dépôt, l’analyse et le suivi des factures SCI/Association ;
- la réservation de séjours ;
- la création, l’inscription et le suivi des chantiers ;
- l’intendance, les repas, les missions et les comptes rendus de chantier ;
- un espace administrateur pour corriger et piloter les données.

Google Sheets, Calendar et Drive sont la base métier. Anthropic Claude analyse
les factures. Le navigateur ne reçoit jamais les secrets : les appels externes
passent par les fonctions serveur TanStack Start.

## 2. Reprise en 15 minutes

Pré-requis : Bun, Git et un compte Google autorisé sur les ressources du Fief.

```bash
unzip fief-champetre-source_*.zip
cd fief-factures-refactor
cp .env.example .env
# Renseigner .env sans le transmettre ni le committer.
bun install --frozen-lockfile
bun run check
bun run dev
```

Ouvrir l’URL affichée par Vite. Si l’interface ne correspond pas aux captures,
vérifier `RELEASE_INFO.md`, l’empreinte de l’archive et l’absence d’un ancien
serveur sur le même port.

Ordre de lecture recommandé :

1. ce document ;
2. `AGENTS.md` ;
3. `docs/DESIGN_SYSTEM.md` ;
4. `docs/ARCHITECTURE.md` ;
5. `docs/INTEGRATIONS.md` ;
6. `docs/ADD_A_MODULE.md` ;
7. `docs/DEPLOYMENT.md`.

## 3. Stack et commandes

- TanStack Start + routage fichier, React 19 et TypeScript strict ;
- TanStack Query pour les lectures distantes et leur cache ;
- Zustand pour l’identité et l’état local persistant ;
- Tailwind CSS 4, Radix et Lucide pour l’interface ;
- Google APIs : Sheets, Calendar et Drive ;
- AI SDK + Anthropic Claude pour les factures ;
- configuration Lovable TanStack et cible Nitro/Cloudflare par défaut.

| Commande                  | Effet                                                 |
| ------------------------- | ----------------------------------------------------- |
| `bun run dev`             | serveur local avec SSR et fonctions serveur           |
| `bun run typecheck`       | contrôle TypeScript strict                            |
| `bun run lint`            | contrôle ESLint                                       |
| `bun run build`           | build de production dans `.output/`                   |
| `bun run check`           | typecheck + lint + build                              |
| `bun run test:google`     | test réel, temporaire et réversible des 3 APIs Google |
| `bun run package:handoff` | contrôle puis archive de reprise dans `release/`      |

Ne pas remplacer Bun par un autre gestionnaire sans mettre à jour et tester le
lockfile. Ne jamais éditer `src/routeTree.gen.ts` à la main.

## 4. Organisation du code

```text
src/routes/                  pages et parcours
src/features/                blocs métier complexes
src/components/              composants partagés
src/components/ui/           primitives UI
src/lib/                     types, règles et fonctions serveur métier
src/core/components/         header, navigation, identification, thème
src/core/config/             feature flags
src/core/google/             OAuth et primitives Google
src/core/ai/                 client Anthropic
src/core/hooks/              données partagées et résumés
src/core/store/              état local persistant
scripts/                     tests, audit, nettoyage et livraison
docs/                        documentation de reprise
.lovable/project.json        version du template Lovable
vite.config.ts               configuration Lovable/TanStack/Nitro
```

Flux d’une modification :

```text
interaction immédiate → état React local → validation métier
→ createServerFn → écriture Google groupée → invalidation du cache
```

Principe non négociable : **pas un appel Google par clic, case ou ligne**. Les
formulaires restent optimistes et les écritures partent sur les boutons de
validation importants avec les primitives `batch*` de `src/core/google/`.

## 5. Routes et parcours à connaître

| Route               | Fonction                                                  |
| ------------------- | --------------------------------------------------------- |
| `/`                 | accueil, identification et entrée du dépôt de facture     |
| `/profil`           | synthèse personnelle                                      |
| `/depenses`         | dépenses et remboursements                                |
| `/agenda`           | agenda et réservation d’un séjour                         |
| `/mes-reservations` | réservations personnelles                                 |
| `/chantiers`        | prochain chantier et trois derniers chantiers             |
| `/chantier/:id`     | fiche, inscription, intendance et exécution               |
| `/mes-chantiers`    | chantiers auxquels le membre participe                    |
| `/signaler`         | proposer une tâche, casse ou dysfonctionnement avec photo |
| `/regles`           | règles SCI / Association                                  |
| `/admin`            | administration actuelle sans mot de passe                 |

Le `AppHeader` est l’unique grammaire de navigation : burger, marque cliquable
vers `/`, membre et thème. Les pages secondaires affichent une ligne de retour
contextuelle. Ne pas réintroduire un header propre à une route.

### Phases d’un chantier

- **Avant** : fiche prévisionnelle, inscriptions modifiables, repas et
  intendance.
- **Pendant** : présence modifiable, missions cochables, photo, durée, personnes
  ayant participé et intendance ajustable.
- **Après** : lecture seule pour le membre ; l’admin peut encore corriger.

### Facture liée à un chantier

La catégorie « Repas chantier » est proposée uniquement si le contenu paraît
alimentaire ou pertinent. Une facture de chantier est enregistrée côté
Association, ajoutée au classeur principal et à l’onglet du chantier associé.
Le Drive reçoit le justificatif dans le dossier approprié.

## 6. Contrat Google

### Variables obligatoires

| Variable                          | Ressource                                                  |
| --------------------------------- | ---------------------------------------------------------- |
| `GOOGLE_OAUTH_CLIENT_ID`          | client OAuth                                               |
| `GOOGLE_OAUTH_CLIENT_SECRET`      | secret OAuth                                               |
| `GOOGLE_OAUTH_REFRESH_TOKEN`      | accès durable                                              |
| `GOOGLE_CALENDAR_ID`              | calendrier partagé                                         |
| `GOOGLE_SHEETS_SPREADSHEET_ID`    | classeur SCI/Asso/membres/réservations                     |
| `GOOGLE_CHANTIERS_SPREADSHEET_ID` | classeur chantiers                                         |
| `GOOGLE_DRIVE_FOLDER_ID`          | dossier racine                                             |
| `ANTHROPIC_API_KEY`               | analyse de facture                                         |
| `ANTHROPIC_MODEL`                 | optionnel, modèle par défaut documenté dans `.env.example` |

Les variables `ADMIN_*_PASSWORD` sont réservées à une future fermeture de
l’administration. La version actuelle utilise volontairement le sentinelle
serveur `__admin_open__` et n’affiche pas de demande de mot de passe.

### Classeur principal

- `SCI` et `Asso` : 21 colonnes de dépense, dont payeur, remboursement,
  justificatif et chantier associé ;
- `Membres` : identité, coordonnées, conjoint et jusqu’à six enfants ;
- `Réservations` : dates, effectifs, prix, paiement et ID Calendar.

Les en-têtes faisant foi sont exportés par `src/core/google/google.server.ts`.
Toujours ajouter une nouvelle colonne en fin de contrat et préserver la lecture
des anciennes lignes.

### Classeur chantiers

- `Chantiers` : registre des périodes et IDs Calendar ;
- un onglet dynamique `Chantier YYYY-MM-DD (xxxx)` par chantier ;
- `Tâches types` : catalogue réutilisable ;
- `Jours chantier` : contributions personnelles ;
- `Signalements chantier` : propositions, statuts et photo.

Chaque onglet chantier est unifié de A à AE. La colonne `Type` distingue
`fiche`, `tache`, `inscription`, `intendance` et `depense`. Le contrat exact est
`CHANTIER_TAB_HEADERS` dans `src/lib/chantier-types.ts`.

### Calendar et Drive

- Calendar est la source des périodes de séjour, Airbnb et chantier ;
- l’agenda distingue Perso, Airbnb et Chantier ;
- les justificatifs sont rangés par SCI/Asso dans le dossier racine ;
- les photos de missions vont dans `<onglet chantier>/Photos missions` ;
- les photos de signalement vont dans `Signalements chantier`.

Ne jamais supprimer les événements Calendar lors d’un nettoyage de classeur.

## 7. Test, audit et nettoyage Google

`bun run test:google` crée un onglet temporaire, un événement temporaire et un
fichier temporaire, les relit puis les supprime dans un bloc `finally`. Il
n’utilise pas les données utilisateur.

```bash
bun run scripts/audit-google-cleanup.ts
bun run scripts/cleanup-google-data.ts       # simulation uniquement
bun run scripts/cleanup-google-data.ts --apply
```

Le nettoyage avec `--apply` :

- crée d’abord des sauvegardes dans `_Sauvegardes avant nettoyage` ;
- ne touche pas à Google Calendar ;
- supprime/restructure réellement des onglets ou données Google.

Toujours lire la simulation et les sauvegardes avant `--apply`. Ne jamais
modifier localement une copie d’en-tête des scripts sans la comparer aux
constantes de `src/`.

## 8. Direction artistique et UX

Palette 60–30–10 :

- base : Cloud Dancer `#F0EEE9`, ou Darkest Hour `#242226` en mode sombre ;
- secondaire : Blue Violet `#685BC7` ;
- accent : Exuberant Orange `#FF582D` ;
- gris/noir/blanc pour structure, texte et états neutres.

Sun Glare est retiré et ne doit pas revenir. Une page peut employer les trois
couleurs en respectant la hiérarchie : 60 % base, 30 % secondaire, 10 % accent.
L’orange est réservé aux actions/alertes réellement importantes. Sur un fond
violet ou orange plein, texte et pictogramme sont blancs. Les utilitaires
canoniques sont `brand-secondary` et `brand-accent`.

Règles : flat design, aucune couleur en dégradé, une hiérarchie éditoriale
forte, détails repliés par défaut, boutons proportionnés, pastilles homogènes,
mobile sans défilement horizontal et retour visuel immédiat au clic.

Le texte membre commence par un verbe et parle en « tu ». Le texte admin est
plus carré et didactique. Voir `docs/DESIGN_SYSTEM.md` avant toute UI.

## 9. Flags et décisions temporaires

`src/core/config/features.ts` contient les fonctionnalités dormantes.

- `badges: false` : le système de badges reste dans le code mais n’est ni
  activé ni visible ;
- administration : ouverte sans mot de passe pour le prototype actuel ;
- aucune donnée démo ne doit apparaître sans `demo=true` explicite.

Ne pas supprimer le code dormant sans décision produit. Activer un flag exige
un contrôle complet mobile/desktop et des données réelles.

## 10. Reprendre dans Lovable — ce qui est réellement possible

Le dépôt utilise bien le template TanStack Start de Lovable :

- `.lovable/project.json` est inclus dans la livraison ;
- `vite.config.ts` délègue à `@lovable.dev/vite-tanstack-config` ;
- le fichier `bun.lock` garantit les versions.

**Limitation officielle : Lovable ne permet pas de créer un nouveau projet en
important un dépôt GitHub existant ou ce ZIP.** La voie fiable est donc :

1. ouvrir le **projet Lovable d’origine** ;
2. connecter ce projet à GitHub depuis Lovable ; Lovable crée son dépôt ;
3. travailler sur le dépôt et la branche par défaut `main` ;
4. conserver le nom, le propriétaire et l’emplacement du dépôt ;
5. pousser les sources de cette livraison sur le dépôt déjà lié, puis laisser
   la synchronisation bidirectionnelle Lovable/GitHub opérer.

Si le projet Lovable d’origine est perdu, le code reste entièrement exploitable
localement et sur un hébergeur SSR, mais un nouveau projet Lovable ne peut pas
être « réattaché » automatiquement à ce dépôt. Il faut alors recréer un projet
dans Lovable et y reporter le code par le code editor/agent, ce qui n’est pas
une importation garantie à l’identique. Conserver le projet d’origine est donc
essentiel.

Dans Lovable, stocker les clés uniquement dans les secrets serveur. Ne jamais
les préfixer `VITE_` ni les coller dans un composant. Références officielles :

- https://docs.lovable.dev/integrations/github
- https://docs.lovable.dev/introduction/faq
- https://docs.lovable.dev/features/code-mode
- https://docs.lovable.dev/features/security
- https://docs.lovable.dev/integrations/cloud

## 11. Déploiement

L’application n’est pas un export statique. Elle nécessite le serveur TanStack
Start pour les secrets et les fonctions Google/Anthropic. La configuration
actuelle génère une sortie Nitro/Cloudflare dans `.output/`.

Avant production :

1. `bun install --frozen-lockfile` ;
2. configurer les secrets du serveur ;
3. `bun run check` ;
4. déployer `.output/` avec la cible compatible ;
5. vérifier les routes principales ;
6. lancer le smoke test Google avec un compte autorisé ;
7. tester dépôt, réservation, inscription et administration ;
8. remplacer l’admin ouvert par une vraie authentification avant exposition
   publique large.

## 12. Matrice de recette minimale

- identification d’un membre existant et création d’un nouveau membre ;
- marque « Fief Champêtre » vers l’accueil et retour contextuel sur chaque page ;
- dépôt photo/PDF, analyse Claude, saisie de secours et export SCI/Asso ;
- facture alimentaire associée à un chantier et double écriture ;
- création, modification et annulation d’un séjour ;
- liste agenda responsive sans confusion Perso/Airbnb/Chantier ;
- inscription chantier avec adulte, invité, enfant et repas distincts ;
- intendance complète, créneau à prendre et validation finale groupée ;
- mission terminée avec participants, durée par demi-heure et photo ;
- signalement avec photo ;
- états vide, chargement et erreur distincts ;
- mode clair/sombre, mobile étroit et desktop ;
- profil sans « Chargement… » permanent si aucune donnée n’existe.

## 13. Sécurité et points de vigilance

- `.env` est ignoré et exclu des archives ;
- ne jamais envoyer OAuth, IBAN, clé Anthropic ou mot de passe à une IA ;
- les documents de passation ne contiennent que des noms de variables ;
- les dossiers Drive sont actuellement rendus accessibles par lien par le code
  historique : revoir cette politique avant une diffusion plus large ;
- l’espace admin ouvert est acceptable seulement dans le contexte décidé ;
- les données Google réelles sont la production : tester avec prudence ;
- une mutation de schéma doit rester rétrocompatible.

## 14. Ajouter ou modifier sans casser

1. trouver le parcours et la fonction serveur existants avec `rg` ;
2. réutiliser les composants, tokens et primitives Google ;
3. garder les clics locaux et grouper l’écriture finale ;
4. ajouter les colonnes Sheets uniquement en fin de contrat ;
5. ne pas dupliquer le header, l’identité ou le client Google ;
6. ajouter états vide/chargement/erreur et responsive ;
7. exécuter `bun run check` ;
8. tester le parcours dans le navigateur ;
9. exécuter `bun run test:google` si l’intégration change ;
10. mettre à jour ce document et les docs spécialisées.

## 15. Passation à une autre IA

Donner l’archive la plus récente et ce prompt :

> Lis `RELEASE_INFO.md`, `docs/PASSATION_COMPLETE.md`, `AGENTS.md` et le dossier
> `docs/` avant toute modification. Travaille dans ces sources exactes, sans
> recréer l’app depuis des captures. Utilise Bun et le lockfile. Préserve
> TanStack Start SSR, les fonctions serveur, le batching Google, le header
> partagé et la DA 60–30–10. Ne lis, n’affiche et ne commits aucun secret.
> Termine par `bun run check` et indique précisément les parcours testés.

## 16. Définition de « prêt à transmettre »

- `bun run check` passe ;
- le smoke test Google passe et ne laisse aucune ressource temporaire ;
- `scripts/check-handoff.sh` ne trouve aucun secret ;
- l’archive contient `.lovable/project.json`, le lockfile, les sources et docs ;
- elle exclut `.env`, `.git`, caches, builds, logs et `node_modules` ;
- le nom contient date, heure et empreinte ;
- aucune modification locale importante n’est oubliée ;
- la limite d’import Lovable est expliquée sans ambiguïté.
