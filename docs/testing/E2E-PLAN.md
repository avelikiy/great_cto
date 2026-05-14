# E2E test plan — pipeline + admin board

Updated: 2026-05-10

## Coverage matrix

| # | Test | Status | File | Runtime | Cases |
|---|---|---|---|---|---|
| 1 | Full pipeline (artifacts simulation) | 🟢 implemented | `tests/pipeline-e2e.test.mjs` | ~17s | 4 |
| 2 | Board admin gate approval | 🟢 implemented | `tests/board-gate.test.mjs` | ~25s | 5 |
| 3 | Cost dashboard correctness | 🟢 implemented | `tests/cost-correctness.test.mjs` | ~1.5s | 4 |
| 4 | Archetype + compliance attachment | 🟢 implemented (extended) | `tests/run-archetype-e2e.mjs` | ~5s | 26 |
| 5 | Cross-session resume | 🟢 implemented | `tests/resume-e2e.test.mjs` | ~21s | 3 |
| | **Total** | **5 of 5 done** | | **~70s** | **42** |

## Run all

```bash
node --test tests/cost-correctness.test.mjs \
            tests/board-gate.test.mjs \
            tests/pipeline-e2e.test.mjs \
            tests/resume-e2e.test.mjs
node tests/run-archetype-e2e.mjs
```

**Requires:** `bd` CLI installed (tests #1, #2, #5 — skip gracefully if `bd --version` fails).

## Test #1 — Full pipeline E2E ✅ implemented (artifacts-driven simulation)

**File:** `tests/pipeline-e2e.test.mjs` (4 cases, ~17s)

**Approach pivot:** rather than spawning a real LLM-driven pipeline (which would require an LLM provider or a complex per-agent mock), this test seeds the artifacts that an LLM-driven pipeline WOULD produce, then validates that the board's pipeline state machine correctly reflects them. This catches the same regressions as a "real" pipeline test for everything between the LLM output and the user's screen.

**What it asserts:**
1. Full 8-stage simulation: 8 verdicts seeded → `/api/pipeline` reports each stage as `status=done`
2. Cost aggregation: 8 verdict `cost=$X` entries sum correctly into `/api/cost.total_llm`
3. Cost ratio sanity ≤ 1000× (regression check for 7,638× class)
4. Gate state transitions: 2 gates open → approve plan → 1 remains → approve ship → 0 remain
5. Failed verdict mapping: `BLOCKED` verdict → stage `status=failed` (not `done`)
6. Cumulative cost across multiple feature runs (3 features × 3 agents = 9 verdicts)

**Why this matters:** the pipeline stage state machine + cost aggregator are what users SEE. If they silently break, kanban looks "stuck" or cost numbers go wrong. This test exercises the full data-flow path from disk artifacts → API → (would-be) UI.

---

## Test #2 — Board admin gate approval ✅ implemented

**File:** `tests/board-gate.test.mjs` (5 cases, ~25s)

**What it asserts:**
1. `POST /api/gates/<id>` with `action=approve` → bd task status=`closed`
2. `POST /api/gates/<id>` with `action=reject` → bd task status=`blocked`
3. Approval appends to `~/.great_cto/decisions.md` (audit trail with id, action, reason)
4. SSE stream (`/api/sse`) broadcasts an `event: tasks` payload after approval
5. Invalid action (e.g. `'maybe'`) returns HTTP 400

**Approach taken:** dropped Playwright dependency. Test exercises the API layer + SSE stream directly via `fetch` + `ReadableStream.getReader()`. Validates the human-in-the-loop contract without needing DOM assertions.

**Why this matters:** the gate-approval flow is the core UX of great_cto — if `bd update`, decisions.md append, or SSE broadcast silently break, the kanban becomes a read-only museum. This test catches all three break-modes.

---

## Test #3 — Cost dashboard correctness ✅ implemented

**File:** `tests/cost-correctness.test.mjs`

**What it asserts:**
1. **Sum check:** `total_llm` matches sum of seeded verdict `cost=$X` values
2. **Daily breakdown:** today/yesterday buckets isolate correctly
3. **Ratio sanity bounds:** `total_human / total_llm` is in `[0, 1000]` — the 7,638× regression check
4. **Empty state:** zero verdicts → zero cost, ratio = 0

**Why it matters:** directly defends against the class of bug that produced the 7,638× claim (outdated pricing, missing context tokens, double-counting).

---

## Test #4 — Archetype detection + compliance ✅ implemented (extended)

**File:** `tests/run-archetype-e2e.mjs`

**Coverage:** 26 fixture projects → expected archetype + expected compliance set.

**Extensions added in this session:**
- Asserts expected compliance keys per fixture (was: just displayed)
- Asserts confidence band (high / medium for known signatures)

---

## Test #5 — Cross-session resume ✅ implemented

**File:** `tests/resume-e2e.test.mjs` (3 cases, ~21s)

**What it asserts:**
1. **Pipeline state survives board restart:**
   - Seed 3 verdicts + 1 open gate + 2 WIP tasks
   - Start board on port A, snapshot `/api/resume` → kill
   - Start fresh board on port B against same HOME + project
   - Assert: 3 verdicts recovered, 1 gate recovered, 2 WIP recovered
   - Assert: counts match pre-restart snapshot exactly

2. **Gate approval persists across restart:**
   - Approve `gate:plan`, kill board
   - Restart → `/api/resume.open_gates` shows only `gate:ship` remaining
   - `/api/inbox.summary.gates` agrees

3. **Decisions log preserves audit trail:**
   - Approve gate with unique marker reason
   - Restart → `/api/decisions` still returns the entry with that marker

**Persistence sources covered:**
- `~/.great_cto/verdicts/*.log` → recent_verdicts (filesystem)
- `.beads/` database (bd CLI's Dolt-embedded storage) → open_gates, wip_tasks
- `~/.great_cto/decisions.md` → project-scoped decisions (append-only audit)

---

## CI integration

Tests #3 and #4 are fast enough to run on every PR. Add to `.github/workflows/ci.yml`:

```yaml
- run: node --test tests/cost-correctness.test.mjs tests/board/*.test.mjs
- run: node tests/run-archetype-e2e.mjs
```

Tests #1, #2, #5 are slow — run on `main` only.
