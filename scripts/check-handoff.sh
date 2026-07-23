#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

required=(
  README.md
  .env.example
  .lovable/project.json
  docs/PASSATION_COMPLETE.md
  docs/AI_HANDOFF.md
  docs/ARCHITECTURE.md
  docs/DESIGN_SYSTEM.md
  docs/ADD_A_MODULE.md
  docs/INTEGRATIONS.md
  docs/DEPLOYMENT.md
)

for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Fichier de passation manquant : $file" >&2
    exit 1
  fi
done

if ! grep -q '@lovable.dev/vite-tanstack-config' vite.config.ts; then
  echo "La configuration Vite Lovable/TanStack est absente." >&2
  exit 1
fi

if [[ -f .env.example ]] && grep -Eq '=(AIza|sk-|ya29\.|[A-Za-z0-9_-]{40,})' .env.example; then
  echo ".env.example semble contenir un secret réel." >&2
  exit 1
fi

if grep -rn \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.output --exclude-dir=release \
  --exclude=bun.lock --exclude=".env" \
  -E '(GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_OAUTH_REFRESH_TOKEN|ANTHROPIC_API_KEY)=[^[:space:]]+' .; then
  echo "Une valeur secrète semble être inscrite dans un fichier transmissible." >&2
  exit 1
fi

echo "Passation : documentation et contrôle des secrets OK."
