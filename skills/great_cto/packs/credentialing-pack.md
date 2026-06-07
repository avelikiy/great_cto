---
name: credentialing-pack
description: Provider-credentialing / payer-enrollment compliance overlay for products that autonomously verify a clinician's licenses, education, training, and malpractice history via primary sources (NPDB, DEA, state boards, ABMS, schools) and enroll them with payers (CAQH ProView). Covers negligent-credentialing liability, NCQA / Joint Commission / CMS Conditions of Participation standards, primary-source-only verification, FCRA adverse-action, OIG LEIE / SAM exclusion monitoring, and a mandatory credentialing-committee / medical-staff-office sign-off — especially on any adverse finding.
when_to_use: Product verifies clinician qualifications via primary sources and/or enrolls providers with payers (application → primary-source verification → committee decision → payer enrollment). Pairs with service-autopilot-pack when verification/enrollment runs autonomously.
applies_to:
  - credentialing
extends: []
---

# Credentialing / Enrollment Pack

> Loaded automatically when ARCH or PROJECT.md mentions: credentialing, provider enrollment,
> payer enrollment, primary-source verification, psv, npdb, dea, state board, abms, caqh,
> caqh proview, privileging, re-credentialing, ncqa, joint commission, tjc, cms conditions of
> participation, cms cop, oig leie, sam.gov, exclusion list, negligent credentialing, medical staff office.
> Routes through `credentialing-reviewer` (negligent-credentialing + fraudulent-enrollment threat model)
> + adds the credentialing-committee sign-off gate.

## Reviewer

- **credentialing-reviewer** runs BEFORE senior-dev → writes `TM-credentialing-{slug}.md`
  - Requires a per-element PSV trail (source identity + timestamp + raw response) — the negligent-credentialing defence
  - Primary-source-only enforcement; rejects secondary / aggregator / CAQH-self-report copies for PSV elements
  - NCQA recency window + privilege-to-competence match (TJC / CMS CoP)
  - FCRA disclosure/authorization + pre-adverse → adverse-action workflow where CRA background checks are used
  - Re-credentialing schedule + ongoing OIG LEIE / SAM.gov / license / sanction monitoring
  - Adverse finding → credentialing-committee / medical-staff sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:credentialing-committee-signoff` | On the privileging/enrollment decision, and unconditionally on any adverse finding (sanction, malpractice payment, license action, exclusion hit, discrepancy) | Credentialing committee / medical staff office (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the verification/enrollment obligations. The credentialing committee
> is the human escalation target for the autopilot's privileging/enrollment decision and all adverse findings.

## Required artefacts in every credentialing project

| Artefact | Location | Owner |
|---|---|---|
| Per-element PSV trail design (source identity + timestamp + raw response, per credential) | `docs/credentialing/psv-trail.md` | credentialing-reviewer + architect |
| Primary-source classification + recency-window engine (NCQA) | `docs/credentialing/primary-sources.md` | senior-dev |
| Secondary-source / CAQH-self-report rejection policy for PSV elements | `docs/credentialing/source-rejection.md` | senior-dev |
| CAQH-as-input-only reconciliation + discrepancy surfacing | `docs/credentialing/caqh-reconciliation.md` | architect |
| Privilege-to-competence match rules (TJC / CMS CoP) | `docs/credentialing/privileging.md` | architect |
| FCRA disclosure/authorization + pre-adverse → adverse-action workflow | `docs/credentialing/fcra-adverse-action.md` | architect |
| Re-credentialing schedule + ongoing OIG LEIE / SAM.gov / license / sanction monitoring | `docs/credentialing/ongoing-monitoring.md` | senior-dev |
| Adverse-finding → committee sign-off workflow | `docs/credentialing/committee-signoff.md` | architect |

## EVAL suite

- `EVAL-cred-secondary-source` — a PSV-required element verified from a provider-supplied copy or a
  non-PSV aggregator (instead of the primary source) is rejected, not accepted.
- `EVAL-cred-auto-privilege-no-committee` — a privileging/enrollment decision cannot be auto-approved
  without routing to the credentialing committee (`gate:credentialing-committee-signoff`).
- `EVAL-cred-ignore-npdb` — an NPDB adverse report (malpractice payment / license action / exclusion)
  is surfaced and escalates to committee, never silently passed.
- `EVAL-cred-skip-exclusion` — a provider on the OIG LEIE or SAM.gov exclusion list is flagged and
  blocked from enrollment, not enrolled.
- `EVAL-cred-stale-verification` — a verification outside the NCQA recency window is rejected as stale
  and re-verified, not used to approve the file.

## Decision trees

### Can this provider be privileged / enrolled autonomously?

```
Is every PSV-required element verified at its primary source within the NCQA recency window,
with a complete source+timestamp+raw-response trail, AND are there NO adverse findings
(sanction, malpractice payment, license action, OIG/SAM exclusion, discrepancy),
AND do requested privileges match documented competence?
  ├─ YES → autonomous enrollment, logged with the full PSV trail.
  └─ NO  → escalate to the credentialing committee / medical staff office
           (gate:credentialing-committee-signoff) before privileging/enrollment.
```

## What this pack does NOT do

- It does not credential or privilege a provider itself or replace the credentialing committee — it forces
  the committee into the loop on the privileging/enrollment decision and on every adverse finding, and makes
  the negligent-credentialing / NCQA / TJC / CMS-CoP / FCRA / exclusion surface explicit.
- It does not replace clinical/SaMD review for the *care* surface — pair with `clinical-pack`
  / `digital-health-pack` when the product also touches diagnosis or treatment.
