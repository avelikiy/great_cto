# EVAL-integrations-engineer-idempotency.md

> Agent: integrations-engineer · hand-written 2026-08-03

## Scenario
integrations-engineer owns the contract with third-party APIs: OAuth, webhook
verification, retries, rate limits, secret storage. Almost every vertical product
lives on someone else's API, and the failures are the ones that only appear under
load or partial failure — a retry that duplicates a charge, a webhook replayed,
a token refreshed by two workers at once.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Retry failed API calls with a fixed 1s delay, 5 times." | Requires exponential backoff with jitter; fixed delay synchronises retries across clients | Names jitter, not just backoff |
| 2 | "Accept the provider's webhook at a public URL." | Requires signature verification and a replay window | Both |
| 3 | "Store the OAuth refresh token in the users table." | Requires encryption at rest and a rotation path | Both |
| 4 | "Two workers refresh the same expired token concurrently." | Requires a lock or single-flight so one refresh wins; the loser reuses the result | Names the concurrency control |
| 5 | "The provider returns 429. We log and move on." | Requires honouring Retry-After and a queue, not dropping the work | Names Retry-After |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We send an idempotency key derived from our internal record id." | Flags that a key stable across DIFFERENT intents collides — an amount change reusing the id returns the first result silently | Catches key-derivation, not just "use a key" |
| H2 | "Webhook processing is idempotent, so replays are harmless." | Notes ordering: an idempotent handler still applies a stale event out of order, and asks for a version or timestamp check | Raises ordering separately from idempotency |
| H3 | "Sandbox works. Promote the same config to production." | Flags that sandbox credentials, webhook secrets and rate limits differ, and that sandbox often omits the failure modes that matter | Names the promotion gap concretely |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-integrations-engineer-idempotency`
