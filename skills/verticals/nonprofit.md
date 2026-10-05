---
name: vertical-nonprofit
description: Domain knowledge for the small-nonprofit vertical (donations, donor records, grants, volunteers) so architect and pm don't spec naively. Covers the vocabulary (gift vs pledge, soft credit, restricted fund, campaign/appeal, acknowledgment, sustainer, LYBUNT), the rules incumbents get right, what a naive build gets wrong, and the entities each of the four products (donation-pages, donor-crm, grant-tracker, volunteer-scheduling) must model. Applied by architect when writing ARCH-{slug}.md and by pm when writing PLAN-{slug}.md for any nonprofit product.
when_to_use: |
  Apply when:
  - architect writes ARCH-{slug}.md for donation-pages, donor-crm, grant-tracker, or volunteer-scheduling
  - pm writes PLAN-{slug}.md and needs to scope fundraising work without treating a gift as an order
  - any spec touches donors, gifts, pledges, receipts, funds, grants, or volunteers
  Do NOT apply to membership businesses that sell a service (use fitness or creator), or
  to commerce checkout (use retail).
effort: low
allowed-tools: Read, Write, Grep, Glob
paths:
  - "docs/architecture/**"
  - "docs/plans/**"
  - "docs/design/**"
---

# Vertical: Nonprofit — a gift is not an order

A donation looks like a checkout and is not one. Nothing is delivered, the "customer" is
often a couple or a company, the money may be promised now and paid over three years, it
may be legally tied to one purpose, and the receipt is a tax document. The incumbents
(Bloomerang, Little Green Light, Neon CRM for donor records; Donorbox, Givebutter for
giving pages; Submittable for grant applications; VolunteerHub, SignUpGenius for
volunteers) encode this. A naive spec reuses an e-commerce order table and cannot answer
"how much unrestricted money did we raise this year".

The four products and their incumbents:

| Product | Archetype | Wedge | Closest incumbent |
|---|---|---|---|
| donation-pages | content-platform | recurring giving with low fees | Donorbox / Givebutter |
| donor-crm | crm | donor records a two-person team can keep clean | Bloomerang / Little Green Light |
| grant-tracker | crud | deadlines and reports for grants applied for and won | a spreadsheet / Submittable |
| volunteer-scheduling | booking | shifts, sign-ups and hours | SignUpGenius / VolunteerHub |

## 1. Domain vocabulary (use these terms in the spec, not paraphrases)

- **Constituent** — anyone the organisation has a relationship with: donor, volunteer,
  board member, foundation. One person can be several.
- **Household / organisation** — the unit that gives. A couple gives as a household; a
  company or foundation gives as an organisation with contact people.
- **Gift** — money (or goods) received. **Pledge** — a promise to give, paid by one or
  more **pledge payments**.
- **Recurring gift / sustainer** — a standing monthly gift; each charge is its own gift.
- **Soft credit** — recognition for a gift someone else legally made (the board member who
  asked, the spouse, the person honoured). No money, no tax receipt.
- **Tribute gift** — given in honour or in memory of someone, with a notification sent to
  a third person.
- **In-kind gift** — goods or services instead of money; valued by the donor, not by you.
- **Restricted vs unrestricted** — a restricted gift may only be spent on what the donor
  named. **Fund / designation** is where it is booked.
- **Campaign → appeal → package** — the coding of how the gift was asked for: the annual
  campaign, the December mailing, version B of the letter.
- **Acknowledgment vs receipt** — the thank-you, and the tax document; often one letter.
- **Fair market value / deductible amount** — a 100 gala ticket with a 40 dinner is a 60
  gift.
- **Matching gift** — the donor's employer matches it; a second gift from a second donor.
- **DAF (donor-advised fund)** — the gift arrives from a fund sponsor; the advisor gets
  the soft credit and no receipt.
- **LYBUNT / SYBUNT** — gave Last Year / Some Year But Unfortunately Not This.
- **Retention rate**, **lapsed donor**, **major gift**, **moves management** — the fund-
  raiser's working vocabulary.
- **Grant lifecycle** — prospect → letter of inquiry → application → award → reports →
  closeout. **Funder**, **award period**, **deliverables**.
- **Shift**, **hours**, **background check** — the volunteer side.

## 2. Non-obvious domain rules (the ones incumbents get right)

- **The giver is a household or an organisation.** Totals, receipts and "largest gift" roll
  up to it. Two spouses with separate records and one joint cheque is the daily case.
- **Hard credit once, soft credit many.** The sum of hard credits equals the money in the
  bank. Soft credits are added for recognition and must never be summed with them.
- **A pledge is not revenue received.** Reports distinguish pledged, paid and outstanding;
  a payment applies against a specific pledge.
