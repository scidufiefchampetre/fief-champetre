# Contexte de reprise pour une IA

Joindre l’archive du projet et donner ce fichier comme première instruction.

## Instruction de démarrage à donner à l’IA

> Travaille directement dans ce projet. Ne recrée pas l’application à partir
> des descriptions ou des captures. Installe exactement les dépendances avec
> `bun install --frozen-lockfile`, puis lance `bun run dev`. Lis
> `RELEASE_INFO.md`, `README.md`, `AGENTS.md` et le dossier `docs/` avant toute
> modification. Si l’interface diffère, vérifie d’abord que tu exécutes bien les
> sources de cette archive et que les variables de `.env.example` sont
> configurées.

Chaque archive porte une date, une heure et une empreinte uniques. Ne réutilise
pas une pièce jointe antérieure portant une autre empreinte.

## Objectif produit

Fief Champêtre permet à un membre de :

- enregistrer et suivre ses dépenses ;
- réserver un séjour ;
- s’inscrire à un chantier avec son groupe et ses repas ;
- choisir une mission d’intendance ;
- suivre ses prochains engagements depuis son profil.

L’admin peut piloter les dépenses, remboursements, chantiers, missions et
comptes rendus. Les données métier sont conservées dans Google Sheets,
Calendar et Drive.

## Contraintes à préserver

1. Lire `README.md`, `AGENTS.md` et tout le dossier `docs/` avant de modifier.
2. Préserver TanStack Start et son routage fichier. Ne pas convertir vers
   Next.js, Remix ou une SPA statique.
3. Ne jamais éditer `src/routeTree.gen.ts` à la main.
4. Toute API Google reste côté serveur dans `src/core/google/`.
5. Les interactions sont optimistes et locales ; écrire dans Google seulement
   lors d’une validation métier, avec des appels groupés.
6. Respecter la palette 60–30–10 et les rôles de Cloud Dancer, Blue Violet et
   Exuberant Orange décrits dans `docs/DESIGN_SYSTEM.md`.
7. Le langage utilisateur est direct et amical ; le langage admin est précis
   et didactique.
8. Ne jamais inclure `.env`, tokens OAuth ou mots de passe dans une réponse,
   une archive ou un commit.
9. Avant livraison : `bun run check`.

## État connu

- Les primitives d’écriture Sheets, Calendar et Drive disposent d’un test réel
  réversible dans `scripts/google-smoke-test.ts`.
- Les gros formulaires conservent les choix côté client puis envoient une
  transaction groupée à la validation finale.
- Les lectures Google courantes sont mises en cache et dédupliquées.
- L’accès admin est volontairement ouvert dans la version actuelle. Pour une
  exposition publique large, le remplacer par une vraie identité journalisée.
- Les badges sont conservés derrière `FEATURES.badges = false` et invisibles.
- Lovable ne permet pas d’importer ce dépôt comme nouveau projet ; utiliser le
  projet Lovable d’origine et sa synchronisation GitHub.

## Definition of done

- TypeScript strict passe.
- Lint sans erreur.
- Build de production passe.
- Les états chargement, vide et erreur sont distincts.
- Mobile et desktop restent utilisables sans défilement horizontal.
- Aucun appel Google par case cochée ou par ligne de formulaire.
