---
description: "Closed prompt-evolution loop: turn a lesson into a candidate agent prompt, gate it on held-out evals, promote only if it beats the baseline. SIA Meta→Target→Feedback ported to great_cto."
argument-hint: "<agent-name> [--lesson \"text\"] — e.g. /prompt-evolve security-officer --lesson \"fewer false positives on TODOs\""
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto `/prompt-evolve` command — the **closed self-improvement loop**.
Today `continuous-learner` writes a lesson and `crystallize` can rewrite a prompt, but
nothing **re-runs the evals to verify the change before it ships**. This command closes
that loop, porting SIA's `run_generation` cycle (hexo-ai/sia):

```
lesson → candidate prompt (gen N+1) → holdout evals → promotion gate → PROMOTE | REJECT
```

A candidate prompt **may only ship if it does not regress on the held-out eval split.**

## Step 1 — Parse args & locate the agent

```bash
AGENT="${ARGUMENTS%% *}"
LESSON=$(echo "$ARGUMENTS" | sed -n 's/.*--lesson \(.*\)/\1/p' | sed 's/^"//; s/"$//')
[ -z "$AGENT" ] && echo "Usage: /prompt-evolve <agent-name> [--lesson \"text\"]" && exit 1
AGENT_FILE="agents/${AGENT}.md"
[ ! -f "$AGENT_FILE" ] && echo "ERROR: agent not found: $AGENT" && exit 1
GEN=$(( $(node scripts/prompt-evolve.mjs log --agent "$AGENT" 2>/dev/null | grep -c '^.*gen ') + 1 ))
echo "Evolving $AGENT → generation $GEN"
```

If no `--lesson` was given, read the most recent un-applied lesson for this agent from
`.great_cto/lessons.md` (the `continuous-learner` output).

## Step 2 — Baseline holdout run (current prompt)

```bash
export ANTHROPIC_API_KEY=...   # required for the live runner
node tests/eval/runner.mjs --split holdout
cp tests/eval/results.jsonl tests/eval/baseline.holdout.jsonl
```

If there are no holdout cases yet for this agent's EVAL files, first run
`/gen-evals <agent>` (it now produces a `## Holdout cases` section), then re-run Step 2.

## Step 3 — Candidate prompt (delegate to ai-prompt-architect)

Spawn the **ai-prompt-architect** agent with the lesson as the improvement directive.
It rewrites `agents/<agent>.md` (or the ADR-PROMPT) into the candidate — generation N+1.
The candidate is the *only* file that changes; nothing else in the pipeline moves.

## Step 4 — Candidate holdout run + gate

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

## Step 5 — On PROMOTE, crystallize the lesson

```bash
# promote the lesson that drove a successful generation to global-patterns
/crystallize propose
```

The generation ledger feeds `/agent-review` (Phase 3 evolutionary memory) — every
generation shows up as a row with its lesson and eval delta.

## Reporting back

```
/prompt-evolve: gen N for <agent> — PROMOTED | REJECTED
- Lesson: <text>
- Holdout delta: <baseline%> → <candidate%>
- Gate: <summary>
- Ledger: .great_cto/prompt-evolution/<agent>.jsonl
- Next: <crystallize propose | revert candidate>
```

## Anti-patterns you refuse

- Shipping a prompt change without a holdout run — defeats the entire loop.
- Tuning the prompt against holdout cases — that turns holdout into tuning and re-introduces overfit.
- Recording a generation with the same prompt hash as its parent (no-op rewrite).
