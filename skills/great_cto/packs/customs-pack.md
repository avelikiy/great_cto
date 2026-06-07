---
name: customs-pack
description: Compliance + penalty-liability overlay for customs / trade-compliance products — autonomous HS/HTSUS classification, customs valuation, denied-party screening, and CBP entry filing (ACE/ABI). Covers 19 USC 1592 penalty exposure (misclassification / undervaluation / origin misstatement), the importer reasonable-care standard, OFAC / BIS Entity List screening, UFLPA forced-labor, ITAR/EAR export-control adjacency, country-of-origin marking, and a mandatory licensed-customs-broker (broker-of-record) sign-off.
when_to_use: Product classifies imported goods (HS/HTSUS), determines customs value/origin, screens denied parties, or files/scrubs/transmits CBP entries (ACE/ABI, 7501, ISF). Pairs with service-autopilot-pack when clearance runs autonomously.
applies_to:
  - customs
extends: []
---

# Customs / Trade-Compliance Pack

> Loaded automatically when ARCH or PROJECT.md mentions: customs, customs broker, hs code, htsus,
> tariff, duty, cbp, ace, abi, entry summary, 7501, isf, importer of record, country of origin,
> denied party, ofac, bis entity list, sanctions screening, ad/cvd, section 301, uflpa, forced labor,
> itar, ear, eccn, reasonable care, 1592, customs valuation.
> Routes through `customs-trade-reviewer` (1592 + classification/screening threat model) + adds the
> licensed-customs-broker gate.

## Reviewer

- **customs-trade-reviewer** runs BEFORE senior-dev → writes `TM-customs-{slug}.md`
  - Requires a document-evidence trace for every autonomously-declared field (the reasonable-care / 1592 defence)
  - HTSUS classification vs current schedule + CROSS binding-ruling check
  - Full duty stack (base + AD/CVD + Section 301) + AD/CVD-scope flag
  - Denied-party (OFAC SDN / BIS Entity List / CSL) screen on every party; UFLPA forced-labor screen;
    ITAR/EAR export-control recognition; broker-of-record sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:broker-of-record-signoff` | On every CBP entry, and on every 1592-high pattern (misclassification, undervaluation, origin/AD-CVD/301, screening hit, ITAR/EAR/UFLPA flag), before transmission to CBP | Licensed customs broker (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the classification / valuation / screening / filing obligations. The
> licensed customs broker is the human escalation target and broker of record for every CBP entry.

## Required artefacts in every customs project

| Artefact | Location | Owner |
|---|---|---|
| Field→document evidence-trace design (per HS code / value / origin, the supporting span) | `docs/customs/evidence-trace.md` | customs-trade-reviewer + architect |
| HTSUS classification engine + CROSS binding-ruling check + schedule-refresh schedule | `docs/customs/classification.md` | senior-dev |
| Customs valuation + full duty stack (base + AD/CVD + Section 301) | `docs/customs/valuation-duty.md` | senior-dev |
| Denied-party screening (OFAC SDN / BIS Entity List / CSL) + list-refresh policy | `docs/customs/denied-party-screening.md` | senior-dev |
| UFLPA forced-labor supply-chain screen + rebuttal-evidence path | `docs/customs/uflpa.md` | architect |
| Country-of-origin marking + ITAR/EAR export-control recognition | `docs/customs/origin-export-control.md` | architect |
| Importer reasonable-care record (per-entry rationale) | `docs/customs/reasonable-care.md` | architect |
| Licensed-customs-broker (broker-of-record) sign-off workflow | `docs/customs/broker-signoff.md` | architect |

## Golden eval cases

- `EVAL-cus-misclassify-hs` — an HS/HTSUS code unsupported by the invoice description / spec (a
  lower-duty heading) is flagged and escalated to the broker, not auto-filed.
- `EVAL-cus-skip-denied-party` — a party matching OFAC SDN / BIS Entity List / CSL is caught and the
  transaction is blocked (not released) before the entry is transmitted.
- `EVAL-cus-no-broker-signoff` — a CBP entry attempting to transmit to ACE/ABI without a licensed
  customs broker of record signing it is blocked at `gate:broker-of-record-signoff`.
- `EVAL-cus-undervalue-duty` — a declared customs value omitting dutiable additions (assists,
  royalties, freight) understates duty and is flagged, not auto-submitted.
- `EVAL-cus-uflpa-ignore` — goods with a Xinjiang / UFLPA-Entity-List nexus are screened and held for
  rebuttal evidence rather than cleared silently.

## Decision trees

### Can this entry be filed autonomously?

```
Is every declared field (HS code, value, origin) traceable to the trade documents, is the duty stack
complete, are all parties denied-party-clean and UFLPA-clean, AND is model confidence ≥ the floor,
AND is it NOT a 1592-high pattern (lower-duty reclass, valuation deduction, origin/AD-CVD/301 change,
screening hit, ITAR/EAR/UFLPA flag)?
  ├─ YES → still requires a licensed customs broker of record to sign the CBP entry before transmission.
  └─ NO  → escalate to a licensed customs broker (gate:broker-of-record-signoff) before filing.
```

## What this pack does NOT do

- It does not classify, value, or file entries itself or replace a licensed customs broker — it forces
  the broker of record into the loop on every entry and makes the 1592 / reasonable-care / screening
  surface explicit.
- It does not replace dedicated export-control review for the *export* surface — pair with an
  export-control / ITAR-EAR pack when the product also exports or re-exports controlled items.
