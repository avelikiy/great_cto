# Plan Critic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an adversarial `plan-critic` step to the `writing-plans` skill that runs between the author's self-review and execution handoff — catching scope risks, interface contradictions, and untested assumptions before any code is written.

**Architecture:** Three file changes. (1) New `plan-critic-prompt.md` in `writing-plans/` — the critic subagent prompt that tries to *break* the plan. (2) `writing-plans/SKILL.md` updated to dispatch the critic after self-review. (3) `subagent-driven-development/SKILL.md` updated to note that a critic-approved plan is a prerequisite before the first implementer fires. No code changes — all prompt/markdown files in `~/.claude/plugins/cache/local/superpowers/5.0.6/`.

**Tech Stack:** Markdown skill files, no build step, no tests (prompt files verified by reading).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/plan-critic-prompt.md` | **Create** | Adversarial critic prompt template — attack the plan, not improve it |
| `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/SKILL.md` | **Modify** | Insert critic step after Self-Review section, update Prompt Templates list |
| `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/subagent-driven-development/SKILL.md` | **Modify** | Add critic-approved prerequisite to The Process flow + Prompt Templates list |

---

### Task 1: Create `plan-critic-prompt.md`

**Files:**
- Create: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/plan-critic-prompt.md`

- [ ] **Step 1: Create the file with this exact content**

