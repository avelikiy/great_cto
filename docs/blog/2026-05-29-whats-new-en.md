# great_cto: what's new — three features and the move to Opus 4.8

While you were sleeping (or heroically fixing prod), `great_cto` — the engineering-process engine for solo founders and teams up to 50 people — picked up some new tricks. No fluff: three features that actually change your daily grind, plus a model upgrade that didn't require re-mortgaging the apartment.

---

## 1. Discovery pipeline: think before you code

A timeless genre: write first, find out *what* you should have written later. Until now the pipeline started with the architect, and everything "before" — problem research, prioritization, the PRD — lived in your head, your notes, and three browser tabs you were too scared to close. That gap is now filled by two commands:

- **`/discover`** — a full product-discovery cycle. Builds an **Opportunity-Solution Tree** (Teresa Torres' framework): desired outcome → opportunities → solutions → experiments. Ranks opportunities by Opportunity Score = `Importance × (1 − Satisfaction)` and tosses in ≥3 solutions for each. Output lands in `docs/discovery/OST-<slug>.md`.
- **`/prd`** — a structured 8-section PRD, from Executive Summary to success criteria. Asks at most 4 clarifying questions (not 40, like that one meticulous stakeholder) and hands you a finished doc in `docs/requirements/`.

The PM agent also finally learned to **prioritize features** when there's more than one and they're all "urgent": pick from Opportunity Score / ICE / RICE / MoSCoW. The full new route: `/discover → /prd → /architect → /pm → senior-dev`.

---

## 2. Quota warning at session start

There's a special genre of pain: hitting the rate limit right in the middle of a heavy pipeline, when the result was *just* around the corner. The new `quota-check.mjs` hook checks your Claude Code quota **at the start of every session** and tactfully clears its throat ahead of time:

- ⚡ **70%+** — prefer the fast-path for big features
- 🔴 **85%+** — fast-path only (skip the ARCH doc)
- 🛑 **95%+** — friend, not today. Don't start the heavy pipeline

As a bonus it shows your burn rate per window (on track, or living large), tracks Sonnet's 7-day sub-quota separately, and watches pay-as-you-go spend. Parallel agents share a single request via a 5-minute cache — no DDoS-ing your own API. API-key users aren't touched at all — it quietly steps aside.

---

## 3. digital-health-pack: an overlay for wearable and mental-health products

A new domain overlay (Wave 4) attaches itself the moment your project starts cozying up to wearables and digital health — **Apple HealthKit, Google Health Connect, Garmin, Fitbit, Oura, Whoop**, biometrics (HRV, SpO2, sleep), mental-health AI, nutrition/supplement recommendations, or physician-in-the-loop (HITL) flows.

What's in the box:
- a chain of three reviewers (`digital-health-reviewer` + `ai-clinical-reviewer` + `healthcare-reviewer`);
- five human gates: **wellness vs SaMD** classification, HITL design, wearable API access, supplement safety (drug-interaction check + NIH dose limits), and a crisis-escalation protocol for mental health;
- a ready-made threat-model template and EVAL suites — refuse-to-diagnose, supplement safety, and crisis escalation per AFSP Safe Messaging guidelines.

In short: a built-in regulatory checklist (FDA General Wellness vs SaMD, HIPAA, GDPR Art. 9, EU AI Act Annex III) — so your health startup attracts an investor, not a regulator's notice.

---

## Bonus: moving to Claude Opus 4.8

`great_cto` upgraded its flagship: **`claude-opus-4-7` → `claude-opus-4-8`** (Anthropic shipped it on 2026-05-28). The kind of move that needs no boxes and no movers:

- **Where it works:** `architect` (deep cross-cutting reasoning and ADR generation) plus 41 reviewers/specialists and `commands/review.md` via `advisor-model`.
- **What you gain:** better coding at the default effort level for comparable token spend, and a **1M-token context window** (yes, even that legacy module fits).
- **Same price:** $5 / $25 per MTok (in/out) — just like 4.7. Accounting can exhale.
- **Tier aliases untouched:** agents on `model: sonnet` / `model: haiku` stay as they were — only explicit Opus pins moved.

---

*Upgrade: `npx great-cto@latest init`. Full changelog — in the [CHANGELOG](https://github.com/avelikiy/great_cto/blob/main/CHANGELOG.md).*
