#!/usr/bin/env bash
# scripts/bench-run.sh — reproducible launcher for benchmark product runs.
#
# Encodes every wave-0 lesson so future runs don't rediscover them:
#   1. Clean env (env -i): the desktop session's ANTHROPIC_BASE_URL / SDK vars
#      break detached auth (401). Requires a standalone-CLI OAuth login
#      (`claude /login` in a terminal — the desktop app's token is separate).
#   2. CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0: without it, headless -p kills
#      the session 600s after the main turn while background subagents still
#      run (wave 0 lost WP-3 to this).
#   3. Benchmark-mode preamble: pre-answers /start's mandatory questions so the
#      run is truly unattended (approval-level auto = CTO pre-approval,
#      disclosed in BENCH methodology as "0 human actions").
#
# Usage:
#   bench-run.sh <product-dir> <brief-file>          # fresh run (/start)
#   bench-run.sh <product-dir> --resume "<message>"  # continue interrupted run
#
# Writes .bench-run-<n>.log in the product dir; prints PID. Non-blocking.

set -euo pipefail

DIR="${1:?usage: bench-run.sh <product-dir> <brief-file> | --resume \"<msg>\"}"
MODE="${2:?usage: bench-run.sh <product-dir> <brief-file> | --resume \"<msg>\"}"
DIR="$(cd "$DIR" && pwd)"

if [ "$MODE" = "--resume" ]; then
  PROMPT="${3:?--resume requires a continuation message}"
  RESUME_FLAG="--continue"
else
  BRIEF_FILE="$MODE"
  [ -f "$BRIEF_FILE" ] || { echo "brief file not found: $BRIEF_FILE" >&2; exit 1; }
  RESUME_FLAG=""
  PROMPT="/start \"$(cat "$BRIEF_FILE")\"

Benchmark mode — run fully unattended, skip questions. Pre-answered by CTO:
- mode: MVP
- team-size: solo
- infra cost cap: \$50/month
- geo: US-only
- size: standard (medium)
- approval-level: auto (CTO pre-approves architecture and ship — do NOT pause at any gate)

After PROJECT.md is written, proceed immediately through the full pipeline end-to-end:
architecture -> plan -> implementation with tests -> QA -> security review -> deploy to a
free preview (Vercel/Cloudflare) only if already authenticated, otherwise skip deploy and
note it. Never wait for human input; make reasonable decisions and record them in the
decision log. Prefer foreground execution over background subagents so no work is lost.
Commit work to git as you go."
fi

# Sequential run log (.bench-run-1.log, -2.log, …) so restarts never clobber evidence.
N=1
while [ -e "$DIR/.bench-run-$N.log" ]; do N=$((N + 1)); done
LOG="$DIR/.bench-run-$N.log"

cd "$DIR"

# Optional API-key mode: if ~/.great_cto/secrets.env defines ANTHROPIC_API_KEY,
# runs bill per-token against the API instead of the subscription's shared 5-hour
# session limit — which is what lets several products run in parallel without
# starving each other. The key lives OUTSIDE the repo (never committed); we read
# it here and forward it through the otherwise-clean env -i. Absent → subscription
# OAuth as before. Reported in BENCH methodology per product (which billing mode).
API_KEY_PASSTHRU=()
if [ -f "$HOME/.great_cto/secrets.env" ]; then
  # shellcheck disable=SC1091
  KEY_VAL="$(grep -E '^ANTHROPIC_API_KEY=' "$HOME/.great_cto/secrets.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  if [ -n "$KEY_VAL" ]; then
    API_KEY_PASSTHRU=(ANTHROPIC_API_KEY="$KEY_VAL")
    echo "billing: API key (session-limit bypassed)"
  fi
fi
[ ${#API_KEY_PASSTHRU[@]} -eq 0 ] && echo "billing: subscription OAuth"

# shellcheck disable=SC2086  # RESUME_FLAG is intentionally word-split (empty or --continue)
nohup env -i \
  HOME="$HOME" PATH="$PATH" USER="$USER" LOGNAME="$USER" \
  SHELL="${SHELL:-/bin/zsh}" TMPDIR="${TMPDIR:-/tmp}" \
  ${API_KEY_PASSTHRU[@]+"${API_KEY_PASSTHRU[@]}"} \
  CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 \
  claude -p $RESUME_FLAG "$PROMPT" --dangerously-skip-permissions \
  > "$LOG" 2>&1 &

PID=$!
echo "launched pid=$PID log=$LOG"
echo "watch:   tail -f $LOG"
echo "collect: node scripts/bench-collect.mjs $DIR --slug $(basename "$DIR") --out ~/bench/results.jsonl"
