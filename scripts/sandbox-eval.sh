#!/usr/bin/env bash
# scripts/sandbox-eval.sh — Phase 4: isolated candidate-prompt dry-run.
#
# Ports SIA's venv-per-run + _run_target_agent_sandboxed isolation discipline to
# great_cto's eval loop. Runs the holdout eval suite for a CANDIDATE agent prompt
# in a throwaway working copy, under a wall-clock timeout, so an LLM-generated /
# edited prompt is exercised in isolation BEFORE it touches the live pipeline.
#
# It never mutates the live agents/ dir: the candidate is copied into a temp
# sandbox, evals run there, and the sandbox is removed on exit.
#
# Usage:
#   scripts/sandbox-eval.sh <agent-name> [candidate-prompt-file] [--timeout SECONDS]
#
# Env:
#   ANTHROPIC_API_KEY   required for a live run (omit for --dry-run smoke).
#   SANDBOX_TIMEOUT     default 600 (seconds), overridable via --timeout.
#
# Exit: propagates the runner's exit code (0 = holdout passed, 1 = below threshold,
#       124 = timed out, 2 = bad args).

set -euo pipefail

AGENT="${1:-}"
[ -z "$AGENT" ] && { echo "usage: $0 <agent-name> [candidate-file] [--dry-run] [--timeout S]" >&2; exit 2; }
shift || true

CANDIDATE=""
DRY_RUN=0
TIMEOUT="${SANDBOX_TIMEOUT:-600}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) CANDIDATE="$1"; shift ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_FILE="${CANDIDATE:-$REPO_ROOT/agents/${AGENT}.md}"
[ ! -f "$AGENT_FILE" ] && { echo "ERROR: agent prompt not found: $AGENT_FILE" >&2; exit 2; }

# Throwaway sandbox — isolated working copy, auto-removed (SIA runs/<id>/ discipline).
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/gcto-sandbox-${AGENT}.XXXXXX")"
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

mkdir -p "$SANDBOX/agents" "$SANDBOX/tests/eval"
cp "$AGENT_FILE" "$SANDBOX/agents/${AGENT}.md"
# Bring the eval suite + runner into the sandbox (read-only intent; copied so the
# live tree is never written to).
cp "$REPO_ROOT"/tests/eval/runner.mjs "$SANDBOX/tests/eval/" 2>/dev/null || true
cp "$REPO_ROOT"/tests/eval/EVAL-*.md "$SANDBOX/tests/eval/" 2>/dev/null || true

echo "Sandbox: $SANDBOX"
echo "Agent:   $AGENT  (prompt: $AGENT_FILE)"
echo "Timeout: ${TIMEOUT}s · holdout split"

# Pick a timeout binary (GNU coreutils `timeout` or macOS `gtimeout`); degrade if absent.
TIMEOUT_BIN=""
command -v timeout >/dev/null 2>&1 && TIMEOUT_BIN="timeout"
[ -z "$TIMEOUT_BIN" ] && command -v gtimeout >/dev/null 2>&1 && TIMEOUT_BIN="gtimeout"

RUN=(node "$SANDBOX/tests/eval/runner.mjs" --split holdout)
[ "$DRY_RUN" -eq 1 ] && RUN+=(--dry-run)

set +e
if [ -n "$TIMEOUT_BIN" ]; then
  ( cd "$SANDBOX" && "$TIMEOUT_BIN" "$TIMEOUT" "${RUN[@]}" )
else
  echo "::warning:: no timeout binary found — running without wall-clock guard" >&2
  ( cd "$SANDBOX" && "${RUN[@]}" )
fi
CODE=$?
set -e

echo "Sandbox run exited: $CODE"
exit "$CODE"
