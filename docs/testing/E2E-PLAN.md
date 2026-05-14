# E2E test plan — pipeline + admin board

Updated: 2026-05-10

## Coverage matrix

| # | Test | Status | File | Runtime |
|---|---|---|---|---|
| 3 | Cost dashboard correctness | 🟢 implemented | `tests/cost-correctness.test.mjs` | ~3s |
| 4 | Archetype + compliance attachment | 🟢 implemented (extended) | `tests/run-archetype-e2e.mjs` | ~5s |
| 2 | Board admin gate approval | 🟡 scaffolded | `tests/board-gate.test.mjs` | ~30s |
| 1 | Full pipeline E2E | 🔴 spec only | TBD | 3–5min |
| 5 | Cross-session resume | 🔴 spec only | TBD | 1–2min |

## Run all

```bash
node --test tests/cost-correctness.test.mjs
node tests/run-archetype-e2e.mjs
```

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

## Test #2 — Board admin gate approval (scaffolded)

**Status:** Scaffolded. Needs UI assertion library (Playwright recommended).

**Workflow:**
```
1. start board → open localhost:3141
2. seed pending gate via .great_cto/gates/plan.pending
3. assert: kanban shows card in "Waiting" column
4. assert: gate panel shows ARCH doc preview
5. POST /api/gates/plan/approve { decision: 'approved' }
6. assert: SSE event /events fires within 500ms
7. assert: .great_cto/gates/plan.approved file written
8. assert: card moves to "In Progress" column
9. assert: .great_cto/decisions.md got new entry
```

**Blocker:** none — can be implemented with `fetch` for API and `EventSource` for SSE. Skipping UI DOM checks keeps it dependency-free.

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
