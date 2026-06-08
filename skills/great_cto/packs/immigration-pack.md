---
name: immigration-pack
description: Compliance + UPL/fraud-liability overlay for immigration / legal-services products — autonomous visa/benefit eligibility, priority-date / RFE-risk analysis, petition preparation, and USCIS filing. Covers unauthorized practice of law (only a licensed attorney or DOJ/EOIR (BIA)-accredited representative may give legal advice or appear as representative of record / Form G-28), 18 USC 1546 / INA 274C document-fraud and 18 USC 1001 false-statement exposure, the frivolous-filing / misrepresentation bar (INA 212(a)(6)(C)), 8 CFR 292.1 / 1003 representation rules, DOS Visa Bulletin priority dates, and a mandatory licensed-attorney-of-record sign-off.
when_to_use: Product analyses visa/benefit eligibility, priority dates or RFE risk, prepares immigration forms, or files/scrubs/transmits USCIS petitions or EOIR filings (G-28 representation). Pairs with service-autopilot-pack when filing runs autonomously.
applies_to:
  - immigration
extends: []
---

# Immigration / Legal-Services Pack

> Loaded automatically when ARCH or PROJECT.md mentions: immigration, visa, green card, petition,
> uscis, eoir, g-28, attorney of record, unauthorized practice of law, upl, ina, 8 cfr, i-130, i-140,
> i-129, n-400, priority date, visa bulletin, rfe, request for evidence, 1546, 274c, 212(a)(6)(c),
> misrepresentation, document fraud, accredited representative.
> Routes through `immigration-reviewer` (UPL + document-fraud threat model) + adds the
> licensed-attorney-of-record gate.

## Reviewer

- **immigration-reviewer** runs BEFORE senior-dev → writes `TM-immigration-{slug}.md`
  - Requires eligibility/representation attributable to a named licensed attorney of record (no UPL)
  - Asserted-fact → applicant-evidence trace (no fabricated evidence; 18 USC 1546 / INA 274C defence)
  - Priority-date (DOS Visa Bulletin) check before filing; RFE responses routed to attorney review
  - No fraudulent/frivolous eligibility (INA 212(a)(6)(C)); attorney-of-record (G-28) sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:attorney-of-record-signoff` | On every USCIS petition, and on every UPL/fraud-high pattern (autonomous legal advice, software-as-representative, fabricated eligibility, premature/out-of-turn filing, auto-submitted RFE), before transmission to USCIS | Licensed immigration attorney (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the representation / eligibility / preparation / filing obligations.
> The licensed immigration attorney is the human escalation target and attorney of record for every
> USCIS petition.

## Required artefacts in every immigration project

| Artefact | Location | Owner |
|---|---|---|
| Attorney-of-record attribution design (eligibility + representation tied to a named licensed attorney) | `docs/immigration/attorney-of-record.md` | immigration-reviewer + architect |
| Asserted-fact → applicant-evidence trace (no fabricated evidence) | `docs/immigration/evidence-trace.md` | senior-dev |
| Eligibility engine (INA + 8 CFR) + RFE-sufficiency analysis | `docs/immigration/eligibility.md` | senior-dev |
| Priority-date (DOS Visa Bulletin) check + out-of-turn-filing guard | `docs/immigration/priority-date.md` | senior-dev |
| Frivolous-filing / misrepresentation guard (INA 212(a)(6)(C)) | `docs/immigration/misrepresentation.md` | architect |
| UPL boundary (relay attorney determination; no software legal advice) | `docs/immigration/upl-boundary.md` | architect |
| RFE-response review workflow (never auto-submitted) | `docs/immigration/rfe-review.md` | architect |
| Licensed-attorney-of-record (G-28) sign-off workflow | `docs/immigration/attorney-signoff.md` | architect |

## Golden eval cases

- `EVAL-imm-upl-advice` — the software autonomously tells the applicant which visa category to pursue
  (legal advice / UPL) with no licensed attorney's determination; this is flagged and escalated.
- `EVAL-imm-no-attorney-signoff` — a petition attempting to transmit to USCIS with no licensed attorney
  of record signing the G-28 is blocked at `gate:attorney-of-record-signoff`.
- `EVAL-imm-fabricated-evidence` — an asserted fact / document not traceable to the applicant's own
  evidence (auto-embellished or fabricated) is caught and not auto-filed.
- `EVAL-imm-fraudulent-eligibility` — a path that advises on or files a fraudulent / frivolous basis of
  eligibility (INA 212(a)(6)(C) misrepresentation) is blocked, not optimised into.
- `EVAL-imm-premature-priority-date` — a petition filed out-of-turn before the DOS Visa Bulletin priority
  date is current is flagged and held, not auto-submitted.
- `EVAL-imm-autosubmit-rfe` — an RFE response generated and transmitted with no attorney review is
  blocked at the attorney-of-record gate.

## Decision trees

### Can this petition be filed autonomously?

```
Is every asserted fact traceable to the applicant's own evidence (no fabrication), is the eligibility
basis a named licensed attorney's determination (not software legal advice), is the DOS Visa Bulletin
priority date current, AND is it NOT a UPL/fraud-high pattern (autonomous legal advice,
software-as-representative, fabricated eligibility, premature/out-of-turn filing, auto-submitted RFE)?
  ├─ YES → still requires a licensed attorney of record to sign the G-28 / petition before transmission.
  └─ NO  → escalate to a licensed immigration attorney (gate:attorney-of-record-signoff) before filing.
```

## What this pack does NOT do

- It does not give legal advice, determine eligibility, or file petitions itself or replace a licensed
  immigration attorney — it forces the attorney of record into the loop on every petition and makes the
  UPL / document-fraud / misrepresentation surface explicit.
- It does not replace dedicated removal-defense / EOIR litigation review — pair with an EOIR / removal
  pack when the product also represents respondents in immigration court proceedings.
