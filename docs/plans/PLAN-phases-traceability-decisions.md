# Plan — Phases, Traceability, Decision Log

> Goal: add three concepts with minimum code added to `great_cto`.

**Guiding principles** (from Karpathy guidelines, already adopted in spirit):
- Simplicity First — no new commands, no new agents
- Surgical Changes — every new line traces to one of the three items below
- Reuse existing primitives: `bd` for traceability, `.great_cto/PROJECT.md` for
  config, `docs/` for artifacts

---

## What we're NOT doing (scope guard)

- ❌ No new commands (we just cut to 5 primary)
- ❌ No new agents
- ❌ No separate MCP servers — we reuse Claude Code + `bd`
- ❌ No graph visualization (SVG/graphviz) — text output only
- ❌ No phase lifecycle automation ("when do you move to review?") — manual switch

---

## Feature 1 — Active Phase

### Problem
All 7 agents load the same context regardless of what stage the project is at.
A tech-lead in `planning` phase doesn't need QA history; a senior-dev in
`implementation` doesn't need roadmap docs; a reviewer in `release` doesn't
need architecture brainstorm notes.

### Design

**New field in `.great_cto/PROJECT.md`:**
```yaml
phase: planning  # planning | implementation | review | release
```
Default: `implementation` (most common state).

**Phase semantics:**
| Phase | Loaded context | Skipped |
|---|---|---|
| `planning` | PROJECT.md, brain.md, RFCs, latest ADR | QA reports, CSO reports, perf baseline |
| `implementation` | PROJECT.md, brain.md, HANDOFF.md, latest ARCH | RFCs, retros, roadmap |
| `review` | PROJECT.md, HANDOFF.md, latest QA + CSO, coverage delta | RFCs, brainstorm |
| `release` | PROJECT.md, HANDOFF.md, GATE:SHIP data, perf baseline | all historical docs |

### Files to touch

1. **`.claude-plugin/plugin.json`** — `SessionStart` hook:
   - Read `phase:` from PROJECT.md (default `implementation`)
   - Replace the 7 hardcoded `cat .great_cto/*.md` calls with a phase-filtered
     loop (bash case statement)
   - ~15 lines added, ~10 lines removed

2. **`skills/great_cto/SKILL.md`** — Intent Mapping table:
   - Add row: `"switch to planning"/"review phase"/etc` → update `phase:` in
     PROJECT.md
   - ~5 lines

3. **`commands/start.md`** — scaffold `phase: implementation` in generated
   PROJECT.md (when type is not greenfield). ~2 lines.

4. **`packages/cli/src/bootstrap.ts`** — CLI-generated PROJECT.md gets
   `phase: implementation` line. ~1 line.

### Success criteria (verifiable)

- [ ] `grep "^phase:" .great_cto/PROJECT.md` returns the current phase
- [ ] SessionStart hook output differs between phases (unit test with 4 fixture
      PROJECT.md files)
- [ ] "switch to review" in chat updates PROJECT.md and next SessionStart
      reflects it
- [ ] No broken behavior when `phase:` field is absent (backward compat)

### Rollback
Remove the one case-statement block from SessionStart hook. Everyone falls back
to loading everything. Zero cost to revert.

---

## Feature 2 — Traceability Graph (reuse `bd`)

### Problem
No easy way to answer "if I change requirement R-007, what breaks?" — the
info is scattered across `bd` deps, ARCH docs, and test files.

### Design: reuse what exists

`bd` already tracks task dependencies (`bd dep T2 T1`). We extend this to
requirements and test-cases via **labels** (not new storage):

```
bd create "REQ: checkout supports Apple Pay" --label req --label feature-checkout
→ returns R-042
bd create "IMPL: Apple Pay button + flow" --label impl --label feature-checkout
→ returns I-087
bd dep I-087 R-042                               # impl implements req
bd create "TEST: Apple Pay happy path" --label test --label feature-checkout
bd dep T-113 I-087                               # test verifies impl
```

No new storage. Labels give us the graph for free:
- `bd list --label req` → all requirements
- `bd list --label feature-checkout` → everything for the feature
- `bd deps R-042` → impact analysis (what depends on this req)

### New artifact: traceability report (on demand)

Add inside existing `/review` command (no new command): a "trace" subsection
that produces a text report when asked.

```
/review trace R-042
→ R-042 (REQ) "checkout supports Apple Pay"
   ↳ I-087 (IMPL) "Apple Pay button + flow"      status=closed
     ↳ T-113 (TEST) "Apple Pay happy path"       status=closed
     ↳ T-114 (TEST) "Apple Pay network fail"     status=open ⚠
   ↳ I-092 (IMPL) "server-side token validation" status=in-progress
Coverage: 2/3 impls closed | 1/2 tests closed ⚠
```

### Files to touch

1. **`agents/tech-lead.md`** — after writing ARCH doc, create `REQ:` tasks in
   `bd` and wire them to impl tasks via `bd dep`. ~15 lines in existing task
   creation section.

2. **`agents/senior-dev.md`** — when claiming an `impl` task, check if it has
   `req` dependencies and mention them in PR description. ~5 lines.

3. **`agents/qa-engineer.md`** — when creating test tasks, `bd dep` them to the
   impl task they verify. ~5 lines.

