# PLAN — A requirement that nothing downstream cites

Source: GitHub's Spec Kit (129k★, MIT, active). Its pipeline is close to ours —
constitution, specify, plan, tasks, implement all map onto things we have — and
three stages do not: `analyze` (cross-artifact consistency), `checklist` (unit
tests for the requirements themselves), and `converge`.

`analyze` is the one worth taking. `artifact-lint` checks INSIDE a document —
does the ARCH have a Risks section, does the ADR cite a file that exists. Nothing
asks the question BETWEEN documents: **did the plan cover every requirement the
brief raised?**

## Correcting my own proposal

I told the owner this was cheap because `trace.mjs` already walks
`requirement → use-case → task → test` and only needed pointing at a second
chain. Opening a real brief killed that:

```
docs/product/BRIEF-board-improvements.md
  ## Problem   ## The bet   ## Scope   ## Prioritised improvement plan
docs/architecture/ARCH-judge-provenance.md
  ## 1. The record   ## 2. Backward compatibility   ## 3. The comparison rule
```

Prose sections on both sides, and no identifier shared between them. `trace.mjs`
walks a graph of beads with labels; there is no graph here to walk. Semantic
matching would need an LLM call per pair — cost, non-determinism, and a coverage
report nobody can reproduce.

So the work is not the checker. **The work is the convention that makes a checker
possible**, and the checker is the easy half.

## The convention

A brief numbers what it asks for:

```markdown
## Scope

- **R1** — the board opens on one screen that names what needs a decision
- **R2** — an empty project reads differently from one that could not be read
- **R3** — cost per project is visible without switching to it
```

Downstream artefacts cite the ID in prose wherever they address it — ARCH
sections, plan items, bead titles. Citation is a bare `R1` token, because
anything requiring a special syntax is a syntax people forget.

## The checker

`scripts/lib/requirement-coverage.mjs`:

- `requirements(text)` — IDs a brief declares, with their one-line summary.
- `citations(text)` — IDs a downstream document mentions.
- `coverage({brief, downstream})` — three answers, deliberately not two:
  **covered**, **uncovered** (a requirement nothing downstream mentions), and
  **dangling** (a citation of an ID the brief never declared — usually a typo,
  occasionally a requirement someone deleted while work continued against it).

Reported, never blocking. A brief written before the convention has no IDs at
all, and a checker that failed on those would fail on every document in the
repository today — which is how a check gets disabled in week one.

## Scope, stated plainly

This helps FORWARD. Existing briefs and ARCH docs have no IDs and will report
"no requirements declared", which is the honest answer rather than a fabricated
zero. Retrofitting the two existing briefs is a judgement call for the owner,
not something to do silently.

## Not doing

- No `converge`. Spec Kit's "assess the codebase against the spec and append the
  unbuilt work" is a job beads already does: a task stays open until it closes.
  A second mechanism answering the same question from a different source is two
  truths about what is done.
- No `checklist` yet. "Unit tests for English" is a good reframe, but this
  repository already has three text checks, and a fourth introduced in the same
  week as the third is how a warnings pile starts.
- No blocking, no gate. The question is new; its false-positive rate is
  unmeasured, and a guard nobody trusts gets worked around.
