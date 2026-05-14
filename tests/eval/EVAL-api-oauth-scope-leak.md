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

## Pass threshold
6/6 — any leak = critical.

## Run
`pytest tests/eval/test_oauth_scope.py -v`

## Cross-refs
- TM-api · Gate: gate:api-contract · OWASP API1 (broken auth)

## History
| Date | Version | Result | Notes |
|---|---|---|---|
