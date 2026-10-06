---
name: vertical-travel
description: Domain knowledge for the SMB travel vertical (tour and activity operators, small stays, travel advisors) so architect and pm don't spec naively. Covers the vocabulary (allotment, departure, OTA, channel manager, net rate, manifest, rate plan), the rules incumbents get right, what a naive build gets wrong, and the entities each of the four products (tour-booking, small-stay-booking, trip-itinerary, channel-sync) must model. Applied by architect when writing ARCH-{slug}.md and by pm when writing PLAN-{slug}.md for any travel product.
when_to_use: |
  Apply when:
  - architect writes ARCH-{slug}.md for tour-booking, small-stay-booking, trip-itinerary, or channel-sync
  - pm writes PLAN-{slug}.md and needs to scope travel work without underestimating availability and channels
  - any spec touches tours, activities, departures, room nights, itineraries, OTAs, or commissions
  Do NOT apply to restaurants or fitness classes (use the matching vertical), and not to
  airline ticketing — see section 6.
effort: low
allowed-tools: Read, Write, Grep, Glob
paths:
  - "docs/architecture/**"
  - "docs/plans/**"
  - "docs/design/**"
---

# Vertical: Travel — spec it like you've run a sold-out Saturday

A tour operator or a twelve-room inn sells the same seat or room through its own site and
through four marketplaces at once, to people in other time zones, months ahead, with a
deposit now and a balance later. The incumbents (FareHarbor, Rezdy, Bókun, Peek for tours;
Cloudbeds, Little Hotelier for small stays; Travefy, TravelJoy for advisors) are built
around that. A naive spec models a "booking" as a row with a date and a headcount — and
double-sells the boat.

The four products and their incumbents:

| Product | Archetype | Wedge | Closest incumbent |
|---|---|---|---|
| tour-booking | booking | direct bookings without marketplace commission | FareHarbor / Rezdy |
| small-stay-booking | booking | a booking engine + calendar for under 20 rooms | Little Hotelier / Cloudbeds |
| trip-itinerary | crm | quote → itinerary → booked trip for an advisor | Travefy / TravelJoy |
| channel-sync | dashboard | one availability across marketplaces | Bókun / a channel manager |

## 1. Domain vocabulary (use these terms in the spec, not paraphrases)

- **Product → option → departure** — a tour ("Sunset cruise") has options (private /
  shared) and departures (a start time on a date). Availability lives on the departure.
- **Capacity by resource** — a departure is limited by what it consumes: seats on a boat,
  a guide, a vehicle. Two tours that share one guide share capacity.
- **Allotment** — inventory set aside for one channel or reseller, released back at a
  **release / cut-off** time if unsold.
- **Pricing category** — adult / child / senior / infant, each with its own price and
  sometimes its own capacity weight (an infant on a lap takes no seat).
- **Per-person vs per-booking pricing** — a private charter is priced per booking up to N
  guests, then per extra guest.
- **OTA** — online travel agency: Viator, GetYourGuide, Booking.com, Airbnb, Expedia.
- **Channel manager** — the system that keeps availability and rates in step across OTAs.
  **ARI** — availability, rates and inventory: the three things it pushes.
- **Net rate vs commission** — the OTA either pays you a net rate or takes a percentage of
  the retail price. **Merchant of record** is whoever charged the traveller's card.
- **Rate plan** — for stays: refundable / non-refundable / breakfast-included, each with
  its own price and cancellation terms. **Min-stay / max-stay** by date range, **closed to
  arrival**, **blackout**. **Booking window** — how far ahead a date may be booked, and how
  close to arrival.
- **Extras / add-ons** — breakfast, a transfer, equipment hire: priced per person or per
  booking, per night or once.
- **Rate parity** — an OTA contract clause: your own site may not undercut the OTA.
- **Voucher / ticket** — what the guest shows; a QR code scanned at check-in.
- **Manifest** — the list of who is on a departure, with pickup points and notes.
- **Deposit / balance due** — part now, the rest N days before travel.
- **No-show**, **waitlist**, **reschedule** — distinct outcomes, each with its own money.
- **FIT vs group** — independent travellers vs a group booked and paid as one.
- **Quote → itinerary → booking** — the advisor's pipeline; an itinerary is a day-by-day
  plan of components (stay, transfer, activity) from different **suppliers**.
- **ADR / occupancy / RevPAR** — the three numbers a small-stay owner looks at.
- **GDS / NDC / PNR** — airline distribution. Named here so the spec can say "out of scope".

## 2. Non-obvious domain rules (the ones incumbents get right)

- **One availability, many channels.** Every sale on any channel must decrement the same
  departure before the next channel is told. A cart **hold** with an expiry reserves
  capacity during checkout; without it two people buy the last seat.
- **Time is local to the place.** A 09:00 departure is 09:00 at the dock, whatever zone the
  buyer or the server is in. Store local date-time plus the IANA zone of the location.
