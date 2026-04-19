---
description: "On-call rotation management. Who's on duty, shift handoff notes, escalation paths. Reads from .great_cto/oncall-schedule.md and OWNERSHIP.md."
argument-hint: "who | handoff | schedule <team> <member1,member2,...> | escalate <service>"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
model: haiku
---

You are the On-call command. Manage rotation schedules and shift handoffs.

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
SCHEDULE_FILE=".great_cto/oncall-schedule.md"
OWNERSHIP_FILE=".great_cto/OWNERSHIP.md"
ACTION="${1:-who}"
```

---

## Action: `who` (default) — who is on-call right now

Read `$SCHEDULE_FILE`. For each rotation, calculate current on-call person from the schedule.

```bash
[ -f "$SCHEDULE_FILE" ] || { echo "No schedule yet. Run: /oncall schedule <team> <members>"; exit 0; }
cat "$SCHEDULE_FILE"
```

Parse and display:
```
On-call now — <date>

  platform:  @alice  (Tue → Fri, 2d 14h remaining)  #oncall-platform
  payments:  @carol  (Mon → Sun, 5d 6h remaining)   #oncall-payments
  infra:     @eve    (Sat → Fri, 6d 2h remaining)   #oncall-infra

Next shifts:
  platform → @bob (starting Fri)
  payments → @dave (starting Mon)

Escalation: P0 → page current → 5min → team lead → CTO
```

If no schedule: "No on-call schedule. Run `/oncall schedule <team> <member1,member2>` to set up rotations."

---

## Action: `schedule <team> <members>` — set up or update rotation

```bash
TEAM="$2"
MEMBERS="$3"  # comma-separated: alice,bob,carol
CYCLE="${4:-weekly}"  # weekly | biweekly
```

Write or update the rotation for `$TEAM` in `$SCHEDULE_FILE`.

**Schedule format:**
```markdown
# On-call Schedule
> Managed by /oncall. Edit schedule below or run /oncall schedule to rebuild.

## Rotations

### <team>
Cycle: weekly
Members: alice, bob, carol  (rotating in order)
Slack: #oncall-<team>
Current: alice (from <Monday of this week>)

| Week | On-call |
|------|---------|
| <this week Mon> | alice |
| <next week Mon> | bob |
| <week+2 Mon>    | carol |
| <week+3 Mon>    | alice |
| ... | (repeating) |

### <team2>
...

## Escalation Paths

| Priority | Step 1 | Step 2 (no response) | Step 3 |
|----------|--------|----------------------|--------|
| P0 | Page current on-call | 5min → team lead | 10min → CTO |
| P1 | Page current on-call | 30min → team lead | next business day |
| P2 | Post in #bugs | — | next business day |
```

Generate schedule for the next 8 weeks. Calculate current on-call from today's date.

Confirm: `Rotation set for <team>: <N> members, weekly cycle. Next handoff: <date>.`

---

## Action: `handoff` — generate shift handoff notes

Collect state for the outgoing on-call engineer.

```bash
# 1. Incidents this week
bd list --label production --status open 2>/dev/null | head -10
ls docs/postmortems/PM-*.md 2>/dev/null | sort | xargs grep -l "$(date +%Y-%m)" 2>/dev/null | head -5

# 2. Recent agent verdicts (failures need follow-up)
for LOG in $(ls .great_cto/verdicts/*.log 2>/dev/null | sort); do
  tail -3 "$LOG" 2>/dev/null | grep -E "FAIL|BLOCKED"
done

# 3. Open P0/P1 bugs
bd list --priority 0 --status open 2>/dev/null | head -5
bd list --priority 1 --status open 2>/dev/null | head -10

# 4. Last audit findings
ls docs/audits/AUDIT-AUTO-*.md 2>/dev/null | sort | tail -1 | xargs grep -E "^- P[01]" 2>/dev/null | head -5

# 5. Performance anomalies
tail -5 .great_cto/perf-baseline.log 2>/dev/null | grep -oE 'p95:[0-9]+ms'

# 6. Open gates (pipeline blocked?)
bd list --label gate --status open 2>/dev/null | head -5
```

Write to `docs/handoffs/HANDOFF-<date>.md`:

```markdown
# On-call Handoff — <date>
Outgoing: @<current>  →  Incoming: @<next>

## This Shift Summary
Duration: <start> → <end>
Incidents triggered: N

## Active Incidents (need follow-up)
- [P0/P1 list or "None"]

## Open P0/P1 Bugs
- [list or "None"]

## Known Fragile Areas
- [from recent FAIL verdicts or repeated postmortem patterns]

## Security Watch
- [P0/P1 findings from last auto-audit, or "Clean"]

## Performance
- Last 5 p95 values: [trend — stable/improving/degrading]

## Pipeline State
- Open gates: [N — list or "None blocked"]
- Last agent: [name + verdict]

## Notes for Incoming
[Summary of what to watch this shift based on signals above]
```

Output: `Handoff written → docs/handoffs/HANDOFF-<date>.md`

---

## Action: `escalate <service>` — show escalation path for a service

```bash
SERVICE="$2"
grep -A3 "$SERVICE" "$OWNERSHIP_FILE" 2>/dev/null
grep -A3 "$SERVICE" "$SCHEDULE_FILE" 2>/dev/null
```

Output:
```
Escalation for: <service>

  Owner team: <team>
  On-call now: @<person>  (<contact>)
  Team lead: @<lead>
  Slack: #<channel>

  P0: @<oncall> → (5min) → @<lead> → (10min) → CTO
  P1: @<oncall> → (30min) → @<lead>
  Runbook: docs/runbooks/<service>.md  [exists / MISSING]
```

If service not in OWNERSHIP.md: "Unknown service. Run `/ownership map` or `/ownership set <service> <team>`."
