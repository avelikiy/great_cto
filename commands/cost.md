---
description: "Cost & capacity health — LLM router savings, run-rate, cost-per-deploy, ROI per shipped feature, WoW/MoM delta. Pairs with /digest (delivery+DORA) and /burn (reliability)."
argument-hint: "[period_days] | feature <slug> | agent <name> — default: /cost 30. Examples: /cost 7 | /cost feature stripe-subscriptions | /cost agent architect"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

You are the Cost & Capacity aggregator. Multiple modes:

1. **`/cost [days]` — Aggregate health** (default mode)
   - LLM router savings — measured Kimi-vs-Sonnet differential from `.great_cto/llm-router-usage.log`
   - Infra cost — monthly run-rate, cost-per-deploy, WoW/MoM drift, headroom vs budget, top movers
2. **`/cost feature <slug>`** — ROI per shipped feature (NEW in v2.3.0)
   - Total LLM cost broken down by agent
   - Comparison to human-equivalent at $150/hr
   - ROI multiplier
   - Cross-reference to similar past features in same archetype
3. **`/cost agent <name>`** — Per-agent cost (NEW in v2.3.0)
   - Same as `/agent-review <name>` but cost-focused

## Mode dispatch

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

# Detect mode from first arg
case "${1:-}" in
  feature)
    SLUG="${2:-}"
    [ -z "$SLUG" ] && { echo "Usage: /cost feature <slug>"; exit 2; }
    # → jump to "Feature mode" section below
    MODE=feature
    ;;
  agent)
    AGENT="${2:-}"
    [ -z "$AGENT" ] && { echo "Usage: /cost agent <name>"; exit 2; }
    # → jump to "Agent mode" section below
    MODE=agent
    ;;
  *)
    MODE=aggregate
    PERIOD=${1:-30}
    case "$PERIOD" in ''|*[!0-9]*) echo "Usage: /cost [period_days] | feature <slug> | agent <name>"; exit 2 ;; esac
    ;;
esac

