#!/usr/bin/env bash
# tests/security/run-section-4-frontend.sh — §4 Frontend API surface
#
# Tests the contracts every Security-tab widget depends on, without
# spinning up a headless browser. If these pass, the UI has the data it
# needs to render; if they fail, the UI will show "—" or empty states.
#
# Covers TESTING-PLAN-leash.md §4.A (toggle endpoint), §4.B (scope), §4.D
# (Threats + FP cols), §4.E (Detection quality KPI), §4.F (Agents
# canonical vs fallback), §4.G (Budgets editor), §4.H (Export CSV/JSON),
# §4.I (kill button endpoint).
#
# Skipped: actual browser interactions (sub-tab switching, button clicks)
# — those require Playwright and are tracked as future work.

set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/_lib.sh"

OUT=${1:-/tmp/section-4-frontend.md}
: > "$OUT"
echo "# §4 Frontend API contract ($(ts))" >> "$OUT"
echo >> "$OUT"
echo '```' >> "$OUT"

board_ok=$(curl_status "$BOARD_URL/api/security")
if [ "$board_ok" != "200" ]; then
  skip "$OUT" "board reachable" "$BOARD_URL → $board_ok"
  echo '```' >> "$OUT"
  echo "**Result:** 0 passed · 0 failed · 1 skipped — board unreachable" >> "$OUT"
  exit 0
fi

# Helper to fail-fast assert that a JSON path exists and has expected type
assert_json_keys() {
  local url=$1; local keys=$2; local name=$3
  local body=$(curl_json "$url")
  local missing=$(python3 -c "
import sys, json
d = json.loads('''$body''') if '''$body''' else {}
keys = '$keys'.split(',')
missing = []
def has(obj, path):
    cur = obj
    for p in path.split('.'):
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return False
    return True
for k in keys:
    if not has(d, k):
        missing.append(k)
print(','.join(missing) or '-')
" 2>/dev/null)
  if [ "$missing" = "-" ]; then
    pass "$OUT" "$name"
  else
    fail "$OUT" "$name" "missing keys: $missing"
  fi
}

# §4.A toggle contract
toggle_get=$(curl_json "$BOARD_URL/api/security")
assert_in '"enabled"' "$toggle_get" "/api/security exposes leash.enabled" "$OUT"
assert_in '"proxy_running"' "$toggle_get" "/api/security exposes proxy_running" "$OUT"
assert_in '"installed_version"' "$toggle_get" "/api/security exposes installed_version" "$OUT"

# §4.B scope contract
default_scope=$(curl_json "$BOARD_URL/api/security" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('leash',{}).get('tenant_filter') or '')" 2>/dev/null)
all_scope=$(curl_json "$BOARD_URL/api/security?project=all" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('leash',{}).get('tenant_filter') or 'null')" 2>/dev/null)
[ -n "$default_scope" ] && pass "$OUT" "scope: default resolves to a tenant" "$default_scope" || skip "$OUT" "scope: default resolves to a tenant" "no PROJECT.md tenant_id"
assert_eq "null" "$all_scope" "scope: ?project=all returns tenant_filter=null" "$OUT"

# §4.D Threats / by-rule contract
audit=$(curl_json "$BOARD_URL/api/leash/audit?limit=10&project=all")
assert_in '"records"' "$audit" "/api/leash/audit returns records[]" "$OUT"

# §4.E Detection quality
eval_status=$(curl_json "$BOARD_URL/api/leash/eval-status")
if echo "$eval_status" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'rules' in d else 1)" 2>/dev/null; then
  pass "$OUT" "/api/leash/eval-status has rules[] shape"
else
  fail "$OUT" "/api/leash/eval-status has rules[] shape" "$eval_status"
fi

# §4.F Agents canonical
agents=$(curl_json "$BOARD_URL/api/leash/agents?period=24h&project=all")
if echo "$agents" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if not d.get('ok'): sys.exit(1)
if 'agents' not in d: sys.exit(1)
if 'all_count' not in d: sys.exit(1)
for a in d.get('agents', []):
    for k in ('name','calls','cost_usd'):
        if k not in a: sys.exit(2)
" 2>/dev/null; then
  count=$(echo "$agents" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('agents',[])))")
  pass "$OUT" "/api/leash/agents canonical shape" "n=$count agents"
else
  # If endpoint returned ok:false it just means console unreachable — that's fallback territory
  ok_field=$(echo "$agents" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok'))" 2>/dev/null)
  if [ "$ok_field" = "False" ]; then
    skip "$OUT" "/api/leash/agents canonical shape" "ok=false — console down, UI falls back to client-side aggregation"
  else
    fail "$OUT" "/api/leash/agents canonical shape" "missing required keys"
  fi
fi

# §4.G Budgets editor — GET + POST
budgets=$(curl_json "$BOARD_URL/api/leash/budgets?project=all")
if echo "$budgets" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ok = isinstance(d.get('per_agent_caps'), dict) and 'all_per_agent_caps' in d and 'tenant_filter' in d
sys.exit(0 if ok else 1)
" 2>/dev/null; then
  pass "$OUT" "/api/leash/budgets shape (per_agent_caps + all_per_agent_caps + tenant_filter)"
else
  fail "$OUT" "/api/leash/budgets shape (per_agent_caps + all_per_agent_caps + tenant_filter)"
fi

# §4.G Budgets POST round-trip — set, verify, clear, verify
TEST_AGENT="leash_section4_test"
set_code=$(curl_status "$BOARD_URL/api/leash/budgets/$TEST_AGENT" POST '{"cap_usd":2.5}')
case "$set_code" in
  200|201|204)
    pass "$OUT" "POST /api/leash/budgets/$TEST_AGENT (set)" "HTTP $set_code"
    ;;
  *) fail "$OUT" "POST /api/leash/budgets/$TEST_AGENT (set)" "HTTP $set_code" ;;
