# Plan — patterns borrowed from three open-source agent projects

Status: in progress · Epic: `great_cto-7bgx` · Started 2026-09-15

## Where these come from

Three MIT-licensed projects were read for ideas great_cto does not have yet.
Nothing is copied wholesale; each item below names what it borrows and credits
the source in the code that implements it.

| Project | What it is | Taken from it |
|---|---|---|
| [razzant/claudexor](https://github.com/razzant/claudexor) | control plane over Claude Code, Codex, Cursor, OpenCode | council planning, handoff packets, numbered invariants |
| [cbrock84/headcount](https://github.com/cbrock84/headcount) | Claude Code plugin organised as departments | diff-time write-surface guard, per-agent authority |
| [GiovanniPasq/agentic-rag-for-dummies](https://github.com/GiovanniPasq/agentic-rag-for-dummies) | agentic RAG tutorial on LangGraph | sectioned retrieval, bounded re-query with an honest gap |

Deliberately **not** taken: claudexor's multi-subscription quota rotation (a
separate product, and it rotates vendor subscriptions), its macOS app and SSH
runtime, headcount's business-department skills (outside the SDLC), and the RAG
project's LangGraph/Qdrant stack (great_cto's scripts are zero-dependency).

## The seven items, in order

Order is by value over size. Items 1 and 3 are small and close real gaps; 2 and
4 change what a run costs or how models hand off, so each gets an ADR before
code; 5–7 are small and independent.

| # | Item | Beads | Size | Needs ADR |
|---|---|---|---|---|
| 1 | Diff-time write-zone guard | `great_cto-7bgx.1` | S | no |
| 2 | Council planning for the architecture stage | `great_cto-7bgx.2` | M | yes |
| 3 | Authority per agent | `great_cto-7bgx.3` | S | no — extends ADR-009 |
| 4 | Handoff packet between models | `great_cto-7bgx.4` | M | yes |
| 5 | Numbered invariants with a verify hint | `great_cto-7bgx.5` | S | no |
| 6 | Sectioned recall + golden-question eval | `great_cto-7bgx.6` | S | no |
| 7 | Bounded re-query with an honest gap | `great_cto-7bgx.7` | S | no |

---

### 1. Diff-time write-zone guard

**Gap.** `scripts/lib/wpl.mjs` proves the Work Packet List is disjoint before a
fan-out. Nothing proves the work stayed inside it: a packet that claimed
`src/auth/*.ts` and also edited `src/db/pool.ts` passes every existing guard and
gets committed — while the packet that owns `src/db/pool.ts` edits the same file.

**Design.** `scripts/lib/lane-diff.mjs` takes the WPL, a packet name and the
packet's changed files (`git diff --name-only --no-renames <base>` plus untracked
files) and answers one of six states: `inside`, `empty`, `stray`,
`unknown-lane`, `absent`, `malformed`. A stray file names the packets that own
it — stray into another zone is a race, stray into none is drift. Session side
files (`.great_cto/**`, `.beads/**`) are ignored and reported. It runs before
the orchestrator commits, because after the commit the diff has no author.
Exit codes: 0 inside/empty, 1 stray/unknown lane, 2 usage, 3 not checked.

The glob rule keeps one owner: a directional `fileInClaim` is added to
`check-lane-overlap.mjs` next to `claimsOverlap`, because a changed
extensionless file is that file, not a directory claim.

**Acceptance.** Tests cover every state, a real git tree with a modified file,
an untracked file and a rename out of another zone, and a planted regression
fails them. `agents/coordinator.md` runs the check after each builder returns.

### 2. Council planning for the architecture stage

**Gap.** A second model reviews a finished diff (`cross-model-review.mjs`), one
reviewer. The architecture itself is drafted by one model, so its blind spots
reach `gate:arch` unchallenged.

**Design (ADR first).** Opt-in `council` for the architect stage: 2–4 models
draft in parallel into `docs/architecture/council/draft-<model>.md`; one merge
pass reads the drafts by path and writes the single ARCH doc with ONE
open-questions section — the human answers one set, not four. A failed member is
recorded and the merge proceeds with what is usable; zero usable drafts is a
typed failure, never an empty plan. Cost is estimated and shown before the run
and measured after, through the existing cost meter; unknown cost stays unknown.

