---
name: vertical-maritime
description: Domain knowledge for the small maritime vertical (marinas, boat charter, vessel upkeep, ocean shipment tracking for small forwarders) so architect and pm don't spec naively. Covers the vocabulary (slip, LOA/beam/draft, transient vs seasonal, bareboat, charter week, running hours, container vs bill of lading, demurrage vs detention, free time, cut-offs), the rules incumbents get right, what a naive build gets wrong, and the entities each of the four products (marina-management, charter-booking, vessel-upkeep, ocean-tracking) must model. Applied by architect when writing ARCH-{slug}.md and by pm when writing PLAN-{slug}.md for any maritime product.
when_to_use: |
  Apply when:
  - architect writes ARCH-{slug}.md for marina-management, charter-booking, vessel-upkeep, or ocean-tracking
  - pm writes PLAN-{slug}.md and needs to scope work on boats, berths or containers
  - any spec touches slips, charters, vessel maintenance, containers, bills of lading, or port dates
  Do NOT apply to parcel shipping or warehouses (use logistics), or to day tours sold by
  the seat (use travel). Navigation and safety-of-life features are out of scope — see
  section 6.
effort: low
allowed-tools: Read, Write, Grep, Glob
paths:
  - "docs/architecture/**"
  - "docs/plans/**"
  - "docs/design/**"
---

# Vertical: Maritime — the boat has to fit, and the clock is already running

Small maritime businesses sell space and time on water: a berth a boat physically fits
into, a week on a yacht, the hours left before an engine service, the days a container may
sit before the port starts charging. The incumbents (Dockwa, Molo for marinas; Booking
Manager, NauSYS for charter fleets; Seahub and similar for vessel upkeep; Terminal49,
Vizion for container tracking; GoFreight, Magaya for small forwarders) are built on those
constraints. A naive spec treats a slip as a hotel room and a container as a parcel.

The four products and their incumbents:

| Product | Archetype | Wedge | Closest incumbent |
|---|---|---|---|
| marina-management | booking | fill empty slips with transient boats | Dockwa / Molo |
| charter-booking | booking | fleet calendar with owner statements | Booking Manager / NauSYS |
| vessel-upkeep | crud | maintenance and certificates that never lapse | Seahub |
| ocean-tracking | dashboard | free-time alerts before the port charges | Terminal49 / Vizion |

## 1. Domain vocabulary (use these terms in the spec, not paraphrases)

- **Slip / berth / mooring** — a place to keep a boat: alongside a dock, or on a buoy.
- **LOA, beam, draft** — a boat's length overall, width, and depth below the water. The
  three numbers that decide whether it fits.
- **Transient vs seasonal / annual** — a visitor for nights vs a contract holder.
- **Dockage** — the fee, usually per foot (or metre) of length per night.
- **Shore power**, **pump-out**, **fuel dock**, **haul-out**, **dry stack** — the marina's
  metered and scheduled services.
- **Bareboat / skippered / crewed** — a charter without crew, with a captain, or with full
  crew. **Charter week** — typically Saturday to Saturday. **Base** — the home marina.
- **Option** — a hold on a charter week that expires unless a deposit arrives.
- **Security deposit / damage waiver** — held at check-in, released at check-out.
- **Skipper qualification** — the licence a bareboat charterer must show.
- **HIN / registration / MMSI / IMO number** — a vessel's identifiers.
- **Running hours** — engine hours; with the calendar, what maintenance is scheduled by.
- **Survey**, **certificate**, **safety equipment service** — dated obligations: life raft,
  flares, fire extinguishers, emergency beacon battery.
- **FCL / LCL** — a full container vs a share of one. **TEU** — the twenty-foot unit.
- **Container number** — four letters, six digits and a check digit.
- **Bill of lading (master / house)** — the carrier's contract, and the forwarder's own.
  **Booking number** — the reservation with the carrier.
- **Vessel / voyage**, **POL / POD** (ports of loading and discharge), **transshipment**.
- **ETD / ETA / ATD / ATA** — estimated and actual departure and arrival.
- **Cut-offs** — the deadlines before sailing: cargo, documents, and verified weight.
- **Free time**, **demurrage**, **detention** — the free days, then the charge for a
  container left in the terminal, then the charge for keeping it outside.
- **Milestones** — gate-in, loaded, departed, discharged, available, gate-out, empty
  returned.

## 2. Non-obvious domain rules (the ones incumbents get right)

- **A slip assignment is geometry.** The boat's LOA, beam and draft are checked against the
  slip's length, width and depth at low water. "Any free slip" is not a valid answer.
- **Dockage is priced by length**, usually the greater of the boat's LOA and the slip's
  length, with season and stay-length rates. Power is metered and billed separately.
- **A seasonal holder's empty slip is inventory.** When they go cruising and say so, the
  slip can be let to a transient boat until their return date.
- **A charter is sold in fixed blocks with a turnaround day.** A booking that starts on a
  Wednesday breaks two weeks. Options expire and release the week automatically.
- **The boat usually belongs to someone else.** Charter fleets are owner boats under
  management: every booking produces an owner statement with the revenue split, costs
  charged to the owner, and owner-use weeks blocked on the calendar.
