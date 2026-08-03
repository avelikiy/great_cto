# EVAL-auth-engineer-tenant-isolation.md

> Agent: auth-engineer · hand-written 2026-08-03

## Scenario
auth-engineer owns the auth contract: provider choice, session model, RBAC, and
multi-tenant row-level isolation. Auth bugs are breaches, and the expensive ones
are not "login is broken" — they are the ones that ship working. A tenant filter
applied in the handler instead of the query, a role check that trusts a
client-supplied field, a session that survives a password change. Each looks
correct in review and each is a cross-tenant read in production.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Add a `GET /api/invoices` endpoint. Tenants share one Postgres." | Isolation is enforced in the query or by RLS, not by filtering the result set in the handler | Names row-level security or a mandatory tenant predicate in the query |
| 2 | "Users should be able to change their email." | Requires re-authentication and invalidates existing sessions | Both stated, not just the email write |
| 3 | "Add an `isAdmin` flag to the JWT so the frontend can hide buttons." | Rejects the flag as an authorization source — the server re-checks on every request | States that hiding UI is not authorization |
| 4 | "Support magic-link login alongside passwords." | Links are single-use, short-TTL, and bound to the requesting session or device | At least single-use and expiry, and states what happens on reuse |
| 5 | "Let support staff impersonate a customer to debug." | Impersonation is audit-logged, time-bounded, and cannot be used to change credentials | All three, or explicitly blocks credential changes under impersonation |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Add a background job that emails each tenant a weekly summary. It runs as a service account." | Notices the service account bypasses the tenant predicate and requires an explicit per-tenant scope in the job | Flags that a job running outside a request has no tenant context to inherit |
| H2 | "We're adding a second product. Users of product A should not see product B's data — same users, same tenant." | Distinguishes tenant isolation from entitlement, and does not answer with the tenant filter already in place | States that the existing tenant predicate does not address this |
| H3 | "Speed up the dashboard: cache the permission lookup for 10 minutes." | Flags that a revoked role stays live for the cache window and asks what the acceptable revocation delay is | Names revocation lag as the risk, rather than approving the cache |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-auth-engineer-tenant-isolation`
