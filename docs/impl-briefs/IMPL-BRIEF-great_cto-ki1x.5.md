# IMPL-BRIEF-great_cto-ki1x.5.md — Nav shell cutover

## Task
- **bd task:** `great_cto-ki1x.5` — Nav shell cutover: 4-destination model + delete kanban/share/notifications tabs + delete dead dashboard KPIs
- **Feature:** `board-redesign-2026-09` · PLAN: `docs/plans/PLAN-board-redesign-2026-09.md`
- **Source:** `docs/product/BRIEF-board-redesign-2026-09.md` (IA table, "What must NOT be on the board") + `docs/design/DESIGN-board-redesign-2026-09.md` §5, §13 step 8
- **Depends on:** `great_cto-ki1x.4` (Foundation — needs StatusDot/ABSENCE for the nav's `FLEET !` glyph)

## Files to modify
| File / glob | Why it changes |
|---|---|
| `packages/board/public/index.html` | nav markup (~L3096), `switchTab`/`cmdkActions` `Go` remap; delete dashboard KPI tiles `'Cost savings vs FTE'` (~L7184/7193), `'Rework rounds'` (~L7224), `'Retire candidates'` (~L8045); demote `renderKanban` (~L6829) to `#/kanban`-only; retire `renderShareState` (~L7294) and `renderNotifDrawer` (~L8693) as top-level surfaces (logic moves to Settings rows in `great_cto-ki1x.11`, this task just detaches them from the tab bar/drawer) |

## Files NOT to modify
| File / glob | Why it's off-limits | Who owns it |
|---|---|---|
| `packages/board/lib/routes.mjs` | `/api/tasks`, `/api/share`, `/api/push/*`, `/api/notif-history` all stay — this task changes the MENU, not the API | n/a |
| Decisions/Ledger/Fleet/Harness/Settings screen bodies | those are built in `great_cto-ki1x.6/.7/.8/.9/.11` — this task only builds the SHELL they mount into | senior-dev (later Lane A tasks) |

## Step-by-step
1. Replace the 8-tab nav with the 4-item model (`Decisions`/`Ledger`/`Fleet`/`Harness`), `role="tablist"`, arrow-key traversal, existing focus trap (~L7777) kept.
2. Remove the 3 named dashboard KPI tiles (grep exact strings above) — these are refusals in the brief ("fleet-wide aggregates over unknowns", "vanity counts"), not features to relocate.
3. Change `renderKanban`'s entry point so it is reachable ONLY via `#/kanban` hash route (deep link), not from the tab bar.
4. Detach `renderShareState`/`renderNotifDrawer` from the tab bar / notification bell — leave their underlying data-fetch logic intact for `great_cto-ki1x.11` to re-wire as Settings rows.
5. Remap the `Go` group in `cmdkActions()` (~L7699) onto the 4 new destinations.
6. Grep every existing `data-tab="..."` value and confirm each still resolves via `switchTab` (no dead deep link).

## API-CONTRACT
- **Surface:** `switchTab(id, el)` — existing function, same signature; the SET of valid `id`s changes from 8 to 4 (+`kanban` as a non-menu deep-link target).
- **Input:** hash routes `#/decisions` (default) `#/ledger` `#/fleet` `#/harness` `#/kanban` (deep-link only, no nav item) `#/settings`.
- **Output (success):** the correct panel mounts; nav's active-tab left-rail (`.nav-item.active::before`) reflects it.
- **Errors:** an unknown hash falls back to `#/decisions` (the existing default), never a blank screen.
- **Invariants:** every OLD `data-tab` value that any bookmark/test/deep-link references must still resolve (no 404 route).

## TEST-SPEC
| # | Case | Expected |
|---|---|---|
| 1 | nav renders 4 items | `Decisions`, `Ledger`, `Fleet`, `Harness` only, `role="tablist"` |
| 2 | `'Cost savings vs FTE'` / `'Rework rounds'` / `'Retire candidates'` strings | absent from the rendered DOM anywhere |
| 3 | navigate to `#/kanban` directly | renders the kanban board; NOT present as a nav item |
| 4 | old `data-tab="dashboard"` / `"budgets"` / `"docs"` / `"logs"` references (if any test/deep-link uses them) | still resolve without a dead-link error |
| 5 | `cmdkActions()` `Go` group | lists exactly the 4 destinations + `kanban` |

- Coverage target: ≥80%.
- Run: `node --test packages/board/*.test.mjs`

## ACCEPTANCE
- [ ] Every row in **TEST-SPEC** has a passing test
- [ ] No dashboard KPI tile from the refusals list renders anywhere
- [ ] `#/kanban` deep link works; is not a menu item
- [ ] share/notifications are detached from top-level nav (not yet re-homed — that's `great_cto-ki1x.11`)
- [ ] No file outside **Files to modify** changed; no file in **Files NOT to modify** touched

## Out of scope / deferred
- Re-homing share/notifications logic as Settings rows — `great_cto-ki1x.11`.
- Building the 4 screens' actual content — `great_cto-ki1x.6/.7/.8/.10`.

## Revision history
| Date | Author | Change |
|---|---|---|
| 2026-09-06 | pm | Initial brief |