COST_LOG=.great_cto/cost-history.log
DEPLOYS_LOG=.great_cto/deploys.log
```

## Feature mode — `/cost feature <slug>`

Compute total cost of shipping a feature, broken down by agent + ROI vs human equivalent.

```bash
if [ "$MODE" = "feature" ]; then
  echo "## Cost: $SLUG"
  echo ""

  if [ ! -f "$COST_LOG" ]; then
    echo "_No cost history yet — feature ROI requires at least one shipped feature._"
    exit 0
  fi

  # Filter cost-history.log entries tagged with this feature slug
  # Format: <timestamp> agent=<name> feature=<slug> cost_usd=<n> [other tags]
  ENTRIES=$(grep -E "feature=$SLUG\b" "$COST_LOG" 2>/dev/null)

  if [ -z "$ENTRIES" ]; then
    echo "_No cost entries tagged with feature=$SLUG. Either:_"
    echo "1. Feature not yet implemented (run \`/start \"feature description\"\`)"
    echo "2. Feature uses different slug — check \`docs/architecture/ARCH-*.md\` filenames"
    echo ""
    echo "Available features in cost log:"
    grep -oE "feature=[^ ]+" "$COST_LOG" | sort -u | head -10
    exit 0
  fi

  # Aggregate by agent
  echo "### Per-agent breakdown"
  echo ""
  echo "| Agent | Invocations | Cost | Avg/inv |"
  echo "|-------|------------:|-----:|--------:|"
  echo "$ENTRIES" | awk '
    {
      for (i=1;i<=NF;i++) {
        if ($i ~ /^agent=/) { gsub(/agent=/, "", $i); agent = $i }
        if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/cost[-_]?usd[=:]/, "", $i); cost = $i+0 }
      }
      sum[agent] += cost
      count[agent]++
    }
    END {
      for (a in sum) printf "| %s | %d | $%.2f | $%.2f |\n", a, count[a], sum[a], sum[a]/count[a]
    }
  ' | sort

  TOTAL=$(echo "$ENTRIES" | awk '
    { for (i=1;i<=NF;i++) if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/cost[-_]?usd[=:]/, "", $i); sum += $i+0 } }
    END { printf "%.2f", sum }
  ')

  echo "| **Total** | | **\$$TOTAL** | |"
  echo ""

  # Human-equivalent comparison
  ARCHETYPE=$(grep -E "^archetype:|^primary:" .great_cto/PROJECT.md 2>/dev/null | head -1 | awk '{print $2}')
  # Default: assume 12 hours human equivalent for standard feature
  HUMAN_HOURS=${HUMAN_HOURS:-12}
  HUMAN_RATE=${HUMAN_RATE:-150}
  HUMAN_COST=$(echo "scale=0; $HUMAN_HOURS * $HUMAN_RATE" | bc)
  ROI=$(echo "scale=1; $HUMAN_COST / $TOTAL" | bc)

  echo "### vs Human equivalent"
  echo ""
  echo "- Estimated effort: ${HUMAN_HOURS}h × \$${HUMAN_RATE}/hr = **\$${HUMAN_COST}**"
  echo "- AI cost: **\$${TOTAL}**"
  echo "- **ROI: ${ROI}x**"
  echo ""
  echo "_Override estimates: \`HUMAN_HOURS=20 HUMAN_RATE=200 /cost feature $SLUG\`_"

  # Comparison to mean for archetype
  if [ -n "$ARCHETYPE" ]; then
    echo ""
    echo "### Compared to other features in archetype=$ARCHETYPE"
    grep "feature=" "$COST_LOG" | grep -v "feature=$SLUG" | awk '
      {
        for (i=1;i<=NF;i++) {
          if ($i ~ /^feature=/) { gsub(/feature=/, "", $i); feat = $i }
          if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/cost[-_]?usd[=:]/, "", $i); cost = $i+0 }
        }
        sum[feat] += cost
      }
      END {
        for (f in sum) printf "- %s: $%.2f\n", f, sum[f]
      }
    ' | sort -t '$' -k2 -n | head -5
  fi
  exit 0
fi
```

## Agent mode — `/cost agent <name>`

Quick per-agent cost summary (lighter than /agent-review):

```bash
if [ "$MODE" = "agent" ]; then
  echo "## Cost: $AGENT"
  echo ""

  if [ ! -f "$COST_LOG" ]; then
    echo "_No cost history yet._"
    exit 0
  fi

  ENTRIES=$(grep -E "agent=$AGENT\b" "$COST_LOG" 2>/dev/null)
  COUNT=$(echo "$ENTRIES" | grep -c .)

  if [ "$COUNT" = "0" ]; then
    echo "_No cost entries for agent=$AGENT._"
    exit 0
  fi

  TOTAL=$(echo "$ENTRIES" | awk '{ for (i=1;i<=NF;i++) if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/cost[-_]?usd[=:]/, "", $i); sum += $i+0 } } END { printf "%.2f", sum }')
  AVG=$(echo "scale=2; $TOTAL / $COUNT" | bc)

  echo "- Total invocations: $COUNT"
  echo "- Total cost: \$$TOTAL"
  echo "- Avg cost/invocation: \$$AVG"
  echo ""
  echo "_For full performance review: \`/agent-review $AGENT\`_"
  exit 0
