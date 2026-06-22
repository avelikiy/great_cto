# Builder-agent gap plan — the "obвязка" for the SMB Product Builder

**Problem.** The Product Builder ships 40 products across 6 archetypes (vertical-saas,
booking, crm, dashboard, content-platform, marketplace-lite). The base CRUD stack is
covered (architect → design-advisor → senior-dev → qa → security → devops). But the
**value of every vertical lives in the obвязка** — integrations, billing, lifecycle
messaging, source connectors, media, geo — and we have **no horizontal builder agents**
for it. We have 62 agents, ~50 of which are regulated-domain reviewers (fda, cmmc,
oracle, biosecurity…) that never fire for an SMB product.

**Strategy reference:** [PRODUCT-BUILDER-DIRECTION](PRODUCT-BUILDER-DIRECTION.md) ·
[BUILD-PIPELINES](BUILD-PIPELINES.md). Coverage counts are over the 40 products in
`great_cto-site/_industries.json`.

**Design constraints (from the codebase):**
- Agents auto-discover from `agents/*.md`; required frontmatter (lint
  `tests/structural/validate.py`): `name, description, model, tools, maxTurns,
  timeout`. Archetype targeting via `applies_to: [...]` (parsed by board + pack tests).
- Skills auto-discover from `skills/<name>/SKILL.md` (`name, description, when_to_use,
  effort, allowed-tools, paths`).
- These are **builders**, modeled on `performance-engineer` / `design-advisor`: each
  owns ONE contract artifact, runs at a defined pipeline position, gated by `applies_to`,
  and hands senior-dev a spec precise enough to implement without re-deciding.
- A builder plans/contracts at **plan altitude** by default and may implement the
  obвязка when delegated — but the contract artifact is the durable output.

---

## Phase 1 — Critical (the four that make "your own software, one gate" true)

Without these the core promise fails. Each is needed by 16–40 of the 40 products.

