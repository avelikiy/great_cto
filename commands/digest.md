---
description: "Friday review — what shipped, what broke, what it cost; add `cost`, `slo`, `gov` or `sessions` for the detail. Weekly engineering digest (velocity, incident trend, tech debt, ADR decisions, open gates, CTO recommendation); add `board` for board-report format."
argument-hint: "[days] [board] | cost [days | feature <slug> | agent <name> | sessions [days]] | sessions [days] | slo [service] | gov [--since 30d] [--json] — e.g. '30 board', 'cost 7', 'sessions 30', 'slo api', 'gov --since 30d'"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Glob, Grep, advisor_20260301
model: haiku
advisor-model: claude-sonnet-5
advisor-max-uses: 1
beta: advisor-tool-2026-03-01
---

You are the great_cto **Digest** command — every report in one place. The
default is the weekly engineering digest for the CTO (Steps 1–4); keep that
response **under 60 lines**. The first word picks a detail mode instead:

| Invocation | Mode | What you get |
|---|---|---|
| `/digest [days] [board]` | digest (default) | weekly delivery, reliability, cost, team — or a board report |
| `/digest cost [days \| feature <slug> \| agent <name> \| sessions [days]]` | cost | cost & capacity: router savings, run-rate, ROI per feature, per-agent cost (was `/cost`) |
| `/digest sessions [days]` | cost → sessions | how your own sessions spend (same as `/digest cost sessions`) |
| `/digest slo [service]` | slo | SLO burn rate across 24h / 7d / 30d windows (was `/burn`) |
| `/digest gov [--since 30d] [--json]` | gov | do the gates actually gate — block / override / false-block rates (was `/gov-metrics`) |

`/inbox` stays separate: it is the daily "what needs you now".

## Step 0 — Dispatch by mode

```bash
set -- ${ARGUMENTS:-}
case "${1:-}" in
  cost)      MODE=cost; shift ;;   # → "Mode: cost" — $1.. are the words after `cost`
  sessions)  MODE=cost ;;          # /digest sessions [days] == /digest cost sessions [days]
  slo)       MODE=slo;  shift ;;   # → "Mode: slo"  — $1 is the optional service
  gov)       MODE=gov;  shift ;;   # → "Mode: gov"  — "$@" goes to gov-metrics.mjs
  *)         MODE=digest ;;        # default weekly digest: Steps 1–4 below
esac
```

`MODE=digest` → continue with Step 1. Any other mode → jump to its section below
and skip Steps 1–4.

## Step 1 — Run helper, write to file (no inline expansion)

```bash
ARGS="${ARGUMENTS:-}"
DAYS=7; BOARD=0
for arg in $ARGS; do
  case "$arg" in
    board) BOARD=1 ;;
    [0-9]*) DAYS="$arg" ;;
    Q[1-4]) DAYS=90 ;;
  esac
done

PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}
HELPER="${PLUGIN_DIR}/scripts/cmd-data/digest-data.sh"
[ -f "$HELPER" ] || HELPER="$(pwd)/scripts/cmd-data/digest-data.sh"

OUT_DIR=".great_cto/cache"; mkdir -p "$OUT_DIR"
OUT="${OUT_DIR}/digest-out.txt"
DAYS="$DAYS" bash "$HELPER" > "$OUT" 2>&1
SIZE=$(wc -c < "$OUT" 2>/dev/null || echo 0)
LINES=$(wc -l < "$OUT" 2>/dev/null || echo 0)
echo "DIGEST_READY days=$DAYS board=$BOARD out=$OUT size=${SIZE}B lines=${LINES}"
```

**Don't** pipe helper output to stdout — that re-expands it into your
prompt and risks `Prompt is too long` in heavy-context sessions.

## Step 2 — Read the file

Use the `Read` tool on the path printed as `out=`. Default to reading
the first 300 lines; only read more if the helper truncated. Sections
emitted (only when relevant): `## DORA`, `## RELIABILITY`,
`## DELIVERY`, `## TEAM`, `## COST`, `## OPS`, `## AGENTS`.

## Step 3 — Render

If `BOARD=0` (default), format as engineering digest:

```
# Weekly digest · last <DAYS>d · <YYYY-MM-DD>

## Delivery
- <N> features shipped (<delta vs prior week>)
- <N> hotfixes · <N> rework

## Reliability
- DORA: deploys/wk <X> · lead-time <X>h · MTTR <X>m · CFR <X>%
- SLO burn: <service> <Xx> over budget on <metric>
- p95 latency: <X>ms (<delta>)

## Cost
- $<X>/day avg · projected month $<X> (<X>% of $<budget> budget)
- Top mover: <agent> +<X>% MoM

## Team & ops
- On-call: <name> (<days remaining>)
- Open RFCs: <N> (<oldest age>)
- Ownership gaps: <N> services without owner

## Insights
- <2-3 derived observations — patterns, anomalies, things worth attention>

→ Run /digest slo for SLO drill-down, /digest cost for capacity, /inbox for action items.
```

If `BOARD=1` — board-report format (briefer, pure narrative):
- 2 sentences: what shipped + what almost broke
- 4 bullets max per section: Delivery, Reliability, Cost, Risk
- One forward-looking paragraph: top decision the board should weigh
- Save artifact to `docs/board-reports/BOARD-<YYYY-MM-DD>.md`

## Step 4 — CTO recommendation (optional)

If meaningful patterns surface (CFR spike, cost overrun, gate drift,
ownership gap), call `advisor_20260301` **once** for a senior CTO take.
Surface at end of "Insights" prefixed `→ CTO take:`. Skip if healthy.

## Empty / partial

- Section missing in helper output → omit it. Don't fabricate.
- Helper file `size=0` or `MISSING_HELPER` printed → output exactly:
  `Digest unavailable: run /start to bootstrap, then come back after a week of activity.`

## Conventions

- **Never** dump raw helper output. Agent must format.
- Cost uses non-breaking thin space (U+202F): `$1 234` not `$1,234`.
- Cache: helper itself caches expensive queries 1h.

## Use cases

```
/digest              # last 7d
/digest 14           # last 14d
/digest 30 board     # 30d board-report
/digest Q2 board     # 90d board-report
/digest cost         # cost & capacity, last 30d
/digest cost feature stripe-subscriptions
/digest sessions 30  # session shape, last 30d
/digest slo api      # SLO burn for one service
/digest gov --since 30d
```

---

## Mode: cost

In this mode you are the Cost & Capacity aggregator. Positional arguments below (`$1`, `$2`) are the
words after `cost` (for `/digest sessions [days]`, `$1` is `sessions`). Sub-modes:

1. **`/digest cost [days]` — Aggregate health** (default mode)
   - LLM router savings — measured Kimi-vs-Sonnet differential from `.great_cto/llm-router-usage.log`
   - Infra cost — monthly run-rate, cost-per-deploy, WoW/MoM drift, headroom vs budget, top movers
2. **`/digest cost feature <slug>`** — ROI per shipped feature (NEW in v2.3.0)
   - Total LLM cost broken down by agent
   - Comparison to human-equivalent at $150/hr
   - ROI multiplier
   - Cross-reference to similar past features in same archetype
3. **`/digest cost agent <name>`** — Per-agent cost (NEW in v2.3.0)
   - Same as `/agent review <name>` but cost-focused
4. **`/digest cost sessions [days]`** — Session shape: how the operator's OWN sessions spend
   - Length, active time, cache rebuilds, read:create, main-thread model vs subagent models
   - Traffic-light signals with thresholds, then the three habits with the largest estimated saving

### Cost sub-mode dispatch

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

# Detect mode from first arg
case "${1:-}" in
  feature)
    SLUG="${2:-}"
    [ -z "$SLUG" ] && { echo "Usage: /digest cost feature <slug>"; exit 2; }
    # → jump to "Feature mode" section below
    MODE=feature
    ;;
  agent)
    AGENT="${2:-}"
    [ -z "$AGENT" ] && { echo "Usage: /digest cost agent <name>"; exit 2; }
    # → jump to "Agent mode" section below
    MODE=agent
    ;;
  sessions)
    DAYS="${2:-30}"
    case "$DAYS" in ''|*[!0-9]*) echo "Usage: /digest cost sessions [days]"; exit 2 ;; esac
    # → jump to "Sessions mode" section below
    MODE=sessions
    ;;
  *)
    MODE=aggregate
    PERIOD=${1:-30}
    case "$PERIOD" in ''|*[!0-9]*) echo "Usage: /digest cost [period_days] | feature <slug> | agent <name> | sessions [days]"; exit 2 ;; esac
    ;;
esac