fi
```

## Aggregate mode (default — original behaviour)

You are the Cost & Capacity aggregator. Two parts:

1. **LLM router savings** — measured Kimi-vs-Sonnet differential from `.great_cto/llm-router-usage.log`. This is the data behind the README "LLM costs down 60–80%" badge. Suppressed when the log is empty (no fake claim).
2. **Infra cost** — monthly run-rate, cost-per-deploy, WoW/MoM drift, headroom vs configured budget, and top movers from `.great_cto/cost-history.log` cross-referenced with `.great_cto/deploys.log`.

Cost is the third axis of engineering health after reliability (`/burn`) and delivery (DORA metrics in `/digest`). A team shipping fast with zero incidents is still failing if its cloud bill doubles every quarter without a matching revenue curve. This command makes that curve visible.

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
PERIOD=${1:-30}
case "$PERIOD" in ''|*[!0-9]*) echo "Usage: /cost [period_days] (got: $PERIOD)"; exit 2 ;; esac
COST_LOG=.great_cto/cost-history.log
DEPLOYS_LOG=.great_cto/deploys.log

if [ ! -f "$COST_LOG" ]; then
  echo "No cost history yet. /cost activates after devops ships at least one release."
  echo "First deploy appends an estimate row; subsequent runs enable actual-vs-estimated comparison."
  exit 0
fi
```

## Read budget config

```bash
# Monthly budget from PROJECT.md — per-project override (legacy).
MONTHLY_BUDGET=$(grep "^monthly-budget:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '$')
ALERT_THRESHOLD=$(grep "^budget-alert-threshold:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '%')
ALERT_THRESHOLD=${ALERT_THRESHOLD:-80}

# Global caps from ~/.great_cto/config.json (v2.8+) — daily / monthly bill-shock
# protection. Used by scripts/hooks/cost-guard.mjs and surfaced here for
# visibility. Format: { "daily_max_usd": 5, "monthly_max_usd": 100, "enforce": "warn" | "block" }
GLOBAL_CFG="$HOME/.great_cto/config.json"
DAILY_CAP=""; GLOBAL_MONTHLY_CAP=""; ENFORCE_MODE="warn"
if [ -f "$GLOBAL_CFG" ]; then
  DAILY_CAP=$(jq -r '.daily_max_usd // empty' "$GLOBAL_CFG" 2>/dev/null)
  GLOBAL_MONTHLY_CAP=$(jq -r '.monthly_max_usd // empty' "$GLOBAL_CFG" 2>/dev/null)
  ENFORCE_MODE=$(jq -r '.enforce // "warn"' "$GLOBAL_CFG" 2>/dev/null)
fi
# Global monthly takes precedence over per-project legacy cap.
MONTHLY_BUDGET="${GLOBAL_MONTHLY_CAP:-$MONTHLY_BUDGET}"
```

## Daily cap section (v2.8+ — emit FIRST so it's visible above the fold)

