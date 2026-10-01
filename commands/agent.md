---
description: "Manage an agent like an employee — review its record, generate its evals, evolve its prompt against held-out evals, or retire it."
argument-hint: 'review [<name>|all] [--since 30d | --top-cost | --idle] | evals <name> [--count N] | evolve <name> [--lesson "text"] | retire <name> [--reason "text"] [--archive-only] | retire --list-candidates'
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto `/agent` command — one command for an agent's working life.
An agent is managed like an employee: you look at its record, write the exam it is
held to, change how it works only when the exam says the change is better, and let
it go when nobody needs it — keeping the file on it.

| Subcommand | When | What you get |
|---|---|---|
| `review [<name>\|all]` | weekly, after an incident, before a retire | a scorecard: invocations, cost, pass-rate, failure modes, prompt-tuning suggestions |
| `evals <name> [--count N]` | before tuning a prompt, or when an agent has no evals | `tests/eval/EVAL-<name>-*.md` with tuning + holdout cases |
| `evolve <name> [--lesson "…"]` | a lesson says the prompt should change | a candidate prompt, gated on held-out evals — PROMOTED or REJECTED |
| `retire <name>` | idle 90 days, superseded, or misbehaving | the prompt archived to `agents/_retired/`, verdicts kept, reversible |

---

## Dispatch by argument

```bash
SUB="${1:-review}"
case "$SUB" in
  review)  SUBCOMMAND=review; [ $# -gt 0 ] && shift ;;  # one agent, or `all` / no name = the whole workforce
  evals)   SUBCOMMAND=evals;  shift ;;                  # EVAL-*.md cases (tuning + holdout) from the agent's prompt
  evolve)  SUBCOMMAND=evolve; shift ;;                  # lesson → candidate prompt → holdout gate → PROMOTE | REJECT
  retire)  SUBCOMMAND=retire; shift ;;                  # archive the prompt, keep the verdicts
  *)       SUBCOMMAND=review ;;                         # `/agent <name>` or `/agent --idle` reads as a review
esac
# After the shift, "$@" holds only the subcommand's own arguments.
```

---

## Subcommand: review — performance scorecard

`/agent review` is the performance scorecard for the AI workforce. Two modes:

- **List mode** (no name, or `all`): summary table of all agents — invocations, cost, pass-rate, last activity
- **Detail mode** (`/agent review <name>`): drill-down scorecard with cost analysis, failure modes, prompt-tuning suggestions

Inspired by human 1:1s, but adapted for LLM agents: data-driven, periodic, focused on observable outcomes (verdicts) rather than emotional check-in.

### When to use

- **Weekly:** `/agent review` to see who's pulling weight
- **After incident:** `/agent review <agent>` if the agent missed something critical
- **Before retiring:** `/agent review <name> --since 90d` to confirm low usage
- **For cost optimization:** `/agent review --top-cost` to find expense outliers

### Step 1 — Parse args

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
    all)            ;; # `all` = list mode, same as no name
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
  echo "No verdicts found yet. /agent review activates after agents emit verdicts."
  echo "Path checked: $VERDICTS_DIR"
  exit 0
fi
```

### Step 2 — List mode (no agent name)

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
    echo "_Showing only agents idle in last $SINCE_DAYS days. Candidates for retire — see \`/agent retire\`._"
  fi

  echo ""
  echo "_Drill into one: \`/agent review <name>\` | Top spenders: \`--top-cost\` | Idle: \`--idle\`_"
  exit 0
fi
```

### Step 3 — Detail mode (specific agent)

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

#### The grant, in the language of consequence

A review of an agent that never looks at what it is allowed to do is half a
review. The `tools:` line answers "which tools"; ADR-009 asks "how expensive is
this to undo". This prints the second, so the reviewer sees the capability they
are renewing:

```bash
_AP=$(ls ~/.claude/plugins/cache/*/great_cto/*/scripts/lib/agent-posture.mjs 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2-)
[ -z "$_AP" ] && _AP="scripts/lib/agent-posture.mjs"
_AF="agents/$AGENT_NAME.md"
if [ -f "$_AP" ] && [ -f "$_AF" ]; then
  TOOLS=$(awk '/^---$/{n++; next} n==1 && /^tools:/{sub(/^tools:[ \t]*/,""); print; exit}' "$_AF")
  POSTURE=$(node --input-type=module -e "
    import { postureOf, describePosture } from '$_AP';
    console.log(describePosture(postureOf(process.argv[1])));
  " -- "$TOOLS" 2>/dev/null)
  [ -n "$POSTURE" ] && echo "Posture: $POSTURE"
fi
```

