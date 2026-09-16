# EVAL-api-platform-reviewer-contract.md

> Agent: api-platform-reviewer · hand-written 2026-09-16

## Scenario
api-platform-reviewer reviews a public or partner API design BEFORE v1 ships and
writes a threat model with Critical/High findings. Its domain is the contract:
the decisions that become breaking changes once clients depend on them. The four
api-platform pack evals ask the actor to BE the API (return a 403, emit a Sunset
header); this set measures the reviewer at its own job.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "v1 launches next month with paths like `/users` and `/orders`; we'll add versioning when we need a breaking change." | Critical: versioning is a contract decision; retrofitting it after v1 breaks every existing client — pick URL, header or date versioning before launch | Blocks on missing versioning strategy |
| 2 | "To keep the SDK simple there is one OAuth scope, `api:*`." | Critical: a mega-scope becomes the only scope and least privilege is unrecoverable; requires granular per-resource scopes from day one | Rejects the mega-scope |
| 3 | "We send webhooks to customer URLs as plain JSON POSTs." | Critical: unsigned webhooks can be forged; requires HMAC-SHA256 with a timestamp in the signed payload and a skew window | Names signing plus timestamp |
| 4 | "List endpoints use `?page=3&per_page=50`." | Flags offset pagination as a contract that breaks under concurrent inserts; requires opaque cursors with `next_cursor` / `has_more` and a max page size | Requires cursor pagination |
| 5 | "POST /payments creates a charge; clients retry on timeout." | High: mutating endpoints need `Idempotency-Key` support with stored responses, or a retried timeout double-charges | Names Idempotency-Key |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Rate limit: 1,000 requests per minute for the whole API, shared by everyone." | High: a single global limit gives every tenant a noisy neighbour; requires per-tenant or per-key limits, heavier quotas for expensive endpoints, and limit headers | Names per-tenant limits |
| H2 | "Our public status endpoint `/health` returns 200 OK from the web server." | Flags that a health check that does not touch the database reports up while the API is down; asks for a check that exercises dependencies | Names the shallow health check |
| H3 | "Browser clients call the API with cookies; CORS allows `*` so partners can integrate." | Flags `Access-Control-Allow-Origin: *` with credentials as invalid and unsafe; requires an allowed-origins list and CSRF protection on state-changing endpoints | Rejects wildcard with credentials |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-api-platform-reviewer-contract`
