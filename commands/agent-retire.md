---
description: "Gracefully retire an LLM agent from the workforce. Archives prompt, removes from sync list, keeps verdicts for audit. Like firing a human — but reversible."
argument-hint: "<agent-name> [--archive-only] [--reason 'text'] | --list-candidates (idle agents)"
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
model: haiku
---

You are the **Agent Retire** command — graceful deprecation flow for AI workforce. Removes an agent from active rotation while preserving audit trail and reversibility.

## When to use

- Agent has had **0 invocations in last 90 days** (use `/agent-review --idle` to find candidates)
- Agent's archetype is no longer in your active project mix
- Agent's prompt is being **superseded** by a better one (consolidation)
- Agent has been **flagged as misbehaving** in multiple verdicts

## What gets retired

1. **Agent prompt file** — `agents/<name>.md` → `agents/_retired/<name>.md`
2. **SessionStart sync list** — `<name>` removed from `plugin.json`
3. **Decisions log** — entry added to `~/.great_cto/decisions.md`
4. **Verdicts** — `~/.great_cto/verdicts/<name>.log` **preserved** (audit trail; never deleted)
5. **Lessons referencing the agent** — left untouched (historical record)

## What's reversible

To un-retire: `mv agents/_retired/<name>.md agents/<name>.md` + add back to sync list. All prior verdicts/lessons resume.

## Step 1 — Parse args + validate

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

ARCHIVE_ONLY=0
REASON=""
AGENT_NAME=""
LIST_CANDIDATES=0

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --archive-only)   ARCHIVE_ONLY=1; shift ;;
    --list-candidates) LIST_CANDIDATES=1; shift ;;
    --reason)         REASON="$2"; shift 2 ;;
    --reason=*)       REASON="${1#*=}"; shift ;;
    *)                AGENT_NAME="$1"; shift ;;
  esac
done

