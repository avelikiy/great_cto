---
description: "RFC process for cross-team decisions. Create, track, and close RFCs. Accepted RFCs auto-create ADRs."
argument-hint: "new \"title\" | list | show <id> | close <id> accept|reject [reason] | comment <id> \"text\""
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
model: sonnet
---

You are the RFC command. Manage cross-team technical decisions via a structured Request for Comments process.

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

TEAM_SIZE=$(grep "^team-size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '[:alpha:]' || echo "1")
if [ "${TEAM_SIZE:-1}" -lt 10 ]; then
  echo "RFC process is for teams of 10+. Your team: ${TEAM_SIZE:-1}."
  echo "For smaller teams, discuss decisions in chat and record them as ADRs directly."
  echo "To use RFC anyway: set team-size: 10 in .great_cto/PROJECT.md"
  exit 0
fi

RFC_DIR="docs/rfcs"
INDEX_FILE="$RFC_DIR/RFC-INDEX.md"
ACTION="${1:-list}"
mkdir -p "$RFC_DIR"
```

---

## Action: `new "title"` — create a new RFC

```bash
TITLE="$2"
# Get next RFC number
LAST_NUM=$(ls "$RFC_DIR"/RFC-*.md 2>/dev/null | grep -oE 'RFC-[0-9]+' | grep -oE '[0-9]+' | sort -n | tail -1 || echo "0")
NUM=$(printf "%03d" $((LAST_NUM + 1)))
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | cut -c1-40)
RFC_FILE="$RFC_DIR/RFC-${NUM}-${SLUG}.md"
AUTHOR=$(git config user.name 2>/dev/null || echo "unknown")
DATE=$(date +%Y-%m-%d)
DEADLINE=$(python3 -c "from datetime import date, timedelta; d=date.today(); days=0; count=0
while count<5:
  d+=timedelta(1)
  if d.weekday()<5: count+=1
print(d.isoformat())" 2>/dev/null || date -v+7d +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
```

Write `$RFC_FILE`:

```markdown
# RFC-<NUM>: <title>

Status: DRAFT
Author: <author>
Created: <date>
Review deadline: <5 business days from today>
Teams affected: []
Related ADR: —

---

## Problem

> What problem are we solving? Who is affected? What happens if we don't solve it?

[Fill in]

## Proposal

> The specific change or decision being proposed.

[Fill in]

## Alternatives considered

> At least 2 alternatives you evaluated and why they were rejected.

1. **Do nothing**: [reason rejected]
2. **[Alternative B]**: [reason rejected]

## Impact

**Breaking changes:** [yes/no — describe if yes]
**Migration path:** [if breaking — how teams migrate]
**Teams affected:** [list teams who need to act or adjust]
**Cost:** [infra cost delta, if any]
**Timeline:** [estimate]

## Open questions

- [ ] Q1: [question that needs resolution before this can be accepted]
- [ ] Q2:

## Comments

> Add comments with: /rfc comment <id> "text"

---

## Decision

> Filled in by: /rfc close <id> accept|reject

Status: DRAFT
Decision: —
Decided by: —
Date: —
Reason: —
ADR created: —
```

Update RFC-INDEX.md (create if missing):
```bash
[ ! -f "$INDEX_FILE" ] && printf '# RFC Index\n\n| RFC | Title | Status | Author | Deadline |\n|-----|-------|--------|--------|----------|\n' > "$INDEX_FILE"
printf '| RFC-%s | %s | DRAFT | %s | %s |\n' "$NUM" "$TITLE" "$AUTHOR" "$DEADLINE" >> "$INDEX_FILE"
```

Output:
```
RFC-<NUM> created → docs/rfcs/RFC-<NUM>-<slug>.md
Status: DRAFT | Review deadline: <date>

Fill in: Problem, Proposal, Alternatives, Teams affected.
When ready for review: edit Status to REVIEW.
To close: /rfc close <NUM> accept|reject "reason"
```

---

## Action: `list` (default) — show all open RFCs

```bash
ls "$RFC_DIR"/RFC-*.md 2>/dev/null | sort | while read F; do
  NUM=$(basename "$F" | grep -oE '[0-9]+' | head -1)
  TITLE=$(grep "^# RFC-" "$F" | sed 's/^# RFC-[0-9]*: //')
  STATUS=$(grep "^Status:" "$F" | head -1 | awk '{print $2}')
  DEADLINE=$(grep "^Review deadline:" "$F" | awk '{print $3}')
  AUTHOR=$(grep "^Author:" "$F" | awk '{print $2}')
  echo "$NUM | $STATUS | $DEADLINE | $AUTHOR | $TITLE"
done
```

Display as table. Flag overdue (deadline < today) with `⚠ OVERDUE`.

```
Open RFCs:

  RFC-001  REVIEW   deadline: 2026-04-18  @alice   Add GraphQL gateway
  RFC-002  DRAFT    deadline: 2026-04-20  @bob     Migrate to Kafka
  RFC-003  REVIEW   deadline: 2026-04-14  @carol   ⚠ OVERDUE — Deprecate v1 API

Closed: N accepted, M rejected
Run /rfc show <id> to read full RFC.
```

If no RFCs: "No RFCs yet. Create one: /rfc new \"your proposal title\""

---

## Action: `show <id>` — display full RFC

```bash
ID=$(printf "%03d" "$2" 2>/dev/null || echo "$2")
RFC_FILE=$(ls "$RFC_DIR"/RFC-${ID}-*.md 2>/dev/null | head -1)
[ -f "$RFC_FILE" ] && cat "$RFC_FILE" || echo "RFC-$2 not found. Run /rfc list."
```

---

## Action: `comment <id> "text"` — add a comment

```bash
ID=$(printf "%03d" "$2" 2>/dev/null || echo "$2")
RFC_FILE=$(ls "$RFC_DIR"/RFC-${ID}-*.md 2>/dev/null | head -1)
COMMENTER=$(git config user.name 2>/dev/null || echo "unknown")
TIMESTAMP=$(date +%Y-%m-%d)
```

Append to the Comments section of the RFC:
```markdown
**@<commenter>** (<date>): <comment text>
```

Confirm: `Comment added to RFC-<ID>.`

---

## Action: `close <id> accept|reject [reason]` — finalize RFC

```bash
ID=$(printf "%03d" "$2" 2>/dev/null || echo "$2")
DECISION="$3"  # accept | reject
REASON="$4"
RFC_FILE=$(ls "$RFC_DIR"/RFC-${ID}-*.md 2>/dev/null | head -1)
DECIDER=$(git config user.name 2>/dev/null || echo "unknown")
DATE=$(date +%Y-%m-%d)
```

Update the Decision section of `$RFC_FILE`:
```markdown
## Decision

Status: ACCEPTED | REJECTED
Decision: <accept/reject>
Decided by: <decider>
Date: <date>
Reason: <reason>
ADR created: <ADR-NNN if accepted, else —>
```

Update Status line at top: `Status: ACCEPTED` or `Status: REJECTED`

Update RFC-INDEX.md: change status column for this RFC.

**If accepted → create ADR automatically:**

```bash
# Find next ADR number
ADR_DIR="docs/decisions"
mkdir -p "$ADR_DIR"
LAST_ADR=$(ls "$ADR_DIR"/ADR-*.md 2>/dev/null | grep -oE 'ADR-[0-9]+' | grep -oE '[0-9]+' | sort -n | tail -1 || echo "0")
ADR_NUM=$(printf "%03d" $((LAST_ADR + 1)))
```

Write `docs/decisions/ADR-<NUM>-<slug>.md`:
```markdown
# ADR-<NUM>: <RFC title>

Date: <date>
Status: ACCEPTED
Source: RFC-<RFC-ID>

## Context
<Copy Problem section from RFC>

## Decision
<Copy Proposal section from RFC>

## Alternatives Considered
<Copy Alternatives from RFC>

## Consequences
- Positive: <from RFC impact>
- Negative: <migration cost, breaking changes>
- Risks: <open questions that remain>
```

Update DECISIONS.md index.

Output:
```
RFC-<ID> closed: <ACCEPTED/REJECTED>
Reason: <reason>
[If accepted:] ADR-<NUM> created → docs/decisions/ADR-<NUM>-<slug>.md
```
