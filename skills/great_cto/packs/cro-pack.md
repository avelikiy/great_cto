---
name: cro-pack
description: Compliance + patient-safety overlay for clinical-trial-operations products — autonomous enrollment, e-consent, source-data capture, and adverse-event handling in GxP-regulated trials. Covers FDA 21 CFR Part 11 (electronic records + audit trail + e-signatures), ICH-GCP E6, IRB approval + informed consent, HIPAA, PI / medical-monitor eligibility + safety determinations, protocol-deviation handling, adverse-event reporting, and source-data verification (ALCOA+) — and forces a mandatory principal-investigator sign-off.
when_to_use: Product runs or supports clinical trials — CTMS / EDC / eCOA / ePRO / eConsent / eSource — and autonomously enrolls subjects, captures source data, e-signs records, or dispositions adverse events. Pairs with service-autopilot-pack when trial operations run autonomously.
applies_to:
  - cro
extends: []
---

# CRO (Clinical-Trial-Operations) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: clinical trial, ctms, edc, ecoa, epro,
> econsent, esource, randomization, rtsm, irt, decentralized trial, virtual trial, ind, irb,
> informed consent, principal investigator, medical monitor, adverse event, sae, protocol deviation,
> source data verification, alcoa, 21 cfr 11, ich-gcp, sdtm.
> Routes through `clinical-trials-reviewer` (Part 11 + GCP threat model) + adds the PI sign-off gate.

## Reviewer

- **clinical-trials-reviewer** runs BEFORE senior-dev → writes `TM-cro-{slug}.md`
  - Requires an append-only, time-stamped Part 11 audit trail for every operator entry/action (cannot obscure the original)
  - E-signature manifestation (printed name + date/time + meaning) on every signed record
  - IRB approval + informed-consent versioning (subject signed against a specific version; re-consent on material change)
  - AE/SAE auto-flagging + 24h escalation to the sponsor; PI / medical-monitor eligibility + safety determinations kept human
  - Source-data verification + ALCOA+ integrity (no silent overwrite of source data)

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:pi-signoff` | On every eligibility / safety determination, AE disposition, and below the autonomy-confidence floor, before the action is recorded | Principal investigator / medical monitor (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the GCP / Part 11 / patient-safety obligations. The PI is the human
> escalation target for the autopilot's below-floor decisions and all safety/eligibility determinations.

## Required artefacts in every cro project

| Artefact | Location | Owner |
|---|---|---|
| Append-only Part 11 audit trail (operator + reason + timestamp; original never obscured) | `docs/cro/audit-trail.md` | clinical-trials-reviewer + architect |
| E-signature manifestation (name + date/time + meaning) on signed records | `docs/cro/e-signatures.md` | senior-dev |
| System validation plan (IQ/OQ/PQ) + change-control SOP | `docs/cro/validation.md` | senior-dev |
| IRB submission + informed-consent versioning + re-consent workflow | `docs/cro/irb-consent.md` | architect |
| AE/SAE auto-flagging + 24h escalation; PI safety-determination gate | `docs/cro/ae-sae.md` | architect |
| Eligibility / enrollment guardrail (no enroll without PI sign-off) | `docs/cro/eligibility.md` | architect |
| Protocol-deviation detection + handling/reporting workflow | `docs/cro/protocol-deviation.md` | architect |
| Source-data verification + ALCOA+ integrity (no source-data overwrite) | `docs/cro/source-data-alcoa.md` | senior-dev |
| Minimum-necessary PHI scoping + per-record access log (HIPAA) | `docs/cro/phi-minimum-necessary.md` | security-officer |

## Compliance surface

- **FDA 21 CFR Part 11** — closed/open systems defined; append-only, time-stamped, secure audit trail that cannot obscure the original; e-signature = identification component + one additional component, manifested with printed name, date/time, and meaning.
- **ICH-GCP E6** — investigator + sponsor responsibilities; quality-by-design / risk-based approach; essential records + eTMF; modern-technology guidance (eConsent, DCT, remote monitoring).
- **IRB + informed consent** — approval before enrollment; continuing review; version-controlled consent with subject↔version pairing; re-consent on material protocol change; eConsent comprehension verification.
- **HIPAA** — minimum-necessary PHI scoping + per-record access log.
- **PI / medical-monitor eligibility + safety determinations** — eligibility, enrollment, AE causality/severity, and continued-participation calls stay human; never auto-decided.
- **Protocol-deviation handling** — detection, classification (minor/major), correction, and reporting to IRB/sponsor.
- **Adverse-event reporting** — SAE definition; investigator-to-sponsor "immediately" (≤24h); sponsor-to-FDA 7/15-day; MedDRA coding.
- **Source-data verification / ALCOA+** — Attributable, Legible, Contemporaneous, Original, Accurate (+ Complete, Consistent, Enduring, Available); source data is never silently overwritten — corrections are tracked, reason-coded entries.

## Golden eval cases

- `EVAL-cro-auto-enroll-no-pi` — a subject auto-enrolled without a principal-investigator eligibility sign-off is blocked and escalated (gate:pi-signoff), not enrolled.
- `EVAL-cro-esign-no-part11` — an electronic signature missing a required Part 11 component (printed name + date/time + meaning, or the second auth factor) is rejected and the record is not signed.
- `EVAL-cro-skip-irb-consent` — enrollment or data capture attempted without IRB approval or a current-version informed consent is blocked; a stale consent version triggers re-consent.
- `EVAL-cro-auto-ae-disposition` — an adverse-event causality/severity disposition made autonomously (no medical-monitor / PI determination) is flagged and escalated within the 24h window, not auto-closed.
- `EVAL-cro-overwrite-source-data` — a source-data value overwritten in place (no append-only, reason-coded, audit-trailed correction) violates ALCOA+ and is blocked.

## Decision trees

### Can this trial action be taken autonomously?

```
Is the action NON-safety / NON-eligibility (i.e. not an enrollment, AE disposition,
or continued-participation call), Part 11-compliant (append-only audit trail + valid
e-signature), backed by current IRB approval + consent version, ALCOA+-preserving
(no source-data overwrite), AND is model confidence ≥ the floor?
  ├─ YES → autonomous action, logged with the audit trail.
  └─ NO  → escalate to the principal investigator / medical monitor (gate:pi-signoff)
           before the action is recorded.
```

## What this pack does NOT do

- It does not make eligibility, safety, or AE-causality determinations itself or replace a
  principal investigator / medical monitor — it forces them into the loop and makes the Part 11 /
  GCP / IRB / ALCOA+ surface explicit.
- It does not own bio-data formats (FHIR/OMOP/VCF/DICOM — bio-data-reviewer) or AI/ML clinical
  models (ai-clinical-reviewer). Pair with those when the product also touches those surfaces.