4. **`commands/review.md`** — new section `## Trace mode` with the text
   rendering logic. ~40 lines. Triggered by `/review trace <id>`.

### Success criteria

- [ ] After running full pipeline, `bd list --label req` returns >0 tasks
- [ ] `/review trace <req-id>` produces a text tree
- [ ] Test case: modify PROJECT.md for smart-contract type → pipeline creates
      REQ tasks from ARCH doc → trace shows full chain

### Rollback
Remove label conventions from agents. `bd` keeps working; existing pipelines
unaffected. `/review trace` block can be deleted in one edit.

---

## Feature 3 — Decision Log (first-class)

### Problem
ADRs cover **architecture** decisions (docs/architecture/ADR-*.md) but the
team makes many non-architectural decisions that get lost:
- "We're deprecating Redis — use Postgres LISTEN/NOTIFY"
- "PRs require 1 reviewer (down from 2)"
- "Vendor X failed eval, went with Y"
- "Skipping formal verification for MVP — accept risk"

Today: buried in Slack / brain.md / nowhere.
Solution: Decision Log as separate artifact.

### Design: single append-only file

**New file:** `docs/decisions/DECISIONS.md` (not per-decision files — too
noisy; one file is scannable).

Format:
```markdown
# Decision Log

## D-0001 — 2026-04-19 — Redis → Postgres LISTEN/NOTIFY
**Context:** Redis added operational burden, single-tenant traffic doesn't justify it.
**Decision:** Migrate pub/sub to Postgres LISTEN/NOTIFY over next sprint.
**Alternatives considered:** Keep Redis, move to NATS.
**Reversible:** yes (2 weeks to rebuild Redis setup)
**Owner:** @cto
**Related:** bd:T-204, ADR-012

## D-0002 — 2026-04-17 — MVP ships without formal verification
**Context:** Smart-contract archetype mandates formal verification. MVP launch
             timeline doesn't allow 2-week Certora engagement.
**Decision:** Ship MVP with Slither + Echidna only. Formal verification before
              any deposits >$10k.
**Alternatives considered:** Delay launch 2 weeks.
**Reversible:** partial (can add post-launch, but audit cost doubles)
**Owner:** @cto
**Related:** ADR-008, gate:ship-waived
```

**Distinction from ADR:**
- ADR: architectural trade-off, usually irreversible, per-file, technical
- Decision: any non-trivial choice, may be reversible, one-file log,
  may be process/people/vendor

### Files to touch

1. **`agents/tech-lead.md`** — when writing ARCH doc AND a decision is logged
   in prose there, extract and append to DECISIONS.md. ~15 lines.

2. **`commands/inbox.md`** — show "Recent decisions" section (last 3 from
   DECISIONS.md). ~10 lines in the existing rendering block.

3. **`commands/start.md`** — scaffold empty `docs/decisions/DECISIONS.md`
   with template header. ~5 lines.

4. **`skills/great_cto/SKILL.md`** — Intent Mapping:
   - Add row: `"log decision"/"we decided X"` → append to DECISIONS.md with
     next D-NNNN id. ~5 lines.

### Success criteria

- [ ] `docs/decisions/DECISIONS.md` exists after `/start`
- [ ] "we decided to skip formal verification" in chat → appends entry with
      sequential ID, fills template, prompts for missing fields
- [ ] `/inbox` shows latest 3 decisions in its output
- [ ] `grep "^## D-" docs/decisions/DECISIONS.md | wc -l` counts entries
      correctly

### Rollback
Delete the file and the 3 snippets. ADRs continue unchanged.

---

## Implementation order

1. **Decision Log first** (smallest, zero-risk, immediately useful)
2. **Phases second** (medium complexity, touches hook — test carefully)
3. **Traceability last** (most surface area — agents + review command)

Each ships independently. No feature blocks another.

## Estimated size

| Feature | LOC added | Files touched | Risk |
|---|---|---|---|
| Decision Log | ~35 | 4 | low |
| Phases | ~25 | 4 | medium (hook changes) |
| Traceability | ~65 | 4 | low (additive) |
| **Total** | **~125** | **9 unique files** | — |

We're adding ~125 lines to an existing system. That's the point.

## CHANGELOG entry (when done)

```
## [1.0.62] — 2026-04-XX
### Added
- `phase:` field in PROJECT.md for context-filtered SessionStart
- Decision Log artifact at docs/decisions/DECISIONS.md
- `/review trace <id>` for requirement→impl→test impact analysis via bd labels
```

---

## Open questions for CTO

1. **Phase default:** `implementation` or `planning` for new projects?
   Recommend `implementation` — most sessions aren't greenfield.
2. **Decision Log location:** `docs/decisions/` or `.great_cto/decisions/`?
   Recommend `docs/decisions/` — it's for humans to read, should live next
   to ADRs.
3. **Traceability scope:** Do it for all pipelines, or only for archetypes
   with regulatory requirements (`regulated`, `commerce`, `web3`)? Recommend
   **all pipelines** — coverage is the whole point; gating it by archetype
   halves the value.
4. **Ship as single v1.0.62 or three patches (62/63/64)?** Recommend three
   patches — each is independently useful and revertable.
