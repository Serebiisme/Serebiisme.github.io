#!/usr/bin/env bash
set -euo pipefail

source_repository="https://github.com/bojieli/ai-agent-book.git"
source_commit="c8963443736004412692b1af7706c89096d46e4e"
site_root=$(cd "$(dirname "$0")/.." && pwd -P)
sync_root=$(mktemp -d "${TMPDIR:-/tmp}/ai-agent-book-sync.XXXXXX")
checkout="$sync_root/source"

cleanup() {
  node -e 'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })' "$sync_root"
}
trap cleanup EXIT

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)'

git clone --filter=blob:none --no-checkout "$source_repository" "$checkout"
git -C "$checkout" checkout --detach "$source_commit"
source_date=$(git -C "$checkout" show -s --format=%cI "$source_commit")

(
  cd "$checkout/web-astro"
  export npm_config_registry="https://registry.npmjs.org/"
  export npm_config_replace_registry_host="never"
  npm ci
  npm run check
  npm run build
  npm test
)

original_editions="$sync_root/original-editions.json"
cp "$checkout/web-astro/src/lib/editions.json" "$original_editions"
node "$site_root/scripts/prune-ai-agent-book.mjs" \
  "$checkout" \
  "$checkout/web-astro/public" \
  "$original_editions" \
  "$site_root/overlays/ai-agent-book/editions.json"

cp "$site_root/overlays/ai-agent-book/editions.json" \
  "$checkout/web-astro/src/lib/editions.json"
cp "$site_root/overlays/ai-agent-book/src/components/Header.astro" \
  "$checkout/web-astro/src/components/Header.astro"
cp "$site_root/overlays/ai-agent-book/src/components/SupplementalReader.astro" \
  "$checkout/web-astro/src/components/SupplementalReader.astro"
cp "$site_root/overlays/ai-agent-book/src/pages/[supplement].astro" \
  "$checkout/web-astro/src/pages/[supplement].astro"

(
  cd "$checkout/web-astro"
  node "$site_root/scripts/prepare-supplemental-assets.mjs" \
    "$checkout" \
    "$checkout/web-astro/public"
  ASTRO_BASE=/learn/ai-agent-book/ npm run build
  node "$site_root/scripts/write-course-provenance.mjs" \
    "$checkout/web-astro/dist/SOURCE.md" \
    "$source_commit" \
    "$source_date"
  ASTRO_BASE=/learn/ai-agent-book/ npm run check:deployment
)

node "$site_root/scripts/import-ai-agent-book.mjs" \
  "$checkout/web-astro/dist" \
  "$site_root/learn/ai-agent-book" \
  "$checkout/LICENSE" \
  "$source_commit" \
  "$source_date"
