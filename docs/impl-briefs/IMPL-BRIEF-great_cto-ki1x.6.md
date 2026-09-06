# IMPL-BRIEF-great_cto-ki1x.6.md — Decisions screen

## Task
- **bd task:** `great_cto-ki1x.6` — Decisions screen: gate row, both reviewer cells, 3 non-verdict states, sort by cost-of-undo
- **Feature:** `board-redesign-2026-09` · PLAN: `docs/plans/PLAN-board-redesign-2026-09.md`
- **Source:** `docs/product/BRIEF-board-redesign-2026-09.md` screen 1 + `docs/design/DESIGN-board-redesign-2026-09.md` §3.1/§3.2 (wireframes), §12.5 (destructive-action rules)
- **Implements:** BRD-R3
- **Depends on:** `great_cto-ki1x.5` (nav shell) AND `great_cto-ki1x.3` (BRD-R2 reader — needed for the `unreadable` reviewer cell)

## Files to modify
| File / glob | Why it changes |
|---|---|
| `packages/board/public/index.html` | new Decisions panel: gate list sorted by `reversibilityOf().state` (expensive+unclassified first, routine last, each group by age desc), two reviewer cells per row (Claude verdict log + cross-review.log via the BRD-R1/R2 join), `GateChip` from `great_cto-ki1x.4`, typed-name approve, mobile stacking asymmetry (`≤375px`: expensive buttons stack full-width, routine may not) |
| `packages/board/gate-affordances.test.mjs` | extend for the Decisions row's paired-reviewer rendering |

## Files NOT to modify
| File / glob | Why it's off-limits | Who owns it |
|---|---|---|
| `scripts/lib/gate-reversibility.mjs` | this task READS `reversibilityOf()`, does not change its classification logic | existing owner |
| `packages/board/lib/routes.mjs` | no new API route needed — existing `/api/harnesses`, `/api/decisions`, verdict logs already carry what this screen needs | n/a |
| Ledger/Fleet/Harness/Settings panels | separate tasks | senior-dev (later Lane A tasks) |

## Step-by-step
1. Build the gate-row list: one row per waiting gate, `GateChip` for the cost-of-undo class, sorted per DESIGN §3.1's ordering rule.
2. Add the Claude-verdict cell (from `.great_cto/verdicts/code-reviewer.log`, keyed by gate/diff) and the cross-review cell (from `/api/harnesses`'s per-line `state`, now including `unreadable` from `great_cto-ki1x.3`).
3. Render the "verdicts disagree" divider when both cells have a verdict and they differ (BLOCK vs PASS).
4. Wire typed-name approve (from `GateChip`) for expensive/unclassified; single-click reject always.
5. Mobile stacking: implement the `≤375px` asymmetry exactly as DESIGN §3.2 draws it (expensive stacks, routine may not).
6. Keyboard focus lands on Reject, never Approve, on row mount (DESIGN §12.5 rule 2).

## API-CONTRACT
- **Surface:** consumes existing `/api/harnesses`, `.great_cto/verdicts/code-reviewer.log` (however the board already reads it), `reversibilityOf(gate)`. No new route.
- **Input:** none new.
- **Output (success):** a rendered gate row per waiting gate; each row's accessible name includes state word + categories (DESIGN §7.4.3).
- **Errors:** a gate absent from `gate-reversibility.mjs`'s map renders `unclassified`, sorted WITH expensive, never silently `routine`.
- **Invariants:** approve for expensive/unclassified is impossible without the typed name matching exactly; reject never requires confirmation.

## TEST-SPEC
| # | Case | Expected |
|---|---|---|
| 1 | a gate not in `GATE_COST` map | renders `unclassified`, sorts above `routine`, requires typed-name approve |
| 2 | a cross-review line missing `sha` (pre-BRD-R1) | reviewer cell shows `unreadable`, not `0`/`not reviewed`/`BLOCK` |
| 3 | Claude BLOCK + Codex PASS on same gate | "verdicts disagree" divider renders |
| 4 | 375px viewport, expensive gate | Reject/Approve buttons stack full-width |
| 5 | 375px viewport, routine gate | buttons MAY sit side by side (both ≥44px) |
| 6 | row mounts | keyboard focus is on Reject, not Approve |

- Coverage target: ≥80%.
- Run: `node --test packages/board/gate-affordances.test.mjs packages/board/harnesses.test.mjs`

## ACCEPTANCE
- [ ] Every row in **TEST-SPEC** has a passing test
- [ ] `gate-affordances.test.mjs` green with the new paired-reviewer assertions
- [ ] `unreadable` never renders as a real negative or a pass
- [ ] Mobile asymmetry matches DESIGN §3.2 exactly
- [ ] No file outside **Files to modify** changed; no file in **Files NOT to modify** touched

## Out of scope / deferred
- The disagreement-RATE metric (n too small; brief explicitly defers it, out of v1 scope).
- Ledger/Fleet/Harness — separate tasks.

## Revision history
| Date | Author | Change |
|---|---|---|
| 2026-09-06 | pm | Initial brief |
