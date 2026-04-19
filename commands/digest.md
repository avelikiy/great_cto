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

Weekly engineering digest. Default window: 7 days. If argument provided, use that many days.
Add `board` flag for quarterly board-report format: `/digest Q2 board` or `/digest 90 board`.

## Gather Data (run all in parallel)

**Parse args — detect board flag and period:**
```bash
BOARD_MODE=false
DAYS=7
CURRENT_YEAR=$(date +%Y)
CURRENT_MONTH=$(date +%m)
for arg in "$@"; do
  case "$arg" in
    board) BOARD_MODE=true ;;
    Q1) DAYS=90; QUARTER="Q1"; PERIOD_LABEL="Q1 (Jan–Mar $CURRENT_YEAR)" ;;
    Q2) DAYS=91; QUARTER="Q2"; PERIOD_LABEL="Q2 (Apr–Jun $CURRENT_YEAR)" ;;
    Q3) DAYS=92; QUARTER="Q3"; PERIOD_LABEL="Q3 (Jul–Sep $CURRENT_YEAR)" ;;
    Q4) DAYS=92; QUARTER="Q4"; PERIOD_LABEL="Q4 (Oct–Dec $CURRENT_YEAR)" ;;
    [0-9]*) DAYS="$arg" ;;
  esac
done
[ -z "$QUARTER" ] && QUARTER="Q$(( (10#$CURRENT_MONTH - 1) / 3 + 1 ))" && PERIOD_LABEL="Q${QUARTER#Q} $CURRENT_YEAR (to date)"
```

