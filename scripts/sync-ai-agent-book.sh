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
  npm ci
  npm test
  npm run check
)

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
  ASTRO_BASE=/learn/ai-agent-book/ npm run build
  ASTRO_BASE=/learn/ai-agent-book/ npm run check:deployment
)

node "$site_root/scripts/import-ai-agent-book.mjs" \
  "$checkout/web-astro/dist" \
  "$site_root/learn/ai-agent-book" \
  "$checkout/LICENSE" \
  "$source_commit" \
  "$source_date"
