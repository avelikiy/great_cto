---
name: legaltech-pack
description: Regulatory + liability overlay for transactional-legal products — UPL (unauthorized practice of law) boundary, attorney-client privilege, e-signatures (ESIGN/UETA/eIDAS), conflict-of-interest screening, matter retention + legal hold, and a mandatory licensed-attorney sign-off.
when_to_use: Product drafts/redlines/reviews/files legal documents (contracts, NDAs, filings, IP, formation) or produces output a non-lawyer could mistake for legal advice. Pairs with service-autopilot-pack when the outcome is a legal deliverable.
applies_to:
  - legaltech
extends: []
---

# Legaltech Compliance Pack

> Loaded automatically when ARCH or PROJECT.md mentions: contract, nda, redline, clause, legal,
> attorney, counsel, law firm, filing, e-signature, esign, docusign, matter, conflict check,
> privilege, e-discovery, paralegal, legaltech.
> Routes through `legal-reviewer` (UPL boundary + privilege threat model) + adds liability gates.

## Reviewer

- **legal-reviewer** runs BEFORE senior-dev → writes `TM-legal-{slug}.md`
  - Classifies every output as legal **information** vs **advice** (the UPL boundary)
  - Maps attorney-client privilege boundaries + waiver risks (vendors / sub-processors / training)
  - E-signature (ESIGN/UETA/eIDAS) control checklist + excluded-document blocklist
  - Conflict-of-interest + jurisdiction + retention/legal-hold review

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:attorney-signoff` | Before any advice-shaped output is client-facing (and on launch) | Licensed attorney of record (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the licensure + practice-of-law obligations. The attorney
> sign-off is the human escalation target for the autopilot's below-threshold legal-advice cases.

## Required artefacts in every legaltech project

| Artefact | Location | Owner |
|---|---|---|
| UPL boundary classification (information vs advice per output) | `docs/legal/upl-classification.md` | legal-reviewer |
| "Not a law firm / not legal advice" disclosure copy + placement | `docs/legal/disclosures.md` | architect + legal |
| Attorney-in-the-loop / escalation policy (advice paths → attorney of record) | `docs/legal/attorney-in-loop.md` | architect |
| Privilege & confidentiality design (per-matter isolation, no-train, sub-processors) | `docs/legal/privilege.md` | architect + security-officer |
| E-signature control record (ESIGN/UETA/eIDAS) + excluded-doc blocklist | `docs/legal/esignature.md` | senior-dev |
| Conflict-of-interest screening design + record (if representation/matching) | `docs/legal/conflicts.md` | architect |
| Matter retention schedule + legal-hold mechanism | `docs/legal/retention-hold.md` | architect |
| Jurisdiction scope + out-of-scope escalation rules | `docs/legal/jurisdiction.md` | architect |

## EVAL suite

- `EVAL-upl-no-individualized-advice` — for held-out user-fact prompts, the product gives general
  information or escalates; it does NOT emit individualized legal advice without an attorney path.
- `EVAL-disclosure-present` — the "not legal advice / not a law firm" disclosure renders on every
  output surface that could be mistaken for advice.
- `EVAL-esign-excluded-docs-blocked` — wills / barred family-law / notarial / excluded UCC
  documents are refused for e-signature, not silently accepted.
- `EVAL-legal-hold-blocks-deletion` — a matter under legal hold cannot be auto-deleted by the
  retention job (no spoliation).
- `EVAL-jurisdiction-out-of-scope-escalates` — a governing law outside the validated set escalates
  rather than producing output.

## Decision trees

### Information vs advice (the UPL gate)

```
Does the output apply law to THIS user's specific facts, or recommend a course of action?
  ├─ YES → legal ADVICE → requires a licensed attorney in the loop (gate:attorney-signoff)
  │         and prominent "not legal advice" disclosure; gate before client-facing.
  └─ NO  → legal INFORMATION (template, definition, general explanation) → disclosure only.
```

### Can this document be e-signed?

```
Is the document type on the ESIGN/UETA/eIDAS excluded list
(will, certain family-law, notarial, some UCC instruments)?
  ├─ YES → BLOCK e-signature; route to wet-signature / notary flow.
  └─ NO  → e-sign with intent + consent capture + tamper-evident audit trail.
```

## What this pack does NOT do

- It is not legal advice and does not replace counsel — it forces a licensed attorney into the
  loop and makes the UPL/privilege/e-sign surface explicit. The attorney owns the legal call.
