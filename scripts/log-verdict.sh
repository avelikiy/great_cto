#!/usr/bin/env bash
# scripts/log-verdict.sh — canonical verdict-line writer for great_cto agents.
#
# Why it exists:
#   - Agents write verdicts as plain `echo "<ts> | agent | verdict | …" >> file`.
#   - The board's /api/cost endpoint expects a `cost=$X` tag in the line.
#   - In practice agents forget. This helper makes the format mandatory and
#     also tees the cost into .great_cto/cost-history.log for fallback parsing.
#
# Usage:
#   scripts/log-verdict.sh <agent> <verdict> <cost_usd> [meta_kv...]
#
# Example:
#   scripts/log-verdict.sh architect APPROVED 0.50 feature=tenant-onboarding arch=docs/architecture/ARCH.md
#
# Writes:
#   .great_cto/verdicts/<agent>.log   ← project-local, includes project=<slug> tag
#   .great_cto/cost-history.log       ← <ts> <agent> <cost_usd> for fallback parsing
#
# Project attribution:
#   - Reads project slug from .great_cto/PROJECT.md when available
#   - Falls back to basename of cwd
#   - Tag `project=<slug>` is appended so global aggregators can still attribute
#
# Exit: 0 on success, 1 on bad args.

set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <agent> <verdict> <cost_usd> [meta_kv...]" >&2
  echo "  example: $0 architect APPROVED 0.50 feature=foo arch=docs/arch.md" >&2
  exit 1
fi

AGENT="$1"; shift
VERDICT="$1"; shift
COST="$1"; shift
META="$*"

# `auto` cost (DEEPEN-PIPELINE Wave 1, cost loop): instead of trusting a typed
# number, compute REAL USD from the API token usage via cost-meter. The caller
# exports LLM_MODEL / LLM_INPUT_TOKENS / LLM_OUTPUT_TOKENS from the response.usage.
#   scripts/log-verdict.sh architect APPROVED auto feature=foo   # with LLM_* env set
if [ "$COST" = "auto" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  COST="$(node "$SCRIPT_DIR/lib/cost-meter.mjs" 2>/dev/null || echo 0)"
  [ -z "$COST" ] && COST="0"
fi

# Validate cost is a non-negative number (allow scientific notation, decimals).
if ! [[ "$COST" =~ ^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$ ]]; then
  echo "error: cost_usd must be a non-negative number, got: $COST" >&2
  exit 1
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PROJ_DIR="${GREAT_CTO_DIR:-.great_cto}"

# Determine project slug: PROJECT.md `slug:` field → basename of cwd
PROJECT_SLUG=""
if [ -f "$PROJ_DIR/PROJECT.md" ]; then
  # `\s` is a GNU extension. BSD grep/sed (macOS, the primary dev platform here)
  # read it as a literal 's', so `^slug:\s*` matched "slug:" followed by any
  # number of the letter s — the leading space survived and PROJECT_SLUG came out
  # as " my-project". Written into a verdict line that reads `project= my-project`,
  # which the board's `project=([^\s|]+)` filter then captures as empty: every
  # project-scoped verdict query silently matched nothing.
  PROJECT_SLUG=$(grep -E '^slug:[[:space:]]*' "$PROJ_DIR/PROJECT.md" 2>/dev/null | head -1 | sed -E 's/^slug:[[:space:]]*//;s/[[:space:]]+$//' || true)
fi
[ -z "$PROJECT_SLUG" ] && PROJECT_SLUG=$(basename "$(pwd)")

# Emit the verdict as one versioned NDJSON record.
#
# The old format was `<ts> | <agent> | <verdict> | <meta> | cost=$X`, and the
# reader picked between it and a space-separated variant by asking whether the
# line contained ' | '. Agents write prose in the meta field, prose contains
# pipes, and "BLOCKED 3 findings | all in the auth path" was read as the pipe
# form with the verdict taken from after the second pipe. Named fields end that
# whole class: no punctuation a human types can move one field into another.
#
# Readers still accept both old dialects (scripts/lib/verdict-record.mjs), so
# every log written before today keeps reading.
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
LINE=$(TS="$TS" AGENT="$AGENT" VERDICT="$VERDICT" COST="$COST" \
       PROJECT_SLUG="$PROJECT_SLUG" META="$META" \
       node "$SCRIPT_DIR/lib/verdict-record.mjs" --emit) || {
  echo "error: could not build the verdict record" >&2
  exit 1
}

# Write to PROJECT-LOCAL ONLY. Previously also wrote to ~/.great_cto/verdicts/
# for cross-project aggregation, but that polluted every project's "AI spend"
# with sum of ALL projects' costs. The board now reads from per-project dirs;
# global is reserved for cron jobs that aggregate across projects.
mkdir -p "$PROJ_DIR/verdicts"
echo "$LINE" >> "$PROJ_DIR/verdicts/$AGENT.log"
echo "$TS $AGENT $COST" >> "$PROJ_DIR/cost-history.log"