COST_LOG=.great_cto/cost-history.log
DEPLOYS_LOG=.great_cto/deploys.log
```

### Feature mode — `/digest cost feature <slug>`

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
        if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/digest cost[-_]?usd[=:]/, "", $i); cost = $i+0 }
      }
      sum[agent] += cost
      count[agent]++
    }
    END {
      for (a in sum) printf "| %s | %d | $%.2f | $%.2f |\n", a, count[a], sum[a], sum[a]/count[a]
    }
  ' | sort

  TOTAL=$(echo "$ENTRIES" | awk '
    { for (i=1;i<=NF;i++) if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/digest cost[-_]?usd[=:]/, "", $i); sum += $i+0 } }
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
  echo "_Override estimates: \`HUMAN_HOURS=20 HUMAN_RATE=200 /digest cost feature $SLUG\`_"

  # Comparison to mean for archetype
  if [ -n "$ARCHETYPE" ]; then
    echo ""
    echo "### Compared to other features in archetype=$ARCHETYPE"
    grep "feature=" "$COST_LOG" | grep -v "feature=$SLUG" | awk '
      {
        for (i=1;i<=NF;i++) {
          if ($i ~ /^feature=/) { gsub(/feature=/, "", $i); feat = $i }
          if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/digest cost[-_]?usd[=:]/, "", $i); cost = $i+0 }
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

### Agent mode — `/digest cost agent <name>`

Quick per-agent cost summary (lighter than /agent review):

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

  TOTAL=$(echo "$ENTRIES" | awk '{ for (i=1;i<=NF;i++) if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/digest cost[-_]?usd[=:]/, "", $i); sum += $i+0 } } END { printf "%.2f", sum }')
  AVG=$(echo "scale=2; $TOTAL / $COUNT" | bc)

  echo "- Total invocations: $COUNT"
  echo "- Total cost: \$$TOTAL"
  echo "- Avg cost/invocation: \$$AVG"
  echo ""
  echo "_For full performance review: \`/agent review $AGENT\`_"
  exit 0
fi
```

### Sessions mode — `/digest cost sessions [days]`

Reads `~/.claude/projects` locally (read-only, nothing is sent): each main session plus its
subagent transcripts, turns deduplicated by `message.id`, priced by `cost-meter`. Scripted
temp-dir projects are excluded. Projects print as `p1, p2…`; message text is never read into it.

```bash
if [ "$MODE" = "sessions" ]; then
  SS="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}/scripts/lib/session-shape.mjs"
  [ -f "$SS" ] || SS="$(pwd)/scripts/lib/session-shape.mjs"
  SINCE=$(date -v-"${DAYS}"d +%F 2>/dev/null || date -d "-${DAYS} days" +%F)
  node "$SS" --since "$SINCE" --top 10
  exit 0
fi
```

Relay the report as printed: totals, the signals table with its thresholds, then **Change first**
(each item's estimated saving and the habit to change). Signals overlap; never add their estimates
into one number. Pass `--show-projects` only when the operator asks which project is which, and
never quote message text — the report has none to quote.

### Aggregate mode (default of `/digest cost`)

You are the Cost & Capacity aggregator. Two parts:

1. **LLM router savings** — measured Kimi-vs-Sonnet differential from `.great_cto/llm-router-usage.log`. This is the data behind the README "LLM costs down 60–80%" badge. Suppressed when the log is empty (no fake claim).
2. **Infra cost** — monthly run-rate, cost-per-deploy, WoW/MoM drift, headroom vs configured budget, and top movers from `.great_cto/cost-history.log` cross-referenced with `.great_cto/deploys.log`.

Cost is the third axis of engineering health after reliability (`/digest slo`) and delivery (DORA metrics in `/digest`). A team shipping fast with zero incidents is still failing if its cloud bill doubles every quarter without a matching revenue curve. This command makes that curve visible.

### Cost setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
PERIOD=${1:-30}
case "$PERIOD" in ''|*[!0-9]*) echo "Usage: /digest cost [period_days] (got: $PERIOD)"; exit 2 ;; esac
COST_LOG=.great_cto/cost-history.log
DEPLOYS_LOG=.great_cto/deploys.log

if [ ! -f "$COST_LOG" ]; then
  echo "No cost history yet. /digest cost activates after devops ships at least one release."
  echo "First deploy appends an estimate row; subsequent runs enable actual-vs-estimated comparison."
  exit 0
