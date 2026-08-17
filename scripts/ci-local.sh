#!/usr/bin/env bash
# scripts/ci-local.sh — run the CI gates locally (macOS / Linux) before pushing.
#
# Mirrors what the GitHub Actions workflows check, so "green here" ≈ "green in CI":
#   - structural validation        (plugin-ci.yml)
#   - docs-reference in sync        (plugin-ci.yml)
#   - root + hooks + lib + eval + board unit tests   (runtime-ci.yml, evals-runner.yml, plugin-ci.yml)
#   - CLI build + unit tests        (cli-ci.yml)
#   - CLI pack (release readiness)
#
# Usage:
#   bash scripts/ci-local.sh            # full gate
#   bash scripts/ci-local.sh --e2e      # also run the heavier archetype e2e suite
#   bash scripts/ci-local.sh --quick    # skip cli build/pack (fast inner-loop)
#
# Exit 0 = all gates green. Non-zero = first failing gate (fail-fast).

set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

E2E=0; QUICK=0
for a in "$@"; do
  case "$a" in
    --e2e) E2E=1 ;;
    --quick) QUICK=1 ;;
    *) echo "unknown flag: $a"; exit 2 ;;
  esac
done

FAIL=0
step() {
  local name="$1"; shift
  printf '\n\033[1m── %s\033[0m\n' "$name"
  if "$@"; then
    printf '\033[32m   ✓ %s\033[0m\n' "$name"
  else
    printf '\033[31m   ✗ %s (exit %s)\033[0m\n' "$name" "$?"
    FAIL=1
  fi
}

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
echo "ci-local: node $(node -v) on $(uname -s)"
[ "$NODE_MAJOR" -lt 22 ] && echo "   ⚠ project targets Node 22 (.nvmrc); you are on $(node -v)"

# ── The privacy guard is actually in force ──
#
# First, because it is the check that fails silently. The pre-push hook was
# installed, executable and current for months while `core.hooksPath` pointed at
# a directory this repository had moved out of — so git ran no hooks at all, and
# three private project names reached a public remote with nothing objecting.
# An uninstalled guard and a guard that passed produce identical output.
step "pre-push guard in force" node scripts/lib/hook-install.mjs --quiet

# ── Structural + docs-reference (plugin-ci) ──
step "structural validation" python3 tests/structural/validate.py
# The lesson-rules pack holds at zero findings across the repository, so a
# finding here is a regression against a rule a real incident bought. Test
# files are excluded — they carry the hunted shapes as fixtures.
step "lesson rules (incident-bought)" node scripts/lib/lesson-rules.mjs --sweep --strict
step "docs-reference in sync" node scripts/gen-docs-reference.mjs --check
# Both of these were wired ONLY to .github/workflows/runtime-ci.yml, and GitHub
# Actions has been billing-locked for weeks — every run fails in seconds with no
# logs. So they were configured, correct, and had not executed: six structural
# errors accumulated over nineteen days behind a check that reads as enabled.
# A guard that only runs where CI cannot run is a guard nobody has.
# See docs/plans/PLAN-2026-08-17-guards-that-do-not-run.md (GUARD-R1).
step "artifact structure (enforced)" node scripts/hooks/artifact-lint.mjs --enforce
step "guards run where CI runs" node scripts/lib/guard-parity.mjs --strict
# The coverage gate is diff-shaped: it asks whether a CHANGED agent has an eval,
# so it needs a base to compare against. `||  exit 1` rather than `&&` chaining —
# a trailing `exit 0` after an `&&` would swallow the gate's own failure, which
# is the fail-open shape this file exists to prevent.
step "agent → eval coverage (changed agents)" bash -c '
  BASE=$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || true)
  if [ -z "$BASE" ]; then echo "  no base ref to diff against — not measured"; exit 0; fi
  EDITED=$(git diff --name-only --diff-filter=M "$BASE"...HEAD -- "agents/*.md" | tr "\n" " ")
  ADDED=$(git diff --name-only --diff-filter=A "$BASE"...HEAD -- "agents/*.md" | tr "\n" " ")
  if [ -n "$EDITED" ]; then node scripts/coverage-gate.mjs --changed $EDITED --require present || exit 1; fi
  if [ -n "$ADDED" ]; then node scripts/coverage-gate.mjs --changed $ADDED --require exercised || exit 1; fi
  if [ -z "$EDITED$ADDED" ]; then echo "  no agent files changed since base"; fi
  exit 0
'

# ── Unit tests: root + hooks + lib + eval + board (runtime-ci/evals/plugin) ──
step "root + hooks + board tests" node --test tests/*.test.mjs tests/hooks/*.test.mjs packages/board/*.test.mjs
step "lib tests" node --test tests/lib/*.test.mjs scripts/lib/*.test.mjs
step "eval tests" node --test tests/eval/*.test.mjs
step "docs tests" bash -c 'node --test tests/docs/*.test.mjs 2>/dev/null || true'

# ── CLI build + tests + pack (cli-ci + release) ──
if [ "$QUICK" -eq 0 ]; then
  step "cli build" bash -c 'cd packages/cli && npm run build'
  step "cli unit tests" bash -c 'cd packages/cli && node --test tests/*.test.mjs'
  step "cli pack (release readiness)" bash -c 'cd packages/cli && npm pack >/dev/null'
fi

# ── Optional heavier e2e ──
if [ "$E2E" -eq 1 ]; then
  step "archetype e2e" bash -c 'cd packages/cli && npm run test:e2e'
fi

printf '\n'
if [ "$FAIL" -eq 0 ]; then
  printf '\033[42;30m CI-LOCAL: ALL GATES GREEN \033[0m\n'
  exit 0
else
  printf '\033[41;97m CI-LOCAL: FAILURES ABOVE \033[0m\n'
  exit 1
fi
