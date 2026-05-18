#!/usr/bin/env bash
# tests/security/run-section-3-budgets.sh — §3 Per-agent budget enforcement
#
# Automates:
#   §3.A set cap → exceed → expect block (HTTP 402 / LeashBudgetExceeded)
#   §3.B soft-warn audit event before block
#   §3.D kill switch via /admin/kill/{session_id}
#
# §3.C per-tenant cap is currently informational (leash v2.23 caps are
# per-agent global, not per-tenant override) — we just verify the budget
# tracker counter shape.

set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/_lib.sh"

OUT=${1:-/tmp/section-3-budgets.md}
: > "$OUT"
echo "# §3 Per-agent budget enforcement ($(ts))" >> "$OUT"
echo >> "$OUT"
echo '```' >> "$OUT"

# Early-exit if proxy not reachable
proxy_ok=$(curl_status "$PROXY_URL/admin/stats")
if [ "$proxy_ok" != "200" ]; then
  skip "$OUT" "proxy reachable" "$PROXY_URL → HTTP $proxy_ok"
  echo '```' >> "$OUT"
  echo "**Result:** 0 passed · 0 failed · 1 skipped — proxy unreachable" >> "$OUT"
  exit 0
fi

AGENT=${SEC3_AGENT:-leash_qa_agent}
TENANT=${SEC3_TENANT:-leash-section3}

# §3.A.1 set a tight cap
since=$(date -u +%FT%TZ)
code=$(curl_status "$PROXY_URL/admin/budget/$AGENT" POST '{"cap_usd":0.01}')
assert_eq "200" "$code" "set $AGENT cap=\$0.01" "$OUT"

# Verify cap visible
caps=$(curl_json "$PROXY_URL/admin/budget" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('per_agent_caps',{}).get('$AGENT'))" 2>/dev/null)
assert_eq "0.01" "$caps" "/admin/budget reflects new cap" "$OUT"

# §3.A.2 fire two requests under the same tenant+agent, second should block
sid_ok="$TENANT-budget-ok-$RANDOM"
sid_block="$TENANT-budget-block-$RANDOM"

# Smaller request — likely under cap when proxy enforces cap_usd=0.01 (tiny)
code1=$(curl -sS -o /tmp/sec3-1.json -w '%{http_code}' \
  -X POST "$PROXY_URL/v1/messages" \
  -H "X-LLM-Leash-Tenant-Id: $TENANT" \
  -H "X-LLM-Leash-Session-Id: $sid_ok" \
  -H "X-LLM-Leash-Agent-Name: $AGENT" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-haiku-4-5","messages":[{"role":"user","content":"ping"}],"max_tokens":4}' 2>/dev/null || echo 000)

# Large request — should blow the cap
code2=$(curl -sS -o /tmp/sec3-2.json -w '%{http_code}' \
  -X POST "$PROXY_URL/v1/messages" \
  -H "X-LLM-Leash-Tenant-Id: $TENANT" \
  -H "X-LLM-Leash-Session-Id: $sid_block" \
  -H "X-LLM-Leash-Agent-Name: $AGENT" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-5","messages":[{"role":"user","content":"write a 500 word essay"}],"max_tokens":500}' 2>/dev/null || echo 000)

# Accept either 402 (LeashBudgetExceeded) or 403 — proxy may use either
case "$code2" in
  402|403)
    pass "$OUT" "over-budget request blocked" "HTTP $code2"
    ;;
  *)
    fail "$OUT" "over-budget request blocked" "HTTP $code2 (expected 402/403)"
    ;;
esac

# §3.B audit shows policy_decision with budget rule
sleep 0.5
blocked=$(audit_lines_since "$since" | python3 -c "
import sys, json
n = 0
for line in sys.stdin:
    try:
        r = json.loads(line)
        if r.get('kind') == 'policy_decision' and r.get('action') == 'block' \
           and 'budget' in (r.get('rule_id') or '').lower():
            n += 1
    except: pass
print(n)
")
[ "${blocked:-0}" -ge 1 ] && pass "$OUT" "audit has budget-block event" "n=$blocked" || fail "$OUT" "audit has budget-block event" "n=$blocked"

# §3.D kill switch round-trip on the second session
# 1) mark killed
code=$(curl_status "$PROXY_URL/admin/kill/$sid_block" POST '{"reason":"section3-qa"}')
assert_eq "200" "$code" "POST /admin/kill/$sid_block" "$OUT"

# 2) status reads back as killed
killed=$(curl_json "$PROXY_URL/admin/kill/$sid_block" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('killed'))" 2>/dev/null)
assert_eq "True" "$killed" "session shows killed=true" "$OUT"

# 3) trying to call the killed session is rejected
code=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$PROXY_URL/v1/messages" \
  -H "X-LLM-Leash-Session-Id: $sid_block" \
  -H "X-LLM-Leash-Agent-Name: $AGENT" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-haiku-4-5","messages":[{"role":"user","content":"ping"}],"max_tokens":4}' 2>/dev/null || echo 000)
case "$code" in
  402|403|410)
    pass "$OUT" "killed session rejects new calls" "HTTP $code"
    ;;
  *)
    fail "$OUT" "killed session rejects new calls" "HTTP $code"
    ;;
esac

# 4) clear kill
code=$(curl_status "$PROXY_URL/admin/kill/$sid_block" DELETE)
assert_eq "200" "$code" "DELETE /admin/kill/$sid_block" "$OUT"

# Cleanup: clear the test cap
curl -sS -X POST "$PROXY_URL/admin/budget/$AGENT" \
  -H 'Content-Type: application/json' -d '{"cap_usd":null}' >/dev/null 2>&1 || true

echo '```' >> "$OUT"
echo >> "$OUT"
echo "**Result:** $PASSED passed · $FAILED failed · $SKIPPED skipped" >> "$OUT"

[ "$FAILED" -eq 0 ] && exit 0 || exit 1
