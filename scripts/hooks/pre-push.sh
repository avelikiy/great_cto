#!/usr/bin/env bash
# pre-push.sh — block pushes that contain private project name leaks
#
# Install as a git hook:
#   cp scripts/hooks/pre-push.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
# Or let great_cto install it via /start.
#
# Scans:
#   1. Commit messages in the push range
#   2. File content diffs in the push range
#
# Exit 0 = allow push, exit 1 = block push.

set -euo pipefail

# ---------------------------------------------------------------------------
# Private terms — words that must never appear in a public commit or diff
# ---------------------------------------------------------------------------
PRIVATE_TERMS=(
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
  "<private-project>"
)

# Personal path pattern (regex for grep -E)
PRIVATE_PATH_PATTERN='/Users/avelikiy/development/[A-Za-z][A-Za-z0-9_-]*'

# Files/paths to exclude from blob scanning (test fixtures, docs examples, etc.)
EXCLUDE_PATHS=(
  "scripts/hooks/pre-push.sh"        # this file legitimately contains the terms
  "tests/hooks/pre-push.test.mjs"    # hook test fixtures legitimately use the terms
  "/tmp/redact-"                     # redaction config files (not in repo)
)

RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

FOUND=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

check_content() {
  local context="$1"
  local content="$2"
  local file_path="${3:-}"

  # Skip excluded paths
  for excl in "${EXCLUDE_PATHS[@]}"; do
    if [[ "$file_path" == *"$excl"* ]]; then
      return 0
    fi
  done

  for term in "${PRIVATE_TERMS[@]}"; do
    if echo "$content" | grep -qF "$term" 2>/dev/null; then
      echo -e "${RED}[pre-push] LEAK DETECTED${NC} — \"${term}\" found in ${context}"
      FOUND=1
    fi
  done

  if echo "$content" | grep -qE "$PRIVATE_PATH_PATTERN" 2>/dev/null; then
    local match
    match=$(echo "$content" | grep -oE "$PRIVATE_PATH_PATTERN" | head -1)
    echo -e "${RED}[pre-push] LEAK DETECTED${NC} — private path \"${match}\" found in ${context}"
    FOUND=1
  fi
}

# ---------------------------------------------------------------------------
# Main — read push refs from stdin (format: <local-ref> <local-sha> <remote-ref> <remote-sha>)
# ---------------------------------------------------------------------------

while read -r local_ref local_sha remote_ref remote_sha; do
  # Skip branch deletions
  if [[ "$local_sha" == "0000000000000000000000000000000000000000" ]]; then
    continue
  fi

  # Determine range — if remote_sha is all zeros this is a new branch or new tag.
  if [[ "$remote_sha" == "0000000000000000000000000000000000000000" ]]; then
    # New branch/tag: scan ONLY commits reachable from local_sha that are not yet
    # on any remote-tracking branch — i.e. the genuinely new work being pushed.
    #
    # Bug fix (v2.37.1): previously used `git rev-list --remotes --not <local>`,
    # which is reversed (it lists commits on remotes NOT in local) and, on a branch
    # that descends from an already-pushed branch, returns empty → fell back to
    # `range=<local_sha>` → `git log <local_sha>` scanned the ENTIRE history,
    # false-flagging private terms in old commits. Correct query is
    # `git rev-list <local_sha> --not --remotes` (positive ref first).
    new_commits="$(git rev-list "${local_sha}" --not --remotes 2>/dev/null || true)"
    if [[ -z "$new_commits" ]]; then
      # Nothing new (commit already on a remote, e.g. a tag on pushed history) — skip.
      continue
    fi
    oldest_new="$(printf '%s\n' "$new_commits" | tail -n 1)"
    base="$(git rev-parse --verify --quiet "${oldest_new}^" 2>/dev/null || true)"
    if [[ -n "$base" ]]; then
      range="${base}..${local_sha}"
    else
      # Root commit (no parent — brand-new repo's first push): scan just this commit.
      range="${local_sha}"
    fi
  else
    range="${remote_sha}..${local_sha}"
  fi

  # 1. Scan commit messages
  while IFS= read -r msg; do
    [[ -z "$msg" ]] && continue
    check_content "commit message" "$msg"
  done < <(git log "$range" --format="%B" 2>/dev/null || true)

  # 2. Scan diff content (added lines only — lines starting with +)
  diff_output=$(git diff "$range" -- 2>/dev/null || true)
  if [[ -n "$diff_output" ]]; then
    # Extract added lines and their file context
    current_file=""
    while IFS= read -r line; do
      if [[ "$line" =~ ^\+\+\+\ b/(.+)$ ]]; then
        current_file="${BASH_REMATCH[1]}"
      elif [[ "$line" =~ ^\+[^+] ]]; then
        check_content "file ${current_file}" "${line:1}" "$current_file"
      fi
    done <<< "$diff_output"
  fi