| # | Deliverable | Kind | Artifact | applies_to | Coverage |
|---|---|---|---|---|---|
| 1 | `integrations-engineer` | agent | `docs/integrations/INTEGRATE-{slug}.md` | all 6 | ~38/40 |
| 2 | `migration-import-engineer` | agent | `docs/migration/IMPORT-{slug}.md` | all 6 | 40/40 |
| 3 | `subscription-billing-engineer` | agent | `docs/billing/BILLING-{slug}.md` | all 6 | ~30/40 |
| 4 | `lifecycle-messaging` | skill | (consumed by #1 + senior-dev) | crm, booking | 16/40 |
| 4b | `vertical-onboarding` | skill | (consumed by #2) | all 6 | 40/40 |

**Wiring:** `applies_to` lists the engine archetype slugs
(`vertical-saas, booking, crm, dashboard, content-platform, marketplace-lite`). Agents
reference the new skills in their `skills:` frontmatter. No registry edit needed (auto-discovery).

**Definition of done (Phase 1):** files created · `structural/validate.py` green ·
`run-packs-e2e` + `pipeline-contracts` unaffected · build suite green · a smoke check
that the board parses the new `applies_to`.

### Agent contracts (what each owns)

- **integrations-engineer** — OAuth2 / API-key flows, webhook **signature verification**,
  **idempotency keys**, retry/backoff + jitter, rate-limit handling, secret storage
  (no secrets in logs), sandbox→prod promotion, provider-failover. Per-provider playbooks:
  Stripe, Twilio, QuickBooks, Google/Microsoft Calendar, Shopify, MLS/IDX, carrier APIs.
- **migration-import-engineer** — incumbent export → our schema: format detection
  (CSV/XLSX/JSON/API), **field mapping**, type coercion, dedup, validation report,
  **dry-run + rollback**, idempotent re-import, progress + partial-failure handling.
  Source playbooks: ServiceTitan, Toast, Mindbody, Shopify, QuickBooks, Follow Up Boss.
- **subscription-billing-engineer** — Stripe Billing/Connect: plans/tiers, **metering**,
  proration, **dunning**, webhook reconciliation, tax (Stripe Tax), customer portal,
  trial→paid, refunds/disputes hand-off to pci-reviewer when regulated.

---

## Phase 2 — Important (5–15 products each)

| # | Deliverable | Kind | Artifact / consumer | Coverage |
|---|---|---|---|---|
| 5 | `connector-builder` | agent | `docs/connectors/CONNECT-{slug}.md` | 6 dashboard + 4 retail |
| 6 | `media-pipeline-engineer` | agent | `docs/media/MEDIA-{slug}.md` | ~6 content |
| 7 | `local-seo` (schema.org) | skill | consumed by senior-dev/cms-reviewer | ~8 |
| 8 | `geo-routing-engineer` | agent | `docs/routing/ROUTE-{slug}.md` | 2–4 (highest value in logistics) |
| 9 | `mobile-app-builder` (React Native) | agent | implements to design-advisor RN contract | ~8 field products |

`connector-builder` is the read-side twin of integrations-engineer (OAuth source
connectors + incremental sync + schema mapping for dashboards). `mobile-app-builder`
closes the gap noted in design-skills-decision (mobile=RN decided, builder never created;
`mobile-store-reviewer` only reviews store policy).

---

## Phase 3 — Domain playbooks (quality, not blocker)

10 light reference skills, one per industry, so architect/pm aren't naive about the
domain: HVAC price-book, agency SOW, MLS/IDX, restaurant COGS, 1099 for subcontractors,
class-pack/membership billing, ATS pipeline stages, bid/estimate math, shipment SLAs,
listing syndication. Each `skills/vertical-<industry>/SKILL.md`, `effort: low`,
read-only, applied during spec authoring. Lifts quoting/proposals/bid-builder from
"technically correct but naive" to credible.

---

## Phase 4 — Prune (epic great_cto-7y5) — ALREADY LEAN, now LOCKED

Investigated: the default build path was **already pruned** for the 6 SMB archetypes (done
with the pivot great_cto-9it). Reviewer firing has two paths — `REVIEWERS_BY_ARCHETYPE`
(lean: each SMB archetype pulls only security-officer ± pci-reviewer) and `suggestPacks`
(strictly signal-gated → zero packs for a clean SMB product). `applies_to` is NOT a firing
path (board-only display). So no regulated reviewer fires for a clean SMB build; deleting the
regulated reviewer agents would wrongly break the regulated archetypes that need them.

Done: a regression-guard test `tests/smb-lean-pipeline.test.mjs` locks (a) each SMB
archetype pulls only {security-officer, pci-reviewer}, (b) a clean detection attaches zero
packs, (c) regulated archetypes are NOT over-pruned. Plus applies_to hygiene (removed the
wrong `web-service` from cmmc-reviewer + emerging-markets-fintech-reviewer).

---

## Sequence

1. ✅ **Phase 1** (DONE, commit 326022c) — integrations/migration/billing agents +
   lifecycle-messaging/vertical-onboarding skills. Validated end-to-end on `quoting`
   (thin slice 9/9; seam bugs caught → template fixes 3a8d24c; systemic fix
   `migration-ready-schema` 90b2d58).
2. ✅ **Phase 2** (DONE, commit cc9c9e9) — connector-builder, media-pipeline-engineer,
   geo-routing-engineer, mobile-app-builder agents + local-seo skill.
3. ✅ **Phase 3** (DONE) — 10 vertical-<industry> domain skills, wired into architect.
4. ✅ **Phase 4** (DONE) — verified the SMB path is already lean; locked with a regression-guard test + applies_to hygiene.

Reference products to validate each builder against (one per archetype, from the niche
analysis): quoting (home-services), proposals (professional-services), online-ordering
(restaurants), inventory (retail), transaction-coordination (real-estate),
class-booking (fitness), sponsorship-crm (creator), onboarding (HR), bid-builder
(construction), shipment-tracking (logistics).
