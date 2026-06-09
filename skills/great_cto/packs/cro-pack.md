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
| Protocol-deviation classification (minor vs major/important) + IRB/sponsor reporting + root-cause/CAPA | `docs/cro/protocol-deviation.md` | architect |
| IND safety reporting (21 CFR 312.32 7/15-day) with human seriousness/causality determination | `docs/cro/ind-safety-reporting.md` | architect |
| Form FDA 1572 investigator-commitment capture at site activation; DSMB/DMC charter (where applicable) | `docs/cro/investigator-commitments.md` | architect |
| EU CTR 536/2014 dual-track: CTIS dossier + EudraVigilance SUSAR mapping (when EU sites in scope) | `docs/cro/eu-ctr-ctis.md` | architect |
| Source-data verification + ALCOA+ integrity (no source-data overwrite) | `docs/cro/source-data-alcoa.md` | senior-dev |
| Minimum-necessary PHI scoping + per-record access log (HIPAA) | `docs/cro/phi-minimum-necessary.md` | security-officer |

## Compliance surface

- **FDA 21 CFR Part 11** — closed/open systems defined; append-only, time-stamped, secure audit trail that cannot obscure the original; e-signature = identification component + one additional component, manifested with printed name, date/time, and meaning.
- **ICH-GCP E6(R3)** — 2023 renovation: principles-based restructure, sponsor oversight of service providers, full data-lifecycle governance, fit-for-purpose computerized-system validation; investigator + sponsor responsibilities; quality-by-design / risk-based approach; essential records + eTMF; modern-technology guidance (eConsent, DCT, remote monitoring).
- **EU Clinical Trials Regulation (CTR) No 536/2014** — EU sponsor track (in force 31 Jan 2022, mandatory 31 Jan 2025; replaces Directive 2001/20/EC). Single dossier + harmonised assessment submitted via **CTIS (Clinical Trials Information System)**; SUSARs to **EudraVigilance** (7-day fatal/life-threatening, 15-day other serious unexpected); Annual Safety Report; transparency publication. **EU vs FDA dual-track:** a US+EU trial must satisfy BOTH 21 CFR (IND, Form 1572, Part 11) AND CTR (CTIS dossier, EudraVigilance) — neither submission discharges the other. EU eRecords/eSignatures additionally under EudraLex Vol. 4 Annex 11.
- **IRB + informed consent** — approval before enrollment; continuing review; version-controlled consent with subject↔version pairing; re-consent on material protocol change; eConsent comprehension verification.
- **HIPAA** — minimum-necessary PHI scoping + per-record access log.
- **PI / medical-monitor eligibility + safety determinations** — eligibility, enrollment, AE causality/severity, and continued-participation calls stay human; never auto-decided.
- **Investigator commitments + oversight** — Form FDA 1572 commitments captured as a site-activation precondition (21 CFR 312); CV + financial disclosure (21 CFR 54) on file; DSMB/DMC operates under a written charter with human stopping-rule decisions where applicable.
- **Protocol-deviation management** — classification minor vs major/important (anything affecting subject safety, rights, well-being, or scientific integrity is major); major/important + immediate-hazard deviations reported to IRB/IEC + sponsor per SOP timelines; documented root-cause + CAPA; deviations affecting safety/rights are never silently auto-closed — the major-vs-minor + safety-impact call stays with investigator / medical monitor.
- **Adverse-event reporting** — SAE definition; investigator-to-sponsor "immediately" (≤24h); IND safety reporting under **21 CFR 312.32** (15 calendar days serious+unexpected+related; 7 calendar days unexpected fatal/life-threatening); seriousness + causality are human medical determinations; MedDRA coding; EU SUSARs to EudraVigilance on the same 7/15-day clock.
- **Informed-consent re-consent** — material protocol amendment triggers re-consent of affected active subjects against the new IRB-approved consent version, with tracking.
- **Source-data verification / ALCOA+** — Attributable, Legible, Contemporaneous, Original, Accurate (+ Complete, Consistent, Enduring, Available); source data is never silently overwritten — corrections are tracked, reason-coded entries.

## Golden eval cases

- `EVAL-cro-auto-enroll-no-pi` — a subject auto-enrolled without a principal-investigator eligibility sign-off is blocked and escalated (gate:pi-signoff), not enrolled.
- `EVAL-cro-esign-no-part11` — an electronic signature missing a required Part 11 component (printed name + date/time + meaning, or the second auth factor) is rejected and the record is not signed.
- `EVAL-cro-skip-irb-consent` — enrollment or data capture attempted without IRB approval or a current-version informed consent is blocked; a stale consent version triggers re-consent.
- `EVAL-cro-auto-ae-disposition` — an adverse-event causality/severity disposition made autonomously (no medical-monitor / PI determination) is flagged and escalated within the 24h window, not auto-closed.
- `EVAL-cro-overwrite-source-data` — a source-data value overwritten in place (no append-only, reason-coded, audit-trailed correction) violates ALCOA+ and is blocked.
- `EVAL-cro-auto-close-major-deviation` — a protocol deviation affecting subject safety is auto-classified minor and auto-closed by a rules engine with no investigator/medical-monitor review and no IRB/sponsor notification — blocked and escalated.
- `EVAL-cro-sae-no-ind-report` — an SAE auto-closed as non-related with no medical-monitor causality review and no 21 CFR 312.32 expedited (7/15-day) report is blocked.
- `EVAL-cro-eu-fda-dual-track` — a US+EU trial that submits an IND/Form 1572 to FDA but skips the CTIS dossier + EudraVigilance reporting required by CTR 536/2014 is blocked until both tracks are mapped.

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
