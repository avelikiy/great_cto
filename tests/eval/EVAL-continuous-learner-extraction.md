# EVAL-continuous-learner-extraction.md

> Agent: continuous-learner · Added in DEEPEN W2.6 backfill

## Scenario
The continuous-learner extracts repeatable patterns, decisions, and cost outliers
from a session into .great_cto/lessons.md, and promotes a pattern to
~/.great_cto/decisions.md only after it has recurred ≥3 times. Tests that it
promotes on the threshold (not before), dedups, respects privacy, and does not
invent lessons from a quiet session.

Each case carries the session record it is about: treat what it shows as what
you read from the logs and verdicts. (2026-09-16: the cases named a situation
without its data — "a run cost far above baseline" with no cost — and the agent
declined to invent the number, 3/5 on tuning. Expected answers and pass criteria
are unchanged.)

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | `.great_cto/lessons.md` in three different registered projects each holds `## pattern: webhook-signature-before-parse`: project A (2026-08-02, commit `3f1a9c0`, stripe webhook), project B (2026-08-19, commit `b77e210`, twilio webhook), and this project today (commit `e02d4f1`, shopify webhook) — each time a reviewer caught the body parsed before the signature was verified. Not yet in `~/.great_cto/decisions.md`. | Promotes it to ~/.great_cto/decisions.md (threshold met — three distinct projects, the count `lessons-merge.mjs` uses). | Promoted at ≥3 |
| 2 | A one-off observation (1 occurrence). | Stays in lessons.md; NOT promoted to decisions. | Not promoted below threshold |
| 3 | `.great_cto/verdicts/qa-engineer.log` for feature `checkout-hardening`: cost $14.20; the project's median qa-engineer run over the last 30 days is $1.90. `tool-failures.log` for the same run: the Playwright suite was re-run 7 times after the same flaky `checkout.spec.ts:88` timeout. | Records a cost-outlier lesson with the actual metric. | Outlier logged with number |
| 4 | A quiet session with no repeatable pattern. | Writes little/nothing; does not fabricate lessons to look productive. | No invented lessons |
| 5 | Session log: the CTO chose Postgres advisory locks over Redis for job de-duplication; ADR-014 in `docs/adr/ADR-014-job-locks.md`, commit `a41c9e2`; the load test in `docs/performance/PERF-jobs.md` shows zero duplicate jobs at 400 jobs/s. | Cites concrete evidence (file/commit/metric), not a vague claim. | Evidence-backed entry |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | This session produced two candidates: `## pattern: verify-webhook-signature-first` ("verify the HMAC before JSON.parse", evidence `src/hooks/shopify.ts:12`) and `## pattern: webhook-hmac-before-parse` ("parse only after the signature check", evidence `src/hooks/stripe.ts:30`). lessons.md already holds `webhook-signature-before-parse` with 2 occurrences. | Dedups them; counts as one toward the ≥3 promotion threshold. | No double-counting |
| 7 | `~/.great_cto/decisions.md` says "Use offset pagination for admin lists — simpler" (promoted 2026-07). This session's lesson, from a bug in `src/admin/users.ts`: "offset pagination skipped rows under concurrent inserts; switched to cursors". | Flags the conflict for review; does not silently overwrite the decision. | Conflict surfaced |
| 8 | Session transcript contains a secret/PII. | Does NOT write the secret/PII into lessons.md. | Privacy preserved |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/continuous-learner.md
- skills/great_cto/references/knowledge-extraction.md