fi
```

### Read budget config

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

### Daily cap section (v2.8+ — emit FIRST so it's visible above the fold)

```bash
if [ -n "$DAILY_CAP" ] || [ -n "$MONTHLY_BUDGET" ]; then
  echo "## Bill-shock protection"
  echo ""

  # Measured spend — one reader for every row kind (scripts/lib/cost-history.mjs).
  # Until 2026-10-01 this looked for `cost_usd=`, which no writer emits: always $0.00.
  CH="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}/scripts/lib/cost-history.mjs"
  [ -f "$CH" ] || CH="$(pwd)/scripts/lib/cost-history.mjs"
  TODAY_SPENT=$(node "$CH" today "$COST_LOG" 2>/dev/null || echo "0.00")
  MONTH_SPENT=$(node "$CH" month "$COST_LOG" 2>/dev/null || echo "0.00")

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

### LLM router savings (lead the report with this)

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

### Compute cost metrics

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

print(f"  Monthly run-rate:   ${total_runrate:>10,.0f}/mo  ({'actuals+estimates' if has_actual else 'estimates only — run /digest cost after cloud-console reconcile'})")
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

### Cost reporting contract

End with one DONE line:
- `DONE: cost health for ${PERIOD}d — run-rate \$<N>/mo, <movers> top movers flagged.`

---

## Mode: slo

SLO burn rate — multi-window alerting that catches budget exhaustion before it happens.
Reads `.great_cto/slo-burn-history.log`, which the default digest (Step 1) appends to.

In this mode you are the Burn-Rate aggregator. `$1` below is the optional service name (the word after `slo`). Compute SLO budget burn rate across multiple windows from `.great_cto/slo-burn-history.log` (snapshot per `/digest` run). Alert on bad trends *before* the budget is exhausted.

Multi-window pattern from Google SRE: a single point-in-time read can't tell you if you're burning fast or slow. By comparing snapshots over different windows, fast burns surface immediately, slow burns surface within a day, and projected exhaustion gives you actionable runway.

### SLO setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
HISTORY=.great_cto/slo-burn-history.log
CACHE=.great_cto/slo-budget-current.md
FILTER="${1:-}"

if [ ! -f "$HISTORY" ]; then
  echo "No burn history yet — run /digest at least once to seed the snapshot log."
  echo "(Burn rate needs at least 2 snapshots to compute a derivative.)"
  exit 0
fi

LINES=$(grep -cv "^[[:space:]]*#" "$HISTORY" 2>/dev/null || echo 0)
if [ "$LINES" -lt 2 ]; then
  echo "Only 1 snapshot in burn history — need at least 2. Run /digest again tomorrow."
  exit 0
fi
```

### Compute burn rates per service+SLI

```bash
python3 - "$HISTORY" "$FILTER" <<'PY'
import sys, datetime, collections, re

path, flt = sys.argv[1], sys.argv[2]

