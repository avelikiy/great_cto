#!/usr/bin/env bash
# Re-render the terminal GIFs from their tapes.
#
# The tapes are the source; the GIFs are build output. A GIF recorded by hand
# drifts from the CLI exactly the way a hand-taken screenshot drifts from the UI,
# and nothing can tell — so this is scripted, and it runs against the same seeded
# fixture the screenshots use rather than the operator's own projects.
#
#   brew install vhs        # also pulls ttyd + ffmpeg
#   bash scripts/record-tapes.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v vhs >/dev/null || { echo "vhs is not installed — brew install vhs"; exit 2; }

# A short, fixed path: the CLI prints its working directory, and a mktemp path
# puts a different machine-specific string in the recording every time — noise in
# the frame and a diff on every re-render.
# /tmp/great-cto-demo, not $TMPDIR: on macOS TMPDIR is a long per-user path
# that lands in every frame and changes per machine.
TMP="/tmp/great-cto-demo"
rm -rf "$TMP"
trap 'rm -rf "$TMP"' EXIT
export GCTO_FIXTURE="$TMP/acme-storefront"
mkdir -p "$GCTO_FIXTURE"
node -e "import('$ROOT/scripts/lib/screenshot-fixture.mjs').then(m=>m.buildFixture(process.argv[1]))" "$GCTO_FIXTURE"

# `register` writes to ~/.great_cto/projects.json. A recording must not touch the
# operator's real registry — and a recording made against it would put their own
# project list in a public GIF. Same rule as the screenshots.
export HOME="$TMP/home"
mkdir -p "$HOME/.great_cto"

# `npx great-cto` inside the fixture must reach THIS checkout, not the registry —
# a recording of the published version would document a release we have not made.
mkdir -p "$GCTO_FIXTURE/node_modules/.bin"
ln -sf "$ROOT/packages/cli/index.mjs" "$GCTO_FIXTURE/node_modules/.bin/great-cto"
chmod +x "$ROOT/packages/cli/index.mjs"

for tape in docs/tapes/*.tape; do
  echo "▸ $(basename "$tape")"
  vhs "$tape"
done

echo
echo "GIFs written:"
ls -lh docs/tapes/*.gif | awk '{printf "  %s  %s\n", $9, $5}'
