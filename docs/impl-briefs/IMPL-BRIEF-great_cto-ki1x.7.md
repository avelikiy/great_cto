# IMPL-BRIEF-great_cto-ki1x.7.md — Ledger screen

## Task
- **bd task:** `great_cto-ki1x.7` — Ledger screen: 2 KPI + pipeline strip + stuck-from-heartbeat + agent×project cost table
- **Feature:** `board-redesign-2026-09` · PLAN: `docs/plans/PLAN-board-redesign-2026-09.md`
- **Source:** `docs/product/BRIEF-board-redesign-2026-09.md` screen 2 + `docs/design/DESIGN-board-redesign-2026-09.md` §8.5 (numeric contract)
- **Implements:** BRD-R5
- **Depends on:** `great_cto-ki1x.6` (Decisions — same file, sequential single-owner)

## Files to modify
| File / glob | Why it changes |
|---|---|
| `packages/board/public/index.html` | new Ledger panel: 2 KPI band, pipeline strip from `/api/pipeline`, stuck-agent detection from `/api/heartbeat` (`updated_at`, unknown-age counted not dropped), agent×project cost table (`null`→`unmeasured`, `0`→`$0`, never the same cell), budgets merged in as thresholds (old `budgets` tab content), summed-before-rounding footnote |
| `tests/lib/board-third-state.test.mjs` | new assertions: cost-null vs cost-zero cells render differently |

## Files NOT to modify
| File / glob | Why it's off-limits | Who owns it |
|---|---|---|
| `packages/board/lib/routes.mjs` | `/api/pipeline`, `/api/heartbeat`, `/api/cost`, `/api/agent-budgets` already serve what's needed — no API change | n/a |
| Decisions/Fleet/Harness/Settings panels | separate tasks | senior-dev (Lane A) |

## Step-by-step
1. Build the 2-KPI header band — no "Cost savings vs FTE" (deleted in `great_cto-ki1x.5`), no forecast, no trend chart without a threshold line.
2. Pipeline strip from `/api/pipeline`.
3. Stuck-agent list from `/api/heartbeat`: an agent with `updated_at` older than the stuck threshold is flagged; an agent with NO `updated_at` (unknown age) is counted in its own bucket, never silently excluded.
4. Agent×project cost table: `cost_usd === null` renders `unmeasured` (absent 'unloaded' or 'none' per which is more accurate — check `fleet.mjs`'s own convention), `cost_usd === 0` renders `$0` — write a test proving these two never share a render path.
5. Merge budgets in: each cap/threshold sits ON the number it governs (BudgetBar from `great_cto-ki1x.4` if built by then, otherwise a simple bar using the same token contract).
6. Summed-before-rounding footnote wherever a rounded-rows-above-a-total table appears (DESIGN §8.5 exact footnote text).

## API-CONTRACT
- **Surface:** consumes `/api/pipeline`, `/api/heartbeat`, `/api/cost`, `/api/agent-budgets` — all existing, no new route.
- **Input:** none new.
- **Output (success):** rendered KPI band + tables; every currency figure uses `Intl.NumberFormat` for minor-unit precision (no hardcoded `.toFixed(2)`).
- **Errors:** a heartbeat entry with unparseable `updated_at` counts as unknown-age, not silently dropped from the stuck count.
- **Invariants:** `null` and `0` cost NEVER render identically.

## TEST-SPEC
| # | Case | Expected |
|---|---|---|
| 1 | agent with `cost_usd: null` | renders `unmeasured` |
| 2 | agent with `cost_usd: 0` | renders `$0` |
| 3 | heartbeat entry with no `updated_at` | counted in "unknown age" bucket, not dropped |
| 4 | rounded rows above a total | footnote text present verbatim |
| 5 | any KPI tile | no trend chart without a threshold line drawn on it |

- Coverage target: ≥80%.
- Run: `node --test tests/lib/board-third-state.test.mjs packages/board/*.test.mjs`

## ACCEPTANCE
- [ ] Every row in **TEST-SPEC** has a passing test
- [ ] `board-third-state.test.mjs` green with the new null-vs-zero assertions
- [ ] No hardcoded `.toFixed(2)` on a new currency render
- [ ] No file outside **Files to modify** changed; no file in **Files NOT to modify** touched

## Out of scope / deferred
- Any forecast/projection line — explicitly refused in the brief.
- Fleet/Harness/Settings — separate tasks.

## Revision history
| Date | Author | Change |
|---|---|---|
| 2026-09-06 | pm | Initial brief |
