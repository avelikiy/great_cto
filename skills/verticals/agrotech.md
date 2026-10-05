---
name: vertical-agrotech
description: Domain knowledge for the small-farm vertical (crop and field records, livestock records, direct farm sales, harvest traceability) so architect and pm don't spec naively. Covers the vocabulary (field/block/bed, season, application record, pre-harvest and re-entry intervals, lot code, withdrawal period, CSA share, catch weight), the rules incumbents get right, what a naive build gets wrong, and the entities each of the four products (field-records, livestock-records, farm-store, harvest-trace) must model. Applied by architect when writing ARCH-{slug}.md and by pm when writing PLAN-{slug}.md for any farm product.
when_to_use: |
  Apply when:
  - architect writes ARCH-{slug}.md for field-records, livestock-records, farm-store, or harvest-trace
  - pm writes PLAN-{slug}.md and needs to scope farm software without assuming a desk and a signal
  - any spec touches fields, plantings, sprays, harvests, animals, shares, or lot codes
  Do NOT apply to a food retailer with no farm (use retail) or to a delivery fleet (use
  logistics).
effort: low
allowed-tools: Read, Write, Grep, Glob
paths:
  - "docs/architecture/**"
  - "docs/plans/**"
  - "docs/design/**"
---

# Vertical: Farms — the record is made in a field with no signal

Farm software is used with gloves on, at the edge of a field, with no connection, by
people whose year has two frantic seasons and a quiet winter. What they record is partly
for themselves and partly a legal record an inspector or a buyer will ask for. The
incumbents (Farmbrite, Tend, Agrivi for mixed farms; AgriWebb for livestock; Croptracker
for produce traceability; Local Line, Barn2Door for direct sales) are built for that. A
naive spec assumes a browser, a connection and one crop per field forever.

The four products and their incumbents:

| Product | Archetype | Wedge | Closest incumbent |
|---|---|---|---|
| field-records | crud | spray and planting records that pass an audit | Farmbrite / Tend |
| livestock-records | crud | every animal's treatments and movements | AgriWebb |
| farm-store | marketplace-lite | shares and pre-orders sold direct | Local Line / Barn2Door |
| harvest-trace | crud | a lot code from field to customer | Croptracker |

## 1. Domain vocabulary (use these terms in the spec, not paraphrases)

- **Farm → field → block / bed** — the land hierarchy. A field is a mapped boundary; a
  block or bed is a managed part of it.
- **Season / crop year** — the unit almost everything is reported by.
- **Planting** — a crop and **variety** put in a place on a date; **succession planting**
  repeats it every few weeks. **Rotation** is what was grown there in earlier seasons.
- **Input** — seed, fertiliser, pesticide, feed, medicine. **Application record** — which
  input, how much, where, when, by whom.
- **REI (re-entry interval)** — how long people must stay out after a spray.
  **PHI (pre-harvest interval)** — how long before the crop may be harvested.
- **Yield** — harvested quantity per area: bushels, hundredweight or tonnes per acre or
  hectare.
- **Harvest lot / lot code** — the identifier that ties a packed product to a field and a
  day. **One-up, one-back** — who it came from, who it went to.
- **Wash / pack**, **cold chain** — what happens between field and sale.
- **Organic / GAP records** — the paperwork a certifier or buyer audits.
- **Animal ID** — visual tag, electronic tag (EID), or both. **Group / herd / mob** — the
  animals managed together. **Paddock**, **grazing rotation**, **stocking rate**.
- **Treatment record**, **withdrawal period** — after a medicine, the days before meat or
  milk may be sold.
- **Breeding record**, **weight record**, **average daily gain**.
- **CSA share** — a season's subscription to the harvest: full or half, a pickup site, a
  pickup day, **vacation holds** and **swaps**.
- **Catch weight** — sold by actual weight, known only at packing; the price is settled
  after the order.
- **Scale ticket**, **moisture**, **dockage** — grain delivered to an elevator, and what is
  deducted.

## 2. Non-obvious domain rules (the ones incumbents get right)

- **Offline is the normal state.** A record is created with no connection and synced
  hours later, possibly from two phones about the same field. Records carry a device
  timestamp and are merged, not overwritten.
- **Everything is per place per season.** The same field carries different crops in
  different years; history is kept, never overwritten, because rotation and audits read it.
- **An application record is a legal record.** Product name and registration number, rate,
  area treated, date and time, applicator, target, and often wind and temperature. It is
  appended and corrected with a note, not edited away.
