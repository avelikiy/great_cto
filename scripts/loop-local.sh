#!/usr/bin/env bash
# scripts/loop-local.sh — the self-improvement loop, run on this mac.
#
# `.github/workflows/scheduled-evals-drift.yml` is the source of truth when
# GitHub Actions is healthy. It is not: every run for weeks has failed in 4-11
# seconds with no logs, which is the billing signature rather than a workflow
# error. So the schedule is correct and inert, and this is the working loop —
# the same shape as scripts/cd-local.sh, for the same reason.
#
# Two stages, and only the first one costs money:
#   1. Holdout evals  — node tests/eval/runner.mjs --split holdout --samples N
#   2. Drift check    — node scripts/lib/eval-drift.mjs --split holdout
#
# The default runs stage 2 only. That is deliberate: stage 2 is free, answers
# "has anything regressed since the last run", and is the reason the loop exists.
# Stage 1 costs about $47 at three samples across 75 holdout evals — a number
# nobody had ever felt, because the workflow that would have spent it never ran.
# ADR-009 asks for a human wherever an operation costs money, so this prices the
# run and stops, the way infra-provisioner does before it creates anything.
#
# Usage:
#   bash scripts/loop-local.sh                  # drift check only (free)
#   bash scripts/loop-local.sh --evals          # price the run, then ask
#   bash scripts/loop-local.sh --evals --yes    # price it and go (for a scheduler)
#   bash scripts/loop-local.sh --samples 1      # cheaper, weaker signal
#   bash scripts/loop-local.sh --schedule       # print the launchd job; install nothing

set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

DO_EVALS=0; ASSUME_YES=0; SAMPLES=3; SHOW_SCHEDULE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --evals) DO_EVALS=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --samples) SAMPLES="${2:-3}"; shift ;;
    --schedule) SHOW_SCHEDULE=1 ;;
    *) echo "unknown flag: $1 (use --evals | --yes | --samples N | --schedule)"; exit 2 ;;
  esac
  shift
done

say()  { printf '\n\033[1m━━ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

# ── --schedule: print, never install ────────────────────────────────────────
#
# Installing a launchd agent is persistent configuration on someone's machine
# and a recurring spend. Printing it is the whole job here; deciding to load it
# is the operator's.
if [ "$SHOW_SCHEDULE" -eq 1 ]; then
  PLIST="$HOME/Library/LaunchAgents/dev.great-cto.loop.plist"
  cat <<PLIST_EOF

Write this to ${PLIST}, then load it with:
  launchctl load -w ${PLIST}

It mirrors the workflow's schedule — Mondays at 06:17 local. Remove with
\`launchctl unload -w ${PLIST}\`.

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.great-cto.loop</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(pwd)/scripts/loop-local.sh</string>
    <string>--evals</string>
    <string>--yes</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>6</integer><key>Minute</key><integer>17</integer></dict>
  <key>StandardOutPath</key><string>${HOME}/.great_cto/loop-local.log</string>
  <key>StandardErrorPath</key><string>${HOME}/.great_cto/loop-local.log</string>
  <key>WorkingDirectory</key><string>$(pwd)</string>
</dict></plist>

Note before you load it: --yes means it spends without asking, weekly. Run
\`bash scripts/loop-local.sh --evals\` once by hand first and look at the price.
PLIST_EOF
  exit 0
fi

echo "loop-local: node $(node -v) on $(uname -s), $(git rev-parse --short HEAD)"

# ── Stage 1 — holdout evals (the part that costs) ───────────────────────────
if [ "$DO_EVALS" -eq 1 ]; then
  say "Holdout evals — pricing first"

  # A second runner would interleave its rows into the same history and make
  # both runs' drift comparisons meaningless.
  if pgrep -f "tests/eval/runner.mjs" >/dev/null 2>&1; then
    die "an eval runner is already going — two runs write interleaved rows into the same history, and neither result would mean anything"
  fi

  # Secrets live outside the repo (see docs/PRIVACY.md). Append-only by
  # convention: never rewrite this file.
  if [ -z "${OPENROUTER_API_KEY:-}" ] && [ -f "$HOME/.great_cto/secrets.env" ]; then
    set -a; . "$HOME/.great_cto/secrets.env"; set +a
  fi
  [ -n "${OPENROUTER_API_KEY:-}" ] || die "no OPENROUTER_API_KEY — set it or put it in ~/.great_cto/secrets.env"

  EST="$(node scripts/lib/eval-cost-estimate.mjs --split holdout --samples "$SAMPLES" 2>/dev/null || echo 'cost: unknown')"
  echo "  split=holdout  samples=${SAMPLES}  judge-votes=3"
  echo "  ${EST}"

  if [ "$ASSUME_YES" -ne 1 ]; then
    # Plan-and-stop. An estimate the operator never saw is not a guard.
    #
    # With no terminal to ask on — a cron, a CI shell, a pipe — the answer is
    # no. Spending $47 because nobody was there to say otherwise is exactly the
    # failure the price is printed to prevent.
    # `[ -r /dev/tty ]` is not the test: the node exists and stats readable even
    # when there is no controlling terminal to open. Opening it is the test.
    if ! ( exec 3</dev/tty ) 2>/dev/null; then
      echo ""
      echo "no terminal to ask on — not spending. Pass --yes if you meant to."
      exit 0
    fi
    printf '\nProceed and spend this? [y/N] '
    read -r ANSWER </dev/tty || ANSWER=""
    case "$ANSWER" in
      y|Y|yes|YES) ;;
      *) echo "stopped — nothing spent."; exit 0 ;;
    esac
  else
    warn "  --yes: spending without asking"
  fi

  say "Running holdout evals"
  node tests/eval/runner.mjs --split holdout --samples "$SAMPLES" --judge-votes 3
  echo "  (a non-zero exit here means evals failed their thresholds, which is a"
  echo "   result rather than an error — the drift check below is the alarm.)"
fi

# ── Stage 2 — drift (free, and the reason the loop exists) ──────────────────
say "Drift check"
node scripts/lib/eval-drift.mjs --split holdout --window 5 --threshold 0.1 --max-noise 0.1
DRIFT_STATUS=$?

if [ "$DRIFT_STATUS" -eq 0 ]; then
  printf '\n\033[42;30m LOOP-LOCAL: NO ACTIONABLE DRIFT \033[0m\n'
else
  printf '\n\033[41;30m LOOP-LOCAL: DRIFT DETECTED \033[0m\n'
  echo "Read the ▼ lines above. A drop is a regression to explain, not a number to re-run until it moves."
fi
exit "$DRIFT_STATUS"