# --list-candidates mode
if [ "$LIST_CANDIDATES" = "1" ]; then
  echo "## Retire candidates — agents with 0 invocations in last 90 days"
  echo ""
  SINCE_TS=$(date -u -v -90d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
             date -u -d "90 days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
  VERDICTS_DIR=~/.great_cto/verdicts
  [ -d "$VERDICTS_DIR" ] || VERDICTS_DIR=.great_cto/verdicts

  for log in "$VERDICTS_DIR"/*.log; do
    [ -f "$log" ] || continue
    AGENT=$(basename "$log" .log)
    RECENT_COUNT=$(awk -v ts="$SINCE_TS" '$1 > ts' "$log" | wc -l | tr -d ' ')
    if [ "$RECENT_COUNT" = "0" ]; then
      LAST=$(tail -1 "$log" 2>/dev/null | awk '{print $1}')
      echo "- \`$AGENT\` — last seen $LAST"
    fi
  done

  echo ""
  echo "_To retire: \`/agent-retire <name>\`. Files preserved in \`agents/_retired/\` for un-retire later._"
  exit 0
fi

# Validate agent name
if [ -z "$AGENT_NAME" ]; then
  echo "Usage: /agent-retire <agent-name> [--archive-only] [--reason 'text']"
  echo "       /agent-retire --list-candidates"
  exit 2
fi

AGENT_FILE="agents/$AGENT_NAME.md"
if [ ! -f "$AGENT_FILE" ]; then
  echo "No such agent file: $AGENT_FILE"
  echo ""
  echo "Available agents (active):"
  ls agents/*.md 2>/dev/null | sed 's|agents/||; s|\.md||' | head -40
  exit 1
fi
```

## Step 2 — Show agent's recent activity (sanity check)

Before retiring, show the user what they're about to lose:

```bash
SINCE_TS=$(date -u -v -90d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
           date -u -d "90 days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
VERDICTS_DIR=~/.great_cto/verdicts
[ -d "$VERDICTS_DIR" ] || VERDICTS_DIR=.great_cto/verdicts
LOG="$VERDICTS_DIR/$AGENT_NAME.log"

echo "## Retire: $AGENT_NAME"
echo ""

if [ -f "$LOG" ]; then
  RECENT=$(awk -v ts="$SINCE_TS" '$1 > ts' "$LOG" | wc -l | tr -d ' ')
  TOTAL=$(wc -l < "$LOG" | tr -d ' ')
  echo "### Activity (last 90 days vs all-time)"
  echo "- Invocations last 90d: $RECENT"
  echo "- Invocations all-time: $TOTAL"
  echo "- Last verdict: $(tail -1 "$LOG" 2>/dev/null | head -c 120)"
  echo ""
  if [ "$RECENT" -gt 5 ]; then
    echo "⚠ This agent has $RECENT recent invocations. Are you sure?"
  fi
fi

# Check archetype dependencies
echo "### Archetype usage"
grep -l "applies_to:.*$AGENT_NAME" agents/*.md packages/cli/src/archetypes.ts 2>/dev/null | head -5 || \
  grep -l "$AGENT_NAME" packages/cli/src/archetypes.ts 2>/dev/null | head -3 || \
  echo "- Not directly referenced by archetype rules ✓ safe to retire"
```

## Step 3 — Confirmation prompt (interactive)

```
Confirm retirement? Type the agent name to confirm: __
```

If the typed name doesn't match `$AGENT_NAME`, abort.

## Step 4 — Execute retirement

If confirmed:

```bash
# 1. Archive folder
mkdir -p agents/_retired

# 2. Move agent file
git mv "agents/$AGENT_NAME.md" "agents/_retired/$AGENT_NAME.md" 2>/dev/null || \
  mv "agents/$AGENT_NAME.md" "agents/_retired/$AGENT_NAME.md"

# 3. Append retirement marker to the moved file
cat <<EOF >> "agents/_retired/$AGENT_NAME.md"

---

## RETIRED — $(date -u +%Y-%m-%d)

**Reason:** ${REASON:-no reason given}

**Last activity:** $(tail -1 "$LOG" 2>/dev/null || echo "no verdicts logged")

**Un-retire:** \`mv agents/_retired/$AGENT_NAME.md agents/$AGENT_NAME.md\` + add back to plugin.json sync list + run /update.
EOF

# 4. Remove from plugin.json SessionStart sync list (if not --archive-only)
if [ "$ARCHIVE_ONLY" = "0" ]; then
  python3 - <<'PY'
import re, sys
import json
p = ".claude-plugin/plugin.json"
text = open(p).read()
agent = "$AGENT_NAME"
# Find "for AGENT in <list>;" and remove agent name
m = re.search(r'(for AGENT in )([^;]+)(;)', text)
if m:
    agents = m.group(2).split()
    if agent in agents:
        agents.remove(agent)
        text = text[:m.start()] + m.group(1) + ' '.join(agents) + m.group(3) + text[m.end():]
        json.loads(text)  # validate
        open(p, 'w').write(text)
        print(f"  ✓ removed {agent} from SessionStart sync list")
    else:
        print(f"  - {agent} not in sync list (already removed?)")
else:
    print("  ⚠ sync list pattern not found in plugin.json")
PY
fi

# 5. Decisions log
mkdir -p ~/.great_cto
cat <<EOF >> ~/.great_cto/decisions.md

---

## Agent retired: $AGENT_NAME — $(date -u +%Y-%m-%d)

**Reason:** ${REASON:-no reason given}

**Replaced by:** _none_ (or specify if consolidated into another agent)

**Verdicts preserved:** $LOG (audit trail intact)

**Reversible:** \`mv agents/_retired/$AGENT_NAME.md agents/$AGENT_NAME.md\` + restore plugin.json
EOF
echo "  ✓ logged to ~/.great_cto/decisions.md"
```

## Step 5 — Final summary

```
✓ Retired: $AGENT_NAME
  - File:        agents/_retired/$AGENT_NAME.md
  - Sync list:   removed from plugin.json
  - Decisions:   logged at ~/.great_cto/decisions.md
  - Verdicts:    preserved at $LOG (audit)

Next session restart will sync the new state.
To un-retire: see notes in agents/_retired/$AGENT_NAME.md
```

## Use-case examples

```
/agent-retire --list-candidates                            # show idle agents (0 invocations in 90d)
/agent-retire game-reviewer                                # full retirement flow
/agent-retire firmware-reviewer --reason "no IoT projects this year"
/agent-retire oracle-reviewer --archive-only               # move file but keep in sync list (rollback ready)
```

## What NOT to retire

- **Core pipeline agents** (architect, pm, senior-dev, qa-engineer, security-officer, devops, code-reviewer) — these run on every project regardless of archetype
- **continuous-learner** — needed for memory/learning loop
- **l3-support** — needed for incident response
- **Agents currently mid-pipeline** — wait for active task to finish

The command auto-warns if you try to retire one of these.
