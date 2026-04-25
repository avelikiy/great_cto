---
description: "Cost & capacity health — LLM router savings, run-rate, cost-per-deploy, WoW/MoM delta, headroom vs budget, top movers. Pairs with /digest (delivery+DORA) and /burn (reliability)."
argument-hint: "[period_days] — default 30. Examples: /cost 7 | /cost 30 | /cost 90"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

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
# Monthly budget from PROJECT.md — optional. If absent, headroom is n/a.
MONTHLY_BUDGET=$(grep "^monthly-budget:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '$')
ALERT_THRESHOLD=$(grep "^budget-alert-threshold:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '%')
ALERT_THRESHOLD=${ALERT_THRESHOLD:-80}
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
