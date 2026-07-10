# Benchmark briefs — batch 1 (frozen 2026-07-10)

The 10 product briefs for the public benchmark
([PLAN-2026-07-10-public-benchmark.md](../../plans/PLAN-2026-07-10-public-benchmark.md)).

**Freeze rule:** these briefs are committed *before* any benchmark run starts and are
not edited afterwards. Each brief is passed to `/start` **verbatim**. This is what
makes the benchmark reproducible and defensible — the input is public, fixed, and
predates the results.

| # | File | Product (catalog №) | Archetype |
|---|------|---------------------|-----------|
| 1 | [dispatch-scheduling.md](dispatch-scheduling.md) | Dispatch & scheduling (№1) | A1 CRUD |
| 2 | [client-portal.md](client-portal.md) | Client portal (№6) | A1 CRUD |
| 3 | [ats.md](ats.md) | Applicant tracking (№29) | A1 CRUD |
| 4 | [booking-portal.md](booking-portal.md) | Customer booking (№3) | A2 Booking |
| 5 | [class-booking.md](class-booking.md) | Class booking + membership (№21) | A2 Booking |
| 6 | [lead-crm.md](lead-crm.md) | Lead CRM + nurture (№18) | A3 CRM |
| 7 | [profitability-dashboard.md](profitability-dashboard.md) | Profitability dashboard (№8) | A4 Dashboard |
| 8 | [instant-quoting.md](instant-quoting.md) | Instant quoting (№2) | A5 Marketplace-lite |
| 9 | [subcontractor-portal.md](subcontractor-portal.md) | Subcontractor portal (№35) | A5 Marketplace-lite |
| 10 | [coaching-content.md](coaching-content.md) | Coaching content (№22) | A6 Content |

Brief style: 4–5 sentences in the voice of the business owner, naming the target
user, core flows, and integrations — enough to build from, not so much that spec
synthesis (S1) has nothing to do. Wave order: №3 (wave 0) → №1, №4, №7 (wave 1) →
rest (wave 2).