done

# ---------------------------------------------------------------------------
# Token-economy: report that artifact summaries are fresh
# ---------------------------------------------------------------------------
# This is gigiene, not security — so it is WARN-ONLY by default and never blocks
# a push. Freshness should be guaranteed by CI, not by a local pre-push hook.
# Set GREAT_CTO_ENFORCE_SUMMARY=1 to make stale summaries block the push.
#
# This block must NEVER hang a push. Three guarantees:
#   1. GREAT_CTO_SKIP_SUMMARY_CHECK=1 short-circuits BEFORE invoking node, so the
#      escape hatch works even if the summary checker itself is wedged.
#   2. The node call is wrapped in a hard timeout (portable: timeout/gtimeout if
#      present, else a background-kill shim) so a slow/blocked checker can never
#      stall the push — on timeout we warn and allow the push.
#   3. Stale summaries only block when GREAT_CTO_ENFORCE_SUMMARY=1; otherwise warn.
SUMMARY_CHECK_TIMEOUT="${GREAT_CTO_SUMMARY_TIMEOUT:-25}"

# run_with_timeout <seconds> <cmd...> — returns the command's exit code, or 124
# if it had to be killed for exceeding the timeout. Works without coreutils.
run_with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "${secs}" "$@"; return $?
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${secs}" "$@"; return $?
  fi
  # Portable fallback: run in background, kill if it overruns. On kill we report
  # 124 (same convention as timeout(1)) so the caller treats it as a timeout, not
  # as a stale-summary failure.
  "$@" &
  local cmd_pid=$!
  local killed_flag; killed_flag="$(mktemp 2>/dev/null || echo "/tmp/gc-prepush-killed.$$")"
  ( sleep "${secs}"
    if kill -0 "${cmd_pid}" 2>/dev/null; then
      printf 1 > "${killed_flag}" 2>/dev/null
      kill -TERM "${cmd_pid}" 2>/dev/null
      sleep 2
      kill -KILL "${cmd_pid}" 2>/dev/null
    fi ) &
  local watch_pid=$!
  local rc=0
  wait "${cmd_pid}" 2>/dev/null || rc=$?
  kill -TERM "${watch_pid}" 2>/dev/null || true
  wait "${watch_pid}" 2>/dev/null || true
  if [[ -s "${killed_flag}" ]]; then rc=124; fi
  rm -f "${killed_flag}" 2>/dev/null || true
  return "${rc}"
}

if [[ "${GREAT_CTO_SKIP_SUMMARY_CHECK:-0}" == "1" ]]; then
  echo -e "${YELLOW}[pre-push] Skipping summary freshness check (GREAT_CTO_SKIP_SUMMARY_CHECK=1).${NC}"
