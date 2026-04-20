#!/usr/bin/env bash
# E2E runner for great_cto pipeline fixtures.
#
# Usage:
#   tests/e2e/run_pipeline.sh <fixture-name> [--assert-only]
#
# Phases:
#   1. Copy tests/fixtures/<name> to a throwaway tmpdir.
#   2. Initialise it as a git repo (needed by many pipeline commands).
#   3. If $CLAUDE_CLI_AVAILABLE=1, invoke `claude -p "/audit" --output-format text`
#      inside the tmpdir to exercise the real pipeline.
#      Otherwise skip runtime and expect caller to have populated artefacts manually.
#   4. Assert expected/manifest.json requirements against the tmpdir.
#
# Exit code 0 on success, non-zero with a diagnostic on first failure.

set -euo pipefail

FIXTURE="${1:-}"
if [ -z "$FIXTURE" ]; then
  echo "usage: $0 <fixture-name> [--assert-only]" >&2
  exit 2
fi

MODE="${2:-full}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURE_DIR="$ROOT/tests/fixtures/$FIXTURE"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "FAIL: fixture not found: $FIXTURE_DIR" >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# Phase 1 — materialise fixture in a tmpdir
# -----------------------------------------------------------------------------

TMPDIR="$(mktemp -d -t "great_cto-$FIXTURE-XXXX")"
trap 'rm -rf "$TMPDIR"' EXIT

cp -R "$FIXTURE_DIR/." "$TMPDIR/"
# Drop golden manifest from the working copy so agents don't see it.
rm -rf "$TMPDIR/expected"

cd "$TMPDIR"
git init -q
git add -A
git -c user.email="test@great-cto.local" -c user.name="test" commit -q -m "fixture bootstrap"

echo "→ fixture materialised at $TMPDIR"

# -----------------------------------------------------------------------------
# Phase 2 — optional: run /audit via claude CLI
# -----------------------------------------------------------------------------

if [ "$MODE" != "--assert-only" ] && [ "${CLAUDE_CLI_AVAILABLE:-0}" = "1" ]; then
  if ! command -v claude >/dev/null 2>&1; then
    echo "FAIL: CLAUDE_CLI_AVAILABLE=1 but claude not in PATH" >&2
    exit 1
  fi
  echo "→ running /audit via claude -p (this may take several minutes)"
  claude -p "/audit" --output-format text || {
    echo "FAIL: claude -p /audit exited non-zero" >&2
    exit 1
  }
else
  echo "→ skipping claude -p (CLAUDE_CLI_AVAILABLE unset or --assert-only)"
fi

# -----------------------------------------------------------------------------
# Phase 3 — assert expected manifest
# -----------------------------------------------------------------------------

python3 "$ROOT/tests/e2e/assert_manifest.py" "$FIXTURE_DIR/expected/manifest.json" "$TMPDIR"
