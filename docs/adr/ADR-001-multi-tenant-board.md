# ADR-001: Multi-tenant board — path to managed SaaS

**Status:** Proposed · **Date:** 2026-05-09 · **Decision:** deferred to v2.6.0+

## Context

The current `great-cto board` is single-tenant and runs on `localhost:3141`.
Tasks, metrics, memory layers, verdicts — all live in the developer's home
dir (`~/.great_cto/`) or the project (`.great_cto/`). This is great for solo
developers but blocks two real use cases:

1. **Engineering teams** want a shared dashboard — gate approvals, cost trends,
   compliance posture across all repos under management
2. **CFOs / compliance officers** want a read-only view of cost + compliance
   without cloning every repo

The path to managed SaaS (and recurring revenue) requires multi-tenant
architecture. Doing it right needs explicit decisions on auth, isolation,
storage, and pricing.

## Decision drivers

- **Privacy-first** — no code or task content leaves the customer's
  infrastructure unless they opt in. Source code never reaches our servers.
- **Self-hostable first** — multi-tenant container that runs on customer's
  k8s. SaaS comes later, same image, hosted by us.
- **Non-breaking** — `great-cto board` (single-tenant local) keeps working
  exactly as today; multi-tenant is a separate `great-cto serve --multi-tenant`
  mode.
- **Reasonable pricing** — flat per-seat (e.g. $20/dev/mo) competitive with
  Linear / Notion. Heavy users pay for their own LLM tokens.

## Architecture options considered

### A. Schema-per-tenant (Postgres)

**Pros:** strong isolation, easy SAR/right-to-be-forgotten, standard postgres
patterns, well-trodden enterprise pattern.
**Cons:** requires SQL migrations across N schemas; higher ops burden.

### B. Row-level security (single Postgres + tenant_id column)

**Pros:** simplest schema, single migration path, cheaper at small scale.
**Cons:** harder isolation guarantees; one bug in `WHERE tenant_id=` leaks
everything; doesn't satisfy SOC2 Type 2 customers without lots of paperwork.

### C. DB-per-tenant (SQLite or dedicated Postgres)

**Pros:** maximum isolation, easy backup/export per tenant, easy SAR
compliance, no shared-state bugs possible.
**Cons:** infrastructure complexity scales linearly; expensive past ~500 tenants.

### Decision

Start with **C (DB-per-tenant SQLite)** for self-hosted, **B (RLS Postgres)**
for managed SaaS. Migration story: tenant export from SQLite → import to RLS
Postgres when they upgrade to managed.

Rationale:
- DB-per-tenant SQLite has zero ops cost — just a file under
  `data/tenants/{tenant_id}/great_cto.sqlite`
- Self-hosted is the dominant case for v2.6.0 (we don't need to manage a fleet)
- RLS-Postgres comes only when we operate the SaaS ourselves and gain SOC2
  via the platform layer (Cloud SQL / RDS) rather than per-tenant infra
- Migration tool from SQLite → Postgres is a few hundred LOC

## Auth

| Decision | Rationale |
|---|---|
| **OAuth (GitHub, Google, Microsoft)** for human users | Enterprise-friendly; no password storage |
| **API tokens** for CLI / CI | One token per project; scoped to that tenant |
| **SAML SSO** | Phase 2 — only for paid Enterprise tier |
| **No password auth** | Skip the entire account-recovery + password-reset complexity |

Bearer token format: `gctk_<base64url>` — easy to grep, easy to invalidate
server-side.

## Tenant isolation guarantees

- Code never crosses tenant boundaries — server only stores derived metadata
  (task counts, agent verdicts, decisions, cost summaries)
- `tenant_id` is part of every database row's PRIMARY KEY where applicable
- API surface is namespaced: `/api/v1/tenants/{tenant_id}/...`
- Audit log: every cross-tenant operation (admin tools only) is logged with
  actor + reason

## Pricing model (proposed)

| Tier | Price | Limits |
|---|---|---|
| **Self-hosted Free** | $0 | unlimited tenants on customer infra; community support |
| **SaaS Starter** | $20/seat/mo | up to 10 projects/tenant, 1M API calls/mo |
| **SaaS Growth** | $50/seat/mo | unlimited projects, SSO, 90-day retention |
| **Enterprise** | custom | SAML, audit logs, BAA, multi-region, longer retention |

LLM tokens are pass-through (customer's API key) — we never touch billing
for upstream model providers.

## What's deferred

- Pricing experiments — wait until v2.6.0 ships and we have 10+ self-hosted
  pilots
- SAML — only after Enterprise customers ask for it
- Multi-region — only when we have customers requiring data residency
- Real-time collab (live cursor on shared board) — SSE is fine for v2.6.0,
  CRDT only if pinch points emerge

## Implementation phases (for v2.6.0+, NOT v2.5.0)

1. **Phase 1 — Auth scaffold** _(2 weeks LLM-agent · ~8 weeks human)_
   - OAuth (GitHub) + API token middleware
   - `great-cto serve --multi-tenant --auth oauth-github`
   - Tenant creation flow
2. **Phase 2 — Isolated storage**
   - Migrate existing `~/.great_cto` files into per-tenant SQLite
   - Migration tool from single-tenant → multi-tenant
3. **Phase 3 — Shared board UI**
   - Tenant switcher in sidebar
   - Per-tenant URL: `boards.greatcto.systems/{tenant}/`
4. **Phase 4 — Billing + plans**
   - Stripe integration
   - Seat metering
5. **Phase 5 — Enterprise features**
   - SAML
   - Audit log export
   - Custom retention

## Consequences

**Because this decision is to _defer_, the consequences are those of staying
single-tenant for now:**

Positive:
- Zero new attack surface — no shared-tenant isolation bugs, no cross-tenant
  data-leak class of incidents while demand is unproven.
- Engineering stays focused on single-tenant production hardening (webhooks,
  reports, MCP SSE) instead of multi-tenant plumbing.
- The SaaS commitment (on-call, uptime SLA, incident response) is not taken on
  before willingness-to-pay is validated.

Negative / deferred cost:
- No shared dashboard for teams or read-only CFO/compliance views until v2.6.0+.
- Reopening later means retrofitting tenant isolation onto code written
  single-tenant — the tenant-id column convention (ADR-014, TBD) must be
  designed before any multi-tenant data is written, or migration cost balloons.
- Revenue from managed SaaS is postponed.

Revisit trigger: the reopen criteria in **Status** below (≥10 orgs in prod,
3 paying design partners, an ops playbook).

## Status

**Deferred.** v2.5.0 ships single-tenant production-grade webhooks + reports
+ MCP SSE. Multi-tenant board is a separate product decision that requires:

- Validating self-hosted demand (track installs of `great-cto serve` and
  tenant counts)
- Pricing sensitivity — survey 20+ teams using single-tenant
- Team capacity for ongoing SaaS ops (monitoring, on-call, incident response)

Reopen this ADR for v2.6.0 once we have:
- ≥10 organizations using single-tenant in production
- Confirmed willingness-to-pay from at least 3 design partners
- Operations playbook for SaaS uptime + incident response

## References

- [Citus multi-tenant patterns](https://www.citusdata.com/blog/2016/10/03/designing-your-saas-database-for-high-scalability/)
- [SOC2 Type 2 multi-tenancy guidance](https://www.aicpa.org/)
- [Linear engineering blog on schema-per-tenant](https://linear.app/blog)
- ADR-014 (TBD): tenant-id column convention
