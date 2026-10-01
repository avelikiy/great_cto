---
name: verticals
description: "Domain knowledge for SMB industry products — the vocabulary, the entities a spec must model, the incumbent to route around, and what a naive build gets wrong — one file per industry, plus local SEO and money-on-a-phone. Read the one file that applies before speccing or building the product."
when_to_use: |
  Speccing or building a product for one of the industries below, a public page that must
  rank locally, or an app that moves money on a phone. Read ONE file, not the directory.
effort: low
allowed-tools: Read, Glob
---

# Verticals — read the one that applies

Each file below is the domain brief for one kind of product. They are references, not
separate skills: one line in every session's skill list instead of twelve paragraphs, and
the full text only when a product needs it.

| Product is for… | Read |
|---|---|
| HVAC, plumbing, cleaning, landscaping — dispatch, quoting, booking | `home-services.md` |
| Agencies, consulting, creative — proposals, portals, time + invoicing | `professional-services.md` |
| Restaurants, cafés — ordering, reservations, loyalty, shifts | `restaurants.md` |
| SMB storefronts — catalog, inventory, pricing, cart recovery | `retail.md` |
| Residential real estate — listings, lead CRM, transactions, property management | `real-estate.md` |
| Studios, gyms, coaches — class booking, membership, content | `fitness.md` |
| Creators, marketing — scheduling, analytics, monetization, sponsorships | `creator.md` |
| HR, recruiting — ATS, onboarding, scheduling, surveys | `hr-recruiting.md` |
| Contractors, field crews — bids, project logs, subcontractors | `construction.md` |
| Shipping, warehouse-lite, routes, purchase orders | `logistics.md` |
| An app that holds a balance or moves money on a phone (orthogonal to the rows above) | `fintech-mobile.md` |
| Public pages that must be found in local or product search | `local-seo.md` |

## How to read it

From a great_cto checkout the files sit next to this one (`skills/verticals/<file>`). From
an installed plugin, resolve the newest cached version:

```bash
# <file> is the row that applies, e.g. retail
cat "$(ls ~/.claude/plugins/cache/*/great_cto/*/skills/verticals/<file>.md 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2-)"
```

Apply what it says to the spec: its vocabulary in the names, its must-model entities in the
data model, its "what a naive build gets wrong" list as review items. If no row fits, read
nothing — a near-miss vertical imports the wrong rules.
