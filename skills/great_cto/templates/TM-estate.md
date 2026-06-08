# TM-estate-{slug} — Estate-Planning / Probate Threat Model

**Owner:** estate-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Drafting a will or trust is the **practice of law** requiring a **licensed estate-planning attorney**; the
> dominant failure mode is **a void will (defective execution) or a missed irreversible tax election (706 /
> portability)** that cannot be fixed once the testator dies. This model forces an attorney sign-off into the pipeline.

## 1. Scope
- Pipeline: assets / beneficiary / family intake → capacity + execution formalities + estate-gift-GST exposure → undue-influence / conflict screen → instrument → execute / file (probate court) → administer
- Autonomy: suggest-to-attorney (assistant) · autonomous-above-confidence (autopilot)
- Instruments: will · trust · poa · probate …
- States: ca · ny · tx …
- Setting: self-represented · attorney-supervised · non-lawyer document service

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| UPL — unauthorized practice of law | | drafting/advice is law practice; the LegalZoom line limits non-lawyer document services |
| Execution formalities (state-specific) | | attestation, two witnesses, notarization, self-proving affidavit; defective execution voids the will |
| Beneficiary-witness purging statute | | a gift to a witness who is a beneficiary can be void |
| Testamentary capacity + undue influence | | capacity at execution; influence patterns block & escalate |
| Estate / gift / GST tax (IRC) | | Form 706 (nine-month deadline), Form 709, GST |
| Portability (DSUE) + unified credit | | irreversible election if missed |
| Fiduciary duties (executor / trustee) | | loyalty, prudence, accounting |
| Probate procedure + deadlines | | court filing, petition status, administration |
| Attorney-client privilege | | no legal advice from a non-lawyer |
| Licensed-attorney requirement | | attorney signs every instrument before execution |

## 3. Instrument/advice → licensed-attorney attribution (the UPL defence)
| Output | Evidence required | Present? |
|---|---|---|
| Will / trust draft | licensed attorney review + signature | |
| Estate-planning / tax advice | attorney authorship (no non-lawyer advice) | |
| Execution package | two witnesses, notarization, self-proving affidavit | |
| Capacity / influence finding | capacity assessment + undue-influence screen result | |

## 4. Edits & guardrails
- State execution formalities applied (attestation, two witnesses, notarization, self-proving affidavit, beneficiary-witness purging): …
- Testamentary-capacity assessment + undue-influence / conflict screen, pre-execution: …
- Estate/gift/GST exposure surfaced (Form 706 nine-month deadline, Form 709, portability/DSUE, unified credit), not silently skipped: …
- No legal / tax advice emitted from a non-lawyer; every instrument attributable to a licensed attorney: …

## 5. Autonomy boundary
- Confidence floor below which an instrument escalates to a licensed estate-planning attorney: …
- UPL/voidness-high patterns always escalated (auto-drafted will/trust, missing witness/notary formalities, capacity/undue-influence flag, software-decided 706/portability election): …
- Attorney audit trail (who/what drafted, assessed, screened, and signed each instrument): … (composes with service-autopilot audit trail)

## 6. Fiduciary duties, privilege & capacity record
- Fiduciary duties of executor/trustee (loyalty, prudence, accounting) recognised: …
- Attorney-client privilege preserved; no legal advice from a non-lawyer: …
- Per-instrument capacity / undue-influence record (capacity assessed, influence screened, basis): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:estate-attorney-signoff` — licensed estate-planning attorney signs off on every instrument and on every UPL/voidness-high pattern, before execution or filing.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
estate-reviewer-verdict: signed-off | blocked
instruments: [will | trust | poa | probate]
states: [ca | ny | tx | …]
upl-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Instrument/advice → licensed-attorney attribution (the UPL defence)
  - State execution formalities (two witnesses, notarization, self-proving affidavit, beneficiary-witness purging)
  - Testamentary-capacity assessment + undue-influence / conflict screen, pre-execution
  - Estate/gift/GST exposure surfaced (Form 706 nine-month deadline, Form 709, portability/DSUE, unified credit)
  - No legal/tax advice from a non-lawyer; fiduciary-duty + privilege recognition
  - Every instrument / execution / filing → licensed estate-planning attorney sign-off (gate:estate-attorney-signoff)
gate: gate:estate-attorney-signoff
