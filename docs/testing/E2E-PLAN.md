# E2E test plan — pipeline + admin board

Updated: 2026-05-10

## Coverage matrix

| # | Test | Status | File | Runtime |
|---|---|---|---|---|
| 2 | Board admin gate approval | 🟢 implemented | `tests/board-gate.test.mjs` | ~25s |
| 3 | Cost dashboard correctness | 🟢 implemented | `tests/cost-correctness.test.mjs` | ~1.5s |
| 4 | Archetype + compliance attachment | 🟢 implemented (extended) | `tests/run-archetype-e2e.mjs` | ~5s |
| 1 | Full pipeline E2E | 🔴 spec only | TBD | 3–5min |
| 5 | Cross-session resume | 🔴 spec only | TBD | 1–2min |

## Run all

```bash
node --test tests/cost-correctness.test.mjs tests/board-gate.test.mjs
node tests/run-archetype-e2e.mjs
```

**Requires:** `bd` CLI installed (board-gate test only — skips gracefully if `bd --version` fails).

## Test #1 — Full pipeline E2E (spec only)

**Status:** Not yet implemented. Requires mock-LLM extension.

**Workflow:**
```
/start "add Stripe webhook with sig verify"
  → architect spawns → ARCH-stripe-webhook.md + ADR written
  → gate:plan opens, simulate approval via .great_cto/gates/plan.approved
  → pm decomposes → 4 beads tasks created
  → senior-dev claims first task, implements with stub LLM
  → code-reviewer runs → verdict written
  → qa-engineer runs → tests scaffolded
  → security-officer runs → threat model attached
  → gate:ship opens, simulate approval
  → devops "deploys" (dry-run)
```

**Assertions:**
- 7 artifacts in `.great_cto/{arch,verdicts,gates,memory}/`
- `bd list --closed` shows 4 closed tasks in dependency order
- `.great_cto/cost-history.log` accumulates entries for all 7 agents
- Final verdict: `ship: approved`

**Blocker:** needs `scripts/mock-llm.py` extended with per-agent deterministic responses (currently it's a single canned response).

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

## Test #5 — Cross-session resume (spec only)

**Status:** Not yet implemented.

**Workflow:**
```
1. /start "add billing endpoint"
2. let pipeline reach senior-dev mid-task
3. assert: 3 verdicts written, 1 gate pending, 2 beads tasks open
4. kill claude/cursor process mid-pipeline
5. wait 5s
6. start fresh session, run /resume
7. assert: board shows correct state from disk
8. assert: bd list returns same 2 open tasks
9. assert: pending gate still pending (not auto-resolved)
10. simulate gate approval → pipeline picks up where it left off
11. completes WITHOUT re-running already-done agents
```

**Blocker:** needs full pipeline (#1) implemented first.

---

## CI integration

Tests #3 and #4 are fast enough to run on every PR. Add to `.github/workflows/ci.yml`:

```yaml
- run: node --test tests/cost-correctness.test.mjs tests/board/*.test.mjs
- run: node tests/run-archetype-e2e.mjs
```

Tests #1, #2, #5 are slow — run on `main` only.