- **Restricted money is tracked to its fund until spent.** This is a legal promise to the
  donor, and the reason the fund is on every gift.
- **Three amounts per online gift.** What the donor gave, the processor's fee, and the net
  deposited — including the case where the donor chose to cover the fee. All three are
  kept and the payouts reconcile to the bank.
- **Recurring gifts fail quietly.** Cards expire; a failed charge needs retries and a card-
  update message, or a sustainer is lost without anyone deciding it.
- **The receipt states what the donor got back.** If nothing, it says so; if something,
  it names the value and the deductible remainder.
- **The gift date is the date it was given, not entered.** A cheque posted on 31 December
  and opened on 4 January belongs to the old tax year.
- **Anonymous means everywhere.** The flag suppresses the name in every list, export,
  report and public page, not only on the giving wall.
- **Duplicates are permanent work.** Every import and every online gift can create one;
  merge must keep both histories.

## 3. What a naive build gets wrong

- **Donor = one person with one email** — households, organisations and DAF gifts have
  nowhere to go.
- **Gifts in an orders table** — no fund, no campaign, no soft credit; every report a
  board asks for needs a rewrite.
- **A pledge stored as a gift** — revenue is counted twice, once promised and once paid.
- **Receipts as a generic "payment confirmation"** — not usable for tax; the January
  year-end summary cannot be produced.
- **Summing soft credits into totals** — the fundraising total exceeds the bank balance.
- **No failed-payment recovery** on recurring gifts.
- **Fees netted out of the amount** — the donor's record shows 96.80 for a 100 gift.
- **Grants as a to-do list** — no award period, no report due dates, no restricted fund
  for the money once it arrives.

## 4. Must-model entities (the shapes that prevent rework)

Pair these with [[migration-ready-schema]] (source_ref + import_batch_id on constituents
and gifts — every small nonprofit arrives with a spreadsheet or an export).

- **Constituent** — person or organisation, with **household** membership, do-not-contact
  and **anonymous** flags, and a merge history.
- **Gift** — donor (hard credit, FK), amount, **fee**, **net**, gift date, method, **fund**,
  **campaign / appeal**, optional pledge (FK), recurring plan (FK), tribute details,
  fair-market value, receipt reference.
- **SoftCredit** — gift (FK) + constituent (FK) + reason.
- **Pledge** — total, schedule, payments applied, balance, write-off.
- **RecurringPlan** — amount, interval, payment-method token, status, failure count.
- **Fund** — restricted or not, with its purpose text.
- **Receipt** — what was sent, when, with which wording; reissued, never edited.
- **Grant** — funder (FK to an organisation constituent), stage, amounts requested and
  awarded, award period, report deadlines, the fund it pays into.
- **VolunteerShift / Signup / HoursLog** — hours are logged against a shift and confirmed.

## 5. Per-product notes (wedge + the one domain thing)

- **donation-pages** (content-platform) — *wedge:* monthly giving with a "cover the fee"
  choice. *The one thing:* gross / fee / net on every gift and failed-charge recovery.
  Recurring charges → [[subscription-billing-engineer]].
- **donor-crm** (crm) — *wedge:* clean records for a tiny team. *The one thing:* household
  roll-up with hard and soft credits kept apart.
- **grant-tracker** (crud) — *wedge:* never miss a report deadline. *The one thing:* the
  grant is a lifecycle with dated obligations, tied to a restricted fund.
- **volunteer-scheduling** (booking) — *wedge:* sign-up without accounts. *The one thing:*
  hours are a record the organisation reports to funders, not a by-product of sign-ups.

## 6. Compliance (light — flag, don't over-build)

- **Tax receipts (US)** — a written acknowledgment is needed for any single gift of 250 or
  more, and a disclosure when a payment over 75 bought something in return. The receipt
  wording is the organisation's responsibility; the product supplies the fields.
- **Gift Aid (UK)** — needs a donor declaration on file per donor; store it with its date.
- **Charitable solicitation registration** — most US states require registration before
  asking their residents for money. A flag for the organisation, not a feature.
- **Raffles and prize draws** — regulated as gambling in many places. Flag before building.
- **Donor privacy** — donor lists are not shared or sold; honour contact preferences and
  consent for email in each donor's country.
- **Cards** — hosted payment fields only; store the processor's token, never the number.
- **Volunteers with children or vulnerable people** — a background-check status and its
  expiry is a field; running the check is a provider's job.

---

Cross-refs: [[subscription-billing-engineer]] (recurring gifts, failed charges),
[[migration-import-engineer]] (the spreadsheet every nonprofit brings),
[[migration-ready-schema]] (importable entities).
