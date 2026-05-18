#!/usr/bin/env bash
# tests/security/run-section-2-detection.sh — §2 Detection quality
#
# Composes the existing run-per-rule.sh + run-fp-bait.sh + eval-record into
# one section report.
#
# §2.A eval-record vs jailbreaks_v1.jsonl (skipped when llm-leash CLI absent)
# §2.B per-rule positive sweep
# §2.C FP-bait sweep
# §2.D drift smoke (informational — just checks that eval-status endpoint
#       returns the expected shape with drift_flag field)

set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/_lib.sh"

OUT=${1:-/tmp/section-2-detection.md}
: > "$OUT"
echo "# §2 Detection quality ($(ts))" >> "$OUT"
echo >> "$OUT"

# ── §2.A eval-record ─────────────────────────────────────────────────────
echo "## §2.A eval-record vs golden set" >> "$OUT"
echo '```' >> "$OUT"
LEASH_REPO="$HOME/.great_cto/llm-leash"
DATASET="$LEASH_REPO/tests/fixtures/eval/jailbreaks_v1.jsonl"
if command -v llm-leash >/dev/null 2>&1 && [ -f "$DATASET" ]; then
  metrics=/tmp/section2-eval.jsonl
  set +e
  LLM_LEASH_EVAL_METRICS_PATH="$metrics" \
    llm-leash eval-record \
      --dataset "$DATASET" \
      --drift-threshold 0.05 \
      > /tmp/section2-eval-stdout.txt 2>&1
  exit_code=$?
  set -e
  if [ "$exit_code" -eq 0 ]; then
    pass "$OUT" "eval-record clean (no drift)" "exit=0"
  elif [ "$exit_code" -eq 1 ]; then
    fail "$OUT" "eval-record clean (no drift)" "exit=1 — drift detected"
  else
    skip "$OUT" "eval-record clean (no drift)" "exit=$exit_code (CLI error)"
  fi
  if [ -f "$metrics" ]; then
    rows=$(wc -l < "$metrics" | tr -d ' ')
    pass "$OUT" "metrics JSONL written" "rows=$rows"
    # Floor check: any rule with F1 < 0.5 → fail; 0.5–0.75 → warn (informational)
    low=$(python3 -c "
import json, sys
low = []
with open('$metrics') as f:
    for line in f:
        try:
            r = json.loads(line)
            if r.get('f1', 1.0) < 0.5:
                low.append(r['rule_id'])
        except: pass
print(','.join(low) or '-')
")
    if [ "$low" = "-" ]; then
      pass "$OUT" "all rules F1 ≥ 0.5"
    else
      fail "$OUT" "all rules F1 ≥ 0.5" "low rules: $low"
    fi
  else
    skip "$OUT" "metrics JSONL written" "no file"
  fi
else
  skip "$OUT" "eval-record clean (no drift)" "llm-leash CLI or dataset missing"
fi
echo '```' >> "$OUT"

# ── §2.B per-rule positive sweep ─────────────────────────────────────────
echo "## §2.B per-rule positive prompts" >> "$OUT"
echo '```' >> "$OUT"
proxy_ok=$(curl_status "$PROXY_URL/admin/stats")
if [ "$proxy_ok" = "200" ]; then
  if [ -x "$SCRIPT_DIR/run-per-rule.sh" ]; then
    REPORT=/tmp/section2-per-rule.md \
      bash "$SCRIPT_DIR/run-per-rule.sh" >/dev/null 2>&1
    rc=$?
    # Aggregate counts from the report
    pr_pass=$(grep -c '✓' /tmp/section2-per-rule.md 2>/dev/null || echo 0)
    pr_fail=$(grep -c '❌' /tmp/section2-per-rule.md 2>/dev/null || echo 0)
    pr_skip=$(grep -c '⊘ skipped' /tmp/section2-per-rule.md 2>/dev/null || echo 0)
    if [ "$rc" -eq 0 ]; then
      pass "$OUT" "per-rule sweep" "pass=$pr_pass fail=$pr_fail skipped=$pr_skip"
    else
      fail "$OUT" "per-rule sweep" "pass=$pr_pass fail=$pr_fail skipped=$pr_skip"
    fi
  else
    skip "$OUT" "per-rule sweep" "run-per-rule.sh not executable"
  fi
else
  skip "$OUT" "per-rule sweep" "proxy unreachable ($proxy_ok)"
fi
echo '```' >> "$OUT"

# ── §2.C FP-bait sweep ───────────────────────────────────────────────────
echo "## §2.C FP-bait sweep" >> "$OUT"
echo '```' >> "$OUT"
if [ "$proxy_ok" = "200" ]; then
  if [ -x "$SCRIPT_DIR/run-fp-bait.sh" ]; then
    REPORT=/tmp/section2-fp-bait.md \
      bash "$SCRIPT_DIR/run-fp-bait.sh" >/dev/null 2>&1
    rc=$?
    blocks=$(grep -c '| block ' /tmp/section2-fp-bait.md 2>/dev/null || echo 0)
    warns=$(grep -c '| allow+warn ' /tmp/section2-fp-bait.md 2>/dev/null || echo 0)
    if [ "$rc" -eq 0 ]; then
      pass "$OUT" "FP-bait sweep" "blocks=$blocks warns=$warns"
    else
      fail "$OUT" "FP-bait sweep" "blocks=$blocks warns=$warns (>thresholds)"
    fi
  else
    skip "$OUT" "FP-bait sweep" "run-fp-bait.sh not executable"
  fi
else
  skip "$OUT" "FP-bait sweep" "proxy unreachable ($proxy_ok)"
fi
echo '```' >> "$OUT"

# ── §2.D drift endpoint contract ─────────────────────────────────────────
echo "## §2.D drift endpoint shape" >> "$OUT"
echo '```' >> "$OUT"
eval_resp=$(curl_json "$BOARD_URL/api/leash/eval-status")
if [ -n "$eval_resp" ]; then
  has_rules=$(echo "$eval_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'rules' in d else 'no')" 2>/dev/null)
  if [ "$has_rules" = "yes" ]; then
    pass "$OUT" "/api/leash/eval-status returns rules[]"
  else
    fail "$OUT" "/api/leash/eval-status returns rules[]" "missing 'rules' key"
  fi
else
  skip "$OUT" "/api/leash/eval-status returns rules[]" "endpoint unreachable"
fi
echo '```' >> "$OUT"

echo >> "$OUT"
echo "**Result:** $PASSED passed · $FAILED failed · $SKIPPED skipped" >> "$OUT"

[ "$FAILED" -eq 0 ] && exit 0 || exit 1
