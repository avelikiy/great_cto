---
description: "Weekly engineering digest. Velocity, incident trend, tech debt, ADR decisions, open gates, and a CTO recommendation. Add 'board' flag for board-report format."
argument-hint: "[days] [board] — e.g. '30 board' or 'Q2 board'"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Glob, Grep, advisor_20260301
model: haiku
advisor-model: claude-sonnet-4-6
advisor-max-uses: 1
beta: advisor-tool-2026-03-01
---

You are the great_cto **Digest** command. Produce a weekly engineering
digest for the CTO. Keep the response **under 60 lines** of console output.

## Step 1 — Parse args

```bash
ARGS="${ARGUMENTS:-}"
DAYS=7
BOARD=0
for arg in $ARGS; do
  case "$arg" in
    board) BOARD=1 ;;
    [0-9]*) DAYS="$arg" ;;
    Q[1-4]) DAYS=90 ;;
  esac
done
```

## Step 2 — Gather data

Run the data-collection helper (DORA, deploys, MTTR, CFR, SLO burn,
cost trend, agent metrics, RFC/oncall/ownership):

```bash
PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
HELPER="${PLUGIN_DIR}/scripts/cmd-data/digest-data.sh"
[ -f "$HELPER" ] || HELPER="$(pwd)/scripts/cmd-data/digest-data.sh"
DAYS="$DAYS" bash "$HELPER" 2>&1 | head -300
```

The helper emits labelled sections (only present when relevant):
- `## DORA` — deployment_freq, lead_time, mttr, cfr (with ↑ bad / ↓ good / — same arrows vs prior period)
- `## RELIABILITY` — incidents this period, current SLO burn rates, p95 latency
- `## DELIVERY` — features shipped, hotfixes, rework count
- `## TEAM` — on-call burden, CI predictability, review pressure
- `## COST` — daily LLM burn, MoM delta, budget %, top mover
- `## OPS` — current on-call, RFC state, ownership gaps
- `## AGENTS` — top-3 most-used + cost outliers

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

→ Run /burn for SLO drill-down, /cost for capacity, /inbox for action items.
```

If `BOARD=1` — board-report format (briefer, pure narrative, business-tier):
- Lead with two sentences on what shipped + what almost broke
- 4 bullets max in each of: Delivery, Reliability, Cost, Risk
- One forward-looking paragraph: top decision the board should weigh in on
- Save artifact to `docs/board-reports/BOARD-<YYYY-MM-DD>.md`

## Step 4 — CTO recommendation (advisor)

If meaningful patterns surface (CFR spike, cost overrun, gate drift, ownership gap), use the `advisor_20260301` tool **once** for a senior CTO take. Surface the recommendation at the end of "Insights" prefixed with `→ CTO take:`. Skip if everything is healthy.

## Empty / partial

If the helper has no data for a section (new project, no deploys.log,
no postmortems), omit that section. Don't fabricate numbers.

If the helper fails entirely: output
`Digest unavailable: run /start to bootstrap, then come back after a week of activity.`

## Conventions

- **Don't dump raw helper output** — agent must format
- Cost uses **non-breaking thin space (U+202F)** for thousands per /cost: `$1 234` not `$1,234`
- Cache: helper caches expensive queries 1h; safe to invoke /digest back-to-back

## Use-case examples

```
/digest                  # last 7d
/digest 14               # last 14d
/digest 30 board         # 30d board-report
/digest Q2 board         # 90d board-report
```
