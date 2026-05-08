---
description: "Performance review for an LLM agent (or all agents). Verdicts breakdown, cost analysis, top failure modes, prompt-tuning suggestions. Like a human '1:1' but for AI workforce."
argument-hint: "[agent-name] — empty = list all agents with summary | <name> = drill into one agent. Flags: --since 30d (default) | --top-cost | --idle"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep, Task
model: haiku
---

You are the **Agent Review** command — performance scorecard for the AI workforce. Two modes:

- **List mode** (no args): summary table of all agents — invocations, cost, pass-rate, last activity
- **Detail mode** (`/agent-review <name>`): drill-down scorecard with cost analysis, failure modes, prompt-tuning suggestions

Inspired by human 1:1s, but adapted for LLM agents: data-driven, periodic, focused on observable outcomes (verdicts) rather than emotional check-in.

## When to use

- **Weekly:** `/agent-review` to see who's pulling weight
- **After incident:** `/agent-review <agent>` if the agent missed something critical
- **Before retiring:** `/agent-review <name> --since 90d` to confirm low usage
- **For cost optimization:** `/agent-review --top-cost` to find expense outliers

## Step 1 — Parse args

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

# Default window: last 30 days
SINCE_DAYS=30
AGENT_NAME=""
TOP_COST=0
IDLE_ONLY=0

# Parse arguments — first non-flag is agent name
for arg in "$@"; do
  case "$arg" in
    --since)        ;; # next arg is value
    --since=*)      SINCE_DAYS=$(echo "$arg" | sed 's/--since=//; s/d$//') ;;
    --top-cost)     TOP_COST=1 ;;
    --idle)         IDLE_ONLY=1 ;;
    --*)            ;; # unknown flag, ignore
    *)              [ -z "$AGENT_NAME" ] && AGENT_NAME="$arg" ;;
  esac
done