**Caching** — digest data is stable for 1 hour (commits don't change in the past):
```bash
CACHE_DIR=".great_cto/cache"
mkdir -p "$CACHE_DIR"
DIGEST_CACHE="$CACHE_DIR/digest-${DAYS}d.txt"

# Use cache if less than 1 hour old
if [ -f "$DIGEST_CACHE" ]; then
  CACHE_AGE=$(( $(date +%s) - $(stat -f %m "$DIGEST_CACHE" 2>/dev/null || stat -c %Y "$DIGEST_CACHE" 2>/dev/null || echo 0) ))
  if [ "$CACHE_AGE" -lt 3600 ]; then
    echo "CACHE_HIT: digest-${DAYS}d.txt age=${CACHE_AGE}s"
    cat "$DIGEST_CACHE"
    exit 0
  fi
fi
```

**Git velocity:**
```bash
git log --oneline --since="${DAYS} days ago" 2>/dev/null | wc -l
git log --since="${DAYS} days ago" --format="%ae" 2>/dev/null | sort | uniq -c | sort -rn | head -5
git log --since="${DAYS} days ago" --name-only --format="" 2>/dev/null | grep -v "^$" | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -5
```

**Incidents:**
```bash
# DAYS already set from args parse above
bd list --label production --status open 2>/dev/null | wc -l
ls docs/postmortems/PM-*.md 2>/dev/null | while read f; do
  D=$(grep "^Date:" "$f" 2>/dev/null | head -1 | awk '{print $2}')
  [ -n "$D" ] && echo "$D $f"
done | sort -r | head -5
```

**Tech debt trend:**
```bash
bd list --status open --priority 2 2>/dev/null | wc -l
# New baseline format: p95:<value>ms error_rate:<value>% ts:<ISO8601> feature:<name>
tail -7 .great_cto/perf-baseline.log 2>/dev/null | grep -oE 'p95:[0-9]+ms' | sed 's/p95://' | tr '\n' ' '
ls docs/audits/AUDIT-*.md docs/audit/AUDIT-*.md 2>/dev/null | sort | tail -1 || echo "NO_AUDIT"
```

**ADR decisions this period:**
```bash
# DAYS already set from args parse above
# Cross-platform date arithmetic
CUTOFF=$(python3 -c "from datetime import date, timedelta; print((date.today() - timedelta(days=${DAYS:-7})).isoformat())" 2>/dev/null \
  || date -v-${DAYS:-7}d +%Y-%m-%d 2>/dev/null \
  || date -d "${DAYS:-7} days ago" +%Y-%m-%d 2>/dev/null \
  || echo "1970-01-01")
ls docs/decisions/ADR-*.md 2>/dev/null | while read f; do
  D=$(grep "^Date:" "$f" 2>/dev/null | awk '{print $2}')
  [ -n "$D" ] && [ "$D" \> "$CUTOFF" ] && echo "$D $f"
done | sort -r | head -5
```

**Open gates:**
```bash
bd list --label gate --status open 2>/dev/null | head -10
# Fallback: check tasks.md
grep "\[GATE" .great_cto/tasks.md 2>/dev/null | grep -v "APPROVED\|BLOCKED\|CLOSED" | head -5
```

**Agent verdict summary (last 7 entries per agent):**
```bash
for AGENT in tech-lead qa-engineer security-officer devops; do
  LOG=".great_cto/verdicts/${AGENT}.log"
  [ -f "$LOG" ] || continue
  TOTAL=$(wc -l < "$LOG")
  PASS=$(grep -cE "PASS|APPROVED|ARCH_READY" "$LOG" 2>/dev/null || echo 0)
  FAIL=$(grep -cE "FAIL|BLOCKED" "$LOG" 2>/dev/null || echo 0)
  LAST=$(tail -1 "$LOG" | awk '{print $1, $3}')
  echo "${AGENT}: total=${TOTAL} pass=${PASS} fail=${FAIL} | last: ${LAST}"
done
```

**DORA Metrics:**
```bash
# DAYS already set from args parse above
CUTOFF=$(python3 -c "from datetime import date, timedelta; print((date.today() - timedelta(days=${DAYS:-7})).isoformat())" 2>/dev/null \
  || date -v-${DAYS:-7}d +%Y-%m-%d 2>/dev/null \
  || date -d "${DAYS:-7} days ago" +%Y-%m-%d 2>/dev/null \
  || echo "1970-01-01")

# Deployment Frequency: deploys in period from perf-baseline.log
DEPLOY_COUNT=$(grep "ts:" .great_cto/perf-baseline.log 2>/dev/null | grep -oE 'ts:[0-9]{4}-[0-9]{2}-[0-9]{2}' | sed 's/ts://' | awk -v cut="$CUTOFF" '$1 >= cut' | wc -l | tr -d ' ')
echo "deploy_frequency=${DEPLOY_COUNT} deploys in last ${DAYS} days"

# Lead Time: first commit to deploy (git first commit in feature branch → deploy ts in perf-baseline.log)
LAST_DEPLOY_TS=$(grep "ts:" .great_cto/perf-baseline.log 2>/dev/null | tail -1 | grep -oE 'ts:[0-9T:Z-]+' | sed 's/ts://')
FIRST_COMMIT_TS=$(git log --format="%aI" --since="${CUTOFF}" 2>/dev/null | tail -1)
if [ -n "$LAST_DEPLOY_TS" ] && [ -n "$FIRST_COMMIT_TS" ]; then
  python3 -c "
from datetime import datetime
try:
    d = datetime.fromisoformat('${LAST_DEPLOY_TS}'.replace('Z','+00:00'))
    c = datetime.fromisoformat('${FIRST_COMMIT_TS}'.replace('Z','+00:00'))
    diff = (d - c).total_seconds() / 3600
    print(f'lead_time={diff:.1f}h (first commit → last deploy)')
except: print('lead_time=N/A')
" 2>/dev/null || echo "lead_time=N/A"
fi

# MTTR: average from postmortem MTTR fields
python3 -c "
import os, glob, re
files = sorted(glob.glob('docs/postmortems/PM-*.md'))
mttr_vals = []
for f in files:
    with open(f) as fp:
        for line in fp:
            m = re.search(r'MTTR:\s*([0-9.]+)\s*(min|h)', line, re.I)
            if m:
                val = float(m.group(1))
                if 'h' in m.group(2).lower(): val *= 60
                mttr_vals.append(val)
if mttr_vals:
    avg = sum(mttr_vals) / len(mttr_vals)
    print(f'mttr_avg={avg:.0f}min (n={len(mttr_vals)} incidents)')
else:
    print('mttr=N/A (no postmortems with MTTR field)')
" 2>/dev/null || echo "mttr=N/A"

# Change Failure Rate: postmortems / total deploys (all time)
TOTAL_DEPLOYS=$(grep -c "ts:" .great_cto/perf-baseline.log 2>/dev/null || echo 0)
TOTAL_PMS=$(ls docs/postmortems/PM-*.md 2>/dev/null | wc -l | tr -d ' ')
python3 -c "
d, p = ${TOTAL_DEPLOYS:-0}, ${TOTAL_PMS:-0}
if d > 0: print(f'change_failure_rate={p/d*100:.1f}% ({p} postmortems / {d} deploys)')
else: print('change_failure_rate=N/A (no deploys logged)')
" 2>/dev/null || echo "change_failure_rate=N/A"
```

**Retro patterns:**
```bash
ls .great_cto/retrospectives/*.md 2>/dev/null | sort | tail -2 | xargs grep -h "What slowed down:\|Notes:" 2>/dev/null | sort | uniq -c | sort -rn | head -3
```

**Team signals (only if files exist):**
```bash
# On-call: current person from schedule
[ -f ".great_cto/oncall-schedule.md" ] && grep "^Current:" .great_cto/oncall-schedule.md 2>/dev/null | head -5

# RFC state
RFC_OPEN=$(ls docs/rfcs/RFC-*.md 2>/dev/null | xargs grep -l "Status: DRAFT\|Status: REVIEW" 2>/dev/null | wc -l | tr -d ' ')
RFC_OVERDUE=$(ls docs/rfcs/RFC-*.md 2>/dev/null | xargs grep -l "Status: DRAFT\|Status: REVIEW" 2>/dev/null | xargs grep "^Review deadline:" 2>/dev/null | awk -v today="$(date +%Y-%m-%d)" '$3 < today {count++} END {print count+0}')
echo "rfc_open=$RFC_OPEN rfc_overdue=$RFC_OVERDUE"

# Ownership gaps
[ -f ".great_cto/OWNERSHIP.md" ] && grep -c "^| .*—.*—" .great_cto/OWNERSHIP.md 2>/dev/null || echo "ownership=not_configured"
```

## Format Output

```
/digest — last [N] days ([from date] → [to date])

VELOCITY
  Commits: [N] | Authors: [list by count]
  Hot areas: [top 3 path prefixes by commit count]

INCIDENTS
  Open P0/P1: [N] | Postmortems this period: [M]
  [List postmortem titles if any, or "None"]

GATES
  Open: [N] — [list gate names and age in days, or "None blocked"]
  [⚠ if any gate open >3 days: flag it]

AGENT VERDICTS (cumulative)
  tech-lead:        pass=[N] fail=[M] | last: <date> ARCH_READY
  qa-engineer:      pass=[N] fail=[M] | last: <date> PASS/FAIL
  security-officer: pass=[N] fail=[M] | last: <date> APPROVED/BLOCKED
  devops:           pass=[N] fail=[M] | last: <date> DEPLOYED/ROLLED_BACK
  [Note: "No verdicts yet" if log is empty for any agent]

DORA METRICS (last [N] days)
  Deployment Frequency: [N deploys] ([elite: daily+ | high: weekly | medium: monthly | low: <monthly])
  Lead Time for Changes: [Xh] ([elite: <1h | high: <1d | medium: <1wk | low: <1mo])
  MTTR: [Xmin avg] ([elite: <1h | high: <1d | medium: <1wk | low: >1wk])
  Change Failure Rate: [X%] ([elite: <5% | high: <10% | medium: <15% | low: >15%])
  [⚠ if any metric is "medium" or "low": flag the weakest]

TECH DEBT
  P2 bugs open: [N] | Last audit: [date or "never"]
  Perf trend (last 7 deploys): [p95 values as sequence, e.g. 120ms → 135ms → 128ms]
  [⚠ if trend consistently increasing across 3+ deploys]

DECISIONS
  ADRs filed: [N]
  [ADR-NNN: title, one per line, or "None"]

TEAM (show only if .great_cto/OWNERSHIP.md or docs/rfcs/ exist)
  On-call now: [@person (team, Nh remaining) | "not configured — run /oncall schedule"]
  RFCs open: [N | "none"]  ⚠ overdue: [N if deadline < today]
  Ownership gaps: [N unowned paths | "ownership map current"]

RECOMMENDATION
  [One clear CTO action derived from signals above.
   Pick the highest-signal problem.
   Examples:
   — "gate:arch open 5 days — unblock it or pipeline stalls"
   — "Security BLOCKED 2 of last 3 deploys — review security-officer gap vs codebase"
   — "P2 backlog grew 40% this week — schedule debt sprint before next feature"
   — "Perf p95 trending up 3 deploys in a row — add perf gate or investigate [hot area]"
   — "No incidents, velocity steady — good week. Consider /update to audit agent coverage."
   — "Auth area touched in 8/[N] commits — consider ADR to lock down change policy"
   — "DORA: Lead Time >1 week (medium) — check for manual approval bottlenecks in pipeline"
   — "DORA: Change Failure Rate 18% (low) — add /review gate before every merge to main"
   — "DORA: MTTR avg 4h (medium) — l3-support runbooks may be missing for key failure modes"
   — "RFC-NNN overdue N days — unreviewed cross-team decision is blocking alignment"
   — "N ownership gaps found — run /ownership verify before next feature to avoid ambiguity"
   — "On-call not configured — run /oncall schedule before next deploy"]
```

If no data available (new project, no commits): "/digest — not enough data yet. Ship a few features first."

## Save Output to Cache

After generating the digest, save for 1-hour reuse:
```bash
# Save formatted output to cache
cat > "$DIGEST_CACHE" <<EOF
$GENERATED_DIGEST_OUTPUT
EOF
echo "CACHED: digest-${DAYS}d.txt (valid for 1h)"
```

Cache invalidates automatically on age. Force refresh by deleting: `rm .great_cto/cache/digest-*.txt`.

---

## Dream Cycle — update brain.md

After saving the digest cache, synthesize signals into `.great_cto/brain.md`.
This is the "dream cycle" — background synthesis that makes the project brain compound over time.

```bash
BRAIN=".great_cto/brain.md"
TODAY=$(date +%Y-%m-%d)

# Create brain.md if it doesn't exist
if [ ! -f "$BRAIN" ]; then
  PROJECT_NAME=$(grep "^# " .great_cto/PROJECT.md 2>/dev/null | head -1 | sed 's/# //' || basename "$PWD")
  cat > "$BRAIN" <<BRAIN_INIT
# Project Brain — ${PROJECT_NAME}
> Compiled truth. Updated by /digest. Read by tech-lead before designing.

## Current Synthesis

### Architecture Patterns in Use
<!-- Updated by tech-lead after each ARCH doc -->

### What Has Failed / Avoid
<!-- Patterns from postmortems and blocked security audits -->

### Tech Debt
<!-- Persistent P2 bugs, perf degradation, audit findings -->

### Team Patterns
<!-- Recurring retro signals -->

---

## Evidence Timeline
<!-- Append-only. Most recent first. -->
BRAIN_INIT
fi
```

Extract signals from this digest run and append to evidence timeline:

```bash
# Append digest summary to evidence timeline
{
  printf '\n### %s — /digest (%s days)\n' "$TODAY" "${DAYS:-7}"

  # Velocity signal
  COMMITS=$(git log --oneline --since="${DAYS:-7} days ago" 2>/dev/null | wc -l | tr -d ' ')
  printf 'Velocity: %s commits\n' "$COMMITS"

  # Incident signal
  PM_COUNT=$(ls docs/postmortems/PM-*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$PM_COUNT" -gt 0 ] && printf 'Postmortems total: %s\n' "$PM_COUNT"

  # Security signal — any recent blocks
  SECURITY_BLOCKS=$(grep -c "BLOCKED" .great_cto/verdicts/security-officer.log 2>/dev/null || echo 0)
  [ "$SECURITY_BLOCKS" -gt 0 ] && printf 'Security blocks (cumulative): %s\n' "$SECURITY_BLOCKS"

  # Retro patterns (most recent)
  RETRO_SIGNAL=$(ls .great_cto/retrospectives/*.md 2>/dev/null | sort | tail -1 | xargs grep -h "What slowed down:" 2>/dev/null | head -1)
  [ -n "$RETRO_SIGNAL" ] && printf 'Retro: %s\n' "$RETRO_SIGNAL"

  # Tech debt trend
  P2_COUNT=$(bd list --status open --priority 2 2>/dev/null | wc -l | tr -d ' ')
  [ "${P2_COUNT:-0}" -gt 0 ] && printf 'Tech debt: %s open P2 bugs\n' "$P2_COUNT"

} >> "$BRAIN"
```

Update "Current Synthesis" sections when signals cross thresholds:

```bash
# If P2 bugs growing (>10): flag as tech debt in synthesis
# If same retro pattern appears ≥2 runs: add to "Team Patterns"
# If security-officer BLOCKED >1 time: add pattern to "What Has Failed"
# Implementation: use advisor_20260301 (max 1 call) to synthesize patterns into prose
# Write updated synthesis sections back to brain.md "Current Synthesis" block
```

Silent on success. Log: `printf '%s dream-cycle brain.md updated\n' "$TODAY" >> .great_cto/agent-writes.log`

## Board Report Mode

**Triggered by**: `board` in arguments — e.g. `/digest Q2 board` or `/digest 90 board`

If `BOARD_MODE=true`, after gathering data write a board report instead of (or in addition to) the digest.

```bash
if [ "$BOARD_MODE" = "true" ]; then
  REPORT_FILE="docs/board-reports/BOARD-${CURRENT_YEAR}-${QUARTER}.md"
  mkdir -p docs/board-reports

  # DORA benchmark label
  DEPLOY_LABEL="Low (less than monthly)"
  if [ "${DEPLOY_COUNT:-0}" -gt 0 ]; then
    PER_WEEK=$(python3 -c "print('%.1f' % (${DEPLOY_COUNT:-0} / (${DAYS:-90}/7)))" 2>/dev/null || echo "0")
    python3 -c "
per_week = ${DEPLOY_COUNT:-0} / (${DAYS:-90}/7)
if per_week >= 7: print('Elite (daily+)')
elif per_week >= 1: print('High (weekly)')
elif per_week >= 0.25: print('Medium (monthly)')
else: print('Low (less than monthly)')
" 2>/dev/null
  fi
fi
```

Write to `$REPORT_FILE`:

```markdown
# Engineering Board Report — <PERIOD_LABEL>

**Prepared for:** Board / CEO
**Date:** <today>
**Project:** <PROJECT_NAME>

---

## Executive Summary

<3 bullet points — most important signals. Business language only.
- "Shipped N features this quarter"
- "Zero P0 incidents — system uptime maintained"
- "Security audit: all compliance controls passing"
>

---

## Delivery

| Metric | This Period | Context |
|--------|-------------|---------|
| Features shipped | <FEATURES> | <trend> |
| Bug fixes | <FIXES> | <trend> |
| Deployments | <DEPLOY_COUNT> | <DORA label> |
| Active engineers | <AUTHORS> | <of TEAM_SIZE total> |

**What shipped:** <top 5 feat: commits in plain English>

**What slowed us down:** <open gates, blockers, or "No major blockers">

---

## Reliability

| Metric | Value | Target |
|--------|-------|--------|
| P0 incidents | <POSTMORTEMS_THIS_PERIOD> | 0 |
| Open critical bugs | <OPEN_P0> P0, <OPEN_P1> P1 | 0 P0 |
| MTTR | <LAST_MTTR> | <1h (elite) |

<If OPEN_P0 > 0: "⚠ RISK: N critical issues open.">

---

## Security & Compliance

**Last security review:** <date of last CSO> — <APPROVED/BLOCKED>
**Compliance:** <COMPLIANCE_STATUS or "No compliance requirements configured">
**Dependencies:** <AUDIT_SUMMARY>

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| <derived from signals> | L/M/H | L/M/H | <action> |

---

## Next Quarter Focus

<3 engineering priorities in business terms, derived from: open RFCs, growing P2 backlog, compliance deadlines, DORA weaknesses>

1. <priority 1>
2. <priority 2>
3. <priority 3>

---

*Generated by great_cto on <date>. Data: git history, Beads, agent verdict logs.*
```

After writing: confirm `Board report → <REPORT_FILE>`. Do NOT output full report to terminal — just the path.
