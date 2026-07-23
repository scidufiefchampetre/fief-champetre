// Authentification Google via OAuth "compte perso" (flux refresh token),
// utilisée pour Calendar, Sheets et Drive.
//
// Pourquoi pas un compte de service : Google bloque par défaut la création de
// clés de compte de service sur les nouveaux projets (politique de sécurité
// "iam.disableServiceAccountKeyCreation"), et la débloquer demande un rôle
// d'administration d'organisation que les comptes Gmail personnels n'ont pas.
// L'OAuth "compte perso" contourne complètement ce problème : Alain autorise
// l'app une seule fois avec son propre compte Google, et l'app agit ensuite
// en son nom — pas de clé, pas de partage de Calendar/Sheet/Drive nécessaire
// puisqu'il y a déjà accès.
//
// Variables d'env nécessaires :
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//
// Voir docs/INTEGRATIONS.md pour la procédure complète d'obtention de ces valeurs
// (écran de consentement OAuth + Google OAuth Playground).

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function getClientId(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_ID manquante");
  return v;
}
function getClientSecret(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET manquante");
  return v;
}
function getRefreshToken(): string {
  const v = process.env.GOOGLE_OAUTH_REFRESH_TOKEN ?? "";
  if (!v) throw new Error("GOOGLE_OAUTH_REFRESH_TOKEN manquante");
  return v;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Récupère (et met en cache) un access token via le refresh token OAuth.
 * Le paramètre `scopes` est conservé pour compatibilité d'appel avec le
 * reste du code, mais un refresh token OAuth "compte perso" couvre déjà
 * tous les scopes accordés lors de l'autorisation initiale — inutile de le
 * repréciser à chaque échange.
 */
export async function getGoogleAccessToken(_scopes: string[]): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: getRefreshToken(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google OAuth refresh failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}
