#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

bash scripts/check-handoff.sh
bun run check

release_dir="$project_dir/release"
release_stamp="$(date +%Y-%m-%d_%H-%M-%S)"
source_hash="$(
  find src public docs scripts .lovable -type f ! -name '.DS_Store' -print0 \
    | sort -z \
    | xargs -0 shasum -a 256
  shasum -a 256 package.json bun.lock vite.config.ts tsconfig.json README.md AGENTS.md .env.example
)"
source_hash="$(printf '%s' "$source_hash" | shasum -a 256 | cut -c1-10)"
archive_name="fief-champetre-source_${release_stamp}_${source_hash}.zip"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/fief-handoff.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT

mkdir -p "$release_dir"

zip -qr "$temp_dir/$archive_name" . \
  -x '.env' '.DS_Store' '*/.DS_Store' \
  -x '.git/*' '.claude/*' \
  -x 'node_modules/*' '.output/*' 'dist/*' 'dist-ssr/*' \
  -x '.vinxi/*' '.tanstack/*' '.nitro/*' '.wrangler/*' \
  -x 'release/*' '*.log'

{
  echo "# Version de livraison"
  echo
  echo "- Créée le : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- Empreinte des sources : $source_hash"
  echo "- Archive : $archive_name"
  echo
  echo "Cette archive contient les sources exactes, pas une maquette à recréer."
  echo "Pour retrouver la même interface : utiliser Bun, exécuter 'bun install --frozen-lockfile',"
  echo "copier '.env.example' vers '.env', renseigner les accès, puis lancer 'bun run dev'."
} > "$temp_dir/RELEASE_INFO.md"

(cd "$temp_dir" && zip -q "$archive_name" RELEASE_INFO.md)

archive_listing="$(unzip -Z1 "$temp_dir/$archive_name")"

if grep -Eq '(^|/)(\.git|\.claude|node_modules|\.output)/|\.DS_Store' <<< "$archive_listing"; then
  echo "L'archive contient un fichier technique qui devait être exclu." >&2
  exit 1
fi

if ! grep -q '\.lovable/project.json' <<< "$archive_listing"; then
  echo "L’archive ne contient pas le manifeste Lovable." >&2
  exit 1
fi

mv "$temp_dir/$archive_name" "$release_dir/$archive_name"

echo "$release_dir/$archive_name"