**Acceptance.** ADR accepted; a run records members, per-member state and who
merged; the merged doc passes the same checks as a solo one; cost appears in the
ledger as measured or explicitly unverifiable.

### 3. Authority per agent

**Gap.** ADR-009 says an expensive-to-undo action needs a decision wherever it
sits. Whether an agent's output may land without one is still decided per
dispatch, from memory.

**Design.** An `authority:` frontmatter field on every agent — `autonomous`
(take the result), `proposes` (show the diff before it lands), `escalates` (do
not dispatch unasked). The agent linter requires the field, rejects `proposes`
or `escalates` on a read-only reviewer (nothing to gate), and reports agents that
defaulted. The coordinator reads it when deciding whether to surface a diff.

**Acceptance.** All 70 agents declare it; the linter fails on a missing or
contradictory value; devops, infra-provisioner and db-migration-reviewer are not
`autonomous`.

### 4. Handoff packet between models

**Gap.** When Codex picks up work Claude started (or back), the receiving model
gets context by prompt text or `HANDOFF.md`, and nothing records whether it
resumed its own session, got a packet, or started cold.

**Design (ADR first).** Write only the turns the receiving model has not seen to
a file under the run directory and reference it by path; past a byte budget the
oldest turns are condensed. Every handoff records `native_resume`, `packet` or
`fresh` in the run's events, so a surprising result can be traced to what the
model actually knew.

**Acceptance.** ADR accepted; codex-pipeline stage transitions write the packet
and the event; a test pins that a second handoff to the same model carries only
the delta.

### 5. Numbered invariants with a verify hint

**Design.** Promote the load-bearing rules in CLAUDE.md (privacy, telemetry
off by default, three states not two, gates follow reversibility) into
`docs/INVARIANTS.md`, each with a stable `INV-NNN` id and a `verify:` line naming
the test or hook that proves it. An invariant with no check is marked as such.
A commit that edits the file carries `INVARIANT-CHANGE(INV-NNN)`; the pre-push
hook refuses one without it.

**Acceptance.** Every invariant has an id and a verify line; a test fails when a
`verify:` names a file that does not exist.

### 6. Sectioned recall + golden-question eval

**Design.** `memory-search.mjs` ranks whole documents. Index headed sections as
the unit (child), return the whole section it belongs to (parent), so `/recall
quota` lands on the ADR section about quota instead of the first 40 lines of the
file. Add `tests/eval/recall-golden.json` — questions whose correct section is
known — and a test that reports hit@3.

**Acceptance.** hit@3 on the golden set is measured before and after; the change
ships only if it does not drop.

### 7. Bounded re-query with an honest gap

**Design.** `/recall` tries a second, simpler query when the first returns
nothing relevant, with a hard cap of three searches, and ends with what was
found and what was not — never an answer assembled from nothing.

**Acceptance.** The command states the cap; a test pins that a query with no
match produces a gap statement, not an empty success.

## Decomposition

Items touch disjoint files except 6 and 7 (both `commands/recall.md`), which run
sequentially.

| Stream | Write-zone (files/dirs) | Depends on | Why parallel-safe |
|---|---|---|---|
| 1 guard | scripts/lib/lane-diff.mjs, scripts/lib/check-lane-overlap.mjs, tests/lib/lane-diff.test.mjs, agents/coordinator.md | — | no other stream touches these |
| 3 authority | agents, scripts/lib/agent-lint.mjs | 1 | agents/coordinator.md belongs to stream 1, so it waits |
| 5 invariants | docs/INVARIANTS.md, scripts/hooks/pre-push.sh | — | disjoint |
| 6 recall sections | scripts/lib/memory-search.mjs, tests/eval/recall-golden.json | — | disjoint |
| 7 re-query | commands/recall.md | 6 | shares the recall surface |
| 2 council | docs/adr, scripts/lib/council.mjs | ADR | design first |
| 4 handoff | docs/adr, scripts/lib/codex-pipeline.mjs | ADR | design first |
