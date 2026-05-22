# Adversarial Critics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three adversarial critic gates to the superpowers workflow — spec critic (after brainstorming), architecture critic (after file-structure design), schema critic and API contract critic (before shipping) — so every decision point with high cost-of-error has an adversarial review before the next phase starts.

**Architecture:** Four new prompt-template files + targeted edits to three SKILL.md files. No code changes. Each critic follows the same pattern as the existing plan-critic: prompt template dispatched as a subagent, returns `Status: APPROVED` or `Status: REVISION REQUIRED` with Critical/Significant findings + Evidence + Fix. Gate is hard: implementation cannot proceed until APPROVED.

**Tech Stack:** Markdown skill files in `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/`. No build step, no tests — verification is reading the files.

**Cache path note:** `~/.claude/plugins/cache/local/superpowers/5.0.6/` is the canonical working location for these skill files — edits here persist across sessions (confirmed: plan-critic edits from the previous session are still in place). A plugin version bump would create a new versioned directory (`5.0.7/`), but that is a separate event that requires re-applying edits. For now, this path is stable and correct.

**Triple-backtick nesting note:** The prompt template files use triple-backtick fences inside a heredoc. This is the established pattern (identical to the existing `plan-critic-prompt.md` which was verified working). Agents read raw file content via the Read tool — they see the literal characters. Rendered markdown will have visual nesting issues but agents don't render markdown. No fix needed.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `skills/brainstorming/spec-critic-prompt.md` | **Create** | Attacks the design doc: wrong problem, scope explosion, contradictions, missing failure spec |
| `skills/brainstorming/SKILL.md` | **Modify** | Add spec-critic step (checklist + process flow + Spec Self-Review section) |
| `skills/writing-plans/arch-critic-prompt.md` | **Create** | Attacks the file structure: wrong abstraction, missing cross-cutting concerns, coupling, untestable design |
| `skills/writing-plans/SKILL.md` | **Modify** | Add `## Architecture Critic` section between `## File Structure` and `## Bite-Sized Task Granularity` |
| `skills/finishing-a-development-branch/schema-critic-prompt.md` | **Create** | Attacks DB migrations: irreversibility, lock duration, backwards compat, data loss |
| `skills/finishing-a-development-branch/api-critic-prompt.md` | **Create** | Attacks API changes: breaking changes, auth gaps, n+1 baked in, missing pagination |
| `skills/finishing-a-development-branch/SKILL.md` | **Modify** | Add Step 1.5 pre-ship critics between Step 1 (Verify Tests) and Step 2 (Determine Base Branch) |

---

### Task 1: Spec critic — prompt + brainstorming integration

**Files:**
- Create: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/spec-critic-prompt.md`
- Modify: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/SKILL.md`

- [ ] **Step 1: Create `spec-critic-prompt.md`**