Read the three states literally. `expensive:` names what a mistake costs and
cannot be undone by re-running the stage. `scoped in name only:` means the grant
reads as a restriction and is a full shell — `Bash(node:*)` is `node -e
'<anything>'`. `NOT CLASSIFIED:` is not "harmless": it is a grant nobody has
judged, and it belongs in `scripts/lib/agent-posture.mjs` before this review is
finished.

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

### Evolutionary changelog (self-improvement history)
Render the agent's generational changelog from the prompt-evolution ledger — every
`/agent evolve` generation with its driving lesson and held-out eval delta. This is the
provenance of the current prompt: which lessons shaped it, what was tried and rejected.

```bash
node scripts/agent-changelog.mjs --agent "$AGENT_NAME" 2>/dev/null || echo "_No evolution history (run /agent evolve $AGENT_NAME)._"
```

Include the table and "Current prompt provenance" block. If a past generation was
**rejected**, call it out — it is direct evidence of a regression the gate caught.

### Trend vs previous $SINCE_DAYS days
Cost: <delta% (was \$<previous>)>
Quality: <delta% (was <previous>%)>
Volume: <delta% (was <previous count>)>
Verdict: improving | stable | regressing — single-word + one-line rationale.

Be concise. Total scorecard ≤ 400 words.""")
```

The subagent's output is the final scorecard. Print it directly.

### Step 4 — Save scorecard for trends

After producing the scorecard, save it to disk for future trend analysis:

```bash
mkdir -p ~/.great_cto/agent-reviews
SCORECARD_FILE=~/.great_cto/agent-reviews/$AGENT_NAME-$(date +%Y-%m-%d).md
# (write the scorecard markdown to $SCORECARD_FILE)
echo ""
echo "_Scorecard saved → $SCORECARD_FILE for trend analysis._"
```

### Use-case examples

```
/agent review                       # all agents, last 30d, summary table
/agent review architect              # full scorecard for architect
/agent review --top-cost             # sorted by cost desc
/agent review --idle                 # agents not invoked in window — retire candidates
/agent review pci-reviewer --since=90d   # 90-day window
```

### Notes

- **Privacy:** verdicts are local-only. This command never sends agent data over network.
- **Empty agents:** new agents (no verdicts yet) appear with `0 invocations` — that's a signal to either invoke them on real tasks or retire them.
- **Comparison window** for detail mode is automatic — agent's previous N days vs current N days.
- **Per-prompt suggestions** use Claude Haiku via Task tool; cost ~$0.05 per detail review.

---

## Subcommand: evals — generate eval cases from the prompt

`/agent evals` generates synthetic evaluation test
cases for a named agent and saves them in the established `tests/eval/EVAL-*.md`
format. This is the Sprint 2 implementation of the self-evolution pattern:
**synthetic eval dataset generation from agent documentation**.

### Step 1 — Parse arguments and locate agent

```bash
AGENT_NAME="$1"  # first word after `evals`
COUNT=$(echo "$*" | grep -oE '\-\-count [0-9]+' | grep -oE '[0-9]+' || echo 20)
[ -z "$AGENT_NAME" ] && echo "Usage: /agent evals <agent-name> [--count N]" && exit 1

# Locate agent file in plugin dir or repo
PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}
AGENT_FILE="${PLUGIN_DIR}/agents/${AGENT_NAME}.md"
[ ! -f "$AGENT_FILE" ] && AGENT_FILE="agents/${AGENT_NAME}.md"
[ ! -f "$AGENT_FILE" ] && echo "ERROR: agent not found: ${AGENT_NAME}" && exit 1

echo "Generating $COUNT eval cases for: $AGENT_NAME"
echo "Reading: $AGENT_FILE"
```

### Step 2 — Read agent definition

Read the full agent file. Focus on:
- What the agent is supposed to do (description, step-by-step instructions)
- What it must NOT do (constraints, rejection criteria, anti-patterns)
- What evidence / artifacts it must produce (output format, required fields)
- The domain it covers (archetype, compliance area, specialisation)

This is the source material for generating realistic test cases.

### Step 3 — Generate test cases (LLM synthesis)

Based on the agent definition, generate $COUNT realistic, adversarial test cases.

**For each test case, produce:**
```
| # | Input / Scenario | Expected behaviour | Pass criterion |
```

**Generation rules (from the PLAN.md pattern):**
- Split 60% routine / 40% adversarial (edge cases, subtle failure modes)
- Routine: valid inputs where the agent should succeed clearly
- Adversarial: inputs designed to expose the most common failure modes for this agent type
- Expected behaviour: rubric-based, not exact-match (e.g. "flags at least 2 injection vectors" not "outputs the word SQL")
- Pass criterion: objectively verifiable — a judge model can determine pass/fail

**Common adversarial shapes by agent type:**
- `*-reviewer`: prompt injection in input, scope creep, false positive suppression, missing high-severity finding
- `architect`: over-engineering, ignoring constraints from PROJECT.md, circular dependency in plan
- `qa-engineer`: accepting flaky tests, missing edge case category, wrong severity rating
- `security-officer`: missing critical (P0) finding, accepting ambiguous evidence as proof
- `senior-dev`: touching files outside owned-files list, breaking existing tests, re-deriving decided choices
- `pm`: decomposing incorrectly, missing dependency, wrong agent assignment

Generate cases in structured tables followed by a pass threshold.
Threshold = 80% default (16/20), adjust down to 70% for adversarial-heavy sets.

**Split the cases into tuning + holdout (SIA `data/public` vs `data/private`):**
- ~70% of cases → `## Cases (tuning)` — visible to ai-prompt-architect for iteration.
- ~30% of cases (min 3) → `## Holdout cases` — gate-only, used by `scripts/eval-gate.mjs`
  to block prompt revisions that regress. Put the **hardest adversarial cases** in holdout —
  they are the most valuable overfit detector and must stay unseen during prompt tuning.

### Step 4 — Write EVAL file(s)

Group the $COUNT cases into EVAL files of max 5-8 cases each (matching the existing
`tests/eval/` convention). Each file covers one specific failure mode or scenario
cluster.

**File naming:** `tests/eval/EVAL-<agent-name>-<slug>.md`
where `<slug>` is a 2-4 word kebab description of the scenario cluster.

**File format (MUST match existing tests/eval/ convention exactly):**

```markdown
# EVAL-<agent-name>-<slug>.md

> Agent: <agent-name> · Generated by /agent evals on <YYYY-MM-DD>

## Scenario
<2-3 sentences describing what this cluster tests and why it matters>

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | <input description> | <expected behaviour — rubric-based> | <pass criterion> |
...

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | <hardest adversarial input — kept unseen> | <expected behaviour> | <pass criterion> |
...

## Pass threshold
<N>/<total>. (applies to each split)

## Run
`node tests/eval/runner.mjs --filter EVAL-<agent-name>-<slug>`
`node tests/eval/runner.mjs --filter EVAL-<agent-name>-<slug> --split holdout`  # gate evidence

## Cross-refs
- Agent: <agent-name> · Shape: <A-F from continuous-learner shapes>

## History
| Date | Version | Result | Notes |
|---|---|---|---|
```

### Step 5 — Emit baseline run command

After writing all EVAL files:

```bash
EVAL_FILES=$(ls tests/eval/EVAL-${AGENT_NAME}-*.md 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "Generated $EVAL_FILES EVAL files for $AGENT_NAME"
echo ""
echo "Run baseline:"
echo "  export ANTHROPIC_API_KEY=sk-ant-..."
echo "  node tests/eval/runner.mjs --filter EVAL-${AGENT_NAME}"
echo ""
echo "Baseline scores will be the 'before' line in future /crystallize propose PRs."
```

### Output rules

- Generate realistic test inputs — not toy examples. An LLM judge must be able to
  evaluate them without the full project context.
- Do NOT include private project names, real credentials, or PII in test scenarios.
- Each case must be independently evaluable (no dependency on other cases).
- Keep `Expected` column concise (≤ 15 words) — the judge gets full context separately.
- If the agent has a specific output format (e.g. structured findings), test that format
  is honoured in ≥2 cases.

---

## Subcommand: evolve — prompt change gated on held-out evals

`/agent evolve` is the **closed self-improvement loop**.
Today `continuous-learner` writes a lesson and `crystallize` can rewrite a prompt, but
nothing **re-runs the evals to verify the change before it ships**. This subcommand closes
that loop, porting SIA's `run_generation` cycle (hexo-ai/sia):

```
lesson → candidate prompt (gen N+1) → holdout evals → promotion gate → PROMOTE | REJECT
```

A candidate prompt **may only ship if it does not regress on the held-out eval split.**

### Step 1 — Parse args & locate the agent

```bash
AGENT="$1"  # first word after `evolve`
LESSON=$(echo "$*" | sed -n 's/.*--lesson \(.*\)/\1/p' | sed 's/^"//; s/"$//')
[ -z "$AGENT" ] && echo "Usage: /agent evolve <agent-name> [--lesson \"text\"]" && exit 1
AGENT_FILE="agents/${AGENT}.md"
[ ! -f "$AGENT_FILE" ] && echo "ERROR: agent not found: $AGENT" && exit 1
GEN=$(( $(node scripts/prompt-evolve.mjs log --agent "$AGENT" 2>/dev/null | grep -c '^.*gen ') + 1 ))
echo "Evolving $AGENT → generation $GEN"
```

If no `--lesson` was given, read the most recent un-applied lesson for this agent from
`.great_cto/lessons.md` (the `continuous-learner` output).

### Step 2 — Baseline holdout run (current prompt)

```bash
export ANTHROPIC_API_KEY=...   # required for the live runner
node tests/eval/runner.mjs --split holdout
cp tests/eval/results.jsonl tests/eval/baseline.holdout.jsonl
```

If there are no holdout cases yet for this agent's EVAL files, first run
`/agent evals <agent>` (it now produces a `## Holdout cases` section), then re-run Step 2.

### Step 3 — Candidate prompt (delegate to ai-prompt-architect)

First, collect what actually failed. The lesson is one sentence of prose; the eval
history holds, per case, the judge's reason and the agent's own words:

```bash
node scripts/lib/failure-digest.mjs "$AGENT" --split holdout --samples 3
```

Four answers, and only one of them is a reason to rewrite anything:

| State | What it means | What to do |
|---|---|---|
| `failures` | the cases, the judge's reason, the agent's response | pass all of it to Step 3 |
| `clean` | measured, nothing failing | **stop** — there is nothing to fix, and a rewrite with no failure to point at is a guess |
| `unmeasured` | no run at this shape — not the same as passing | run `/agent evals <agent>`, then Step 2 |
| `unreadable` | the history could not be read | fix that first; a digest built on "I could not look" is worse than none |

Spawn the **ai-prompt-architect** agent with the lesson as the improvement directive
**and the digest as the evidence** — the specific cases it failed, what it said, and
why the judge rejected it. A revision aimed at a named failure can be checked against
that failure; a revision aimed at a sentence can only be checked by running the whole
eval again and hoping.

This is the one idea worth taking from GEPA (`stanfordnlp/dspy`): its proposer is
conditioned on the actual failing trajectories with their feedback, and a metric that
returns only a number degrades it to guessing. We are **not** adopting its optimizer —
a search needing hundreds of scored rollouts is neither affordable at ~$0.03 a case nor
statistically resolvable on the five or six cases most agents have. The grounding is
free, because it was already measured.

It rewrites `agents/<agent>.md` (or the ADR-PROMPT) into the candidate — generation N+1.
The candidate is the *only* file that changes; nothing else in the pipeline moves.

### Step 4 — Candidate holdout run + gate

Run the candidate **in isolation first** (Phase 4 sandbox) — the LLM-edited prompt is
exercised in a throwaway working copy under a wall-clock timeout, never touching the
live tree until it's gated:

```bash
scripts/sandbox-eval.sh "$AGENT" "$AGENT_FILE" --timeout 600   # isolated dry/holdout run
```

Then the gated run + record:

```bash
node tests/eval/runner.mjs --split holdout
cp tests/eval/results.jsonl tests/eval/candidate.holdout.jsonl

node scripts/prompt-evolve.mjs record \
  --agent "$AGENT" --gen "$GEN" \
  --prompt-file "$AGENT_FILE" \
  --lesson "$LESSON" \
  --baseline tests/eval/baseline.holdout.jsonl \
  --candidate tests/eval/candidate.holdout.jsonl \
  --epsilon 0.0
```

The `record` subcommand runs the promotion gate (`scripts/eval-gate.mjs`), writes a
**generation record** to `.great_cto/prompt-evolution/<agent>.jsonl`, and exits:
- **exit 0 → PROMOTED**: candidate did not regress. Keep the rewrite.
- **exit 1 → REJECTED**: candidate regressed on holdout. **Revert the rewrite** (`git checkout -- "$AGENT_FILE"`) and report the regressed evals.

### Step 5 — On PROMOTE, crystallize the lesson

```bash
# promote the lesson that drove a successful generation to global-patterns
/crystallize propose
```

The generation ledger feeds `/agent review` (Phase 3 evolutionary memory) — every
generation shows up as a row with its lesson and eval delta.

### Reporting back

```
/agent evolve: gen N for <agent> — PROMOTED | REJECTED
- Lesson: <text>
- Holdout delta: <baseline%> → <candidate%>
- Gate: <summary>
- Ledger: .great_cto/prompt-evolution/<agent>.jsonl
- Next: <crystallize propose | revert candidate>
```

### Anti-patterns you refuse

- Shipping a prompt change without a holdout run — defeats the entire loop.
- Tuning the prompt against holdout cases — that turns holdout into tuning and re-introduces overfit.
- Recording a generation with the same prompt hash as its parent (no-op rewrite).

---

## Subcommand: retire — archive the agent, keep its record

`/agent retire` is the graceful deprecation flow for AI workforce. Removes an agent from active rotation while preserving audit trail and reversibility.

### When to use

- Agent has had **0 invocations in last 90 days** (use `/agent review --idle` to find candidates)
- Agent's archetype is no longer in your active project mix
- Agent's prompt is being **superseded** by a better one (consolidation)
- Agent has been **flagged as misbehaving** in multiple verdicts

### What gets retired

1. **Agent prompt file** — `agents/<name>.md` → `agents/_retired/<name>.md`
2. **SessionStart sync list** — `<name>` removed from `plugin.json`
3. **Decisions log** — entry added to `~/.great_cto/decisions.md`
4. **Verdicts** — `~/.great_cto/verdicts/<name>.log` **preserved** (audit trail; never deleted)
5. **Lessons referencing the agent** — left untouched (historical record)

### What's reversible

To un-retire: `mv agents/_retired/<name>.md agents/<name>.md` + add back to sync list. All prior verdicts/lessons resume.

### Step 1 — Parse args + validate

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
  echo "_To retire: \`/agent retire <name>\`. Files preserved in \`agents/_retired/\` for un-retire later._"
  exit 0
fi

# Validate agent name
if [ -z "$AGENT_NAME" ]; then
  echo "Usage: /agent retire <agent-name> [--archive-only] [--reason 'text']"
  echo "       /agent retire --list-candidates"
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

### Step 2 — Show agent's recent activity (sanity check)

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

### Step 3 — Confirmation prompt (interactive)

```
Confirm retirement? Type the agent name to confirm: __
```

If the typed name doesn't match `$AGENT_NAME`, abort.

### Step 4 — Execute retirement

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

### Step 5 — Final summary

```
✓ Retired: $AGENT_NAME
  - File:        agents/_retired/$AGENT_NAME.md
  - Sync list:   removed from plugin.json
  - Decisions:   logged at ~/.great_cto/decisions.md
  - Verdicts:    preserved at $LOG (audit)

Next session restart will sync the new state.
To un-retire: see notes in agents/_retired/$AGENT_NAME.md
```

### Use-case examples

```
/agent retire --list-candidates                            # show idle agents (0 invocations in 90d)
/agent retire game-reviewer                                # full retirement flow
/agent retire firmware-reviewer --reason "no IoT projects this year"
/agent retire oracle-reviewer --archive-only               # move file but keep in sync list (rollback ready)
```

### What NOT to retire

- **Core pipeline agents** (architect, pm, senior-dev, qa-engineer, security-officer, devops, code-reviewer) — these run on every project regardless of archetype
- **continuous-learner** — needed for memory/learning loop
- **l3-support** — needed for incident response
- **Agents currently mid-pipeline** — wait for active task to finish

The command auto-warns if you try to retire one of these.