```bash
if [ -n "$DAILY_CAP" ] || [ -n "$MONTHLY_BUDGET" ]; then
  echo "## Bill-shock protection"
  echo ""

  TODAY=$(date -u +%Y-%m-%d)
  MONTH=$(date -u +%Y-%m)

  # Today's spend
  TODAY_SPENT=$(awk -v d="$TODAY" '
    $0 ~ "^" d {
      for (i=1; i<=NF; i++) if ($i ~ /^cost_usd=/) { split($i,a,"="); s+=a[2] }
    }
    END { printf "%.2f", s+0 }
  ' "$COST_LOG" 2>/dev/null)

  # Month's spend
  MONTH_SPENT=$(awk -v m="$MONTH" '
    $0 ~ "^" m {
      for (i=1; i<=NF; i++) if ($i ~ /^cost_usd=/) { split($i,a,"="); s+=a[2] }
    }
    END { printf "%.2f", s+0 }
  ' "$COST_LOG" 2>/dev/null)

  if [ -n "$DAILY_CAP" ]; then
    REMAIN_DAY=$(awk "BEGIN{printf \"%.2f\", $DAILY_CAP - $TODAY_SPENT}")
    PCT_DAY=$(awk "BEGIN{printf \"%.0f\", 100 * $TODAY_SPENT / $DAILY_CAP}")
    BAR_DAY=$(awk "BEGIN{n=int(($TODAY_SPENT*10)/$DAILY_CAP); for(i=0;i<10;i++) printf (i<n ? \"▓\" : \"░\")}")
    echo "  Today  $BAR_DAY  \$$TODAY_SPENT / \$$DAILY_CAP  (${PCT_DAY}% used, \$$REMAIN_DAY left)"
  fi

  if [ -n "$MONTHLY_BUDGET" ]; then
    REMAIN_MO=$(awk "BEGIN{printf \"%.2f\", $MONTHLY_BUDGET - $MONTH_SPENT}")
    PCT_MO=$(awk "BEGIN{printf \"%.0f\", 100 * $MONTH_SPENT / $MONTHLY_BUDGET}")
    BAR_MO=$(awk "BEGIN{n=int(($MONTH_SPENT*10)/$MONTHLY_BUDGET); for(i=0;i<10;i++) printf (i<n ? \"▓\" : \"░\")}")
    echo "  Month  $BAR_MO  \$$MONTH_SPENT / \$$MONTHLY_BUDGET  (${PCT_MO}% used, \$$REMAIN_MO left)"
  fi

  echo "  Mode:  $ENFORCE_MODE  $([ "$ENFORCE_MODE" = "block" ] && echo "(hard cap)" || echo "(warning only)")"
  echo ""
  echo "  ▸ Configure: \`~/.great_cto/config.json\` keys: \`daily_max_usd\` \`monthly_max_usd\` \`enforce\`"
  echo "  ▸ One-shot bump: \`GREAT_CTO_BUMP_CAP=10\` then re-run"
  echo ""
fi
```

## LLM router savings (lead the report with this)

Surface measured cost reduction from `.great_cto/llm-router-usage.log` first, before infra cost. The README badge claims "60–80% LLM cost down" — this section is the data backing it. If the log is empty, the section is suppressed (no false claim).

```bash
ROUTER_LOG=.great_cto/llm-router-usage.log
if [ -f "$ROUTER_LOG" ]; then
  python3 - "$ROUTER_LOG" "$PERIOD" <<'PY'
import sys, json, datetime, pathlib
log_path, period = sys.argv[1], int(sys.argv[2])
window_start = datetime.datetime.now(datetime.timezone.utc).timestamp() - period * 86400

# Pricing (USD per 1M tokens) — keep in sync with skills/great_cto/references/llm-router.md
PRICING = {
    # Routine triage path (Kimi K2 via OpenRouter)
    "kimi":   {"in": 0.60e-6, "out": 2.50e-6},
    # Native Claude path (Sonnet) — what the same call would have cost without the router
    "sonnet": {"in": 3.00e-6, "out": 15.00e-6},
}

calls = 0
in_tok = out_tok = 0
for line in pathlib.Path(log_path).read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    try:
        rec = json.loads(line)
    except Exception:
        continue
    ts = rec.get("ts") or rec.get("timestamp")
    if ts:
        try:
            t = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
            if t < window_start:
                continue
        except Exception:
            pass
    calls += 1
    in_tok += rec.get("prompt_tokens") or 0
    out_tok += rec.get("completion_tokens") or 0

if calls == 0:
    print("─── LLM ROUTER SAVINGS ─────────────────────────")
    print("  No router calls in the last", period, "days. Routine triage stays on native Claude.")
    print("  Set OPENROUTER_API_KEY to enable the Kimi fallback (see skills/great_cto/references/llm-router.md).")
    raise SystemExit

kimi_cost   = in_tok * PRICING["kimi"]["in"]   + out_tok * PRICING["kimi"]["out"]
sonnet_cost = in_tok * PRICING["sonnet"]["in"] + out_tok * PRICING["sonnet"]["out"]
saved = sonnet_cost - kimi_cost
pct = (saved / sonnet_cost * 100.0) if sonnet_cost > 0 else 0.0

print("─── LLM ROUTER SAVINGS ─────────────────────────")
print(f"  Window:     last {period} days")
print(f"  Calls:      {calls:,}        Tokens: {in_tok+out_tok:,} ({in_tok:,} in + {out_tok:,} out)")
print(f"  Kimi spend: ${kimi_cost:>9.4f}")
print(f"  Sonnet eq:  ${sonnet_cost:>9.4f}")
print(f"  Saved:      ${saved:>9.4f}    ({pct:.1f}% reduction)")
print()
if pct >= 60:
    print(f"  ✓ Backs the README claim 'LLM costs down 60–80%' ({pct:.0f}% measured here).")
elif pct >= 40:
    print(f"  ⚠ Below the 60% claim — mostly running on Sonnet path. Audit ask_kimi triggers in agent prompts.")
else:
    print(f"  ✗ Router under-utilised — most calls still on Sonnet. Check llm-router.md routing rules.")
PY
fi
```

