export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>La page ne s’est pas chargée</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #F0EEE9; color: #242226; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; border-radius: 1.5rem; background: #F8F7F4; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #77737A; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.75rem 1rem; border-radius: 1rem; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #685BC7; color: #FBFAF9; }
      .secondary { background: transparent; color: #242226; border-color: #D9D6D2; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>La page ne s’est pas chargée</h1>
      <p>Tu peux réessayer ou revenir à l’accueil.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Réessayer</button>
        <a class="secondary" href="/">Accueil</a>
      </div>
    </div>
  </body>
</html>`;
}
