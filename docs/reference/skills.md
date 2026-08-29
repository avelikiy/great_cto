# Reference — Skills

> **Auto-generated** by `scripts/gen-docs-reference.mjs` from `skills/*/SKILL.md` frontmatter.
> Do not edit by hand — edit the skill and re-run the generator.

A skill is knowledge an agent loads on demand, rather than a thing that runs.
36 in total: 12 industry domain packs and 24 others.

## Industry domain packs (12)

Loaded when a product is being built for that industry, so `architect` and `pm`
are not naive about the domain.

| Skill | What it carries |
|---|---|
| `vertical-construction` | Domain knowledge for the construction vertical (contractors, field crews) so architect and pm don't spec construction products naively. |
| `vertical-creator` | Domain-knowledge primer for the marketing & creator vertical (creators, newsletter writers, podcasters, course sellers) so architect/pm don't spec naively against incumbents (Substack ~10%, Patreon… |
| `vertical-fintech-mobile` | Domain-knowledge pack for money on a phone — wallets, payments, custody and signing, transaction lifecycle, KYC/AML gates, and offline reconciliation. |
| `vertical-fitness` | Domain-knowledge pack for fitness & wellness (boutique studios, gyms, coaches, on-demand brands) — the membership vocabulary, non-obvious billing/booking rules, and retention realities a builder mu… |
| `vertical-home-services` | Domain-knowledge pack for home & field services (HVAC, plumbing, cleaning, landscaping) — the trades vocabulary, non-obvious pricing/dispatch rules, and field-crew realities a builder must know so … |
| `vertical-hr-recruiting` | Domain-knowledge primer for the HR & recruiting vertical (ATS, onboarding, workforce scheduling, engagement). |
| `vertical-logistics` | Domain knowledge for the logistics & supply-chain vertical (SMB shipping & inventory) so architect and pm don't spec naively. |
| `vertical-onboarding` | Onboarding-and-switching playbook for SMB Product-Builder products. |
| `vertical-professional-services` | Domain-knowledge primer for the professional-services vertical (agencies, consulting firms, creative studios) so architect/pm don't spec naively against PSA incumbents (Scoro, Productive, Accelo, R… |
| `vertical-real-estate` | Residential-proptech domain knowledge so architect / pm aren't naive when speccing real-estate products (listings, lead-crm, transaction-coordination, property-mgmt). |
| `vertical-restaurants` | Domain-knowledge primer for the restaurants & hospitality vertical (dine-in, pickup, delivery). |
| `vertical-retail` | Retail & e-commerce domain knowledge for SMB storefront products (storefront, inventory, pricing, cart-recovery). |

## Everything else (24)

| Skill | What it carries |
|---|---|
| `anti-patterns` | Catalogue of known SDLC anti-patterns that great_cto agents must actively reject when reviewing architecture, plans, code, or post-mortems. |
| `anydesign` | Analyze images, websites, and Figma files to extract their design and generate a `design.md` with token system, component inventory, and reconstruction notes. |
| `archetype-review-base` | Shared review framework that every domain reviewer (pci, oracle, gov, edtech, healthcare, mlops, etc.) MUST follow. |
| `brainstorming` | Structured idea generation + multi-LLM debate for the product-owner stage. |
| `cost-model` | Standardized cost-estimation framework for great_cto plans. |
| `crystallize` | Distils repeating patterns from session logs and lessons.md into draft skill files. |
| `decision-eval` | Spawns the decision-scorer agent after architect proposes 2+ variants in an ADR. |
| `discovery` | Structured pre-design questioning to surface hidden constraints before any architecture decision is locked in. |
| `done-blocked` | Reusable reporting contract for any agent that hands work back to the pipeline. |
| `great_cto` | Use when the CTO describes a feature, task, or project goal. |
| `lifecycle-messaging` | Email/SMS lifecycle and deliverability framework for SMB Product-Builder products that send transactional or lifecycle messages (booking reminders, CRM sequences, receipts, win-back). |
| `local-seo` | Local-business SEO and structured-data framework for content-platform Product-Builder products that need to be found (storefronts, restaurant online-ordering, real-estate listings, service-business… |
| `migration-ready-schema` | Data-model rules that make a schema importable from day one, so the migration-import-engineer is never blocked on missing columns. |
| `observability-baseline` | Scaffold-time observability so a shipped product is not blind in prod from day one — error capture (Sentry), request-id structured logging, and /healthz + /readyz endpoints. |
| `opportunity-solution-tree` | Build an Opportunity Solution Tree (OST) to structure product discovery — map a desired outcome to customer opportunities, possible solutions, and experiments. |
| `outcome-roadmap` | Transform an output-focused roadmap (feature list) into an outcome-focused one. |
| `pm-planning` | Decomposition methodology for pm agent — turns an approved ARCH document into a Beads task list with explicit dependencies, time-boxes, and acceptance criteria. |
| `pre-mortem` | Imagine the project has already shipped and failed catastrophically — work backwards from the failure to identify the most likely causes BEFORE building. |
| `prose-style` | Reusable writing-style contract for agent outputs (reports, ARCH docs, verdicts, threat models). |
| `skeptical-triage` | Reusable 3-round self-challenge + arbiter pattern for filtering false positives from findings/verdicts. |
| `stack-baseline` | The pinned default technology stack for SMB Product-Builder products. |
| `test-strategy` | Coverage-design method for qa-engineer — pyramid ratios per archetype, equivalence/boundary/property case selection, mutation score as the real coverage signal, and a flake-quarantine policy. |
| `ui-ux-pro-max` | UI/UX design intelligence for web and mobile. |
| `well-architected` | 6-pillar architecture review framework. |
