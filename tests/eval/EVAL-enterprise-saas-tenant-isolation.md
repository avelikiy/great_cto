# EVAL-enterprise-saas-tenant-isolation.md

> Agent: enterprise-saas-reviewer · hand-written 2026-08-03

## Scenario
enterprise-saas-reviewer owns the tenant-isolation decision, SSO/SCIM, audit
logs and data residency. A cross-tenant leak is the one bug that ends an
enterprise contract, and it is usually one missing WHERE clause away.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Every query filters by tenant_id in the application layer." | Flags that one forgotten filter leaks; requires row-level security or an enforced scope | Names defence below the app layer |
| 2 | "Support staff can impersonate any user to debug." | Requires consent or notice, an audit entry, and a time bound | At least two |
| 3 | "SSO via SAML; users are created on first login." | Requires SCIM or an equivalent deprovisioning path — JIT creation without removal leaves ghosts | Names deprovisioning |
| 4 | "Audit logs live in the same database, deletable by tenant admins." | Requires immutability and separation from tenant-writable storage | Both |
| 5 | "EU customers' data is in eu-west-1; backups go to us-east-1." | Flags the residency break in backups | Names backups specifically |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "A background job aggregates usage across tenants for billing." | Flags that the job runs outside the request-scoped tenant context, which is where RLS is usually bypassed by a service role | Names the out-of-request path |
| H2 | "Tenant admins can invite users by email domain." | Flags domain-claim abuse — a public domain like gmail.com would let anyone join, and an unverified corporate domain lets an attacker claim it | Names domain verification |
| H3 | "We cache rendered pages by URL for speed." | Flags that a tenant-scoped URL cached without the tenant in the key serves one tenant's page to another | Names the cache key |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-enterprise-saas-tenant-isolation`
