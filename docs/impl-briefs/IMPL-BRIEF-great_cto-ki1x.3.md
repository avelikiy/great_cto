# IMPL-BRIEF-great_cto-ki1x.3.md — BRD-R2 unreadable classification (reader side)

## Task

- **bd task:** `great_cto-ki1x.3` — BRD-R2: classify pre-join-key log lines as 'unreadable'
- **Feature:** `board-redesign-2026-09` · PLAN: `docs/plans/PLAN-board-redesign-2026-09.md`
- **Source docs:** `docs/product/BRIEF-board-redesign-2026-09.md` (BRD-R2) + `docs/design/DESIGN-board-redesign-2026-09.md` §4 (absence vocabulary — `unreadable`, glyph `!`)
- **Implements REQ:** BRD-R2
- **Depends on:** `great_cto-ki1x.1` (BRD-R1 writer) merged past `gate:evidence-schema` — the field name this task checks for must match exactly what the writer emits.

## Files to modify

| File / glob | Why it changes |
|---|---|
| `packages/board/lib/routes.mjs` | The `/api/harnesses` reader (~L1623-1676) that parses `.great_cto/cross-review.log`: a line lacking `sha` renders `state: 'unreadable'`, distinct from `ok`/`skipped` |
| `packages/board/harnesses.test.mjs` | RED tests for the new `unreadable` classification, dimmed rendering, exclusion from `blocked` count |

## Files NOT to modify

| File / glob | Why it's off-limits | Who owns it |
|---|---|---|
| `scripts/lib/cross-model-review.mjs` | The WRITER side — already done in `great_cto-ki1x.1`; do not re-touch the field's shape here | senior-dev (T-R1-01) |
| `packages/board/public/index.html` | UI rendering of `unreadable` is Lane A's job (`great_cto-ki1x.10`, Harness screen, and `great_cto-ki1x.6`, Decisions screen) — this task only classifies server-side | senior-dev (Lane A) |

## Step-by-step

1. Read `routes.mjs:1623-1676` (existing `/api/harnesses` handler) and confirm today's `logState` variable / equivalent.
2. Write a failing test: a log line fixture WITHOUT `sha` → reader returns `state: 'unreadable'`.
3. Implement: check for `sha` presence (not just truthy — must handle `sha: null` explicitly as "not supplied" per BRD-R1's contract) → classify `unreadable`.
4. Update the `runs`/`reviewed`/`skipped`/`blocked` counters so `unreadable` lines are counted in `runs` but excluded from `blocked` (matching the existing `skipped` exclusion pattern the file's own comment documents).
5. Add the "N lines could not be parsed" footer count (distinct from `unreadable` — a line that isn't even valid JSON, vs. a valid JSON line missing the join field) — DESIGN §3.7 draws both as separate figures.
6. Run `node --test packages/board/harnesses.test.mjs` green.

## API-CONTRACT

- **Surface:** `/api/harnesses` GET — existing route, response shape gains one new possible `state` value: `unreadable`.
- **Input:** none new (existing query, no params change).
- **Output (success):** existing JSON shape; each log-line entry's `state` field is one of `ok | skipped | unreadable` (was `ok | skipped`); a new `unparseable_lines: number` counter at the top level.
- **Errors:** no new error paths — a JSON.parse failure on a whole line is already handled (feeds `unparseable_lines`); this task's new branch fires only on lines that DO parse but lack `sha`.
- **Invariants:** never renders `unreadable` as `0`, `not reviewed`, or `BLOCK`. Never counts an `unreadable` line in `blocked`.

## TEST-SPEC

| # | Case | Expected |
|---|---|---|
| 1 | log line JSON with no `sha` key | `state: 'unreadable'`, excluded from `blocked` count |
| 2 | log line JSON with `sha: null` | same — `null` means "not supplied", still `unreadable` |
| 3 | log line JSON with a real `sha` string | `state` follows the existing ok/skipped logic unchanged |
| 4 | a line that fails `JSON.parse` entirely | increments `unparseable_lines`, distinct from `unreadable` |
| 5 | today's actual 3-line `.great_cto/cross-review.log` fixture (all pre-BRD-R1, no `sha`) | all 3 classify `unreadable` — this is the expected MAJORITY case at ship, per the brief |

- Coverage target: ≥80% (PROJECT.md default).
- Run: `node --test packages/board/harnesses.test.mjs`

## ACCEPTANCE

- [ ] Every row in **TEST-SPEC** has a passing test
- [ ] `unreadable` is visibly distinct from `ok`/`skipped`/`BLOCK` in the API response shape
- [ ] `unreadable` lines excluded from `blocked`, included in `runs`
- [ ] No file outside **Files to modify** was changed
- [ ] No file in **Files NOT to modify** was touched
- [ ] Today's real `.great_cto/cross-review.log` (3 lines) classifies all 3 as `unreadable` when tested against this code

## Out of scope / deferred

- Rendering `unreadable` on screen (Decisions/Harness UI) — Lane A's job, separate tasks.
- Backfilling `sha` onto historical log lines — the log is append-only evidence; old lines stay `unreadable` forever, by design (K5).

## Revision history

| Date | Author | Change |
|---|---|---|
| 2026-09-06 | pm | Initial brief |