- **The cancellation policy is a snapshot.** What applies is the policy shown when the
  guest booked, not the one configured today. Copy it onto the booking.
- **An OTA booking is not your payment.** When the OTA is merchant of record you never see
  the card: you receive a booking, a net amount later, and a payout to reconcile.
- **Weather cancels a whole departure.** Cancelling by operator means bulk rebook-or-refund
  for every booking on it, with a different refund rule than a guest cancellation.
- **Party composition is data.** Ages (child prices and room occupancy depend on them),
  weights (helicopters, zip lines), dietary notes and pickup location are collected per
  guest and end up on the manifest.
- **Commission is earned after travel.** A supplier pays the advisor weeks after the trip.
  Track expected vs received commission per booking, or the advisor never gets paid.
- **Price in one currency, charge in another.** Suppliers quote in theirs; record the
  amount, the currency and the rate used at the time of the quote.

## 3. What a naive build gets wrong

- **Availability as a number on the tour** instead of on each departure and its resources.
- **No hold during checkout** — the last seat is sold twice under load.
- **UTC timestamps for departure times** — tours shift by an hour twice a year.
- **Channel sync as a nightly job** — overbooking happens in the hours between.
- **Refund = full reversal** — real cases are partial: deposit kept, fee withheld, credit
  issued instead of money.
- **Treating OTA bookings as paid orders** — revenue is overstated by the commission and
  reconciliation never balances.
- **An itinerary as a rich-text document** — it cannot be priced, re-quoted or turned into
  supplier bookings.

## 4. Must-model entities (the shapes that prevent rework)

Pair these with [[migration-ready-schema]] (source_ref + import_batch_id on importable
entities; suppliers, guests and channels are their own tables).

- **Product / Option / Departure** — the departure carries local start time + zone,
  capacity, and the resources it consumes.
- **Resource** — guide, vehicle, vessel, room; with its own calendar, so shared resources
  block each other.
- **Booking** — channel (FK), status, **policy snapshot**, guests with category, age and
  notes, price lines including **extras** and taxes, deposit and balance schedule, voucher
  code.
- **Hold** — capacity reserved with an expiry, released automatically.
- **Channel** — direct / OTA / reseller, with commission model (net or percent) and whether
  it is merchant of record.
- **Payment / Refund / Credit** — separate records; a booking has many.
- **Itinerary** — ordered **components**, each with supplier (FK), cost, sell price,
  currency, confirmation number and commission expected / received.

## 5. Per-product notes (wedge + the one domain thing)

- **tour-booking** (booking) — *wedge:* commission-free direct bookings. *The one thing:*
  departure-level capacity by resource, with checkout holds. Payments →
  [[subscription-billing-engineer]] only for the deposit/balance schedule; card capture
  through a hosted checkout.
- **small-stay-booking** (booking) — *wedge:* a booking engine for inns under 20 rooms.
  *The one thing:* rate plans with min-stay and closed dates — a room night is not one
  price.
- **trip-itinerary** (crm) — *wedge:* quote-to-trip for an independent advisor. *The one
  thing:* the itinerary is structured components, with commission tracked per component.
- **channel-sync** (dashboard) — *wedge:* one calendar across marketplaces. *The one
  thing:* push availability on every change, not on a schedule. OTA APIs →
  [[connector-builder]] for reads, [[integrations-engineer]] for writes.

## 6. Compliance (light — flag, don't over-build)

- **Airline ticketing is out of scope.** Issuing tickets needs IATA or ARC accreditation
  and a GDS or NDC agreement. If flights are wanted, the product links out to a host
  agency or consolidator; it does not sell the seat.
- **Packages** — selling transport and accommodation together as one price triggers
  package-travel rules (EU Package Travel Directive; in the UK, ATOL when a flight is
  included). Flag it to the operator; do not model the insolvency protection.
- **Seller-of-travel registration** — some US states (California, Florida, Washington,
  Hawaii) require it. A flag for the operator, not a feature.
- **Passport and health details** — collect only what the supplier needs, delete after the
  trip. Cards go through a hosted payment page, never the app's own forms.
- **Liability waivers** — signed per guest before the activity; store the signed copy with
  the booking.
- **Tourist / city tax** — charged per person per night, per room per night, or as a
  percentage, depending on the place; separate from VAT. Keep it as its own price line
  with its collection rule.

## Checked against

Small stays: QloApps (2026-10) — room types and rooms, min/max length of stay by date
range, booking-offset limits, advance-payment rules per room type, date-based feature
pricing, closed dates, refund rules per property, adults/children with ages, tourism-tax
collection type, extra services, a channel-manager ARI interface. The stay rules above have
counterparts there. **Tours, activities and travel advisors are not yet checked against a
shipped product** — those sections rest on domain knowledge until a live project tests them.

---

Cross-refs: [[connector-builder]] (OTA reads), [[integrations-engineer]] (OTA writes,
payments), [[subscription-billing-engineer]] (deposit and balance schedules),
[[migration-ready-schema]] (importable entities).
