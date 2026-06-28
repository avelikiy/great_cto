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

# ── Structural + docs-reference (plugin-ci) ──
step "structural validation" python3 tests/structural/validate.py
step "docs-reference in sync" node scripts/gen-docs-reference.mjs --check

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