---

## Compute cost metrics

```bash
python3 - "$COST_LOG" "$DEPLOYS_LOG" "$PERIOD" "${MONTHLY_BUDGET:-0}" "$ALERT_THRESHOLD" <<'PY'
import sys, os, datetime, collections

cost_log, deploys_log, period, budget, alert_threshold = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
now = datetime.datetime.now(datetime.timezone.utc).timestamp()
window_start = now - period * 86400
window_start_prev = now - 2 * period * 86400

# Parse cost log
rows = []  # (ts, service, est, actual, source, feature)
with open(cost_log) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'): continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 6: continue
        try:
            ts = datetime.datetime.fromisoformat(parts[0].replace('Z', '+00:00')).timestamp()
        except Exception: continue
        try: est = float(parts[2]) if parts[2] not in ('-', '') else None
        except: est = None
        try: actual = float(parts[3]) if parts[3] not in ('-', '') else None
        except: actual = None
        rows.append((ts, parts[1], est, actual, parts[4], parts[5]))

if not rows:
    print("No parseable cost entries.")
    sys.exit(0)

rows.sort()

# Monthly run-rate = most recent actual per service; fall back to estimate if no actual yet.
# This mirrors how a real cloud bill aggregates: latest known value per line item.
latest_per_service = {}  # service -> (ts, est, actual)
for ts, svc, est, actual, source, feat in rows:
    prev = latest_per_service.get(svc)
    if prev is None or ts > prev[0]:
        latest_per_service[svc] = (ts, est, actual)

def value(tup):
    _, est, actual = tup
    return actual if actual is not None else (est if est is not None else 0.0)

total_runrate = sum(value(v) for v in latest_per_service.values())
has_actual = any(v[2] is not None for v in latest_per_service.values())

# Window cost (sum of estimates for features shipped in this window)
cur_rows = [r for r in rows if r[0] >= window_start]
prev_rows = [r for r in rows if window_start_prev <= r[0] < window_start]
cur_added = sum((r[2] or 0) for r in cur_rows)
prev_added = sum((r[2] or 0) for r in prev_rows)
delta_pct = ((cur_added - prev_added) / prev_added * 100) if prev_added > 0 else None

# Cost-per-deploy: deploys in window vs cost added in window
deploys_in_window = 0
if os.path.exists(deploys_log):
    with open(deploys_log) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'): continue
            parts = [p.strip() for p in line.split('|')]
            if len(parts) < 2: continue
            try:
                ts = datetime.datetime.fromisoformat(parts[0].replace('Z', '+00:00')).timestamp()
            except Exception: continue
            if ts >= window_start:
                deploys_in_window += 1

cost_per_deploy = (cur_added / deploys_in_window) if deploys_in_window > 0 else None

# Top movers: services where estimated added this window > 20% of prior window's total
service_cur = collections.defaultdict(float)
service_prev = collections.defaultdict(float)
for ts, svc, est, _actual, _s, _f in cur_rows:
    if est: service_cur[svc] += est
for ts, svc, est, _actual, _s, _f in prev_rows:
    if est: service_prev[svc] += est
movers = []
for svc in set(list(service_cur.keys()) + list(service_prev.keys())):
    cur_v = service_cur.get(svc, 0)
    prev_v = service_prev.get(svc, 0)
    if prev_v > 0:
        pct = (cur_v - prev_v) / prev_v * 100
        if abs(pct) >= 20: movers.append((svc, cur_v, prev_v, pct))
    elif cur_v > 50:
        movers.append((svc, cur_v, prev_v, None))
movers.sort(key=lambda m: m[1] - m[2], reverse=True)

# Output
print(f"═══ Cost & Capacity — last {period} days ═══\n")

print(f"  Monthly run-rate:   ${total_runrate:>10,.0f}/mo  ({'actuals+estimates' if has_actual else 'estimates only — run /cost after cloud-console reconcile'})")
if budget > 0:
    pct = total_runrate / budget * 100
    headroom = budget - total_runrate
    if pct >= 100:
        marker = "🔴 OVER BUDGET"
    elif pct >= alert_threshold:
        marker = f"⚠ {pct:.0f}% of budget (alert at {alert_threshold:.0f}%)"
    else:
        marker = f"✓ {pct:.0f}% of budget"
    print(f"  Budget:             ${budget:>10,.0f}/mo   headroom: ${headroom:>10,.0f}/mo  {marker}")
else:
    print(f"  Budget:             not configured — set `monthly-budget: <usd>` in PROJECT.md to enable headroom")

print()
print(f"  Added this window:  ${cur_added:>10,.0f}   (prior {period}d: ${prev_added:,.0f}", end="")
if delta_pct is not None:
    arrow = "↑" if delta_pct >= 0 else "↓"
    mark = "⚠" if delta_pct >= 30 else "ℹ" if delta_pct >= 10 else "✓"
    print(f", {arrow}{abs(delta_pct):.0f}% {mark})")
else:
    print(", no prior baseline)")

if cost_per_deploy is not None:
    print(f"  Cost per deploy:    ${cost_per_deploy:>10,.0f}   ({deploys_in_window} deploys in window)")
else:
    print(f"  Cost per deploy:    n/a  (no deploys in window)")

if movers:
    print()
    print("  ─ Top movers (≥20% MoM change) ─")
    for svc, cur_v, prev_v, pct in movers[:5]:
        if pct is not None:
            sign = "+" if pct >= 0 else ""
            print(f"    {svc:<20}  ${cur_v:>8,.0f}  ({sign}{pct:.0f}% vs prior)")
        else:
            print(f"    {svc:<20}  ${cur_v:>8,.0f}  (new)")

# Action items
print()
actions = []
if budget > 0 and total_runrate / budget * 100 >= alert_threshold:
    actions.append(f"Run-rate at {total_runrate/budget*100:.0f}% of budget — review top movers and defer non-essential services")
if delta_pct is not None and delta_pct >= 30:
    actions.append(f"Cost added {delta_pct:.0f}% faster than prior window — audit the last {period}d of ARCH docs for oversized components")
if not has_actual:
    actions.append("No actual cost recorded yet — reconcile against cloud console and append rows with `source=cloud-console`")
if cost_per_deploy is not None and cost_per_deploy > 100:
    actions.append(f"Cost-per-deploy = ${cost_per_deploy:.0f} — batch feature rollouts or audit per-deploy infrastructure changes")

if actions:
    print("─────────────────────────")
    print("Action items:")
    for a in actions: print(f"  → {a}")

print()
print("Cost discipline = know the number, watch the derivative, budget the ceiling.")
print("See skills/great_cto/references/cost-discipline.md for how to reconcile actuals monthly.")
PY
```

## Reporting Contract

End with one DONE line:
- `DONE: cost health for ${PERIOD}d — run-rate \$<N>/mo, <movers> top movers flagged.`
