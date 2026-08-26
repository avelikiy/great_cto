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
# The sibling question. guard-parity asks whether a guard EXECUTES; this asks
# whether a declaration is CONSUMED. Four agents could write a verdict nothing
# would act on — including senior-dev's own refuse-a-bad-plan escape hatch — and
# all four were found by this check rather than by anyone noticing.
step "declarations have consumers" node scripts/lib/declared-consumed.mjs --strict
# The question underneath the other two. guard-parity asks whether a guard
# EXECUTES; declared-consumed asks whether a declaration is CONSUMED; this asks
# whether the dispatcher could ACT AT ALL in a given project.
#
# It was bought by the map being resolved against the project instead of the
# plugin: thirteen of seventeen registered projects hit `return process.exit(0)`
# and said nothing — no dispatch, no verdict, no task, nowhere to look. The
# pipeline reported success while being incapable of running.
step "the pipeline can run where it is installed" node scripts/lib/pipeline-health.mjs --strict
# The same question one layer down. A CSS rule written above the rules it
# overrides loses at equal specificity and applies to nothing, while reading as
# entirely correct in the diff — it happened twice in two days on the board's
# phone layout, and both times it was found by looking at the rendered page
# rather than the source. Declared is not applied.
step "css declarations apply" bash -c '
  for f in packages/board/public/index.html packages/board/public/share.html; do
    node scripts/lib/css-cascade.mjs "$f" || exit 1
  done
'

# Two layers further down, and the reason both of these are wired here rather
# than only unit-tested: css-tokens.mjs and css-type-scale.mjs already existed,
# already had passing tests, and were pointed at NOTHING. Run against the board
# they exited 0 in silence — including against a file with an undeclared token
# and an off-scale size planted in it — because neither had a CLI entry point at
# all. A check nobody calls and a check that cannot fail are the same artefact.

# A var(--x) with no --x is dropped at computed-value time and the element
# renders as if that line were never written; with a fallback it paints a
# hardcoded value and survives the theme switch that was supposed to change it.
# Both look exactly like a declaration that worked.
step "css tokens resolve" bash -c '
  for f in packages/board/public/index.html packages/board/public/share.html; do
    node scripts/lib/css-tokens.mjs "$f" || exit 1
  done
'

# Type scale, index.html only — and the omission is deliberate rather than
# overlooked. share.html is a self-contained report published to an external
# host, with its own palette and its own visual language (a 92px hero figure
# that belongs to nothing in the admin chrome). It carries 16 distinct sizes
# including 9.5 and 10.5 — the shape of a scale being invented one declaration
# at a time — and giving it one is a design decision about a public-facing
# artefact, not a mechanical snap. Named here so it reads as known and unbudgeted
# rather than as covered.
step "css type scale" bash -c '
  node scripts/lib/css-type-scale.mjs packages/board/public/index.html
'

# The verifier that checks the agents must itself be checked, and in both
# directions. A verifier that only ever returns rework sends correct work back
# forever and gets switched off within a day; one that only ever returns
# verified is the self-report it was built to replace. The suite carries one
# fixture of each, with the answer known before the run.
step "independent verifier: both directions" bash -c '
  node --test tests/lib/independent-verify.test.mjs
'

# A cost figure must not depend on when the repository was cloned. `git clone`
# writes every file at clone time, so dating a plan by mtime collapsed thirteen
# dates into one and made the 30-day window return the project's entire history.
# The test changes timestamps and asserts the answer does not move.
step "plan dates ignore the filesystem" bash -c '
  node --test tests/lib/plan-date.test.mjs
'

# Every agent read $0.00 while the real spend sat measured on the same disk, in
# a file the board could not parse, priced by a guess that tripled it. Four
# links, each present and each broken in a way that looked like "nothing has
# been measured yet".
step "measured cost reaches the board" bash -c '
  node --test tests/lib/measured-cost.test.mjs
'

# The other half: a cap that cannot refuse is not a cap. Budgets existed for
# weeks and never held anything back — the rule they rest on (an estimate never
# refuses) was, in practice, a permanent open gate, because nothing measured ever
# reached the judge. Walks the whole chain and asserts all four states.
step "agent budgets actually refuse" bash -c '
  node --test tests/hooks/budget-fires.test.mjs
'

# Quality kept apart from what happened. The property that earns the separation:
# an unassessed run has a NULL value, never 0, and a pass rate divides by the
# assessed count. Nine unverifiable runs and one verified one is 100% of 1, not
# 10% — the second is a number about work nobody looked at.
step "scores: unassessed is not zero" bash -c '
  node --test tests/lib/scores.test.mjs
'

# One number must not mean two things. `runs` was incremented once per priced
# verdict and once per closed task on days with no cost, so its meaning changed
# from day to day — and it disagreed with the verdict logs in both directions.
# The property: agent runs in a window equals verdicts in that window, whatever
# was or was not priced.
step "agent runs match the verdict logs" bash -c '
  node --test tests/lib/cost-runs.test.mjs
'

# What a stage produces is declared in the map, not in JavaScript. Borrowed from
# Pipelex, where every step declares its typed output — here one direction,
# because what a stage consumes is implied by what its predecessor produced.
#
# The check REPORTS coverage and fails only on a contract that is declared and
# unreadable. Failing on absence would push people to invent contracts to silence
# it, and an invented contract makes verification reject work for not producing
# something nobody wanted.
step "stage output contracts" bash -c '
  node scripts/lib/pipeline-contract.mjs shared/pipeline.toml
  node --test tests/lib/pipeline-contract.test.mjs
'

# Install it the way someone who just found it would.
#
# `great-cto init` clones the repo into the plugin cache, and packages/cli/dist
# is a build artefact — five of its thirty-two files are in git by accident,
# archetypes.js is not. So a cloned plugin got 5 of 32 and the board died on
# ERR_MODULE_NOT_FOUND. It worked for the author (install-local.sh from a built
# working tree) and from the npm tarball (ships all 32), and failed on the one
# path a new user takes. Nothing in this suite walked that path, so the board was
# unstartable for every new user across several releases with CI fully green.
step "installs for a stranger, not just the author" bash -c '
  node --test tests/install-as-a-stranger.test.mjs
'

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