- **No handover without paperwork.** Crew list, skipper qualification and the deposit
  pre-authorisation are conditions of check-in, tracked per booking.
- **Maintenance is due by hours or by date, whichever comes first.** An oil change every
  250 hours or 12 months needs both counters. Hours are entered by people and can go
  backwards by mistake; validate.
- **An expired certificate grounds the vessel.** Certificate and safety-equipment expiry
  are hard deadlines with advance warnings, not tasks that can be snoozed.
- **A shipment has three keys.** Container number, bill of lading and booking number each
  unlock different carrier data, and one bill of lading can cover many containers.
- **ETAs move.** Keep every change with its timestamp and source; "the ETA slipped four
  days last Tuesday" is what the customer asks about.
- **Carrier events do not agree.** Each carrier names milestones differently and reports
  some late or never; normalise onto one milestone list and keep the raw event.
- **The money is in free time.** Demurrage and detention start from discharge and gate-out
  dates, and free days differ by carrier, port and contract. Alerts before the last free
  day are the product.
- **A ship's position is not the container's.** Vessel tracking says where the ship is;
  whether the box is on it comes from the carrier's milestones.

## 3. What a naive build gets wrong

- **Slips as interchangeable rooms** — a 45-foot boat is assigned a 30-foot slip.
- **Per-night flat pricing** — the marina's actual tariff cannot be entered.
- **Charter bookings on arbitrary dates** — the calendar fragments and weeks go unsold.
- **No owner on the boat** — the fleet manager cannot produce a statement.
- **Maintenance by date only** — a boat used hard misses services; one laid up gets them
  needlessly.
- **Certificates as documents in a folder** — nothing warns before they lapse.
- **One "tracking number" per shipment** — the model breaks on the first multi-container
  bill of lading.
- **Overwriting the ETA** — the history the customer needs is gone.
- **No free-time arithmetic** — the product shows where the container is and misses why
  anyone looks.
- **Container numbers stored unvalidated** — a mistyped number polls a carrier for weeks.

## 4. Must-model entities (the shapes that prevent rework)

Pair these with [[migration-ready-schema]] (source_ref + import_batch_id — marinas and
forwarders both arrive with spreadsheets).

- **Slip** — length, width, depth at low water, power available, dock, status.
- **Vessel** — LOA, beam, draft, identifiers, owner (FK), engine(s) with running hours.
- **Reservation / Contract** — slip (FK), vessel (FK), transient or seasonal, dates, rate
  basis, metered charges; **Absence** records that release a seasonal slip.
- **Charter booking** — vessel (FK), block dates, type (bareboat / skippered / crewed),
  option expiry, crew list, qualification check, deposit hold, extras.
- **Owner statement** — per owner per period: bookings, split, costs, owner-use weeks.
- **Maintenance task** — interval in hours and in days, last done at (hours + date), next
  due computed from both.
- **Certificate / Equipment** — item, issue and expiry dates, warning lead time.
- **Shipment** — house bill of lading; parties; route (POL, POD, transshipment ports).
- **Container** — validated number, size/type, linked to a master bill of lading and
  booking; **Milestone events** (normalised + raw + source + time).
- **ETA history** — each estimate with when and from whom it came.
- **Free-time terms** — days free and daily rates for demurrage and detention, per carrier
  and port; the computed last free day per container.

## 5. Per-product notes (wedge + the one domain thing)

- **marina-management** (booking) — *wedge:* online transient bookings that fill empty
  slips. *The one thing:* fit by LOA, beam and draft, with length-based pricing.
- **charter-booking** (booking) — *wedge:* one fleet calendar across agents. *The one
  thing:* week blocks with expiring options, and an owner statement per boat.
- **vessel-upkeep** (crud) — *wedge:* nothing lapses. *The one thing:* tasks due by hours
  or date, and certificates as hard deadlines. Offline entry on board →
  [[mobile-app-builder]].
- **ocean-tracking** (dashboard) — *wedge:* a warning before the port starts charging.
  *The one thing:* normalised milestones plus free-time arithmetic. Carrier and terminal
  data → [[connector-builder]].

## 6. Compliance (light — flag, don't over-build)

- **Navigation and safety of life are out of scope.** Charts, collision avoidance, distress
  alerting and anything a crew would rely on at sea belong to type-approved equipment. The
  product may show a position; it must say it is not for navigation.
- **Passenger vessels** — carrying paying passengers brings licensing and passenger-count
  rules that vary by country. Flag to the operator.
- **Customs filings** — advance cargo declarations are a customs broker's filing. Carry the
  reference numbers; do not build the filing.
- **Verified gross mass** — the weight declared before loading is the shipper's legal
  declaration. Record who declared it and when.
- **Sanctions screening** of shipment parties — flag it; it is a provider's service.
- **Crew and guest documents** — passport and licence copies are sensitive personal data:
  collect what the handover needs and delete after the charter.

---

Cross-refs: [[connector-builder]] (carrier and terminal data), [[mobile-app-builder]]
(entries made on board), [[migration-ready-schema]] (importable entities).