- **PHI and REI are computed dates that block actions.** A harvest logged before the PHI
  has passed, or a task scheduled inside an REI, is a warning the product must raise.
- **Withdrawal periods block sales.** An animal or its milk cannot be marked sold inside
  the window.
- **Animals are individuals and groups at once.** A treatment given to a group is recorded
  once and applies to every member that day; animals move between groups and keep their
  own history.
- **Units are the farmer's, and they convert badly.** Acres or hectares; pounds, kilos,
  bushels. A bushel is a volume whose weight depends on the crop and its moisture. Store
  the entered quantity and unit; convert for display.
- **A field is a shape.** Boundaries are polygons; area is computed from them and is the
  divisor for every rate and yield.
- **The lot code is the join.** It links harvest → field → the inputs applied there, and
  forward to each customer who received it. A recall is that query.
- **A share is not a fixed basket.** What is in the box depends on the week's harvest;
  the subscription is for a share of whatever there is.

## 3. What a naive build gets wrong

- **Online-only forms** — nobody records anything until evening, from memory.
- **One crop per field as a column** — last year's data is destroyed by this year's.
- **Editable spray records with no history** — worthless to an inspector.
- **No PHI / REI / withdrawal arithmetic** — the one check that prevents an illegal sale.
- **Animals only as a head count** — no individual treatment history, no traceability.
- **Converting everything to metric on save** — the farmer's own numbers come back wrong
  by rounding.
- **Fixed-price cart for meat and produce** — catch-weight items are charged the wrong
  amount.
- **Harvest without a lot code** — a recall means recalling everything.

## 4. Must-model entities (the shapes that prevent rework)

Pair these with [[migration-ready-schema]] (source_ref + import_batch_id — records arrive
from spreadsheets and from other farm apps).

- **Field / Block** — boundary polygon, computed area, the unit the farmer uses.
- **Planting** — place (FK) + season + crop + variety + dates; never overwritten.
- **Input** — product, registration number, PHI, REI or withdrawal days, unit.
- **Application** — input (FK), place or group (FK), rate, area, date-time, applicator,
  conditions; append-only with corrections.
- **Harvest** — planting (FK), date, quantity + unit, **lot code**.
- **Animal** — IDs, birth, sex, breed, current group; **GroupMembership** with dates.
- **Treatment** — animal or group, medicine (an Input), dose, date, **withdrawal-until**.
- **Lot → Shipment line** — which customer received which lot.
- **Share / Subscription** — size, pickup site and day, holds, the season it covers.
- **Order line** — with ordered quantity and, for catch weight, packed weight and final
  price.
- **SyncRecord** — device id and device timestamp on anything created offline.

## 5. Per-product notes (wedge + the one domain thing)

- **field-records** (crud) — *wedge:* spray and planting records an auditor accepts. *The
  one thing:* offline capture with computed PHI / REI dates. The phone app →
  [[mobile-app-builder]].
- **livestock-records** (crud) — *wedge:* each animal's history in one place. *The one
  thing:* group actions that fan out to individuals, with withdrawal dates.
- **farm-store** (marketplace-lite) — *wedge:* shares and pre-orders without a marketplace
  fee. *The one thing:* catch weight and shares with holds — not a fixed cart. Recurring
  share payments → [[subscription-billing-engineer]].
- **harvest-trace** (crud) — *wedge:* a recall answered in minutes. *The one thing:* the
  lot code joining field, inputs and customers.

## 6. Compliance (light — flag, don't over-build)

- **Pesticide records** — keeping them is a legal duty for restricted products in many
  countries; the product keeps the fields and the history, the farmer owns the duty.
- **Organic certification** — certifiers audit several years of input and field history;
  never delete it.
- **Food traceability** — rules for certain produce require lot-level records passed along
  the chain (in the US, the FDA's food-traceability rule; check its current compliance
  date). Model the lot code; defer the full reporting format.
- **Animal identification and movement** — many countries require registered tags and
  movement reports. Store the official ID; flag reporting as the farmer's.
- **Farm data belongs to the farm.** Export of everything, on request, in a plain format;
  no sharing with input suppliers or buyers without explicit consent.
- **Subsidy and government reporting** — out of scope; flag it if asked.

---

Cross-refs: [[mobile-app-builder]] (offline capture in the field),
[[subscription-billing-engineer]] (share subscriptions), [[migration-ready-schema]]
(importable entities).