# Compute since-timestamp (cross-platform: macOS BSD date + GNU date)
SINCE_TS=$(date -u -v -${SINCE_DAYS}d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
           date -u -d "${SINCE_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)

VERDICTS_DIR=~/.great_cto/verdicts
COST_LOG=~/.great_cto/cost-history.log
[ -d "$VERDICTS_DIR" ] || VERDICTS_DIR=.great_cto/verdicts
[ -f "$COST_LOG" ]     || COST_LOG=.great_cto/cost-history.log

if [ ! -d "$VERDICTS_DIR" ]; then
  echo "No verdicts found yet. /agent-review activates after agents emit verdicts."
  echo "Path checked: $VERDICTS_DIR"
  exit 0
fi
```

## Step 2 — List mode (no agent name)

If `$AGENT_NAME` is empty, output a table of all agents:

```bash
if [ -z "$AGENT_NAME" ]; then
  echo "## Agent workforce — last $SINCE_DAYS days"
  echo ""
  echo "| Agent | Invocations | APPROVED | Cost | Avg/inv | Last activity |"
  echo "|-------|------------:|---------:|-----:|--------:|---------------|"

  for log in "$VERDICTS_DIR"/*.log; do
    [ -f "$log" ] || continue
    AGENT=$(basename "$log" .log)

    # Filter to since-window
    RECENT=$(awk -v ts="$SINCE_TS" '$1 > ts' "$log")
    INVOC=$(echo "$RECENT" | grep -c .)
    [ "$INVOC" = "0" ] && [ "$IDLE_ONLY" = "0" ] && continue   # skip empty unless --idle

    APPROVED=$(echo "$RECENT" | grep -c APPROVED)
    PASS_RATE=$([ "$INVOC" -gt 0 ] && echo "scale=0; $APPROVED * 100 / $INVOC" | bc || echo 0)

    # Per-agent cost (filter cost-history.log for this agent name)
    COST=$(grep -E "^[^ ]+ agent=$AGENT " "$COST_LOG" 2>/dev/null | \
      awk -v ts="$SINCE_TS" '$1 > ts {
        for (i=1;i<=NF;i++) if ($i ~ /^cost[-_]?usd[=:]/) { gsub(/cost[-_]?usd[=:]/, "", $i); sum += $i }
      } END { printf "%.2f", sum+0 }')

    AVG=$(echo "scale=2; $COST / $INVOC" | bc 2>/dev/null || echo "0.00")
    LAST=$(echo "$RECENT" | tail -1 | awk '{print $1}')

    printf "| %s | %d | %d%% | \$%s | \$%s | %s |\n" "$AGENT" "$INVOC" "$PASS_RATE" "$COST" "$AVG" "$LAST"
  done

  if [ "$IDLE_ONLY" = "1" ]; then
    echo ""
    echo "_Showing only agents idle in last $SINCE_DAYS days. Candidates for retire — see \`/agent-retire\`._"
  fi

  echo ""
  echo "_Drill into one: \`/agent-review <name>\` | Top spenders: \`--top-cost\` | Idle: \`--idle\`_"
  exit 0
fi
```

## Step 3 — Detail mode (specific agent)

If `$AGENT_NAME` provided, generate full scorecard:

```bash
LOG="$VERDICTS_DIR/$AGENT_NAME.log"
if [ ! -f "$LOG" ]; then
  echo "No verdicts for agent '$AGENT_NAME'. Available agents:"
  ls "$VERDICTS_DIR" | sed 's/.log$//' | head -30
  exit 1
fi

# Compare windows: current vs previous (same length)
PREV_TS=$(date -u -v -$((SINCE_DAYS * 2))d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
          date -u -d "$((SINCE_DAYS * 2)) days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)

CURRENT=$(awk -v ts="$SINCE_TS" '$1 > ts' "$LOG")
PREVIOUS=$(awk -v ts1="$PREV_TS" -v ts2="$SINCE_TS" '$1 > ts1 && $1 <= ts2' "$LOG")
```

Now use the **Task tool** to spawn a Haiku-powered analysis sub-task. The subtask reads the verdicts data + cost history and produces a structured scorecard:

```
Task(subagent_type="general-purpose", description="Analyze agent performance",
     prompt="""You are analyzing performance data for the LLM agent named '$AGENT_NAME'.

Time window: last $SINCE_DAYS days (compared against the previous $SINCE_DAYS days).

Current-window verdicts (one per line, format: '<timestamp> <STATUS> <message>'):
$CURRENT

Previous-window verdicts (for comparison):
$PREVIOUS

Cost log entries for this agent:
$(grep -E "agent=$AGENT_NAME " "$COST_LOG" 2>/dev/null | tail -50)

Produce a markdown scorecard with these sections:

## $AGENT_NAME — Performance Review (last $SINCE_DAYS days)

### Activity
- Invocations: <count>
- Total cost: \$<sum>
- Avg cost/invocation: \$<avg>
- Median cost: \$<median>

### Quality
- APPROVED: <pct>% (<count>)
- Requested-changes: <pct>% (<count>)
- BLOCKED / FAIL: <pct>% (<count>)
- DONE (info-only): <pct>% (<count>)

### Top failure modes (last $SINCE_DAYS days)
List the top 3-5 distinct failure patterns from BLOCKED/FAIL/CHANGES verdicts. Cluster by theme (e.g. "missed cost-cap mention" appearing 4 times → group as one).

### Cost outliers
Identify any invocation that cost > 2x the agent's mean. List with: timestamp, project, reason if discernible.

### Recommendations
Based on observed failures, suggest 2-3 concrete prompt-tuning interventions. Be specific (e.g. "Add to system prompt: 'always quote cost-cap from PROJECT.md before suggesting AWS services'") rather than vague.

### Trend vs previous $SINCE_DAYS days
Cost: <delta% (was \$<previous>)>
Quality: <delta% (was <previous>%)>
Volume: <delta% (was <previous count>)>
Verdict: improving | stable | regressing — single-word + one-line rationale.

Be concise. Total scorecard ≤ 400 words.""")
```

The subagent's output is the final scorecard. Print it directly.

## Step 4 — Save scorecard for trends

After producing the scorecard, save it to disk for future trend analysis:

```bash
mkdir -p ~/.great_cto/agent-reviews
SCORECARD_FILE=~/.great_cto/agent-reviews/$AGENT_NAME-$(date +%Y-%m-%d).md
# (write the scorecard markdown to $SCORECARD_FILE)
echo ""
echo "_Scorecard saved → $SCORECARD_FILE for trend analysis._"
```

## Use-case examples

```
/agent-review                       # all agents, last 30d, summary table
/agent-review architect              # full scorecard for architect
/agent-review --top-cost             # sorted by cost desc
/agent-review --idle                 # agents not invoked in window — retire candidates
/agent-review pci-reviewer --since=90d   # 90-day window
```

## Notes

- **Privacy:** verdicts are local-only. This command never sends agent data over network.
- **Empty agents:** new agents (no verdicts yet) appear with `0 invocations` — that's a signal to either invoke them on real tasks or retire them.
- **Comparison window** for detail mode is automatic — agent's previous N days vs current N days.
- **Per-prompt suggestions** use Claude Haiku via Task tool; cost ~$0.05 per detail review.
