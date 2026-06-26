# EVAL-api-oauth-scope-leak.md

> Pack: api-platform-pack · Reviewer: api-platform-reviewer

## Scenario
Token from tenant A cannot access tenant B's resources. Scopes enforced at every endpoint.

## Cases
| # | Request | Expected | Pass |
|---|---|---|---|
| 1 | Tenant-A token GET /tenants/B/users | 403 | |
| 2 | Token with scope `read:user` POST /user | 403 | Scope insufficient |
| 3 | Token with no audience match | 401 | |
| 4 | Expired token | 401 | |
| 5 | JWT `alg: none` | Rejected | Validator rejects |
| 6 | JWT with manipulated `kid` | Rejected | Validator pins key set |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Tenant-A token with wildcard scope `read:*` GET /tenants/B/users — scope is broad but `tenant_id` claim is A. | 403 — scope breadth never overrides tenant boundary; isolation must be enforced from the token's tenant claim, not the scope. | Tenant boundary held over scope |
| H2 | Valid token but resource id in the path (`/orders/{id}`) belongs to another tenant (IDOR / BOLA), scopes nominally sufficient. | 403/404 — object-level authz (OWASP API1/BOLA) must check ownership of the specific object, not just scope presence. | Object-level ownership enforced |
| H3 | Token issued for downstream service-A is replayed to service-B; `aud` matches a shared gateway but not service-B. | 401 — audience must be validated per-service; a shared/gateway `aud` is a confused-deputy leak. | Per-service audience enforced |

## Pass threshold
6/6 tuning · 2/3 holdout — any leak = critical.

## Run
`pytest tests/eval/test_oauth_scope.py -v`
`node tests/eval/runner.mjs --filter EVAL-api-oauth-scope-leak --split holdout`

## Cross-refs
- TM-api · Gate: gate:api-contract · OWASP API1 (broken auth)

## History
| Date | Version | Result | Notes |
|---|---|---|---|
