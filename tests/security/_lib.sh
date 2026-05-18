#!/usr/bin/env bash
# tests/security/_lib.sh — shared helpers sourced by every run-section-*.sh.
#
# Provides:
#   ts          monotonic timestamp for log lines
#   log         echo to stderr with timestamp prefix
#   pass FILE NAME [DETAIL]   append "✓ NAME" to FILE and increment PASSED
#   fail FILE NAME [DETAIL]   append "✗ NAME" to FILE and increment FAILED
#   skip FILE NAME REASON     append "⊘ NAME" to FILE and increment SKIPPED
#   require_cmd CMD           hard-exit when CMD not on PATH
#   curl_status URL [METHOD] [BODY]   echo HTTP status; never fail
#   curl_json URL [METHOD] [BODY]     pipe response JSON to stdout
#   audit_lines_since SINCE_ISO       tail audit log + filter by ts
#   assert_eq EXPECTED ACTUAL NAME    equality assert with pass/fail
#   assert_in NEEDLE HAYSTACK NAME    substring assert
#   reset_counters                    set PASSED=FAILED=SKIPPED=0
#
# Convention: tests write to a report file passed as $1, never stdout. The
# master runner concatenates per-section reports into one bundle.

set -u

PROXY_URL=${LEASH_PROXY_URL:-http://localhost:8765}
CONSOLE_URL=${LEASH_CONSOLE_URL:-http://localhost:8801}
BOARD_URL=${BOARD_URL:-http://localhost:3141}
AUDIT_LOG=${LEASH_AUDIT_LOG:-$HOME/.leash/audit.jsonl}

PASSED=0
FAILED=0
SKIPPED=0

ts() { date -u +%FT%TZ; }

log() { echo "[$(ts)] $*" >&2; }

pass() {
  local out=$1; local name=$2; local detail=${3:-}
  PASSED=$((PASSED + 1))
  printf '✓ %s' "$name" >> "$out"
  [ -n "$detail" ] && printf ' — %s' "$detail" >> "$out"
  printf '\n' >> "$out"
}

fail() {
  local out=$1; local name=$2; local detail=${3:-}
  FAILED=$((FAILED + 1))
  printf '✗ %s' "$name" >> "$out"
  [ -n "$detail" ] && printf ' — %s' "$detail" >> "$out"
  printf '\n' >> "$out"
}

skip() {
  local out=$1; local name=$2; local reason=${3:-}
  SKIPPED=$((SKIPPED + 1))
  printf '⊘ %s' "$name" >> "$out"
  [ -n "$reason" ] && printf ' (%s)' "$reason" >> "$out"
  printf '\n' >> "$out"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "FATAL: required command not found: $1"
    exit 2
  fi
}

curl_status() {
  local url=$1
  local method=${2:-GET}
  local body=${3:-}
  if [ -n "$body" ]; then
    curl -sS -o /tmp/curl-body.tmp -w '%{http_code}' \
      -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$body" 2>/dev/null || echo "000"
  else
    curl -sS -o /tmp/curl-body.tmp -w '%{http_code}' \
      -X "$method" "$url" 2>/dev/null || echo "000"
  fi
}

curl_json() {
  local url=$1
  local method=${2:-GET}
  local body=${3:-}
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$url" -H 'Content-Type: application/json' -d "$body" 2>/dev/null
  else
    curl -sS -X "$method" "$url" 2>/dev/null
  fi
}

# Print audit JSONL records whose ts is >= the given ISO timestamp.
audit_lines_since() {
  local since=$1
  [ ! -f "$AUDIT_LOG" ] && return 0
  python3 -c "
import sys, json, datetime
cutoff = datetime.datetime.fromisoformat('$since'.replace('Z','+00:00'))
with open('$AUDIT_LOG') as f:
    for line in f:
        try:
            r = json.loads(line)
            t = r.get('ts','')
            if not t: continue
            tt = datetime.datetime.fromisoformat(t.replace('Z','+00:00'))
            if tt >= cutoff:
                print(line.rstrip())
        except Exception:
            continue
"
}

assert_eq() {
  local expected=$1; local actual=$2; local name=$3; local out=$4
  if [ "$expected" = "$actual" ]; then
    pass "$out" "$name"
  else
    fail "$out" "$name" "expected='$expected' actual='$actual'"
  fi
}

assert_in() {
  local needle=$1; local haystack=$2; local name=$3; local out=$4
  if [[ "$haystack" == *"$needle"* ]]; then
    pass "$out" "$name"
  else
    fail "$out" "$name" "'$needle' not in response"
  fi
}

reset_counters() { PASSED=0; FAILED=0; SKIPPED=0; }