```bash
cat > ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/spec-critic-prompt.md << 'ENDOFFILE'
# Spec Critic Prompt Template

Use this template when dispatching a spec critic subagent.

**Purpose:** Attack the spec adversarially — find what will cause the wrong thing
to be built, not what could be written more clearly. The critic is not a copy-editor.

**Dispatch after:** Spec self-review passes. Before user review gate.

**Model:** Use the most capable available model (opus). The critic needs strong reasoning
to find non-obvious contradictions and wrong-problem traps.

---

## Prompt

```
Task tool (general-purpose):
  description: "Spec critic: adversarial review of [SPEC_NAME]"
  prompt: |
    You are a spec critic. Your job is to try to BREAK this spec — find the reasons
    the wrong thing will be built, not the ways it could be written more clearly.

    You are NOT an editor. You are an adversary.

    **Spec to attack:** [SPEC_FILE_PATH]

    Read the full spec before forming any opinion.

    ---

    ## Attack Vectors

    Work through each of these systematically. For each, state what you found
    or "no issue" if clean.

    ### 1. Wrong problem
    - Does the spec describe a solution rather than a problem?
      (Solution masquerading as a requirement: "Build a dashboard" instead of
      "Users need to track X in real time")
    - Is the stated goal what the user actually needs, or a proxy they asked for?
    - Would delivering this spec exactly as written leave the user's actual need unmet?

    ### 2. Scope explosion triggers
    - Which requirements use the words "just", "simply", "easy", "straightforward"?
      These are where complexity is hidden.
    - Which requirements hide recursive complexity?
      ("Support nested X" or "allow any configuration" are never simple)
    - Which requirements will cascade into other systems not in scope?
      (e.g., "send an email" requires an email service, template system, bounce handling)

    ### 3. Internal contradictions
    - Do any sections make mutually exclusive assumptions?
    - Does the data model in one section contradict the API shape in another?
    - Do the stated constraints conflict with the stated requirements?
      (e.g., "must be real-time" + "no WebSocket" is a constraint conflict)

    ### 4. Missing stakeholders and edge cases
    - Who is affected by this feature that the spec doesn't mention?
      (other teams, existing users, downstream consumers)
    - What does the spec say happens when the user does the unexpected thing?
      (submits twice, refreshes mid-flow, has empty state, exceeds limits)
    - What happens to existing data and existing users when this ships?

    ### 5. Untested assumptions
    - What does this spec assume about other systems or APIs that isn't documented?
      (e.g., "we'll use the existing auth system" — does it support the required flows?)
    - What environment does this assume exists that a fresh developer wouldn't have?
    - Which "obvious" things are assumed but not written down — and would cause
      implementation to stall if wrong?

    ### 6. Irreversibility traps
    - Which decisions in this spec are hard to change once shipped?
      (data schemas, public API shapes, external contracts, URL structures)
    - Which parts of the spec will create external dependencies?
      (once clients depend on a shape, you can't change it)
    - Does this spec foreclose a future option that is likely to be needed?

    ### 7. Missing failure specification
    - What should the system do when the happy path fails?
      (network error, third-party API down, validation failure, timeout)
    - Are error states and their recovery paths defined?
    - Is there a spec for what happens under load or with bad input?
    - Is there a spec for what happens when this feature is partially deployed?
      (old code + new data, new code + old data)

    ---

    ## Calibration

    Only raise issues that would cause the wrong thing to be built:
    - Implementing a feature the user didn't need
    - Implementer gets 60% through and discovers the spec contradicts itself
    - Feature ships but users immediately find an edge case the spec missed
    - Wrong architecture choice locked in by an assumption in the spec

    Do NOT raise:
    - Writing style or clarity improvements
    - "I would have structured this differently"
    - Feature suggestions outside the spec scope
    - Performance concerns not relevant to the spec's stated scale

    An issue is real if an implementer following the spec exactly would build the wrong thing.
    An issue is not real if it requires deliberately ignoring the spec.

    ---

    ## Output Format

    Status: APPROVED
    or
    Status: REVISION REQUIRED

    If APPROVED: one sentence on why this spec is solid enough to plan against.

    If REVISION REQUIRED:

    ### Critical (will cause wrong thing to be built)
    - **[Attack vector, Section reference]:** [Specific description of the problem]
      *Evidence:* [Quote from spec that shows the issue]
      *Fix:* [What the spec author needs to change — be specific]

    ### Significant (will cause confusion or stalled implementation)
    - **[Attack vector, Section reference]:** [Specific description]
      *Evidence:* [Quote]
      *Fix:* [Specific change needed]

    Do not include stylistic suggestions. Do not include a "Recommendations" section.
    If it's not critical or significant, don't mention it.

    If there are no issues: APPROVED. Don't invent problems to seem thorough.
```

---

**After critic returns:**

- If **APPROVED**: append sign-off to the bottom of the spec document, then proceed to User Review Gate:
```markdown
---
Status: APPROVED
Critic verdict: [paste the critic's one-sentence approval]
```

- If **REVISION REQUIRED**: author fixes the spec inline, then dispatches critic again.
  - Do not proceed to User Review Gate until critic returns APPROVED.
  - Critic re-reads the full spec on re-dispatch (do not summarise changes).
ENDOFFILE
```

- [ ] **Step 2: Verify file created**

```bash
ls -la ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/
```

Expected: `spec-critic-prompt.md` appears alongside `SKILL.md`.

- [ ] **Step 3: Verify exact anchor strings exist in `brainstorming/SKILL.md` before editing**

```bash
grep -n "Spec self-review\|User reviews written spec\|Spec self-review.*(fix inline)\|User reviews spec?" \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/SKILL.md
```

Expected: at least four matching lines — two checklist items and two diagram references. If any are missing or worded differently, adjust the edits in Steps 3–5 to use the exact wording found.

- [ ] **Step 4: Update `brainstorming/SKILL.md` — add spec-critic to checklist**

Read the SKILL.md. Find the checklist section:

```
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
8. **User reviews written spec** — ask user to review the spec file before proceeding
```

Replace with:

```
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
8. **Spec critic** — dispatch adversarial spec critic using `./spec-critic-prompt.md`; fix REVISION REQUIRED before step 9
9. **User reviews written spec** — ask user to review the spec file before proceeding
```

- [ ] **Step 5: Update `brainstorming/SKILL.md` — update process flow diagram**

Confirmed from Step 3 that the DOT diagram uses `"Spec self-review\n(fix inline)"` as the node label.
Find this exact line in the DOT diagram:

```
    "Spec self-review\n(fix inline)" -> "User reviews spec?";
```

Replace with:

```
    "Spec self-review\n(fix inline)" -> "Spec critic\n(fix + re-dispatch loop)";
    "Spec critic\n(fix + re-dispatch loop)" -> "User reviews spec?";
```

Also add the node definition before the edge list (find `"Spec self-review\n(fix inline)" [shape=box];` and add after it):

```
    "Spec critic\n(fix + re-dispatch loop)" [shape=box];
```

- [ ] **Step 6: Update `brainstorming/SKILL.md` — add dispatch instruction to Spec Self-Review section**

Find the end of the "Spec Self-Review" section (the paragraph that ends with "Fix any issues inline. No need to re-review — just fix and move on."). Insert immediately after:

```
**After self-review passes, dispatch spec critic:**

Dispatch the spec-critic subagent (`./spec-critic-prompt.md`) now.
When dispatching, replace `[SPEC_FILE_PATH]` with the absolute path to the saved spec document.

- If REVISION REQUIRED: fix each issue inline, re-dispatch (critic re-reads full spec, not just diff)
- If APPROVED: append `Status: APPROVED` sign-off to the spec document, proceed to User Review Gate

Do not proceed to the user review gate until the critic returns APPROVED.
```

- [ ] **Step 7: Verify ordering in SKILL.md — checklist**

```bash
grep -n "Spec self-review\|Spec critic\|User reviews written spec\|User Review Gate" \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/SKILL.md
```

Expected (checklist and section references in order):
```
NNN:7. **Spec self-review**
NNN:8. **Spec critic**
NNN:9. **User reviews written spec**
NNN:Spec critic
NNN:User Review Gate
```

- [ ] **Step 8: Verify ordering in SKILL.md — diagram**

```bash
grep -n 'Spec self-review' \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/SKILL.md
grep -n 'Spec critic' \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/SKILL.md
grep -n 'User reviews spec' \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/brainstorming/SKILL.md
```

Expected: The `Spec critic` line number falls between `Spec self-review` and `User reviews spec` line numbers.

---

### Task 2: Architecture critic — prompt + writing-plans integration

**Files:**
- Create: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/arch-critic-prompt.md`
- Modify: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/SKILL.md`

- [ ] **Step 1: Create `arch-critic-prompt.md`**

```bash
cat > ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/arch-critic-prompt.md << 'ENDOFFILE'
# Architecture Critic Prompt Template

Use this template when dispatching an architecture critic subagent.

**Purpose:** Attack the proposed file structure and architectural approach — find what
will cause the implementation to collapse, not what could be named differently.
The critic is not a code style reviewer.

**Dispatch after:** File map is designed. Before tasks are written.

**Model:** Use the most capable available model (opus). The critic needs strong reasoning
to find non-obvious coupling and scalability traps.

---

## Prompt

```
Task tool (general-purpose):
  description: "Architecture critic: adversarial review of [PLAN_NAME] file structure"
  prompt: |
    You are an architecture critic. Your job is to try to BREAK the proposed file
    structure and architectural approach — find the reasons the implementation will
    collapse, not the ways the names could be improved.

    You are NOT a code style reviewer. You are an adversary.

    **Plan (file map section) to attack:** [PLAN_FILE_PATH]

    Read the File Map section of the plan. Also read the Goal and Architecture
    summary. Do not read the task steps — you are attacking the structure, not
    the implementation details.

    ---

    ## Attack Vectors

    Work through each of these systematically. For each, state what you found
    or "no issue" if clean.

    ### 1. Wrong abstraction level
    - Are files split too finely? (ceremony overhead: 8 files each doing 10 lines)
    - Are files too coarse? (one file doing 5 unrelated things)
    - Does the module structure map to the problem domain, or to implementation
      convenience? (domain-driven is harder to get wrong)
    - Are there files that will inevitably grow into god modules because there's
      nowhere else for related code to live?

    ### 2. Missing cross-cutting concerns
    - Where does authentication and authorization live? Is it enforced at every
      external entry point, or added ad-hoc?
    - Where does error handling and logging live? Are they afterthoughts that
      every module will implement differently?
    - Where does caching live? Can it be added without changing all callers?
    - Are there infrastructure concerns (retry, timeout, circuit-breaker) that
      need a home but don't have one?

    ### 3. Circular dependencies and tight coupling
    - Does any proposed import create a dependency cycle?
      (FileA imports FileB imports FileC imports FileA)
    - Are there two files that will always change together?
      (This signals they should be one file, or one needs to own the contract)
    - Does any high-level module import from a low-level module that imports back?

    ### 4. Test isolation
    - Can each module be unit-tested without standing up the rest of the system?
    - Are there hidden dependencies (globals, singletons, filesystem, network)
      that will make mocking painful?
    - Does the architecture make testing the happy path easy but error paths require
      a full integration test?
    - Are there modules with no clear unit test seam?

    ### 5. Interface leakage
    - Does any module expose implementation details in its interface?
      (e.g., returns a DB row object instead of a domain type)
    - Are there internal types being passed across module boundaries?
    - Would changing the internals of FileA require changing FileB's tests?

    ### 6. Scalability shape
    - Which module becomes the bottleneck at 10x current load?
    - Is state stored in-process in a way that prevents horizontal scaling?
    - Is there a synchronous step on the critical path that blocks everything else?
    - Does the architecture assume a single process / single machine?

    ### 7. Deployment and evolution
    - What is the deployment unit? Can FileA's changes be deployed without FileB?
    - Which architectural decisions are hardest to change in 6 months?
      (e.g., data storage choice, protocol choice, schema shape)
    - Does this architecture support the next obvious feature extension,
      or will it require restructuring?

    ---

    ## Calibration

    Only raise issues that would cause real implementation collapse:
    - Circular import that causes a runtime error on startup
    - Module that can't be unit-tested without running a database
    - Architectural decision that forecloses the next obvious feature
    - Design where adding auth requires touching every file

    Do NOT raise:
    - Naming preferences
    - "I would have split this differently"
    - Performance concerns that aren't architectural (micro-optimisations)
    - File organisation preferences unrelated to coupling or testability

    An issue is real if an implementer following the file map exactly would hit it.
    An issue is not real if it requires deliberately ignoring the file map.

    ---

    ## Output Format

    Status: APPROVED
    or
    Status: REVISION REQUIRED

    If APPROVED: one sentence on why this architecture is solid enough to write
    tasks against.

    If REVISION REQUIRED:

    ### Critical (will cause implementation collapse)
    - **[Attack vector, File reference]:** [Specific description of the problem]
      *Evidence:* [Quote from plan's file map that shows the issue]
      *Fix:* [What the plan author needs to change — be specific]

    ### Significant (will cause confusion or rework)
    - **[Attack vector, File reference]:** [Specific description]
      *Evidence:* [Quote]
      *Fix:* [Specific change needed]

    Do not include stylistic suggestions. Do not include a "Recommendations" section.
    If it's not critical or significant, don't mention it.

    If there are no issues: APPROVED. Don't invent problems to seem thorough.
```

---

**After critic returns:**

- If **APPROVED**: append sign-off to the plan's File Map section, then proceed to writing tasks:
```markdown
<!-- arch-critic: APPROVED -->
```

- If **REVISION REQUIRED**: author fixes the file map inline, then dispatches critic again.
  - Do not start writing tasks until critic returns APPROVED.
  - Critic re-reads the full plan file map on re-dispatch (do not summarise changes).
ENDOFFILE
```

- [ ] **Step 2: Verify file created**

```bash
ls -la ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/
```

Expected: `arch-critic-prompt.md` appears alongside `SKILL.md`, `plan-critic-prompt.md`.

- [ ] **Step 3: Verify anchor string exists in `writing-plans/SKILL.md`**

```bash
grep -n "## Bite-Sized Task Granularity\|## File Structure\|## Plan Critic" \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/SKILL.md
```

Expected: all three headings present, in order File Structure → Bite-Sized → Plan Critic.
If `## Bite-Sized Task Granularity` is missing or differently named, adjust Step 4 to insert before whichever heading comes after `## File Structure`.

- [ ] **Step 4: Update `writing-plans/SKILL.md` — add `## Architecture Critic` section**

Read the SKILL.md. Find the exact heading:

```
## Bite-Sized Task Granularity
```

Insert the following block IMMEDIATELY BEFORE it:

```markdown
## Architecture Critic

After designing the File Map, dispatch an architecture critic subagent using `./arch-critic-prompt.md`.
When dispatching, replace `[PLAN_FILE_PATH]` with the absolute path to the plan document
(the file map section is what the critic reads).

**The critic's job is adversarial:** find coupling traps, missing cross-cutting concerns,
circular dependencies, and untestable designs that would cause the implementation to collapse.
The critic is NOT a naming reviewer — stylistic feedback is noise.

**Dispatch:** Use model `opus`.

**If critic returns REVISION REQUIRED:**
- Fix the file map inline in the plan document
- Re-dispatch the critic (it re-reads the full file map, not just the diff)
- Repeat until APPROVED

**If critic returns APPROVED:** append `<!-- arch-critic: APPROVED -->` as a comment
after the File Map table, then proceed to writing bite-sized tasks.

**Do not write tasks until the architecture critic approves.** Structural errors found
after tasks are written cascade into every task — far cheaper to catch at the file map stage.

```

- [ ] **Step 5: Update `writing-plans/SKILL.md` — add to Prompt Templates equivalent**

Find the `## Plan Critic` section (which references `./plan-critic-prompt.md`). In the same spirit, add `./arch-critic-prompt.md` to any cross-reference list that exists near Execution Handoff or at the bottom of the file. If no such list exists, skip this step.

- [ ] **Step 6: Verify section ordering**

```bash
grep -n "## File Structure\|## Architecture Critic\|## Bite-Sized Task\|## Plan Critic" \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/writing-plans/SKILL.md
```

Expected output shows lines in this order:
```
NNN:## File Structure
NNN:## Architecture Critic
NNN:## Bite-Sized Task Granularity
NNN:## Plan Critic
```

---

### Task 3: Schema critic — prompt + finishing-a-development-branch integration

**Files:**
- Create: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/schema-critic-prompt.md`
- Modify: `~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/SKILL.md`

- [ ] **Step 1: Create `schema-critic-prompt.md`**

```bash
cat > ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/schema-critic-prompt.md << 'ENDOFFILE'
# Schema Critic Prompt Template

Use this template when dispatching a schema critic subagent.

**Purpose:** Attack DB migrations adversarially — find what will cause data loss,
table locks, or a broken rollback path in production.
The critic is NOT a schema design reviewer.

**Dispatch when:** Migration files are detected in the branch diff before shipping.

**Model:** Use the most capable available model (opus).

---

## Prompt

```
Task tool (general-purpose):
  description: "Schema critic: adversarial review of migrations in [BRANCH_NAME]"
  prompt: |
    You are a schema critic. Your job is to try to BREAK these database migrations —
    find what will cause data loss, table locks, or a broken rollback path in production.

    You are NOT a schema design reviewer. You are an adversary.

    **Migration files to attack:** [MIGRATION_FILE_PATHS]

    Read each migration file fully before forming any opinion.
    Also read the rollback/down migration if it exists.

    ---

    ## Attack Vectors

    Work through each of these systematically. For each, state what you found
    or "no issue" if clean.

    ### 1. Irreversibility and rollback
    - Does a rollback/down migration exist for every up migration?
    - Can the rollback be run safely AFTER the up migration has already processed
      production data? (i.e., does the rollback DROP data that was created by the up?)
    - Is the migration idempotent? Can it be run twice without error?
    - Are there irreversible operations (DROP COLUMN, DROP TABLE, data transformation)
      with no recovery path?

    ### 2. Lock duration and table availability
    - Which ALTER TABLE statements will acquire an exclusive lock?
    - On a table with millions of rows, how long will that lock be held?
    - Are there index creations that should use CREATE INDEX CONCURRENTLY?
    - Are there operations that should use a shadow table / online schema change tool?
    - Will this migration cause a maintenance window or can it run zero-downtime?

    ### 3. Backwards compatibility window
    - Will the OLD application code (already deployed) break if this migration runs
      before the new code deploy? (Column renamed/removed that old code reads)
    - Does the migration assume the new code is already deployed?
    - Is there a safe deployment order? (migrate-first or code-first)
    - For the window where old code + new schema coexist: does the old code crash,
      silently corrupt data, or continue working?

    ### 4. Data safety
    - Does any transformation step overwrite data without a backup or reversible step first?
    - Are there type changes (e.g., VARCHAR → INT) that will silently truncate or fail
      on existing values that don't fit?
    - Does adding NOT NULL without DEFAULT assume all existing rows will be updated first?
      (On a live table this is a data error, not just a schema error)
    - Are there UPDATE or DELETE statements on existing data? Is the WHERE clause correct?
      (A missing WHERE clause is the most common production disaster)

    ### 5. Constraint and index ordering
    - Are foreign key constraints added BEFORE the referenced data exists?
    - Are indexes created BEFORE or AFTER bulk inserts?
      (Creating indexes after bulk insert is 10x faster)
    - Are NOT NULL constraints applied before the column is populated?
    - Are unique constraints applied before duplicates are resolved?

    ### 6. Query performance after migration
    - Is there a query in the codebase that will do a full table scan after this migration?
      (e.g., a new foreign key column without an index, a new filterable column without an index)
    - Does removing an index break a query that the ORM generates automatically?
    - Are new join columns indexed on both sides?

    ### 7. Multi-tenant, multi-region, and environment concerns
    - Does this migration run per-tenant (row-level) or globally?
      (If per-tenant and there are 1000 tenants, running time = 1000x)
    - Are there timezone assumptions in DEFAULT NOW() or timestamp transformations?
    - Will this migration produce different results in dev vs staging vs prod
      due to different data volumes or existing records?
    - If this migration seeds data, will it conflict with existing seed data in non-prod?

    ---

    ## Calibration

    Only raise issues that would cause real production harm:
    - Table locked for >5 seconds on a live table
    - Data loss with no recovery path
    - Old application code crashes after migration runs
    - Migration fails midway with no clean rollback
    - Silent data corruption

    Do NOT raise:
    - Naming preferences
    - Schema design opinions ("I would have normalised this differently")
    - Performance concerns that are not caused by this migration
    - Theoretical future concerns unrelated to this migration

    An issue is real if running this migration on a production database would cause it.
    An issue is not real if it requires the production database to be in an unusual state.

    ---

    ## Output Format

    Status: APPROVED
    or
    Status: REVISION REQUIRED

    If APPROVED: one sentence on why this migration is safe to run in production.

    If REVISION REQUIRED:

    ### Critical (will cause production harm)
    - **[Attack vector, Migration file:line]:** [Specific description of the problem]
      *Evidence:* [Quote from migration that shows the issue]
      *Fix:* [What the author needs to change — be specific]

    ### Significant (will cause confusion or operational risk)
    - **[Attack vector, Migration file:line]:** [Specific description]
      *Evidence:* [Quote]
      *Fix:* [Specific change needed]

    Do not include stylistic suggestions. Do not include a "Recommendations" section.
    If it's not critical or significant, don't mention it.

    If there are no issues: APPROVED. Don't invent problems to seem thorough.
```

---

**After critic returns:**

- If **APPROVED**: proceed to merge/PR options.
- If **REVISION REQUIRED**: fix the migration, then dispatch critic again.
  - Do not ship until critic returns APPROVED.
  - Critic re-reads the full migration on re-dispatch (do not summarise changes).
ENDOFFILE
```

- [ ] **Step 2: Create `api-critic-prompt.md`**

```bash
cat > ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/api-critic-prompt.md << 'ENDOFFILE'
# API Contract Critic Prompt Template

Use this template when dispatching an API contract critic subagent.

**Purpose:** Attack API changes adversarially — find breaking changes, auth gaps,
and scalability traps baked into the contract.
The critic is NOT an API design reviewer.

**Dispatch when:** API endpoint, route, controller, GraphQL schema, or OpenAPI spec
files are detected in the branch diff before shipping.

**Model:** Use the most capable available model (opus).

---

## Prompt

```
Task tool (general-purpose):
  description: "API contract critic: adversarial review of API changes in [BRANCH_NAME]"
  prompt: |
    You are an API contract critic. Your job is to try to BREAK these API changes —
    find breaking changes, authentication gaps, and scalability traps baked into
    the contract before they ship.

    You are NOT an API design reviewer. You are an adversary.

    **Branch diff to attack:** run `git diff [BASE_SHA]...[HEAD_SHA]` and focus on
    API-related files (routes, controllers, resolvers, handlers, OpenAPI specs).

    **BASE_SHA:** [BASE_SHA]
    **HEAD_SHA:** [HEAD_SHA]

    Read the full diff before forming any opinion.

    ---

    ## Attack Vectors

    Work through each of these systematically. For each, state what you found
    or "no issue" if clean.

    ### 1. Breaking changes without versioning
    - Are any response fields removed or renamed without a deprecation path?
    - Are any field types changed in a non-backwards-compatible way?
      (string → string[], optional → required, number → string)
    - Are any HTTP status codes changed for existing endpoints?
      (200 → 201, 400 → 422 — clients often hardcode these)
    - Are any endpoint paths changed without redirects or API versioning?
    - Are any request parameters removed that existing clients might send?

    ### 2. Authentication and authorization gaps
    - Are any new endpoints accessible without authentication?
    - Do new endpoints enforce the same authorization rules as similar existing endpoints?
    - Is there a new admin/internal endpoint accessible to regular users?
    - Are there new query parameters that bypass existing access controls?
      (e.g., `?userId=123` that lets any user read another user's data)

    ### 3. Implicit client coupling
    - Is there client-side code (frontend, mobile, SDK) that hardcodes the old
      response shape and will break silently?
    - Are there generated TypeScript types, OpenAPI clients, or SDKs that need
      regenerating after this change?
    - Does any external consumer (partner API, webhook subscriber) depend on the
      old contract?

    ### 4. Scalability traps baked into the contract
    - Does any new list endpoint lack pagination (limit/offset or cursor)?
      (Once shipped, adding pagination is a breaking change)
    - Does the contract force the client to make N+1 requests for what should be one?
      (e.g., list endpoint returns IDs only, client must fetch each separately)
    - Is there a response payload that will grow unboundedly as data grows?
      (returning all records, all tags, all history)
    - Does any endpoint do a full-table scan implied by the contract?

    ### 5. Error contract consistency
    - Do new endpoints use the same error response format as existing ones?
      (mixing `{ error: "..." }` with `{ message: "...", code: "..." }` is a client trap)
    - Are validation errors returned with the same structure as infrastructure errors?
    - Are HTTP status codes used correctly and consistently?
      (401 vs 403, 400 vs 422, 404 vs 410)
    - Are error messages safe to expose to the client?
      (no stack traces, no internal IDs, no SQL errors)

    ### 6. Versioning and deprecation strategy
    - Is this a breaking change that requires a version bump (v1 → v2)?
    - Are removed/changed fields marked as deprecated first in a prior release?
    - Is there a migration path documented for consumers of the old contract?
    - If this is a versioned API, is the old version still supported?

    ### 7. Contract documentation completeness
    - Is the OpenAPI/Swagger spec updated if one exists?
    - Are new request fields documented (required vs optional, types, constraints)?
    - Are new authentication requirements documented?
    - Are new error codes documented?

    ---

    ## Calibration

    Only raise issues that would cause real breakage or security problems:
    - Client 500s or silent data corruption after deploy
    - Auth bypass that exposes private data
    - Contract that will be impossible to evolve in 6 months
    - Scalability trap that manifests at 100x current load

    Do NOT raise:
    - API design opinions ("I would have used REST differently")
    - Naming preferences
    - Performance concerns unrelated to the contract shape
    - Internal implementation concerns

    An issue is real if a client following the documented contract would break or
    a security control would be bypassed.

    ---

    ## Output Format

    Status: APPROVED
    or
    Status: REVISION REQUIRED

    If APPROVED: one sentence on why these API changes are safe to ship.

    If REVISION REQUIRED:

    ### Critical (will cause client breakage or security issue)
    - **[Attack vector, Endpoint/file:line]:** [Specific description of the problem]
      *Evidence:* [Quote from diff that shows the issue]
      *Fix:* [What the author needs to change — be specific]

    ### Significant (will cause future pain or operational risk)
    - **[Attack vector, Endpoint/file:line]:** [Specific description]
      *Evidence:* [Quote]
      *Fix:* [Specific change needed]

    Do not include stylistic suggestions. Do not include a "Recommendations" section.
    If it's not critical or significant, don't mention it.

    If there are no issues: APPROVED. Don't invent problems to seem thorough.
```

---

**After critic returns:**

- If **APPROVED**: proceed to merge/PR options.
- If **REVISION REQUIRED**: fix the API changes, then dispatch critic again.
  - Do not ship until critic returns APPROVED.
  - Critic re-reads the full diff on re-dispatch.
ENDOFFILE
```

- [ ] **Step 3: Verify both files created**

```bash
ls -la ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/
```

Expected: `schema-critic-prompt.md` and `api-critic-prompt.md` appear alongside `SKILL.md`.

- [ ] **Step 4: Verify anchor string exists in `finishing-a-development-branch/SKILL.md`**

```bash
grep -n "If tests pass\|Step 2\|Determine Base Branch" \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/SKILL.md
```

Expected: a line containing `**If tests pass:** Continue to Step 2.` and a line `### Step 2: Determine Base Branch`.
If wording differs, adjust Step 5 to use the exact wording found.

- [ ] **Step 5: Update `finishing-a-development-branch/SKILL.md` — add Step 1.5 pre-ship critics**

Read the SKILL.md. Find the exact text:

```
**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch
```

Replace with:

```
**If tests pass:** Continue to Step 1.5.

### Step 1.5: Pre-Ship Critics

Before presenting merge/PR options, check whether the branch contains schema or API changes
that require adversarial review.

**Detect migration files** (checks only actual migration/schema files, not docs about them):
```bash
BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
git diff --name-only "$BASE" HEAD \
  | grep -E "^(db/migrate/|migrations/|database/migrations/|.*\.sql$)" | head -20
```

If any files match, confirm with a brief list before dispatching:
```
Detected migration files: [list]. Run schema critic? (y to proceed, n to skip)
```

If confirmed → **dispatch schema critic:** use `./schema-critic-prompt.md`.
Substitute all placeholders: `[MIGRATION_FILE_PATHS]` = list of detected files,
`[BRANCH_NAME]` = current branch name (`git branch --show-current`).

- If REVISION REQUIRED: fix the migration, re-dispatch (critic re-reads full migration)
- If APPROVED: proceed

**Detect API contract files** (routes, controllers, GraphQL, OpenAPI specs only — not test files):
```bash
BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
git diff --name-only "$BASE" HEAD \
  | grep -E "^(src/routes/|src/controllers/|src/resolvers/|app/controllers/|api/|graphql/schema)" \
  | grep -v '__tests__\|\.test\.\|\.spec\.' | head -20
```

If any files match, confirm with a brief list before dispatching:
```
Detected API files: [list]. Run API contract critic? (y to proceed, n to skip)
```

If confirmed → **dispatch API contract critic:** use `./api-critic-prompt.md`.
Substitute all placeholders: `[BASE_SHA]` = output of `git merge-base HEAD main`,
`[HEAD_SHA]` = output of `git rev-parse HEAD`, `[BRANCH_NAME]` = `git branch --show-current`.

- If REVISION REQUIRED: fix the API changes, re-dispatch
- If APPROVED: proceed

**If neither detected or both skipped:** proceed to Step 2 directly.

**Do not proceed to Step 2 until all dispatched critics return APPROVED.**

### Step 2: Determine Base Branch
```

- [ ] **Step 6: Verify Step 1.5 placement**

```bash
grep -n "Step 1\b\|Step 1\.5\|Step 2\|Pre-Ship\|schema-critic\|api-critic" \
  ~/.claude/plugins/cache/local/superpowers/5.0.6/skills/finishing-a-development-branch/SKILL.md
```

Expected: "Step 1.5" and "Pre-Ship Critics" appear between the "Verify Tests" section and "Step 2: Determine Base Branch".

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Spec critic prompt with 7 attack vectors + calibration + output format | Task 1 |
| Spec critic integrated into brainstorming checklist + process flow + Self-Review section | Task 1 |
| Arch critic prompt with 7 attack vectors + calibration + output format | Task 2 |
| Arch critic integrated into writing-plans between File Structure and Bite-Sized Task Granularity | Task 2 |
| Schema critic prompt with 7 attack vectors + calibration + output format | Task 3 |
| API contract critic prompt with 7 attack vectors + calibration + output format | Task 3 |
| Both critics integrated into finishing-a-development-branch as Step 1.5 with detection logic | Task 3 |
| All critics use model opus | Tasks 1–3 |
| All critics produce `Status: APPROVED` / `Status: REVISION REQUIRED` (plain text, grep-able) | Tasks 1–3 |
| All APPROVED paths write sign-off to document | Tasks 1–3 |
| All critics: "Do not proceed until APPROVED" gate | Tasks 1–3 |

**Placeholder scan:** None — all prompt sections contain complete content.

**Type consistency:** N/A (prompt files, no types). All critics use identical output format pattern established by plan-critic.

**Key design decision:** Schema and API critics land in `finishing-a-development-branch` rather than a separate skill because that's the last human-controlled checkpoint before code merges. Detection is based on file path patterns in the branch diff — pragmatic and zero-config.

---
Status: APPROVED
Critic verdict: All anchor strings verified present in target files, heredoc pattern matches the proven plan-critic template, and each verification step is specific enough to catch wrong insertion points.