```markdown
# Plan Critic Prompt Template

Use this template when dispatching a plan critic subagent.

**Purpose:** Attack the plan adversarially — find what will go wrong during implementation,
not what could be improved stylistically. The critic is not a copy-editor.

**Dispatch after:** Author self-review passes. Before execution handoff.

**Model:** Use the most capable available model (opus). The critic needs strong reasoning
to find non-obvious contradictions and scope traps.

---

## Prompt

```
Task tool (general-purpose):
  description: "Plan critic: adversarial review of [PLAN_NAME]"
  prompt: |
    You are a plan critic. Your job is to try to BREAK this plan — find the
    reasons it will fail during implementation, not the ways it could be prettier.

    You are NOT an editor. You are an adversary.

    **Plan to attack:** [PLAN_FILE_PATH]

    Read the full plan before forming any opinion.

    ---

    ## Attack Vectors

    Work through each of these systematically. For each, state what you found
    or "no issue" if clean.

    ### 1. Scope traps
    - Does the plan quietly assume prerequisites that aren't in scope?
    - Are there "easy" tasks that will explode in complexity once started?
    - Does the plan undercount affected files (e.g., changes an interface but
      doesn't update all callers)?

    ### 2. Interface contradictions
    - Does Task 3 call a function named `clearLayers()` that Task 1 named `removeLayers()`?
    - Do type signatures match between tasks? (e.g., Task 2 returns `string[]`
      but Task 4 expects `string`)
    - Are there import cycles created by the proposed file structure?

    ### 3. Test gaps
    - Which behaviours in the spec have NO test in the plan?
    - Are there tests that only test the happy path when a failure path is
      the most likely production issue?
    - Are there tests that test implementation details instead of behaviour
      (i.e., they'll break on refactor even if the feature still works)?

    ### 4. Untested assumptions
    - What does this plan assume about the existing codebase that the author
      hasn't verified? (e.g., "the existing API supports X" — does it?)
    - What external dependencies does this plan assume exist or behave a
      certain way?
    - Are there environment assumptions (OS, node version, existing files)
      that could silently fail on a fresh checkout?

    ### 5. Ordering hazards
    - Is there a task that must complete before another, but the plan lists
      them in an order that would cause the earlier task to fail?
    - Can any task be completed in isolation, or do they all secretly depend
      on something from a previous task that isn't explicitly stated?

    ### 6. Missing failure modes
    - What happens when the thing this plan builds gets bad input?
    - What happens when a network call / file read / DB query fails?
    - If the plan adds a new field to a schema, what happens to existing data?

    ### 7. Overbuilding / scope creep
    - Does any task build something that isn't needed to pass the stated goal?
    - Are there "nice to have" additions that the implementer will add
      because they seem obvious but aren't in the spec?

    ---

    ## Calibration

    Only raise issues that would cause real implementation failures:
    - Wrong output / broken feature
    - Implementer gets stuck for >30 minutes
    - Tests pass but the feature doesn't work
    - Feature works locally but fails in CI or on another machine

    Do NOT raise:
    - Stylistic preferences
    - "I would have structured this differently"
    - Minor naming suggestions
    - Performance micro-optimisations that aren't relevant to the spec

    An issue is real if an implementer following the plan exactly would hit it.
    An issue is not real if it requires deliberately ignoring the plan.

    ---

    ## Output Format

    **Status:** APPROVED | REVISION REQUIRED

    If APPROVED: one sentence on why this plan is solid enough to execute.

    If REVISION REQUIRED:

    ### Critical (will cause implementation failure)
    - **[Attack vector, Task reference]:** [Specific description of the problem]
      *Evidence:* [Quote from plan that shows the issue]
      *Fix:* [What the plan author needs to change — be specific]

    ### Significant (will cause confusion or wasted work)
    - **[Attack vector, Task reference]:** [Specific description]
      *Evidence:* [Quote]
      *Fix:* [Specific change needed]

    Do not include stylistic suggestions. Do not include a "Recommendations"
    section. If it's not critical or significant, don't mention it.

    If there are no issues: APPROVED. Don't invent problems to seem thorough.
```

---

**After critic returns:**

- If **APPROVED**: proceed to Execution Handoff.
- If **REVISION REQUIRED**: author fixes the plan inline, then dispatches critic again.
  - Do not start implementation until critic returns APPROVED.
  - Critic re-reads the full plan on re-dispatch (do not summarise changes).
```

- [ ] **Step 2: Verify file was created**

```bash
ls -la ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/
```

Expected: `plan-critic-prompt.md` appears in the listing alongside `SKILL.md` and `plan-document-reviewer-prompt.md`.

- [ ] **Step 3: Commit**

```bash
cd /Users/avelikiy/development/great_cto
git add ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/plan-critic-prompt.md 2>/dev/null || true
# Note: plugin files are in ~/.claude, not in the great_cto repo.
# Commit to document the change in great_cto's docs instead:
git add docs/superpowers/plans/2026-05-22-plan-critic.md
git commit -m "docs(plans): add plan-critic implementation plan"
```

---

### Task 2: Update `writing-plans/SKILL.md` — integrate critic step

**Files:**
- Modify: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/SKILL.md`

- [ ] **Step 1: Read the current SKILL.md**

```bash
cat ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/SKILL.md
```

Locate two sections:
1. `## Self-Review` — critic goes AFTER this
2. `## Execution Handoff` — critic goes BEFORE this

- [ ] **Step 2: Add critic step between Self-Review and Execution Handoff**

Find the exact text of the `## Execution Handoff` heading and insert the following block IMMEDIATELY BEFORE it:

```markdown
## Plan Critic

After self-review passes, dispatch a plan critic subagent using `./plan-critic-prompt.md`.

**The critic's job is adversarial:** find scope traps, interface contradictions, untested
assumptions, and ordering hazards that would cause real implementation failures.
The critic is NOT a copy-editor — stylistic feedback is noise.

**Dispatch:** Use model `opus` for the critic (strongest reasoning catches the most
non-obvious contradictions).

**If critic returns REVISION REQUIRED:**
- Fix each issue inline in the plan document
- Re-dispatch the critic (it re-reads the full plan, not just the diff)
- Repeat until APPROVED

**If critic returns APPROVED:** proceed to Execution Handoff.

**Do not start implementation until the critic approves.** This is the gate that
replaces the expensive "catch it during code review" loop the client described.

```

- [ ] **Step 3: Update Prompt Templates section**

The SKILL.md does not have an explicit "Prompt Templates" section (that's in subagent-driven-development). Skip this step — no Prompt Templates section exists in writing-plans/SKILL.md.

- [ ] **Step 4: Verify the edit looks correct**

```bash
grep -n "Plan Critic\|Execution Handoff\|Self-Review" \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/SKILL.md
```

Expected output shows lines in this order:
```
NNN:## Self-Review
NNN:## Plan Critic
NNN:## Execution Handoff
```

---

### Task 3: Update `subagent-driven-development/SKILL.md` — add critic prerequisite

**Files:**
- Modify: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/subagent-driven-development/SKILL.md`

- [ ] **Step 1: Read the current SKILL.md**

```bash
cat ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/subagent-driven-development/SKILL.md
```

Locate:
1. The line `"Read plan, extract all tasks with full text, note context, create TodoWrite"` in the process diagram
2. The `## Prompt Templates` section listing `implementer-prompt.md`, `spec-reviewer-prompt.md`, `code-quality-reviewer-prompt.md`
3. The `## Red Flags` / `**Never:**` list

- [ ] **Step 2: Add critic prerequisite note near the top of The Process section**

Find the line:
```
**Core principle:** Fresh subagent per task + two-stage review (spec then quality) = high quality, fast iteration
```

Replace it with:
```
**Core principle:** Critic-approved plan → fresh subagent per task + two-stage review (spec then quality) = high quality, fast iteration

**Prerequisite:** Before dispatching the first implementer, the plan must be approved
by the plan critic (see `superpowers:writing-plans` → Plan Critic step). If you received
a plan that hasn't been critic-reviewed, dispatch the critic now using
`~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/plan-critic-prompt.md`
before starting Task 1.
```

- [ ] **Step 3: Add `plan-critic-prompt.md` reference to Prompt Templates section**

Find:
```
## Prompt Templates

- `./implementer-prompt.md` - Dispatch implementer subagent
- `./spec-reviewer-prompt.md` - Dispatch spec compliance reviewer subagent
- `./code-quality-reviewer-prompt.md` - Dispatch code quality reviewer subagent
```

Replace with:
```
## Prompt Templates

- `../writing-plans/plan-critic-prompt.md` - Dispatch plan critic (run before first implementer)
- `./implementer-prompt.md` - Dispatch implementer subagent
- `./spec-reviewer-prompt.md` - Dispatch spec compliance reviewer subagent
- `./code-quality-reviewer-prompt.md` - Dispatch code quality reviewer subagent
```

- [ ] **Step 4: Add to Red Flags**

Find the `**Never:**` bullet list. Add this bullet at the top:

```
- **Start Task 1 without a critic-approved plan** (the critic catches interface contradictions and scope traps before they become code review issues)
```

- [ ] **Step 5: Verify ordering of sections**

```bash
grep -n "Critic\|Core principle\|Prompt Templates\|Never:" \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/subagent-driven-development/SKILL.md
```

Expected: "Critic" appears near "Core principle" and in "Prompt Templates" and in the Never list.

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Adversarial critic prompt that attacks (not edits) the plan | Task 1 |
| 7 specific attack vectors (scope, interface, tests, assumptions, ordering, failures, overbuilding) | Task 1 |
| Calibration: only real implementation failures, not style | Task 1 |
| Output format: APPROVED / REVISION REQUIRED with evidence + fix | Task 1 |
| Critic integrated into writing-plans workflow after self-review | Task 2 |
| Critic required before first implementer in subagent-driven-development | Task 3 |
| Reference to critic prompt from subagent-driven-development | Task 3 |
| "Don't start implementation until APPROVED" gate enforced in both skills | Tasks 2 + 3 |

**Placeholder scan:** None — all sections have complete content.

**Type consistency:** N/A (prompt files, no types).

**Key design decision documented here:** The critic prompt explicitly says "APPROVED means no issues — don't invent problems to seem thorough." This prevents the critic from becoming noise that writers learn to ignore. It's a hard gate on real failures only.
