# Déploiement

L’application utilise TanStack Start avec fonctions serveur et accès secrets.
Elle doit être hébergée sur une plateforme exécutant le serveur généré ; un
hébergement statique seul ne convient pas.

## Préparation

```bash
bun install --frozen-lockfile
bun run check
```

Le build est généré dans `.output/`. La configuration actuelle fournie par
Lovable cible Cloudflare par défaut.

## Cloudflare / Lovable

1. Configurer toutes les variables de `.env.example` dans les secrets du projet.
2. Lancer `bun run build`.
3. Déployer la sortie Nitro/Cloudflare produite dans `.output/` selon
   l’interface de la plateforme.
4. Vérifier `/`, `/profil`, `/agenda`, `/chantiers` et `/admin`.
5. Réaliser une écriture de test puis la supprimer.

Documentation :

- [Déploiement Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [TanStack Start](https://tanstack.com/start/latest)
- [Lovable](https://docs.lovable.dev/)

Lovable ne peut pas importer un dépôt GitHub existant comme nouveau projet.
Pour conserver l’édition dans Lovable, utiliser le projet d’origine et le dépôt
créé par sa connexion GitHub bidirectionnelle. Voir `PASSATION_COMPLETE.md`.

## Autre hébergeur

Adapter la cible Nitro dans la configuration Vite pour l’hébergeur choisi. Ne
pas convertir l’application en export statique : les fonctions serveur et les
secrets Google/Anthropic doivent rester côté serveur.

## Archive de passation

`bun run package:handoff` exécute les contrôles puis génère un zip source propre
dans `release/`. Il inclut le manifeste `.lovable/project.json` et exclut les
secrets, dépendances installées, caches, builds et métadonnées Git. Son nom
contient l’heure de création et une empreinte des sources pour
éviter toute confusion avec une ancienne pièce jointe. La personne ou l’IA qui
reprend le projet lance ensuite `bun install --frozen-lockfile` et
`bun run check`.
