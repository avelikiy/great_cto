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
digest for the CTO. Keep the response **under 60 lines**.

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

PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
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

→ Run /burn for SLO drill-down, /cost for capacity, /inbox for action items.
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
```
