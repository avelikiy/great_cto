#!/usr/bin/env bash
# scripts/mods-test.sh — the plugin's mod (hooks/hooks.json → modules), checked by
# the engine that loads it: `claude plugin validate` on the plugin, then
# `claude plugin test` on its *.test.ts.
#
# The tests run on a copy holding only what the mod is — the manifest, hooks/,
# types/ and tests/mods/ — because `claude plugin test <dir>` runs every *.test.ts
# under <dir>, and the repository root also holds node_modules.
#
# No `claude` on PATH is "not measured", printed as a skipped test so ci-local
# counts it — never a pass.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v claude >/dev/null 2>&1; then
  echo "mods: claude CLI not on PATH — not measured"
  echo "# skip 1"
  exit 0
fi

claude plugin validate "$ROOT" || exit 1

COPY="$(mktemp -d "${TMPDIR:-/tmp}/great-cto-mod.XXXXXX")"
trap 'rm -rf "$COPY"' EXIT
mkdir -p "$COPY/.claude-plugin" "$COPY/tests"
cp "$ROOT/.claude-plugin/plugin.json" "$COPY/.claude-plugin/"
cp -R "$ROOT/hooks" "$ROOT/types" "$COPY/"
cp -R "$ROOT/tests/mods" "$COPY/tests/"
claude plugin test "$COPY"
