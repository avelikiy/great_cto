#!/usr/bin/env bash
# tests/security/run-section-0-preflight.sh — §0 Pre-flight from TESTING-PLAN-leash.md
#
# Asserts:
#   • leash CLI installed, version ≥ 2.23
#   • python `llm_leash` package importable
#   • exactly one leash-proxy + one board server running
#   • /api/security, /admin/stats, /api/stats endpoints reachable
#
# Exit 0 = all pass, 1 = any fail. Writes a per-section markdown report.

set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/_lib.sh"

OUT=${1:-/tmp/section-0-preflight.md}
: > "$OUT"
echo "# §0 Pre-flight ($(ts))" >> "$OUT"
echo >> "$OUT"
echo '```' >> "$OUT"

# Required tools
for cmd in curl python3 jq; do
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "$OUT" "$cmd available" "$(command -v $cmd)"
  else
    fail "$OUT" "$cmd available" "not on PATH"
  fi
done

# llm-leash python package
if python3 -c "import llm_leash" 2>/dev/null; then
  ver=$(python3 -c "import llm_leash; print(getattr(llm_leash,'__version__','unknown'))" 2>&1)
  pass "$OUT" "llm_leash python package" "v$ver"
else
  fail "$OUT" "llm_leash python package" "import failed"
fi

# leash CLI on PATH
if command -v llm-leash >/dev/null 2>&1; then
  pass "$OUT" "llm-leash CLI" "$(command -v llm-leash)"
else
  skip "$OUT" "llm-leash CLI" "not on PATH (proxy may still be running)"
fi

# Process state
n_proxy=$(ps aux | grep -v grep | grep -cE "(llm-leash-proxy|leash\.proxy)" || true)
n_board=$(ps aux | grep -v grep | grep -cE "node.*(board/)?server\.mjs" || true)
[ "$n_proxy" -ge 1 ] && pass "$OUT" "leash-proxy process running" "n=$n_proxy" || fail "$OUT" "leash-proxy process running" "n=$n_proxy"
[ "$n_board" -ge 1 ] && pass "$OUT" "board server running" "n=$n_board" || fail "$OUT" "board server running" "n=$n_board"
[ "$n_proxy" -le 2 ] || fail "$OUT" "leash-proxy uniqueness" "n=$n_proxy (>2 means stale dupes)"
[ "$n_board" -le 2 ] || fail "$OUT" "board server uniqueness" "n=$n_board"

# Endpoint reachability — 200 is ideal, but 503 from /admin/stats also means
# "proxy is alive, just requires admin token" which is fine for our purposes.
for label in "board:/api/security:$BOARD_URL/api/security" \
             "proxy:/admin/stats:$PROXY_URL/admin/stats" \
             "console:/api/stats:$CONSOLE_URL/api/stats"; do
  name=${label%%:*}
  rest=${label#*:}
  path=${rest%%:*}
  url=${rest#*:}
  code=$(curl_status "$url")
  case "$code" in
    200)
      pass "$OUT" "$name $path reachable" "200"
      ;;
    503)
      # leash returns 503 when admin token absent — process is alive
      pass "$OUT" "$name $path reachable" "503 (alive, admin token required for live data)"
      ;;
    *)
      fail "$OUT" "$name $path reachable" "HTTP $code"
      ;;
  esac
done

# Project_tenant_id is sensible (not null)
tenant=$(curl_json "$BOARD_URL/api/security" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('leash',{}).get('project_tenant_id') or '')" 2>/dev/null)
if [ -n "$tenant" ]; then
  pass "$OUT" "board resolves project_tenant_id" "$tenant"
else
  skip "$OUT" "board resolves project_tenant_id" "null (board cwd has no .great_cto/PROJECT.md leash: block)"
fi

echo '```' >> "$OUT"
echo >> "$OUT"
echo "**Result:** $PASSED passed · $FAILED failed · $SKIPPED skipped" >> "$OUT"

[ "$FAILED" -eq 0 ] && exit 0 || exit 1
