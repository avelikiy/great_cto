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
  "scripts/hooks/pre-push.sh"    # this file legitimately contains the terms
  "/tmp/redact-"                 # redaction config files (not in repo)
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

  # Determine range — if remote_sha is all zeros this is a new branch
  if [[ "$remote_sha" == "0000000000000000000000000000000000000000" ]]; then
    # New branch: scan all commits reachable from local_sha but not in any remote branch
    range="${local_sha}"
    commit_range="$(git rev-list --remotes --not "${local_sha}" 2>/dev/null | head -1)"
    if [[ -n "$commit_range" ]]; then
      range="${commit_range}..${local_sha}"
    else
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

if [[ "$FOUND" -eq 1 ]]; then
  echo ""
  echo -e "${YELLOW}Push blocked.${NC} Remove private project references before pushing."
  echo "Use <private-project> as placeholder in commits/docs."
  echo "To bypass (emergency only): git push --no-verify"
  exit 1
fi

exit 0
