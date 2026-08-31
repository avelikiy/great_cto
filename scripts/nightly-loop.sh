#!/usr/bin/env bash
# scripts/nightly-loop.sh — run the unattended loop where its output is reversible.
#
# ralph-loop.sh runs fresh agent sessions until the work is done or the cap is
# reached. It has a stop file and an iteration cap; what it did not have was
# ISOLATION, and that is the whole reason it was never scheduled.
#
# The rule this enforces comes from ADR-009: an operation that is expensive to
# undo needs a human. So this wrapper makes every outcome cheap to undo.
#
#   · Never on the checked-out branch. Work happens in a git worktree on a fresh
#     `auto/<date>` branch, so deleting the branch deletes the night's work.
#   · Never pushes. Nothing leaves the machine, so nothing needs a gate. The
#     remote ref is recorded before and compared after; a move is a hard failure,
#     not a warning.
#   · Never on a dirty tree. Unattended agents editing on top of your uncommitted
#     work is how you lose the work.
#   · A summary lands in the MAIN tree, so you read it in the morning without
#     hunting for a worktree.
#
# Usage:
#   bash scripts/nightly-loop.sh [ITERATIONS]        # run now (default 6)
#   bash scripts/nightly-loop.sh --dry-run           # print the schedule unit, install nothing
#   bash scripts/nightly-loop.sh --install-schedule  # install the nightly launchd job
#   bash scripts/nightly-loop.sh --uninstall-schedule
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

ITERATIONS="${1:-6}"
LABEL="systems.greatcto.nightly-loop"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SUMMARY_DIR="$ROOT/.great_cto/nightly"
STAMP="$(date -u +%Y-%m-%d)"
BRANCH="auto/${STAMP}"
WORKTREE="$ROOT/.great_cto/worktrees/${STAMP}"

# A refusal must leave the same trace a run does.
#
# Without this, a night that did not happen looks exactly like a night with
# nothing to report: the script exits into a log nobody opens, and the morning
# summary from three days ago is still the newest file in the directory. That is
# the defect this whole tool is built to refuse, arriving through the back door.
die() {
  echo "nightly-loop: $*" >&2
  mkdir -p "$SUMMARY_DIR" 2>/dev/null
  {
    echo "# Nightly loop — ${STAMP}"
    echo
    echo "**It did not run.**"
    echo
    echo "> $*"
    echo
    echo "No branch was created and nothing was changed. This file exists so that a"
    echo "night which did not happen does not look like a night with nothing to say."
  } > "${SUMMARY_DIR}/${STAMP}.md" 2>/dev/null
  exit 1
}

plist() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT}/scripts/nightly-loop.sh</string>
    <string>6</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${ROOT}/.great_cto/nightly/launchd.log</string>
  <key>StandardErrorPath</key><string>${ROOT}/.great_cto/nightly/launchd.log</string>
  <key>WorkingDirectory</key><string>${ROOT}</string>
</dict></plist>
EOF
}

case "${1:-}" in
  --dry-run)
    echo "Would write ${PLIST}:"; echo; plist
    echo; echo "Install with: bash scripts/nightly-loop.sh --install-schedule"
    exit 0 ;;
  --install-schedule)
    mkdir -p "$(dirname "$PLIST")" "$SUMMARY_DIR"
    plist > "$PLIST" || die "could not write $PLIST"
    launchctl unload "$PLIST" 2>/dev/null
    launchctl load "$PLIST" || die "launchctl load failed"
    echo "✓ scheduled nightly at 02:00 — ${LABEL}"
    echo "  remove with: bash scripts/nightly-loop.sh --uninstall-schedule"
    exit 0 ;;
  --uninstall-schedule)
    launchctl unload "$PLIST" 2>/dev/null
    rm -f "$PLIST"
    echo "✓ removed ${LABEL}"
    exit 0 ;;
esac

[[ "$ITERATIONS" =~ ^[0-9]+$ ]] || die "iterations must be a number, got: $ITERATIONS"

# ── Refusals ────────────────────────────────────────────────────────────────
# Each is a hard exit. A wrapper whose safety rules are warnings is a wrapper
# whose safety rules are decoration.

[ -n "$(git status --porcelain)" ] && \
  die "the working tree is dirty. Unattended edits on top of uncommitted work is how work is lost. Commit or stash first."

command -v claude >/dev/null || die "claude is not on PATH — nothing to run"

mkdir -p "$SUMMARY_DIR" "$(dirname "$WORKTREE")"

# The remote as it stands. Compared again at the end: this script never pushes,
# and "never" is checked rather than asserted in a comment.
REMOTE_BEFORE="$(git rev-parse --verify --quiet origin/main || echo none)"
HEAD_BEFORE="$(git rev-parse --verify HEAD)"

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  die "branch ${BRANCH} already exists — a previous run is unreviewed. Delete it or review it first."
fi

git worktree add -b "$BRANCH" "$WORKTREE" HEAD >/dev/null 2>&1 || die "could not create worktree at $WORKTREE"

echo "nightly-loop: ${BRANCH} → ${WORKTREE} (${ITERATIONS} iterations, no push)"
START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

( cd "$WORKTREE" && bash "$ROOT/scripts/ralph-loop.sh" "$ITERATIONS" ) \
  > "$SUMMARY_DIR/${STAMP}.log" 2>&1
LOOP_EXIT=$?

# ── What happened, written where you will see it ─────────────────────────────
COMMITS="$(git -C "$WORKTREE" log --oneline "${HEAD_BEFORE}..HEAD" 2>/dev/null | wc -l | tr -d ' ')"
FILES="$(git -C "$WORKTREE" diff --name-only "${HEAD_BEFORE}..HEAD" 2>/dev/null | wc -l | tr -d ' ')"
REMOTE_AFTER="$(git rev-parse --verify --quiet origin/main || echo none)"

{
  echo "# Nightly loop — ${STAMP}"
  echo
  echo "**Branch:** \`${BRANCH}\` · **started** ${START} · **exit** ${LOOP_EXIT}"
  echo
  if [ "$REMOTE_BEFORE" != "$REMOTE_AFTER" ]; then
    echo "> **STOP — the remote moved during this run.** This script never pushes, so"
    echo "> something else did, or the guard is wrong. Do not trust the rest of this"
    echo "> summary until you know which."
    echo
  else
    echo "Nothing was pushed. The remote is where it was."
    echo
  fi
  echo "- Commits: **${COMMITS}**"
  echo "- Files touched: **${FILES}**"
  echo
  if [ "$COMMITS" = "0" ]; then
    echo "Nothing was committed. That is not the same as nothing having happened —"
    echo "read the log before concluding the night was idle."
  else
    echo "## Commits"; echo '```'
    git -C "$WORKTREE" log --oneline "${HEAD_BEFORE}..HEAD" 2>/dev/null
    echo '```'
  fi
  echo
  echo "## Review"; echo '```bash'
  echo "git diff ${HEAD_BEFORE}..${BRANCH}      # what changed"
  echo "git worktree remove ${WORKTREE}"
  echo "git branch -D ${BRANCH}                 # and it never happened"
  echo '```'
  echo
  echo "Full log: \`.great_cto/nightly/${STAMP}.log\`"
} > "$SUMMARY_DIR/${STAMP}.md"

echo "nightly-loop: ${COMMITS} commit(s), summary → .great_cto/nightly/${STAMP}.md"
[ "$REMOTE_BEFORE" != "$REMOTE_AFTER" ] && { echo "nightly-loop: REMOTE MOVED — see summary" >&2; exit 3; }
exit 0
