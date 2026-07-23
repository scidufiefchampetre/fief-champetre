# Architecture

## Carte du projet

```text
src/routes/                 pages et orchestration des parcours
src/features/               composants métier complexes
src/components/             composants applicatifs partagés
src/components/ui/          primitives UI réellement utilisées
src/lib/                    types, règles métier et fonctions serveur
src/core/components/        header, menu, identification, thème
src/core/navigation/        définition centralisée des modules
src/core/store/             état local persistant du membre/admin
src/core/hooks/             résumés de données partagés
src/core/google/            OAuth et clients Sheets/Drive/Calendar
src/core/ai/                fournisseur Anthropic
scripts/                    contrôles et emballage du projet
```

## Routes

| URL                 | Rôle                                        |
| ------------------- | ------------------------------------------- |
| `/`                 | accueil et dépôt de facture                 |
| `/profil`           | synthèse personnelle et profil              |
| `/depenses`         | suivi des dépenses                          |
| `/agenda`           | création d’un séjour                        |
| `/mes-reservations` | réservations personnelles                   |
| `/chantiers`        | liste des chantiers                         |
| `/chantier/:id`     | fiche, inscription, intendance et exécution |
| `/mes-chantiers`    | engagements personnels                      |
| `/signaler`         | signaler/proposer une tâche                 |
| `/regles`           | règles SCI / Association                    |
| `/admin`            | gestion administrative                      |

## Flux de données

```text
clics/formulaire
  → état React local
  → validation finale
  → createServerFn dans src/lib
  → primitives groupées de src/core/google
  → Sheets / Calendar / Drive
  → invalidation React Query en arrière-plan
```

Ne jamais faire un appel Google pour chaque case ou chaque caractère. Pour une
action composée, utiliser `batchMutateRows`, `batchUpdateRanges`,
`batchAppendRowsByTab` ou une nouvelle primitive atomique équivalente.

## Données Google

Classeur principal : onglets `SCI`, `Asso`, `Membres` et `Réservations` définis
dans `google.server.ts`.

Classeur chantiers : onglets `Chantiers`, `Tâches types`, `Jours chantier`,
`Signalements chantier` et un onglet unifié dynamique par chantier.
Les en-têtes constituent un contrat : les étendre en fin de ligne et conserver
la compatibilité de lecture des anciennes données.

## État client

- Zustand conserve l’identité du membre et la configuration locale.
- TanStack Query gère les données distantes, le cache et les invalidations.
- Un clic doit afficher son résultat immédiatement ; la synchronisation distante
  intervient au bouton de validation.
