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
# `auto` when the meter has nothing to measure is UNMEASURED, not zero.
#
# The meter needs LLM_INPUT_TOKENS / LLM_OUTPUT_TOKENS from the API response.
# Agents do not export them, so it returned 0 and `|| echo 0` turned even its
# refusal into a zero. All 35 agents pass `auto`, so every verdict in every
# project recorded a MEASURED zero: the portfolio reported $0.00 spend for
# twelve projects, and a per-agent budget would have read "spent $0.00 of $25,
# measured from verdicts" forever — a limit that could never fire, wearing the
# word `measured`.
#
# COST empty means the field is OMITTED from the record. Every reader downstream
# already distinguishes an absent cost from a zero one; they had nothing to
# distinguish.
if [ "$COST" = "auto" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  COST="$(node "$SCRIPT_DIR/lib/cost-meter.mjs" 2>/dev/null)" || COST=""
fi

# Validate cost is a non-negative number — when one was measured at all.
if [ -n "$COST" ] && ! [[ "$COST" =~ ^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$ ]]; then
  echo "error: cost_usd must be a non-negative number, got: $COST" >&2
  exit 1
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PROJ_DIR="${GREAT_CTO_DIR:-.great_cto}"

# A verdict is state about the PROJECT, not about a checkout of it.
#
# Agents run in git worktrees under .claude/worktrees/, each with its own
# .great_cto/. Three runs in a row wrote their verdict there: the pipeline reads
# the main tree, saw nothing, named no next stage, and a human copied the file
# across by hand every time. The worktree is then removed with the verdict inside
# it. Once the work was 105 passing tests that the pipeline could not see at all.
#
# `--git-common-dir` differs from `--git-dir` only in a linked worktree, and
# points at the main checkout's .git — so its parent is where .great_cto belongs.
# An explicit GREAT_CTO_DIR still wins: someone naming a directory means it.
if [ -z "${GREAT_CTO_DIR:-}" ]; then
  _COMMON=$(git rev-parse --git-common-dir 2>/dev/null || true)
  _GITDIR=$(git rev-parse --git-dir 2>/dev/null || true)
  if [ -n "$_COMMON" ] && [ "$_COMMON" != "$_GITDIR" ]; then
    _MAIN=$(cd "$(dirname "$_COMMON")" 2>/dev/null && pwd || true)
    [ -n "$_MAIN" ] && [ -d "$_MAIN" ] && PROJ_DIR="$_MAIN/.great_cto"
  fi
fi

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
# The fallback is the PROJECT's directory, not the checkout's. From inside a
# worktree, `basename $(pwd)` is the worktree name — a verdict tagged
# `project=wt-1786206189-78666`, which no project-scoped query will ever match
# and which reads as a different project in any cross-project view.
[ -z "$PROJECT_SLUG" ] && PROJECT_SLUG=$(basename "$(cd "$PROJ_DIR/.." 2>/dev/null && pwd || pwd)")

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

# A receipt: the fingerprint of exactly what this agent saw.
#
# Every other rung of the evidence ladder asks a question about the moment of
# review — did the stage report, does the artefact exist, does the check pass,
# does a second reader agree. None of them says whether the code that was
# reviewed is the code that shipped. An APPROVED verdict over one tree and a
# push over another both read green, because both rungs are answering questions
# about the past.
#
# Best-effort and never fatal: a verdict that cannot be fingerprinted is still a
# verdict. `RECEIPT=""` then means "no receipt", which the checker reports as its
# own state rather than as a match.
RECEIPT="$(node "$SCRIPT_DIR/lib/receipt.mjs" --emit 2>/dev/null || true)"

LINE=$(TS="$TS" AGENT="$AGENT" VERDICT="$VERDICT" COST="$COST" \
       PROJECT_SLUG="$PROJECT_SLUG" META="$META" RECEIPT="$RECEIPT" \
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
# The fallback log carries the same distinction: an unmeasured cost is written
# as `-`, never as 0, so a parser cannot read it back as spend.
echo "$TS $AGENT ${COST:--}" >> "$PROJ_DIR/cost-history.log"
