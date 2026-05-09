# Validation: per-stage Beads tasks (v2.5.7+)

**Goal:** verify that real Claude Code / Cursor / Codex sessions actually
use `scripts/phase-task.sh` to track per-agent phases — not just the
gate aggregations.

This is the only way to confirm v2.5.7 works as designed: agents must
**read their own prompt** and decide to invoke the helper. Pipeline
automated tests (60/60) only verify the helper itself works.

---

## Setup (one-time)

```bash
# Fresh test project — no existing .great_cto/ noise
mkdir /tmp/phase-validate-real && cd /tmp/phase-validate-real
git init
echo '{"name":"phase-validate","dependencies":{"stripe":"^14"}}' > package.json
echo '# Test project for phase-task validation' > README.md

# Bootstrap great_cto (uses latest npm)
npx -y great-cto@latest init --yes
```

Expected: `.great_cto/PROJECT.md` created, archetype detected as
`commerce` (Stripe dep).

## Test 1 — happy path (~5 min)

1. **Open Claude Code in `/tmp/phase-validate-real`**

2. Run: `/start "add Stripe webhook signature verification"`

3. **Watch for phase task creation in agent output.** Each agent should
   echo something like:
   ```
   Phase task: phase-validate-real-x7a (architect: stripe-webhook-...)
   ```
   If the agent **doesn't** invoke the helper, this confirms the
   instruction in their prompt is too long / not surfacing in context.

4. After architect approves and continues, run in a separate terminal:
   ```bash
   cd /tmp/phase-validate-real
   bd list --label phase 2>&1 | head -20
   ```

   **Expected after 1 minute:**
   - `architect` task: closed (✓) — gate:arch came in
   - `pm` task: in_progress (◐) or closed (✓)
   - `senior-dev` task: open (○) or in_progress

5. After full pipeline (`/start` → architect approve → senior-dev → 12-angle review → qa → security → devops → ship approve):
   ```bash
   bd list --label phase --status closed | grep -cE '^✓'
   ```

   **Expected:** ≥ 6 (architect, pm, senior-dev, code-reviewer, qa, security, devops — minus any that didn't fire because pipeline scaled to `quick` or `standard` instead of `deep`)

6. Open `great-cto board` (http://localhost:3141/?project=phase-validate-real):
   - **Tasks tab:** should show ~6-8 phase-* tasks (one per agent that ran)
   - **Activity feed:** chronological create+close events visible
   - **Cost panel:** per-agent cost using time-based estimate

## Test 2 — QA fail/remediate cycle (~7 min)

Forces the failure path that re-opens phase-task.

1. Run: `/start "add 2FA with magic links"` (intentionally vague)

2. Let pipeline run until QA. **Reject the ship gate** with reason:
   "no rate-limiting on /verify endpoint"

3. Pipeline should:
   - Mark qa-engineer's phase task as **blocked** (●)
   - senior-dev creates a new phase task for remediation
   - On second QA pass, qa-engineer creates a **new** phase task (id ≠ first)

4. Verify:
   ```bash
   bd list --label phase-qa
   ```

   **Expected:** 2 tasks — first ● blocked with note, second ✓ closed.

## Test 3 — multi-tool environment (~10 min)

Validates the helper falls back to `.great_cto/tasks.md` when bd is
absent, and that re-running with bd later still works.

1. **Without bd installed** (e.g. in Cursor without Beads):
   ```bash
   # Temporarily mask bd
   alias bd='echo "bd not found" >&2; return 1'
   bash scripts/phase-task.sh open architect test-feat
   ```

   **Expected:** outputs `phase-architect-<timestamp>`, appends to
   `.great_cto/tasks.md`. No bd error leaks.

2. **Restore bd, re-run:**
   ```bash
   unalias bd
   bash scripts/phase-task.sh open architect test-feat
   ```

   **Expected:** creates a real bd task (different id from fallback).
   Original `.great_cto/tasks.md` line stays — manual cleanup if desired.

## Failure modes to look for

| Symptom | Likely cause |
|---|---|
| No phase-* tasks ever created | Agent prompt is too long, helper instruction got context-trimmed. Fix: shorten the instruction in `agents/<name>.md`. |
| `phase-task.sh: command not found` in agent | PLUGIN_DIR detection failed. Agent should fall back to `$(pwd)/scripts/phase-task.sh`. Check both paths in `agents/<name>.md`. |
| Tasks created but never closed | Agent doesn't reach the closing block (errored out, context compacted, etc). Acceptable; cleanup via `/agent-retire` later. |
| Wrong agent label (e.g. `phase-impl` for QA) | `phase_label_for()` mapping bug in `phase-task.sh`. |
| Bd close fails silently | Verify with `bd close --force` fallback (fixed in v2.5.10). |

## Evidence to collect

When validating in a real session, save:

1. **bd list output** before + after the pipeline:
   ```bash
   bd list --label phase > /tmp/phase-before.txt
   # ... run pipeline ...
   bd list --label phase > /tmp/phase-after.txt
   diff /tmp/phase-{before,after}.txt
   ```

2. **Board screenshot** of Tasks tab showing phase tasks

3. **Agent verdict log** (`~/.great_cto/verdicts/<agent>.log`) entries
   for the test feature

4. **Timing**: how long from `/start` to ship gate approve, vs human-team
   estimate

## Success criteria (v2.5.7+ phase tasks)

- ≥ 6 phase tasks created per pipeline run
- All closed (or blocked with reason) by end of pipeline
- One task per agent per feature (idempotent re-open works)
- Failure verdict correctly marks blocked, doesn't lose work
- Bd unavailable → fallback to tasks.md silently
- Board UI displays them under Tasks tab with phase-* labels

## Pipeline regression coverage

`scripts/test-pipeline.sh` L4b (5 tests) automatically verifies:
- Helper creates labelled tasks
- Open is idempotent
- Close ok despite open gate dependency
- Close fail marks blocked
- 8-stage simulation produces 8 closed phase tasks

Run before each release: `bash scripts/test-pipeline.sh`.
