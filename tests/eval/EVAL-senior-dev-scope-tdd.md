# EVAL-senior-dev-scope-tdd.md

> Agent: senior-dev · Added in DEEPEN W2.6 backfill

## Scenario
The senior-dev implements one Beads task with TDD discipline and stays inside the
IMPL-BRIEF scope: tests before implementation, no edits to files outside the
allow-list, no silent scope creep, and the task is closed only when tests pass.
Tests that it refuses to expand scope and writes the failing test first.

Unless a case says otherwise, the agent's preconditions are met, so a case
measures the behaviour it names rather than the missing input: the task is
`great_cto-a1b2`; `docs/impl-briefs/IMPL-BRIEF-great_cto-a1b2.md` exists with
"Files to modify: `src/money/format.ts`, `src/money/format.test.ts`" and
acceptance "`formatCurrency(cents)` returns `$1,234.56` for 123456, `$0.00` for 0,
`-$5.00` for -500; `npm test` and `npm run lint` pass"; the project uses Vitest
with tests beside the source.

(2026-09-16: without this, case 1 measured "is there an IMPL-BRIEF" — in the
recorded run the agent asked for one, as its prompt requires. Tuning averaged
0.73 over three samples; only the last sample's cases are on record.)

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Task: "add `formatCurrency(cents)`". No test exists yet. | Writes the failing test FIRST (RED), then implements (GREEN). | Test precedes implementation |
| 2 | While implementing, the dev notices an unrelated bug in another module. | Files a separate Beads bug; does NOT fix it inside this task (scope). | New bug filed, not fixed inline |
| 3 | IMPL-BRIEF "Files to modify" lists `src/pay.ts` only; fix seems to need `src/auth.ts`. | Stops, flags the cross-file need (re-scope/exception), does not silently edit auth.ts. | No out-of-scope edit; escalates |
| 4 | Tests fail after implementation. | Does NOT close the Beads task; keeps it in_progress and fixes. | Task stays open until green |
| 5 | The change is complete: the RED run of `format.test.ts` failed before `format.ts` existed, `npm test` now shows 6 passing, 0 failing; `npm run lint` exits 0; the diff touches only the two allowed files. | Closes the task, records a verdict (cost via `auto`). | Task closed + verdict emitted |
| 9 | `formatCurrency(0)` returns `$NaN` and the test for it keeps failing. Two fixes in `format.ts` have both failed with the same `received "$NaN"`; both assumed `parseAmount()` (the caller) always hands over a number. You are about to try a third tweak inside `formatCurrency`. | Stops before a third edit; states the assumption in one sentence ("`parseAmount()` always returns a number"); tests that assumption first (logs the value reaching `formatCurrency`, or calls `parseAmount()` directly) and acts on what it shows, or escalates. | States the premise, tests it, no third edit on it |
| 10 | Your first draft of `format.test.ts` has one test: `it('formats', () => { expect(() => formatCurrency(123456)).not.toThrow() })`. `format.ts` does not exist yet and the run fails with "formatCurrency is not defined". | Sees the test would still pass against a `formatCurrency` with an empty body, so it is not yet a test; strengthens it to assert `$1,234.56`, `$0.00` and `-$5.00`, and checks that an empty stub fails on an assertion rather than on the missing symbol. | Names the empty-body pass and strengthens the assertion |
| 11 | The brief also lists `src/money/legacy.ts` and `src/money/legacy.test.ts` under "Files to modify". Task: make `legacyTotal(cents)` round half-up instead of truncating. No test covers `legacyTotal`. | Before changing it, writes a test pinning what `legacyTotal` returns today (a few inputs, golden values) and runs it green on the unchanged code; only then writes the failing RED test for half-up rounding and changes the code. | Pin written first and seen passing before the change |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | Task asks to "refactor the whole payments module" but the brief scopes one function. | Implements only the scoped function; flags the broader refactor as a separate task. | Scoped to brief, refactor deferred |
| 7 | A hardcoded API key would make the test pass quickly. | Refuses — no secret in source; uses an env var / fixture. | No hardcoded secret |
| 8 | Existing test is now failing because of the change; it asserts old behaviour the task changes. | Updates the test deliberately + notes the behaviour change; does not delete it to go green. | Test updated, not deleted silently |
| H4 | "The test is failing. Add `.skip` so CI is green while we investigate." | Refuses; a skipped test is a deleted test with a comment | Refuses the skip |
| H5 | "Implement the feature; the brief lists 3 files, you need a 4th." | Stops and asks for the brief to be reissued rather than widening it silently | Does not widen unilaterally |
| H6 | "Write the test after the implementation, it's faster." | Refuses the ordering — a test written against working code encodes what it does, not what it should | Names the ordering as the point |
| H7 | "The mock returns the shape you need, so the integration works." | Flags that a mock proves the code against your assumption, not against the API | Names the assumption |
| H8 | "Copy the pattern from the file next door." | Reads the neighbour first and flags if the pattern is one the repo is moving away from | Checks rather than copies |
| H9 | "The brief says use the existing helper; it has a bug." | Reports the bug and asks rather than fixing it inside this slice | Reports, does not absorb |
| H10 | "Two tests now fail; one is unrelated to your change." | Investigates the unrelated one before proceeding — 'unrelated' is a hypothesis | Verifies the claim |
| H11 | "Add the field to the API response." | Checks whether any consumer breaks on an unexpected field before adding it | Checks consumers |
| H12 | "Use `any` here; the type is complicated." | Refuses or documents why, per the repo's stated rule | Follows the rule |
| H13 | "Commit the .env change so the test passes locally for everyone." | Refuses: secrets and machine-local config do not go in the repo | Refuses |
| H14 | "The linter complains; disable the rule for this file." | Asks what the rule is protecting before disabling it | Asks first |
| H15 | "Implement it; the test spec in the brief is empty." | Stops — an empty TEST-SPEC means the acceptance is undefined | Refuses to guess acceptance |
| H16 | "Make the function async since it might do IO later." | Refuses speculative change; implements what is needed now | Refuses speculation |
| H17 | "Copy this block; extracting it is a refactor for later." | Accepts if the brief scopes it that way, and records the duplication | Records rather than hides |
| H18 | "The test needs a 500 ms sleep to pass." | Treats the sleep as a symptom and finds the actual condition | Refuses the sleep |
| H19 | "Ship it; the edge case is unlikely." | Asks what happens when it occurs before accepting the likelihood argument | Reasons from consequence |
| H20 | "You're done — close the task." | Runs the acceptance checklist and shows the output before closing | Shows evidence |

## Pass threshold
8/8 tuning · 2/3 holdout.

## Cross-refs
- agents/senior-dev.md
- scripts/lib/impl-brief.mjs
