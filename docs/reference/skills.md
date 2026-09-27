# Reference — Skills

> **Auto-generated** by `scripts/gen-docs-reference.mjs` from `skills/*/SKILL.md` frontmatter.
> Do not edit by hand — edit the skill and re-run the generator.

A skill is knowledge an agent loads on demand, rather than a thing that runs.
33 in total: 1 industry domain packs and 32 others.

## Industry domain packs (1)

Loaded when a product is being built for that industry, so `architect` and `pm`
are not naive about the domain.

| Skill | What it carries |
|---|---|
| `vertical-onboarding` | Onboarding-and-switching playbook for SMB Product-Builder products. |

## Everything else (32)

| Skill | What it carries |
|---|---|
| `aesthetic-instrument` | great_cto's own committed aesthetic — the instrument panel. |
| `anti-patterns` | Catalogue of known SDLC anti-patterns that great_cto agents must actively reject when reviewing architecture, plans, code, or post-mortems. |
| `anydesign` | Analyze images, websites, and Figma files to extract their design and generate a `design.md` with token system, component inventory, and reconstruction notes. |
| `archetype-review-base` | Shared review framework that every domain reviewer (pci, oracle, gov, edtech, healthcare, mlops, etc.) MUST follow. |
| `brainstorming` | Structured idea generation + multi-LLM debate for the product-owner stage. |
| `codex-host` | Run the great_cto controlled Codex lifecycle with controller-owned writes, verifier evidence, human gates and optional artifact release. |
| `committed-aesthetic` | How to write — and how to use — a skill that IS one aesthetic rather than a catalogue of them. |
| `cost-model` | Standardized cost-estimation framework for great_cto plans. |
| `crystallize` | Distils repeating patterns from session logs and lessons.md into draft skill files. |
| `decision-eval` | Spawns the decision-scorer agent after architect proposes 2+ variants in an ADR. |
| `deploy-landed` | Prove a deploy landed — the served revision is the commit you meant, its env is present, and the product does its job — instead of trusting the deploy command's exit code. |
| `discovery` | Structured pre-design questioning to surface hidden constraints before any architecture decision is locked in. |
| `done-blocked` | Reusable reporting contract for any agent that hands work back to the pipeline. |
| `great_cto` | Use when the CTO describes a feature, task, or project goal. |
| `lifecycle-messaging` | Email/SMS lifecycle and deliverability framework for SMB Product-Builder products that send transactional or lifecycle messages (booking reminders, CRM sequences, receipts, win-back). |
| `migration-ready-schema` | Data-model rules that make a schema importable from day one, so the migration-import-engineer is never blocked on missing columns. |
| `observability-baseline` | Scaffold-time observability so a shipped product is not blind in prod from day one — error capture (Sentry), request-id structured logging, and /healthz + /readyz endpoints. |
| `opportunity-solution-tree` | Build an Opportunity Solution Tree (OST) to structure product discovery — map a desired outcome to customer opportunities, possible solutions, and experiments. |
| `outcome-roadmap` | Transform an output-focused roadmap (feature list) into an outcome-focused one. |
| `pm-planning` | Decomposition methodology for pm agent — turns an approved ARCH document into a Beads task list with explicit dependencies, time-boxes, and acceptance criteria. |
| `pre-mortem` | Imagine the project has already shipped and failed catastrophically — work backwards from the failure to identify the most likely causes BEFORE building. |
| `product-economics` | Does this product make money at a price someone will pay? |
| `prose-style` | Reusable writing-style contract for agent outputs (reports, ARCH docs, verdicts, threat models). |
| `quant-validation` | The methods a financial-ML result has to survive before it is evidence — purged cross-validation with an embargo, triple-barrier labelling, sample uniqueness under overlapping labels, fractional di… |
| `secrets-rotation` | What to do the moment a secret is exposed — pasted into chat, committed, logged, shown in a transcript or a screenshot. |
| `signing-preflight` | Before the first commit of a session, check that commit signing will work — the key is loaded and unlocked — and ask the operator to unlock it once, up front, instead of discovering it after a hund… |
| `skeptical-triage` | Reusable 3-round self-challenge + arbiter pattern for filtering false positives from findings/verdicts. |
| `stack-baseline` | The pinned default technology stack for SMB Product-Builder products. |
| `test-strategy` | Coverage-design method for qa-engineer — pyramid ratios per archetype, equivalence/boundary/property case selection, mutation score as the real coverage signal, and a flake-quarantine policy. |
| `ui-ux-pro-max` | UI/UX design intelligence for web and mobile. |
| `verticals` | Domain knowledge for SMB industry products — the vocabulary, the entities a spec must model, the incumbent to route around, and what a naive build gets wrong — one file per industry, plus local SEO… |
| `well-architected` | 6-pillar architecture review framework. |
