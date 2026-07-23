# Intégrations, variables et liens

## Variables d’environnement

Copier `.env.example` vers `.env`. Toutes les variables restent exclusivement
côté serveur.

| Variable                          | Obligatoire | Usage                                                        |
| --------------------------------- | :---------: | ------------------------------------------------------------ |
| `GOOGLE_OAUTH_CLIENT_ID`          |     ✅      | Client OAuth Google                                          |
| `GOOGLE_OAUTH_CLIENT_SECRET`      |     ✅      | Secret OAuth Google                                          |
| `GOOGLE_OAUTH_REFRESH_TOKEN`      |     ✅      | Accès durable au compte propriétaire                         |
| `GOOGLE_CALENDAR_ID`              |     ✅      | Agenda partagé                                               |
| `GOOGLE_SHEETS_SPREADSHEET_ID`    |     ✅      | Classeur principal (SCI, Asso, Membres, Réservations)        |
| `GOOGLE_CHANTIERS_SPREADSHEET_ID` |     ✅      | Classeur Chantiers (créé auto si absent)                     |
| `GOOGLE_DRIVE_FOLDER_SCI_ID`      |     ✅      | Dossier Drive justificatifs SCI                              |
| `GOOGLE_DRIVE_FOLDER_ASSO_ID`     |     ✅      | Dossier Drive justificatifs Asso                             |
| `ADMIN_SCI_PASSWORD`              |     ✅      | Mot de passe espace Trésorier SCI                            |
| `ADMIN_ASSO_PASSWORD`             |     ✅      | Mot de passe espace Trésorier Asso                           |
| `ANTHROPIC_API_KEY`               |      —      | Analyse auto des factures par IA (saisie manuelle si absent) |
| `ANTHROPIC_MODEL`                 |      —      | Modèle Anthropic (défaut : claude-haiku-4-5-20251001)        |
| `GOOGLE_FEEDBACK_SPREADSHEET_ID`  |      —      | Classeur Bugs/Idées (créé auto au premier retour)            |
| `VITE_USE_MOCK_DATA`              |      —      | `true` pour désactiver tous les appels Google en dev         |
| `CLOUDFLARE_API_TOKEN`            |      —      | Déploiement wrangler uniquement                              |

## Google OAuth

Activer Google Calendar API, Google Sheets API et Google Drive API dans
[Google Cloud Console](https://console.cloud.google.com/). Le refresh token doit
porter les scopes :

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive`

Créer le token via [Google OAuth Playground](https://developers.google.com/oauthplayground/)
avec son propre client OAuth. L’utilisateur autorisé doit avoir accès aux
ressources configurées.

Liens d’administration utiles :

- [Identifiants Google Cloud](https://console.cloud.google.com/apis/credentials)
- [Écran de consentement OAuth](https://console.cloud.google.com/apis/credentials/consent)
- [Google Drive](https://drive.google.com/)
- [Google Calendar](https://calendar.google.com/)

## Anthropic

Créer et suivre la clé dans la
[console Anthropic](https://console.anthropic.com/settings/keys). Si l’analyse
échoue, l’interface bascule vers la saisie manuelle afin de ne pas bloquer le
dépôt.

## Règles de sécurité

- Ne jamais préfixer ces variables avec `VITE_` : elles deviendraient publiques.
- Ne pas transmettre `.env` à une IA ni l’inclure dans une archive.
- Révoquer immédiatement un token exposé.
- L’administration actuelle est volontairement ouverte. Pour un usage public,
  la remplacer par une authentification individuelle et journalisée.
