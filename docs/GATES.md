# Gates — where the pipeline stops and asks you

One setting decides how often the build pauses for a human: `approval-level` in
`.great_cto/PROJECT.md`. Everything below is generated from the rule in
`scripts/lib/approval-level.mjs`, which is the only place the answer lives.

```
approval-level: gates-only     # the default
```

## What each level stops for

Unregulated archetype (`web-service`, `cli-tool`, `library`, …):

| Level | Stops at | Count |
|---|---|---|
| `auto` | — | 0 |
| `product-only` | `product` · `ship` | 2 |
| **`gates-only`** (default) | `arch` · `ship` | 2 |
| `strict` | `arch` · `code` · `ship` | 3 |
| `expert` | `product` · `arch` · `plan` · `code` · `qa` · `security` · `ship` | 7 |
| `step-by-step` | same as `expert`, plus checkpoints inside each agent | 7+ |

## The floor a level cannot remove

A regulated archetype (`fintech`, `healthcare`, `regulated`, `insurance`,
`gov-public`, …) keeps `security`, `compliance`, and `ship` at **every** level,
including `auto`:

| Level | `fintech` stops at |
|---|---|
| `auto` | `security` · `compliance` · `ship` |
| `product-only` | `product` · `security` · `compliance` · `ship` |
| `gates-only` | `arch` · `security` · `compliance` · `ship` |

Choosing a lighter level is a delegation of judgement, not a compliance bypass.
An unrecognised value in `PROJECT.md` falls back to the default — a typo cannot
silently disable human review.

## Which level to pick

**`gates-only`** — you want to review the design before it is built. This is the
default because most people, most of the time, want to see the architecture.

**`product-only`** — you want to be asked *what* gets built, not *how*. The
architect, pm, and code review run without you; you approve the product brief and
the deploy. Pick this when you trust the technical judgement and the product
decision is the one you actually own.

**`strict`** — adds a stop at code review. Worth it on a codebase where a bad
merge is expensive to unwind.

**`auto`** — a hotfix, a throwaway prototype, or a repo where CI is the real
gate. On a regulated archetype it is not what its name suggests: the floor above
still applies.

**`expert` / `step-by-step`** — learning mode. Every stage asks. Slow on purpose.

## Why `ship` is in almost every row

`gate:ship` guards the operations that are expensive to undo — a deploy a user
can reach, a published package, provisioned infrastructure, a force-push. ADR-009
sets the rule: an operation gets a gate because of its cost of reversal, not
because of where it sits in the pipeline. That is why `auto` still stops there on
a regulated archetype, and why we did not weaken the default to make a shorter
marketing claim true.

## What happens at a stop

The gate is a Beads task labelled `gate`, created by the agent that reached it.
The pipeline dispatcher sees the gate is active and tells the orchestrator to
wait rather than spawn the next agent. You approve with `/inbox` or by closing
the task. Every verdict appends to the project's decision log.

If a gate is declared in `shared/pipeline.toml` but not active at your level, the
dispatcher hands off with the reason instead of waiting — a gate nobody will
create must not stall the run.

## The other axis

`effectiveGates(archetype, size, tier)` in `packages/cli/src/archetypes.ts`
models a second question: how reversible is *this particular change*
(`change_tier` T0/T1/T2). It is used by planning tools and ADR-003 describes the
two-axis model. **It does not currently drive the running pipeline** — the
dispatcher reads `approval-level` only. If you are reasoning about what your next
run will actually ask you, use the table at the top of this file.

## Scope, at write time

Gates stop the pipeline between stages. A separate check runs *inside* a stage:
while an IMPL-BRIEF is active, `scripts/hooks/edit-scope-guard.mjs` sees every
Edit/Write before it happens and answers two questions.

**Which file?** A path on the brief's `## Files NOT to modify` list is denied
outright. A path on neither list is a warning — allowlists are routinely
incomplete (a new test file, a generated artifact), and a guard that blocks on
"not listed" is one people switch off.

**How many?** A brief that allows `src/**` says yes to most of a repo, so
"which" alone cannot catch a slice that rewrites two hundred files. The guard
counts the distinct files a slice touches and says so past a threshold. Repeated
writes to one file count once — editing something forty times is not a wide
change.

| Variable | Default | Effect |
|---|---|---|
| `GREAT_CTO_MAX_SLICE_FILES` | `30` | Distinct files per slice before the guard speaks. `0` disables the count. |
| `GREAT_CTO_ENFORCE_EDIT_SCOPE` | unset | `block` turns both warnings (unlisted file, too many files) into hard denials. |
| `GREAT_CTO_DISABLE_EDIT_SCOPE` | unset | `1` turns the whole guard off. |

The count resets when the active brief changes: a new brief is a new slice.

Why a count at all — a diff nobody can hold in their head gets approved on trust
rather than read, so width is a review risk on its own, separately from whether
every file in it was permitted.
