# Ajouter un module sans casser l’application

## 1. Définir le contrat

Écrire avant le code : objectif, personnes autorisées, données lues/écrites,
action finale, états vide/erreur et rôle dans la palette 60–30–10. Éviter d’ajouter une
question si une valeur par défaut fiable suffit.

## 2. Ranger le code

- Types et règles métier : `src/lib/<module>-types.ts`.
- Fonctions serveur : `src/lib/<module>.functions.ts`.
- Composants complexes : `src/features/<module>/components/`.
- Route : `src/routes/<route>.tsx`.
- Navigation : une entrée dans `src/core/navigation/app-modules.ts`.

Une route orchestre ; elle ne doit pas réimplémenter les API Google.

## 3. Concevoir les écritures

Le formulaire vit localement jusqu’à « Enregistrer », « Valider » ou
« Confirmer ». À cette étape seulement :

1. valider les données avec Zod ;
2. relire le strict minimum nécessaire ;
3. détecter les conflits ;
4. envoyer une écriture groupée ;
5. prévoir le rollback si plusieurs services sont concernés ;
6. rendre la main immédiatement puis invalider le cache en arrière-plan.

## 4. Ajouter une table Google

Déclarer l’onglet et ses en-têtes dans `src/core/google/google.server.ts`.
Ajouter les colonnes à droite, ne jamais déplacer silencieusement les colonnes
existantes. Réutiliser `ensureTabExists` et les fonctions batch.

## 5. Appliquer la D.A.

Suivre `DESIGN_SYSTEM.md`. Réutiliser `AppHeader`, les tokens de `styles.css`
et les composants existants avant d’en créer un nouveau. Utiliser les classes
`brand-secondary` et `brand-accent` ; ne pas inventer une palette par route.

## 6. Tester

```bash
bun run typecheck
bun run lint
bun run build
```

Pour une nouvelle primitive Google, étendre `scripts/google-smoke-test.ts` avec
des données identifiables et un nettoyage dans `finally`.
