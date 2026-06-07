---
name: rcm-pack
description: Compliance + fraud-liability overlay for revenue-cycle / medical-coding products — autonomous ICD-10-CM / CPT / HCPCS coding and claim submission. Covers False Claims Act exposure (upcoding / unbundling), NCCI edits + MUEs, medical necessity (LCD/NCD), modifier discipline, HIPAA minimum-necessary, and a mandatory certified-coder (CPC/CCS) sign-off.
when_to_use: Product assigns medical billing codes from clinical documentation or submits/scrubs/adjudicates claims (837/835, CMS-1500, UB-04). Pairs with service-autopilot-pack when coding runs autonomously.
applies_to:
  - rcm
extends: []
---

# RCM (Revenue-Cycle / Medical-Coding) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: medical coding, icd-10, cpt, hcpcs, drg,
> revenue cycle, rcm, claim scrub, 837, 835, cms-1500, ub-04, e/m level, prior authorization,
> charge capture, denial management, ncci, modifier, upcoding, payer.
> Routes through `rcm-reviewer` (FCA + coding-edit threat model) + adds the certified-coder gate.

## Reviewer

- **rcm-reviewer** runs BEFORE senior-dev → writes `TM-rcm-{slug}.md`
  - Requires a documentation-evidence trace for every autonomously-assigned code (the FCA defence)
  - NCCI PTP + MUE edit coverage with current quarterly tables, pre-submission
  - Upcoding/unbundling + modifier (-25/-59) support guardrail
  - ICD↔CPT medical-necessity (LCD/NCD) linkage; confidence-floor coder sign-off

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:coding-signoff` | Below the autonomy-confidence floor + on every FCA-high pattern, before claim submission | CPC / CCS certified coder (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the coding/fraud obligations. The certified coder is the human
> escalation target for the autopilot's below-floor and high-FCA-risk claims.

## Required artefacts in every rcm project

| Artefact | Location | Owner |
|---|---|---|
| Code→documentation evidence-trace design (per code, the supporting span) | `docs/rcm/evidence-trace.md` | rcm-reviewer + architect |
| NCCI PTP + MUE edit engine + table-refresh schedule (quarterly) | `docs/rcm/ncci-mue.md` | senior-dev |
| Upcoding / unbundling guardrail (distribution vs baseline) | `docs/rcm/upcoding-guardrail.md` | senior-dev |
| Modifier (-25 / -59) support policy | `docs/rcm/modifiers.md` | architect |
| ICD↔CPT medical-necessity (LCD/NCD) linkage rules | `docs/rcm/medical-necessity.md` | architect |
| Confidence floor + CPC/CCS coder sign-off workflow | `docs/rcm/coder-signoff.md` | architect |
| 60-day overpayment refund + sampling-audit process | `docs/rcm/overpayment.md` | architect |
| Minimum-necessary PHI scoping + per-claim access log | `docs/rcm/phi-minimum-necessary.md` | security-officer |

## EVAL suite

- `EVAL-code-has-evidence` — every autonomously-assigned code traces to a supporting span in the
  clinical note; a code with no evidence is blocked (not submitted).
- `EVAL-ncci-blocks-unbundling` — a known NCCI PTP-edit code pair is caught and blocked / requires
  a supported modifier; MUE unit caps enforced.
- `EVAL-upcoding-guardrail` — a synthetic over-coded E/M (level unsupported by the note) is flagged
  and escalated, not auto-submitted.
- `EVAL-medical-necessity-linkage` — a CPT with no supporting ICD per LCD/NCD is flagged.
- `EVAL-coder-signoff-fires` — claims below the confidence floor or matching an FCA-high pattern
  route to a certified coder before submission.

## Decision trees

### Can this claim be submitted autonomously?

```
Is every assigned code traceable to documentation, NCCI/MUE-clean, and medically necessary,
AND is model confidence ≥ the floor, AND is it NOT an FCA-high pattern
(high-level E/M, -25/-59 modifier, unbundling override)?
  ├─ YES → autonomous submission, logged with the evidence trace.
  └─ NO  → escalate to a CPC/CCS certified coder (gate:coding-signoff) before submission.
```

## What this pack does NOT do

- It does not assign codes itself or replace a certified coder — it forces the coder into the loop
  above the confidence floor and makes the FCA / NCCI / medical-necessity surface explicit.
- It does not replace clinical/SaMD review for the *care* surface — pair with `clinical-pack`
  / `digital-health-pack` when the product also touches diagnosis or treatment.
