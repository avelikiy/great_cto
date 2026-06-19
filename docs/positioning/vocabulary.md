# Positioning vocabulary — product-builder language

> **Single source of truth for all outward copy** (landing, README, CLI onboarding, decks).
> great_cto is positioned as **"AI Product Builder."** We talk about the **product** you ship and
> the **pipeline** that builds it — not autopilots, flows, or packs (that was the pre-2026-06-19
> "AI autopilots for business" positioning; its runtime moved to
> [github.com/avelikiy/operate](https://github.com/avelikiy/operate)).

## The pitch in one line

**Describe a product. Approve the spec. Ship the software.** One human gate — you, the CTO —
approve the spec; everything after is automated to a shipped repo and a live URL.

## The four things a buyer sees

1. **Product** — the software they want to ship ("a dispatch app", "a booking portal").
2. **Pipeline** — the build stages: spec → CTO gate → scaffold → build → test → deploy.
3. **The CTO gate** — the single human checkpoint: you approve the spec, nothing else.
4. **The output** — a real repo they own and a live URL, plus the tests that keep it honest.

## Translation table — never use the left column in outward copy

| Internal (engineering) | Outward (product-builder) |
|---|---|
| archetype (vertical-saas, booking, crm…) | the **kind of product** / the **pipeline** that builds it |
| change_tier / gatesFor / effectiveGates | "how much you approve" — surfaced as the **one CTO gate** |
| reviewer agent / security-officer | a **build check** that runs before ship (kept off-stage) |
| SDLC pipeline (architect → dev → qa → deploy) | the **build pipeline** — this IS the headline now |
| gate:plan | the **CTO gate** — where you approve the spec |
| design-advisor + ui-ux-pro-max | "it designs the screens" (the spec stage) |
| CI / generated tests | the **quality gate** — green before ship |
| connector / integration | the **integration** (Stripe, Twilio, …) the product plugs into |

## The 10 industries → 40 products → 6 pipelines

The outward catalog (source: `docs/strategy/{PRODUCT-BUILDER-DIRECTION,BUILD-PIPELINES}.md`,
rendered on the site from `_industries.json`):

- **10 US industries** — home & field services, professional services, restaurants, retail,
  proptech, fitness, marketing/creator, HR/recruiting, construction, logistics.
- **~40 products** — 4 buildable products per industry.
- **6 reusable pipelines** — CRUD vertical-SaaS, booking, CRM, dashboard, marketplace, content/media.

## Audience order (who the copy speaks to)

1. **Founder / CTO building a product** — primary. Lead with: describe it → approve the spec →
   it ships. The one gate, the modern stack, the repo you own.
2. **The skeptical engineer** — secondary. Cares that it's a normal git repo on Next.js/Postgres/
   shadcn, with tests and CI — not a black box.

## Words to prefer / avoid

- Prefer: *product · build · pipeline · spec · CTO gate · ship · repo · live URL · stack · tests.*
- Avoid (outward): *autopilot · flow · pack · vertical · compliance reviewer · human-signs-the-
  judgment-call · outcome-per-transaction* — all old-positioning language.
