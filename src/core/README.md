# Core — le tronc commun

Tout ce qui est ici est **générique** : utilisé par plusieurs modules (ou par
tous), et ne contient aucune logique métier propre à un module (Factures,
Réservations, futurs modules Netatmo/Enedis…).

- `google/` — accès bas niveau à Sheets, Drive, Calendar + OAuth. Aucun module
  ne doit parler à l'API Google directement : il passe toujours par ici.
- `ai/` — accès générique à l'IA (actuellement Anthropic Claude pour l'analyse de
  factures, mais pensé pour être réutilisé par d'autres modules plus tard).
- `store/` — l'état partagé entre tous les modules : qui est identifié
  (`member`), quel classeur Google est utilisé (`spreadsheetId`), etc.
- `components/` — UI générique utilisée par tous les modules : header,
  menu burger, écran d'identification, sélecteur de thème.
- `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts` —
  infrastructure d'erreurs, transverse à toute l'app.

## Ce qui n'est PAS ici

Tout ce qui est propre à un module (types, logique métier, composants
spécifiques à Factures ou Réservations) reste dans `src/lib/` et
`src/components/` pour l'instant — le rangement en `src/modules/<nom>/` se
fait module par module, dans un chantier séparé.

Les routes (`src/routes/*.tsx`) restent à leur emplacement (obligatoire pour
le routeur TanStack Start) — elles ne font qu'importer depuis `core/` et les
modules, sans contenir de logique métier elles-mêmes à terme.
