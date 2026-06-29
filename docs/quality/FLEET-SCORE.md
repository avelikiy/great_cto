# FLEET-SCORE — empirical product-quality benchmark

> Auto-generated 2026-06-29 by scripts/lib/product-score.mjs over freshly-generated reference products (one per build archetype A1–A6). Each built by an agent to the same quality scaffold; `npm test` passing.

| Archetype | Product | Score | Grade |
|-----------|---------|------:|:-----:|
| crud | CRUD vertical-SaaS | 84/100 | B |
| booking | Booking/scheduling | 91/100 | A |
| crm | CRM + nurture | 91/100 | A |
| dashboard | Dashboard/analytics | 91/100 | A |
| marketplace | Marketplace-lite | 91/100 | A |
| content | Content/media | 91/100 | A |
| | **Fleet average** | **89/100** | |

## What this measures (and what it doesn't)

These are **reference builds** — agent-generated to a tight quality brief, every dimension requested. The score measures **presence + shape of quality machinery** (data model, API, UI, auth, tests incl. e2e, observability, deploy config) — a **floor, not a ceiling**: 89 means "the builder reliably produces products with the right machinery," proven empirically.

It does **not** measure deep real-world correctness or UX (a static score can't). The earlier holistic expert estimate (~70) factors in those un-measurable depths + average (not best-case) real builds. Both numbers are honest; they measure different things. To raise the *ceiling*: execute the e2e specs (the harness checks they exist) + the cross-model review layer.