elif [[ -f "scripts/generate-summary.mjs" ]] && command -v node >/dev/null 2>&1; then
  # Run the check ONCE, capturing output, under a hard timeout.
  SUMMARY_RC=0
  STALE_OUTPUT=$(run_with_timeout "${SUMMARY_CHECK_TIMEOUT}" node scripts/generate-summary.mjs --check 2>&1) || SUMMARY_RC=$?
  if [[ "${SUMMARY_RC}" -eq 124 ]]; then
    echo ""
    echo -e "${YELLOW}[pre-push] Summary freshness check timed out after ${SUMMARY_CHECK_TIMEOUT}s — allowing push.${NC}"
    echo "(Run 'node scripts/generate-summary.mjs --all' manually if summaries are stale.)"
  elif [[ "${SUMMARY_RC}" -ne 0 ]]; then
    echo ""
    echo -e "${YELLOW}Stale artifact summaries detected.${NC}"
    echo "$STALE_OUTPUT" | grep '⚠ stale' | head -5
    echo ""
    echo "Fix: node scripts/generate-summary.mjs --all"
    if [[ "${GREAT_CTO_ENFORCE_SUMMARY:-0}" == "1" ]]; then
      echo "Then re-commit and push."
      echo "(To skip: GREAT_CTO_SKIP_SUMMARY_CHECK=1 git push)"
      exit 1
    else
      echo -e "${YELLOW}(warn-only — push allowed. Set GREAT_CTO_ENFORCE_SUMMARY=1 to block on stale summaries.)${NC}"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Artifact hygiene: structural + freshness lint of ADRs / threat models / design
# contracts (scripts/hooks/artifact-lint.mjs). Same discipline as the summary
# block above: WARN-ONLY and never hangs a push.
#   - GREAT_CTO_SKIP_ARTIFACT_CHECK=1 short-circuits before invoking node.
#   - Runs under the same run_with_timeout shim (timeout → warn + allow).
#   - Structural ERRORs block ONLY when GREAT_CTO_ENFORCE_ARTIFACTS=1 (which the
#     linter itself honours for its exit code); otherwise report-and-allow.
ARTIFACT_CHECK_TIMEOUT="${GREAT_CTO_ARTIFACT_TIMEOUT:-25}"
if [[ "${GREAT_CTO_SKIP_ARTIFACT_CHECK:-0}" == "1" ]]; then
  echo -e "${YELLOW}[pre-push] Skipping artifact lint (GREAT_CTO_SKIP_ARTIFACT_CHECK=1).${NC}"
elif [[ -f "scripts/hooks/artifact-lint.mjs" ]] && command -v node >/dev/null 2>&1; then
  ARTIFACT_RC=0
  ARTIFACT_OUT=$(run_with_timeout "${ARTIFACT_CHECK_TIMEOUT}" node scripts/hooks/artifact-lint.mjs 2>&1) || ARTIFACT_RC=$?
  if [[ "${ARTIFACT_RC}" -eq 124 ]]; then
    echo -e "${YELLOW}[pre-push] Artifact lint timed out after ${ARTIFACT_CHECK_TIMEOUT}s — allowing push.${NC}"
  elif echo "$ARTIFACT_OUT" | grep -qE 'ERRORS|WARNINGS'; then
    echo ""
    echo "$ARTIFACT_OUT"
    if [[ "${GREAT_CTO_ENFORCE_ARTIFACTS:-0}" == "1" && "${ARTIFACT_RC}" -ne 0 ]]; then
      echo -e "${YELLOW}Push blocked${NC} on structural artifact errors."
      echo "(To skip: GREAT_CTO_SKIP_ARTIFACT_CHECK=1 git push)"
      exit 1
    fi
  fi
fi

if [[ "$FOUND" -eq 1 ]]; then
  echo ""
  echo -e "${YELLOW}Push blocked.${NC} Remove private project references before pushing."
  echo "Use <private-project> as placeholder in commits/docs."
  echo "To bypass (emergency only): git push --no-verify"
  # Log the block so the board's Security tab can surface counters.
  # Best-effort, swallows any I/O error so we never override the exit code.
  {
    STATS_DIR="$HOME/.great_cto"
    mkdir -p "$STATS_DIR" 2>/dev/null
    REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null)
    BRANCH=$(git branch --show-current 2>/dev/null)
    TS=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
    printf '{"ts":"%s","kind":"block","repo":"%s","branch":"%s"}\n' \
      "$TS" "${REPO:-unknown}" "${BRANCH:-unknown}" \
      >> "$STATS_DIR/pre-push-stats.jsonl" 2>/dev/null
  } || true
  exit 1
fi

exit 0
