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
# Private terms — loaded from an OUT-OF-REPO file so the private names themselves
# never live in this public repository. One term per line; blank lines and lines
# starting with '#' are ignored; matching is case-insensitive. Override the path
# with GREAT_CTO_PRIVATE_TERMS (the test suite does this). If the file is absent,
# name matching is skipped (the personal-path check below still runs) and a
# one-line notice explains how to enable it.
# ---------------------------------------------------------------------------
PRIVATE_TERMS_FILE="${GREAT_CTO_PRIVATE_TERMS:-$HOME/.great_cto/private-terms}"
PRIVATE_TERMS=()
if [[ -f "$PRIVATE_TERMS_FILE" ]]; then
  while IFS= read -r _line || [[ -n "$_line" ]]; do
    _line="${_line#"${_line%%[![:space:]]*}"}"   # ltrim
    _line="${_line%"${_line##*[![:space:]]}"}"    # rtrim
    [[ -z "$_line" || "$_line" == \#* ]] && continue
    PRIVATE_TERMS+=("$_line")
  done < "$PRIVATE_TERMS_FILE"
fi

# ---------------------------------------------------------------------------
# Derived terms — every directory in the workspace is a private project
# ---------------------------------------------------------------------------
#
# The hand-maintained list above kept losing. Three project names that had
# already leaked into this repository were simply not on it, and nothing said so:
# a name absent from a denylist produces silence, which reads exactly like a name
# that is safe. That is the same defect this repository spends its time removing
# everywhere else — an absent check and a passed check looking identical.
#
# The rule the owner actually holds is simpler than any list: everything under
# the workspace is private, and `great_cto` is the one public project. So derive
# the terms from the directories themselves. A project created tomorrow is
# covered the moment it exists, with nobody remembering to add it.
#
# The polarity is the point
# -------------------------
# Directory names collide with ordinary English — `docs`, `shared`, `Work`,
# `Dashboard` are all real directories here, and flagging them would fire on
# hundreds of innocent files. So there is an allowlist, and it is maintained by
# hand. That is deliberate: a forgotten allowlist entry costs a false alarm you
# fix in a minute, while a forgotten denylist entry costs a leak you cannot
# retract. Both lists are imperfect; only one is imperfect in a safe direction.
#
# The derived names never enter this repository — they are read from disk at
# push time, on the machine that already has them.
WORKSPACE_DIR="${GREAT_CTO_WORKSPACE:-$HOME/development}"
PUBLIC_TERMS_FILE="${GREAT_CTO_PUBLIC_TERMS:-$HOME/.great_cto/public-terms}"

# `${var,,}` is bash 4; macOS ships bash 3.2, so lowercase via tr.
_lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

_is_public() {
  local name_lc
  name_lc="$(_lc "$1")"
  # The one public project, and anything published under its name.
  [[ "$name_lc" == great_cto* ]] && return 0
  [[ -f "$PUBLIC_TERMS_FILE" ]] || return 1
  while IFS= read -r _allow || [[ -n "$_allow" ]]; do
    _allow="${_allow#"${_allow%%[![:space:]]*}"}"
    _allow="${_allow%"${_allow##*[![:space:]]}"}"
    [[ -z "$_allow" || "$_allow" == \#* ]] && continue
    [[ "$name_lc" == "$(_lc "$_allow")" ]] && return 0
  done < "$PUBLIC_TERMS_FILE"
  return 1
}

if [[ -d "$WORKSPACE_DIR" ]]; then
  while IFS= read -r _dir; do
    _name="$(basename "$_dir")"
    [[ -z "$_name" || "$_name" == .* ]] && continue
    _is_public "$_name" && continue
    PRIVATE_TERMS+=("$_name")
  done < <(find "$WORKSPACE_DIR" -mindepth 1 -maxdepth 2 -type d -not -path '*/.*' 2>/dev/null || true)
fi

# Personal path pattern (regex for grep -E). The username is intentionally
# GENERIC — a hardcoded /Users/<name>/development/<Project> path is a leak no
# matter whose it is, and keeping a real username out of this pattern keeps it
# out of the public repo too.
PRIVATE_PATH_PATTERN='/Users/[A-Za-z0-9._-]+/development/[A-Za-z][A-Za-z0-9_-]*'

# Files/paths to exclude from blob scanning. These no longer contain any private
# name; they are skipped only to avoid self-matching the path-pattern definition
# and the synthetic fixture names in the hook's own test.
EXCLUDE_PATHS=(
  "scripts/hooks/pre-push.sh"        # defines PRIVATE_PATH_PATTERN — would self-match
  "tests/hooks/pre-push.test.mjs"    # uses synthetic (non-private) fixture names
  "/tmp/redact-"                     # redaction config files (not in repo)
  # Vendored Google Fonts data: third-party rows carrying typeface designers'
  # names. Not this project's prose, and a designer who shares a name with a
  # directory here is not a leak.
  "skills/ui-ux-pro-max/data/"
)

# One alternation, built once.
#
# check_content used to loop the term list and spawn `sed` + `grep` per term per
# added line. With eight hand-listed terms that was tolerable; deriving them from
# the workspace took the list to thirty-four, and a push touching a few hundred
# lines became sixty-eight thousand subprocesses — two minutes on a hook that
# used to be instant.
#
# A pre-push hook that costs two minutes is a hook people run with --no-verify,
# and this repository has already had one guard silently disabled for months.
# Escaping happens once at startup; matching is one grep per line.
TERMS_RE=""
for _t in ${PRIVATE_TERMS[@]+"${PRIVATE_TERMS[@]}"}; do
  _esc=$(printf '%s' "$_t" | sed 's/[][\.*^$(){}?+|/]/\\&/g')
  TERMS_RE="${TERMS_RE:+$TERMS_RE|}$_esc"
done

RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

if [[ ! -f "$PRIVATE_TERMS_FILE" ]]; then
  echo -e "${YELLOW}[pre-push] No private-terms file at ${PRIVATE_TERMS_FILE} — project-name matching disabled (personal-path check still active). Create it (one project name per line) to enable.${NC}" >&2
fi

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

  # Match the term as a WORD, not as any substring.
  #
  # Plain `grep -F` matched a private name wherever its letters happened to fall.
  # One real term on this list is a substring of `thresholdRaw`, so adding it lit
  # up thirteen files of eval-runner internals with nothing private in them. A
  # guard that cries wolf on ordinary identifiers is a guard people push past
  # with --no-verify, and then it protects nothing at all.
  #
  # The boundary is "not a letter or digit", so the shapes a real leak takes are
  # still caught — `name.ai`, `name-prod`, `"name"`, `/name/`, `name_1` — while a
  # name buried inside a longer word is not.
  if [[ -n "$TERMS_RE" ]] && echo "$content" | grep -qiE "(^|[^A-Za-z0-9])(${TERMS_RE})([^A-Za-z0-9]|\$)" 2>/dev/null; then
    # Only now, on the rare path, pay to find out WHICH term matched — a report
    # that says "a private name" and not which one sends the reader hunting.
    local hit
    hit=$(echo "$content" | grep -oiE "(^|[^A-Za-z0-9])(${TERMS_RE})([^A-Za-z0-9]|\$)" | head -1 | sed 's/^[^A-Za-z0-9]*//; s/[^A-Za-z0-9]*$//')
    echo -e "${RED}[pre-push] LEAK DETECTED${NC} — \"${hit}\" found in ${context}"
    FOUND=1
  fi

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
# Receipt: is what is being pushed what was reviewed?
# ---------------------------------------------------------------------------
#
# Every other rung of the evidence ladder asks a question about the moment of
# review. None of them asks whether the code that was reviewed is the code that
# ships — an APPROVED verdict over one tree and a push over another both read
# green, because both are answering questions about the past.
#
# Warn-only by default, like the two checks below it, and for the same reason:
# not every change in this repository is reviewed by an agent, and a guard that
# fires on every push is one people learn to pass with --no-verify. That is
# exactly how the privacy guard came to be trusted while silently disabled.
# GREAT_CTO_ENFORCE_RECEIPT=1 makes it block.
#
# What is never quiet is the third state. "No approving verdict carries a
# receipt" is not the same as "the receipt matched", and the check says which.
if [[ "${GREAT_CTO_SKIP_RECEIPT_CHECK:-}" != "1" ]] && [[ -f "scripts/lib/receipt.mjs" ]]; then
  RECEIPT_OUT="$(node scripts/lib/receipt.mjs --verify 2>/dev/null || true)"
  RECEIPT_RC=$?
  if [[ -n "$RECEIPT_OUT" ]]; then
    if [[ "$RECEIPT_OUT" == *"reviewed file(s) changed"* ]]; then
      echo -e "\n${RED}Files changed after the review that approved them.${NC}" >&2
      echo "$RECEIPT_OUT" >&2
      if [[ "${GREAT_CTO_ENFORCE_RECEIPT:-}" == "1" ]]; then
        echo -e "${RED}[pre-push] BLOCKED — re-review, or unset GREAT_CTO_ENFORCE_RECEIPT.${NC}" >&2
        exit 1
      fi
      echo -e "${YELLOW}(warn-only — push allowed. Set GREAT_CTO_ENFORCE_RECEIPT=1 to block.)${NC}" >&2
    else
      echo -e "\n${RECEIPT_OUT}"
    fi
  fi
fi

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
  local rc
  # A `timeout` on PATH is not necessarily a RUNNABLE timeout: an x86 binary on
  # an arm64 Mac exits 126 ("Bad CPU type in executable"), and a broken shim
  # exits 127. Both are "the wrapper failed", not "the command failed" — fall
  # through to the next strategy instead of reporting the wrapper's exit as the
  # checker's verdict (which is how a stale-summary WARNING became a blocked push).
  if command -v timeout >/dev/null 2>&1; then
    timeout "${secs}" "$@"; rc=$?
    if [[ $rc -ne 126 && $rc -ne 127 ]]; then return $rc; fi
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${secs}" "$@"; rc=$?
    if [[ $rc -ne 126 && $rc -ne 127 ]]; then return $rc; fi
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
    # `|| true`: grep exits 1 when the output has no "⚠ stale" line, and under
    # `set -e -o pipefail` that killed the hook mid-warning — turning a warn-only
    # notice into a blocked push. Second instance of this trap in this file.
    echo "$STALE_OUTPUT" | grep '⚠ stale' | head -5 || true
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

# ---------------------------------------------------------------------------
# Prose slop: the AI voice in the Markdown this push is adding
# (scripts/lib/prose-slop.mjs). WARN-ONLY, always — style is a judgement call
# and a linter that blocks on it gets bypassed, then ignored, then deleted.
#   - Only files this push actually changes: nobody wants a verdict on prose
#     they did not write.
#   - GREAT_CTO_SKIP_PROSE_CHECK=1 short-circuits before invoking node.
PROSE_CHECK_TIMEOUT="${GREAT_CTO_PROSE_TIMEOUT:-15}"
if [[ "${GREAT_CTO_SKIP_PROSE_CHECK:-0}" == "1" ]]; then
  : # opted out
elif [[ -f "scripts/lib/prose-slop.mjs" ]] && command -v node >/dev/null 2>&1; then
  # `@{push}` fails outright on a branch with no upstream — which is the FIRST
  # push of every branch, the one that introduces all the new prose. With
  # 2>/dev/null it degraded into "no files changed" and the check silently never
  # ran; on this repo it had never run at all. Fall back through upstream, then
  # the default branch, then the last commit.
  PROSE_RANGE=""
  for cand in "@{push}..HEAD" "@{upstream}..HEAD" "origin/main..HEAD" "HEAD~1..HEAD"; do
    if git rev-parse --verify --quiet "${cand%%..*}" >/dev/null 2>&1; then PROSE_RANGE="$cand"; break; fi
  done
  PROSE_FILES=$(git diff --name-only --diff-filter=ACM ${PROSE_RANGE:+"$PROSE_RANGE"} 2>/dev/null \
    | grep -E '\.md$' | grep -vE '^(CHANGELOG\.md|node_modules/|tests/fixtures/)' || true)
  if [[ -n "$PROSE_FILES" ]]; then
    PROSE_RC=0
    # shellcheck disable=SC2086 — deliberate word-splitting of the file list
    PROSE_OUT=$(run_with_timeout "${PROSE_CHECK_TIMEOUT}" node scripts/lib/prose-slop.mjs $PROSE_FILES --quiet 2>&1) || PROSE_RC=$?
    if [[ "${PROSE_RC}" -eq 124 ]]; then
      : # timed out — say nothing, this is the least important check here
    elif echo "$PROSE_OUT" | grep -q 'finding'; then
      echo ""
      echo "$PROSE_OUT"
      echo "(advisory — never blocks. Silence one line with <!-- slop-ok -->,"
      echo " or all of them with GREAT_CTO_SKIP_PROSE_CHECK=1 git push)"
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