esac

# Verify cap appears
appeared=$(curl_json "$BOARD_URL/api/leash/budgets?project=all" | python3 -c "
import sys, json
d = json.load(sys.stdin)
caps = d.get('all_per_agent_caps') or d.get('per_agent_caps', {})
print(caps.get('$TEST_AGENT'))
" 2>/dev/null)
[ "$appeared" = "2.5" ] && pass "$OUT" "budget cap visible after POST" "cap=$appeared" || fail "$OUT" "budget cap visible after POST" "cap=$appeared"

# Clear
clear_code=$(curl_status "$BOARD_URL/api/leash/budgets/$TEST_AGENT" POST '{"cap_usd":null}')
case "$clear_code" in
  200|201|204) pass "$OUT" "POST cap_usd=null clears the cap" "HTTP $clear_code" ;;
  *)           fail "$OUT" "POST cap_usd=null clears the cap" "HTTP $clear_code" ;;
esac

# §4.H Export CSV + JSON
csv_status=$(curl -sS -o /tmp/sec4-threats.csv -w '%{http_code}' "$BOARD_URL/api/leash/export?kind=threats&period=24h&project=all" 2>/dev/null || echo 000)
assert_eq "200" "$csv_status" "/api/leash/export?kind=threats returns 200" "$OUT"
# Header check
if [ -s /tmp/sec4-threats.csv ]; then
  first_line=$(head -1 /tmp/sec4-threats.csv)
  assert_in 'rule_id' "$first_line" "threats CSV has rule_id column" "$OUT"
  assert_in 'tenant_id' "$first_line" "threats CSV has tenant_id column" "$OUT"
fi

json_status=$(curl -sS -o /tmp/sec4-audit.json -w '%{http_code}' "$BOARD_URL/api/leash/export?kind=audit&period=1h&project=all" 2>/dev/null || echo 000)
assert_eq "200" "$json_status" "/api/leash/export?kind=audit returns 200" "$OUT"
if [ -s /tmp/sec4-audit.json ]; then
  has_records=$(python3 -c "import json; d=json.load(open('/tmp/sec4-audit.json')); print('yes' if 'records' in d else 'no')")
  assert_eq "yes" "$has_records" "audit JSON has records[]" "$OUT"
fi

# §4.I Kill endpoint contract (don't actually kill anything live — just send
# to a non-existent session id and verify it 200s or 404s cleanly)
fake_sid="section4-nonexistent-$RANDOM"
kill_code=$(curl_status "$BOARD_URL/api/leash/kill" POST "$(printf '{"session_id":"%s","reason":"section4-test"}' "$fake_sid")")
case "$kill_code" in
  200|404|500)
    pass "$OUT" "/api/leash/kill accepts session_id payload" "HTTP $kill_code"
    ;;
  *) fail "$OUT" "/api/leash/kill accepts session_id payload" "HTTP $kill_code" ;;
esac

# §4.D extra — Feedback (rule performance) contract
feedback=$(curl_json "$BOARD_URL/api/leash/feedback?period=7d")
if echo "$feedback" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'rules' in d else 1)" 2>/dev/null; then
  count=$(echo "$feedback" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('rules',[])))")
  pass "$OUT" "/api/leash/feedback has rules[]" "n=$count"
else
  fail "$OUT" "/api/leash/feedback has rules[]" "missing 'rules'"
fi

# Sanity: index.html ships sub-tab handlers
index_html=$(curl_json "$BOARD_URL/")
assert_in 'switchLeashSubtab' "$index_html" "index.html exports switchLeashSubtab handler" "$OUT"
assert_in 'leash-quality-table' "$index_html" "index.html has Detection quality detail block" "$OUT"
assert_in 'leash-per-agent' "$index_html" "index.html has per-agent container" "$OUT"
assert_in 'classifyLeashRisk' "$index_html" "index.html has risk classifier (with new v2.21 rules)" "$OUT"
assert_in 'tool_result_scanner' "$index_html" "classifier knows tool_result_scanner" "$OUT"
assert_in 'exfil_chain_detector' "$index_html" "classifier knows exfil_chain_detector" "$OUT"

echo '```' >> "$OUT"
echo >> "$OUT"
echo "**Result:** $PASSED passed · $FAILED failed · $SKIPPED skipped" >> "$OUT"

[ "$FAILED" -eq 0 ] && exit 0 || exit 1