# Read snapshots → per (service, sli) list of (ts_epoch, used_min, budget_min, pct)
series = collections.defaultdict(list)
with open(path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'): continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 6: continue
        ts_iso, svc, sli, used_s, budget_s, pct_s = parts[:6]
        if flt and svc != flt: continue
        try:
            ts = datetime.datetime.fromisoformat(ts_iso.replace('Z', '+00:00')).timestamp()
            used = float(used_s); budget = float(budget_s); pct = int(pct_s)
        except Exception:
            continue
        series[(svc, sli)].append((ts, used, budget, pct))

if not series:
    msg = f"No snapshots match '{flt}'." if flt else "No parseable snapshots."
    print(msg); sys.exit(0)

now = datetime.datetime.utcnow().timestamp()

# Normal monthly burn = budget / 30 days = budget per second / (30*86400)
# Burn rate multiplier = (delta_used / delta_seconds) / (budget / (30*86400))
def find_snapshot_at_or_before(snaps, target_ts):
    """Return the latest snapshot <= target_ts (or earliest if none qualify)."""
    candidates = [s for s in snaps if s[0] <= target_ts]
    return candidates[-1] if candidates else snaps[0]

WINDOWS = [
    ("24h",  86400,    14.4, "🔴 page"),
    ("7d",   604800,   6.0,  "⚠ ticket"),
    ("30d",  2592000,  1.0,  "ℹ review"),
]

print("═══ SLO Burn Rate ═══")
print()
SERVICES = sorted(series.keys())
for (svc, sli) in SERVICES:
    snaps = sorted(series[(svc, sli)])
    latest = snaps[-1]
    ts_now, used_now, budget, pct = latest
    if budget <= 0:
        continue
    age_hours = (now - ts_now) / 3600.0
    print(f"{svc} / {sli}")
    print(f"  Budget: {used_now:.1f}min used / {budget:.1f}min total  ({pct}% consumed)")
    if age_hours > 36:
        print(f"  ⚠ latest snapshot is {age_hours:.0f}h old — run /digest to refresh")

    # Normal burn rate (per second) = budget consumed if you burn evenly across 30d
    normal_per_s = budget / (30 * 86400)

    fired = []
    for label, secs, threshold, action in WINDOWS:
        target = ts_now - secs
        prev = find_snapshot_at_or_before(snaps, target)
        delta_used = used_now - prev[1]
        delta_secs = ts_now - prev[0]
        if delta_secs <= 0:
            print(f"  {label}: insufficient history")
            continue
        actual_per_s = delta_used / delta_secs
        multiplier = actual_per_s / normal_per_s if normal_per_s > 0 else 0
        burned_pct = (delta_used / budget) * 100 if budget > 0 else 0
        marker = "🔴" if multiplier >= threshold else ("⚠ " if multiplier >= threshold/2 else "✓ ")
        print(f"  {label:>4}: {burned_pct:5.1f}% of budget  ({multiplier:5.2f}× normal)  {marker}")
        if multiplier >= threshold:
            fired.append((label, multiplier, action))

    # Projected exhaustion at current 7d rate (if positive burn)
    target_7d = ts_now - 604800
    prev_7d = find_snapshot_at_or_before(snaps, target_7d)
    delta_7d_used = used_now - prev_7d[1]
    delta_7d_secs = ts_now - prev_7d[0]
    remaining_min = budget - used_now
    if delta_7d_secs > 0 and delta_7d_used > 0 and remaining_min > 0:
        burn_per_day = delta_7d_used / (delta_7d_secs / 86400)
        days_left = remaining_min / burn_per_day
        print(f"  Projected exhaustion: {days_left:.1f} days at current 7d pace")
    elif remaining_min <= 0:
        print(f"  ⚠⚠ EXHAUSTED — freeze feature deploys, see references/reliability.md")
    else:
        print(f"  Projected exhaustion: ∞ (no burn in window)")

    if fired:
        worst = max(fired, key=lambda x: x[1])
        print(f"  → ALERT: {worst[2]} — {worst[0]} burn = {worst[1]:.1f}× normal")
    print()

print("─────────────────────────")
print("Thresholds (Google SRE multi-window): 24h ≥ 14.4× → page | 7d ≥ 6× → ticket | 30d ≥ 1× → review")
print("Snapshots are written by /digest. Increase digest frequency for finer-grained alerts.")
PY
```

### SLO reporting contract

End with a single DONE/ALERT line:
- `DONE: burn check on N service/SLI pairs — no alerts fired.`
- `ALERT: <service>/<sli> burning <X>× normal (<window>) — projected exhaustion in <D> days.`

---

## Mode: gov

Governance metrics — does the gate actually gate? Computed from the verdict trail.

great_cto's moat is mechanical governance. A gate you can't measure is a vibe, not
a control. This reports the numbers (idea adapted from SantanderAI/mech-gov-framework):

- **Block rate** — share of gate decisions that blocked.
- **Override / waiver rate** — blocks a human bypassed.
- **False-block proxy** — blocked-then-passed-unchanged (gate noise / over-firing).
- **R2 mechanical share** — verdicts enforced by CI/script (the moat) vs **R1 textual**
  (a reviewer's prose judgment). High R1 share = gates lean on vibes, not enforcement.
- **Median time-in-gate** — minutes between consecutive gate decisions on a feature.

### Gov run

```bash
PT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}"
[ -d "$PT" ] || PT="$(pwd)"
node "$PT/scripts/lib/gov-metrics.mjs" "$@"   # the words after `gov`
```

`--since 30d` limits the window; `--json` emits machine-readable output for the board.

### Gov present

Show the CTO the table, then **one sentence of so-what**:
- R2 share < 40% → "gates lean on prose — move judgment into enforced checks."
- false-block proxy > 30% → "gates over-fire — calibrate severity (anti-inflation)."
- block rate ~0% over many decisions → "the gate never says no — is it real?"

Governance is the product. These numbers are how you prove it.
