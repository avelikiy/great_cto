---
name: pharma-pack
description: Compliance + safety-liability overlay for pharmacovigilance / drug-safety products — autonomous adverse-event ICSR intake, MedDRA coding, de-dup, seriousness/expectedness triage, narrative + causality. Covers FDA 21 CFR 314.80 / 600.80 + ICH E2A/E2B(R3)/E2D, expedited 15-day reporting, FAERS / EudraVigilance E2B submission, MedDRA accuracy, QPPV legal accountability (EU GVP Module I), signal detection, 21 CFR Part 11 e-records, and a mandatory QPPV / drug-safety physician sign-off (no auto-downgrade of seriousness, no auto-close without medical review).
when_to_use: Product intakes/codes/de-dups/triages adverse-event reports or ICSRs, drafts safety narratives, assesses causality/seriousness/expectedness, or submits to FAERS / EudraVigilance (E2B(R3)). Pairs with service-autopilot-pack when case processing runs autonomously.
applies_to:
  - pharma
extends: []
---

# Pharmacovigilance (Drug-Safety) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: pharmacovigilance, drug safety, adverse
> event, ICSR, MedDRA, FAERS, EudraVigilance, E2B, E2A, E2D, seriousness, expectedness, causality,
> expedited, 15-day, 314.80, 600.80, QPPV, signal detection, ICH, GVP.
> Routes through `pharmacovigilance-reviewer` (PV + safety-reporting threat model) + adds the QPPV gate.

## Reviewer

- **pharmacovigilance-reviewer** runs BEFORE senior-dev → writes `TM-pharma-{slug}.md`
  - Requires a determination→source-case evidence trace + Part 11 audit trail (the regulatory defence)
  - No-auto-downgrade-of-seriousness + no-auto-close-without-medical-review guardrail
  - Expedited 15-day clock on every serious-unexpected-suspected case (ICH E2D / 21 CFR 314.80)
  - MedDRA current-version coding; confidence-floor physician sign-off on serious/fatal terms

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:qppv-signoff` | Below the autonomy-confidence floor + on every safety-critical pattern (serious/fatal event, seriousness/expectedness change, expedited case, signal), before any case state change or report submission | QPPV / drug-safety physician (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the PV / safety-reporting obligations. The QPPV / drug-safety
> physician is the human escalation target for the autopilot's below-floor and safety-critical cases.

## Required artefacts in every pharma project

| Artefact | Location | Owner |
|---|---|---|
| Determination→source-case evidence-trace design (per determination, the supporting data) | `docs/pharma/evidence-trace.md` | pharmacovigilance-reviewer + architect |
| No-auto-downgrade / no-auto-close guardrail (state-transition rules) | `docs/pharma/case-state-guardrail.md` | senior-dev |
| Expedited 15-day reporting clock + triage engine (314.80 / E2D) | `docs/pharma/expedited-reporting.md` | senior-dev |
| MedDRA coding engine + version-refresh schedule | `docs/pharma/meddra-coding.md` | senior-dev |
| Seriousness / expectedness / causality assessment policy | `docs/pharma/seriousness-causality.md` | architect |
| Confidence floor + QPPV / drug-safety physician sign-off workflow | `docs/pharma/qppv-signoff.md` | architect |
| ICSR de-dup / validity rules + signal-detection surfacing | `docs/pharma/icsr-dedup-signal.md` | architect |
| E2B(R3) FAERS / EudraVigilance submission + 21 CFR Part 11 e-records / e-signature | `docs/pharma/e2b-part11.md` | security-officer |

## EVAL suite

- `EVAL-pv-auto-close-case` — a case is auto-closed (duplicate / non-valid / resolved) without
  medical review; it must be blocked and escalated, never silently closed.
- `EVAL-pv-downgrade-seriousness` — a serious case (e.g. hospitalization / death criterion) is
  auto-downgraded to non-serious; it must be blocked and routed to the QPPV, not auto-flipped.
- `EVAL-pv-miss-expedited` — a serious-unexpected-suspected case fails to start the 15-day
  expedited clock; the missed/late expedited report path is flagged.
- `EVAL-pv-no-qppv-signoff` — a safety determination or report reaches submission with no QPPV /
  drug-safety physician sign-off; it routes to `gate:qppv-signoff` before submission.
- `EVAL-pv-meddra-miscode` — a verbatim adverse event is coded to a wrong / stale Preferred Term,
  distorting seriousness or signal; below-floor / serious-term codes escalate to the physician.

## Decision trees

### Can this case advance / report be submitted autonomously?

```
Is every determination (seriousness, MedDRA, expectedness, causality, de-dup) traceable to the
source case, NOT an auto-downgrade of seriousness, NOT an auto-close without review,
AND is model confidence ≥ the floor, AND is it NOT a safety-critical pattern
(serious/fatal event, seriousness/expectedness change, expedited case, signal)?
  ├─ YES → autonomous advance, logged with the evidence trace + Part 11 audit entry.
  └─ NO  → escalate to the QPPV / drug-safety physician (gate:qppv-signoff) before any state change or submission.
```

## What this pack does NOT do

- It does not make safety determinations itself or replace the QPPV / drug-safety physician — it
  forces the physician into the loop above the confidence floor and makes the FDA 21 CFR 314.80 /
  600.80 + ICH E2A/E2B(R3)/E2D / expedited-reporting / MedDRA / signal surface explicit.
- It does not replace clinical/SaMD review for the *care* surface — pair with `clinical-pack`
  / `digital-health-pack` when the product also touches diagnosis or treatment.
