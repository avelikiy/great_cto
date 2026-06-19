# Build pipelines — Product Builder (2026-06-19)

**Insight that shapes this:** the 40 target products
([PRODUCT-BUILDER-DIRECTION.md](PRODUCT-BUILDER-DIRECTION.md)) collapse into **6
reusable build archetypes**. So we ship **6 parameterized pipeline templates**, not 40
bespoke pipelines. Each of the 40 products is an *instance* of an archetype with
parameters (vertical, entities, integrations, branding). That is what "maximum
automation" means here: generate from 6 templates, don't hand-build 40.

Each pipeline has **exactly one human gate — the CTO — at the spec/architecture step.**
Everything before it is automated synthesis; everything after it is automated build →
deploy. This maps 1:1 onto the existing engine: `change_tier` T1 (`effectiveGates`)
opens only `plan`; the rest runs unattended.

## The 6 archetypes (40 products mapped)

| # | Archetype | Core shape | Products (of the 40) |
|---|-----------|-----------|----------------------|
| **A1** | **CRUD vertical-SaaS** | entities + roles + workflow + records UI | dispatch app, client portal, time-tracking+invoicing, property-mgmt portal, transaction-coordination, ATS, onboarding builder, project-mgmt+logs, field documentation, inventory+reorder, warehouse-lite, supplier/PO mgmt, menu manager, loyalty engine, transaction-coordination |
| **A2** | **Booking / scheduling** | calendar + availability + reminders + payments | customer booking portal, reservations+waitlist, class booking+membership, staff shift scheduling, route optimization+dispatch |
| **A3** | **CRM + nurture** | contacts + pipeline + automated sequences | lead CRM+nurture, sponsorship CRM, review/reputation autopilot, abandoned-cart autopilot, member churn autopilot, employee engagement/surveys |
| **A4** | **Dashboard / analytics** | ingest + metrics + viz + alerts | project/retainer profitability, cross-channel marketing analytics, shipment tracking/visibility |
| **A5** | **Marketplace-lite** | two-sided listings + matching + payments/escrow | subcontractor/vendor coordination, brand-deal marketplace, proposal/SOW + e-sign, dynamic pricing+promotions, instant quoting/estimate, bid/estimate builder |
| **A6** | **Content / media platform** | catalog + access control + delivery + monetization | on-demand video library, coaching content delivery, content scheduler/publisher, creator monetization, storefront builder, online ordering |

(One product can lean on two archetypes — e.g. storefront = A6 catalog + A1 inventory;
the pipeline composes them.)

## Canonical pipeline (1 CTO gate, max automation)

```
[ industry + product brief ]
        │
   S1. Spec synthesis  ──────── architect + design-advisor (ui-ux-pro-max):
        │                       PRD, data model, screen inventory, stack, integrations
        ▼
   ╔══════════════════════════════════════════════╗
   ║  👤 CTO GATE — the ONE human gate            ║   ← change_tier T1 → effectiveGates = [plan]
   ║  approve spec + architecture (is this right?) ║
   ╚══════════════════════════════════════════════╝
        │  (approved → everything below is automated)
   S2. Scaffold        ──────── instantiate the archetype's stack template
   S3. Backend         ──────── data model → API + auth + CRUD + roles
   S4. Frontend        ──────── senior-dev + ui-ux-pro-max build to design-advisor's DESIGN-{slug}.md
   S5. Integrations    ──────── archetype-specific (Stripe, email/SMS, calendar, storage…)
   S6. Test + QA       ──────── generated tests + CI green (the automated quality gate)
   S7. Deploy          ──────── Vercel / Cloudflare; preview URL → production
        ▼
   [ shipped product + repo + URL ]
```

The CTO gate is the *only* human checkpoint. CI + generated tests are the quality gate
(replacing the per-step human review of the regulated era — see the pivot in
[[positioning-icp]]). A T0 maintenance change to a shipped product skips even the CTO
gate (CI gates it); a T2 action (prod deploy of a sensitive change) can re-open `ship`.

## Per-archetype parameters (what the template takes)

| Archetype | Key parameters | Stack default | Signature integration |
|-----------|----------------|---------------|-----------------------|
| A1 CRUD | entities[], roles[], state-machine | Next.js + Postgres + shadcn | — |
| A2 Booking | resources, slot rules, reminder channels | Next.js + Postgres + cal engine | Stripe + Twilio/email |
| A3 CRM | contact schema, pipeline stages, triggers | Next.js + Postgres + queue | email/SMS + webhooks |
| A4 Dashboard | sources, metrics, refresh, thresholds | Next.js + warehouse-lite + charts | source connectors |
| A5 Marketplace | sides, listing schema, fee model | Next.js + Postgres + Stripe Connect | Stripe Connect / escrow |
| A6 Content | content model, access tiers, delivery | Next.js + object storage + CDN | Stripe + media pipeline |

All 6 share: Next.js + Tailwind + shadcn (web), React Native option (mobile, via
ui-ux-pro-max app-interface rules), auth, Postgres, deploy target. The shared base is
one scaffold; archetypes differ in data shape + signature integration.

## How it maps onto the existing engine (reuse, don't rebuild)

- **Archetype detection / selection** — extend `packages/cli/src/archetypes.ts` with
  the 6 product-builder archetypes (A1–A6) alongside the existing dev archetypes.
- **Gates** — the single CTO gate IS `effectiveGates(archetype, size, T1) → [plan]`.
  No new gate system; the two-axis model already produces exactly one gate for a
  reversible feature build (great_cto-s3v).
- **Design** — `design-advisor` (ui-ux-pro-max + anydesign) produces the screen
  inventory + DESIGN-{slug}.md at S1/S4; `senior-dev` builds to it (great_cto-4lm).
- **Flow** — each archetype's S2–S7 is a `compileFlow`-style template; the 6 templates
  are data, parameterized per product.

## Next steps

1. `great_cto-7y5` — remove the regulated archetypes/reviewers; add A1–A6 in their place.
2. Author the 6 pipeline templates as parameterized flow definitions.
3. Pick one archetype (A1 CRUD vertical-SaaS — widest coverage) and ship a reference
   product end-to-end through the single-CTO-gate pipeline as the proof.
