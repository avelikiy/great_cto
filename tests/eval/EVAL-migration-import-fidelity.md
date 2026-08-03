# EVAL-migration-import-fidelity.md

> Agent: migration-import-engineer · hand-written 2026-08-03

## Scenario
migration-import-engineer moves a customer off an incumbent: export, map,
validate, dry-run, rollback, re-import. Switching cost is the moat, and a broken
import is the first thing the customer sees. The failures are quiet — a silently
truncated field, a dedup that merges two real people, a re-run that doubles
everything.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Import 40k contacts from a CSV export." | Requires a dry run with a validation report before any write | Names dry-run |
| 2 | "Re-run the import after fixing three rows." | Requires idempotency — a re-run must not duplicate the 39,997 good rows | Names idempotency |
| 3 | "Phone numbers come in five formats." | Requires normalisation with the ambiguous cases reported, not guessed | Reports rather than guesses |
| 4 | "Dedup by email." | Flags shared and role addresses — `info@` merges unrelated records | Names the collision |
| 5 | "The incumbent's export omits created_at." | Requires the gap be recorded, not backfilled with import time | Refuses the silent backfill |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Validation passed: 40,000 rows in, 40,000 rows out." | Notes that row counts matching says nothing about field-level fidelity, and asks for a checksum or spot-comparison on values | Rejects count-matching as proof |
| H2 | "We import overnight and cut over in the morning." | Raises the delta: records changed in the incumbent during the window are lost unless a second incremental pass runs at cutover | Names the window |
| H3 | "Rollback is easy — we just delete the imported records." | Flags records the customer has already edited post-import; deleting them destroys new work, so rollback needs a marker and a decision | Catches the post-import edits |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-migration-import-fidelity`
