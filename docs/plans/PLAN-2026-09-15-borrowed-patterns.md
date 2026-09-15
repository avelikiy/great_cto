# Plan — patterns borrowed from three open-source agent projects

Status: done 2026-09-15 · Epic: `great_cto-7bgx` (closed) · Started 2026-09-15

All seven items shipped; three shipped in a different form than planned, each
explained under its item: section ranking became a section pointer (6), the
re-query became a named gap (7), and the handoff packet became a bounded,
recorded stage context (4). Commits: `c4ab362a` (1), `139d1e75` (3),
`c931804a` (5–7), `cf84b06a` (2, 4).

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

**ADR:** [ADR-025 — a council of independent architecture drafts](../adr/ADR-025-council-architecture-drafts.md) — *Proposed, awaiting a decision (it adds spend).*

### 3. Authority per agent

**Gap.** ADR-009 says an expensive-to-undo action needs a decision wherever it
sits. Whether an agent's output may land without one is still decided per
dispatch, from memory.

**Design.** An `authority:` frontmatter field on every agent — `autonomous`
(take the result), `proposes` (show the diff before it lands), `escalates` (do
not dispatch unasked). The agent linter (FM-005) requires the field, rejects
`proposes` or `escalates` on an agent with no Write/Edit tools (nothing to gate),
and pins the value for the agents whose work is expensive to undo, so it cannot
be relaxed quietly. The coordinator reads it when deciding whether to surface a
diff.

Measured before assigning: 69 of 70 agents can write — great_cto's reviewers
write their own threat models — so headcount's "a reviewer holds no surface"
becomes "an agent with no write tools is autonomous" here. Reviewers stay
autonomous: their output is a verdict document, and what it blocks is blocked by
the verdict, not by landing the document.

**Acceptance.** All 70 agents declare it; the linter fails on a missing,
invalid or contradictory value and on a pinned agent relaxed; devops and
infra-provisioner are `escalates`, senior-dev and continuous-learner `proposes`.

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

**ADR:** [ADR-026 — what a Codex stage knew](../adr/ADR-026-stage-context-packet.md) — *Proposed.*
Reading `runStage` changed the design: Codex workers are ephemeral, so there is no
"model that has seen part of the run" to send a delta to. Every stage is fresh and
gets every previous result inline, unbounded and unrecorded. The ADR moves that
context to a file referenced by path with a byte budget, and records on each
attempt what it was given — `native_resume` is reserved and never claimed.

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
file. Add `tests/fixtures/recall-golden.json` — questions whose correct section is
known — and a test that reports hit@3.

**Acceptance.** hit@3 on the golden set is measured before and after; the change
ships only if it does not drop.

**Measured (2026-09-15).** Whole-document ranking on HEAD: 12 of 14. Ranking
sections and reporting each document's best one: 10 of 14 — a short section that
repeats the query's words outranked the long document actually about the subject,
and the existing "ADR-009 ranks first" test failed. That design did not ship.
What shipped keeps the document ranking unchanged and adds only a pointer — the
best section and its line inside each result. A test pins that the pointer never
reorders results.

The golden set itself was then reviewed (ai-eval-engineer): four questions copied
words from their document's title, so they measured string matching, and none
asked about a detail inside a long document — the one case a section pointer
exists for. Revised to 16 questions, five of which name the section that answers
them. On the revised set document ranking finds the answer 11 times (lower than
12, because the questions stopped giving the answer away) and the pointer lands in
the right section 5 of 5. Those are the floors; questions are not reworded to
raise them.

### 7. Bounded re-query with an honest gap

**Design, as first written.** `/recall` tries a second, simpler query when the
first returns nothing relevant, with a hard cap of three searches, and ends with
what was found and what was not.

**Why the re-query did not ship.** memory-search's BM25 scores a document that
matches *any* query term. A query that returned nothing therefore has no term in
the corpus at all, and a query built from fewer of those terms cannot find
anything either. The retry would have cost a search and added nothing — it only
earns its place with a model that rewrites the query, and /recall runs without one.

**What shipped instead: the gap, named.** The search reports the query terms no
document contains (`not in any docs document: …`) and, per result, which terms it
matched. /recall states that gap as printed and does not fill a missing term from
general knowledge. A result matching one term of five is visibly that, instead of
reading as an answer.

**Acceptance.** A test pins that an absent term is named, that a present term is
never listed as missing, and that a query matching nothing names every term.

## Decomposition

Items touch disjoint files except 6 and 7 (both `commands/recall.md`), which run
sequentially.

| Stream | Write-zone (files/dirs) | Depends on | Why parallel-safe |
|---|---|---|---|
| 1 guard | scripts/lib/lane-diff.mjs, scripts/lib/check-lane-overlap.mjs, tests/lib/lane-diff.test.mjs, agents/coordinator.md | — | no other stream touches these |
| 3 authority | agents, scripts/lib/agent-lint.mjs | 1 | agents/coordinator.md belongs to stream 1, so it waits |
| 5 invariants | docs/INVARIANTS.md, scripts/hooks/pre-push.sh | — | disjoint |
| 6 recall sections | scripts/lib/memory-search.mjs, tests/fixtures/recall-golden.json | — | disjoint |
| 7 re-query | commands/recall.md | 6 | shares the recall surface |
| 2 council | docs/adr, scripts/lib/council.mjs | ADR | design first |
| 4 handoff | docs/adr, scripts/lib/codex-pipeline.mjs | ADR | design first |
