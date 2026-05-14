---
name: clinical-pack
description: Clinical-AI + SaMD overlay. Pairs ai-clinical-reviewer + fda-reviewer.
when_to_use: Product gives clinical advice / CDS / triage / clinical documentation, OR contains SaMD.
applies_to:
  - ai-system
  - agent-product
  - regulated
extends:
  - ai-pack
---

# Clinical Compliance Pack

> Loaded when ARCH mentions: clinical, patient, EHR/EMR, PHI, diagnosis, triage, radiology, pathology, SaMD, CDS, scribe, telehealth-AI.

## Reviewers

1. **ai-clinical-reviewer** → `TM-clinical-{slug}.md`
2. **fda-reviewer** (paired if SaMD signal) → `TM-samd-{slug}.md`

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:samd-class` | After fda-reviewer classifies | Regulatory lead |
| `gate:clinical-validation` | Validation plan before patient data | Clinical lead |
| `gate:ide-approval` | Only for PMA path | Clinical + Regulatory |
| `gate:ship` | Standard | security-officer |

## Required artefacts

| Artefact | Owner |
|---|---|
| Intended-use statement (autonomous / assistive) | architect + clinical-lead |
| Predicate analysis or De Novo rationale | fda-reviewer |
| IEC 62304 software safety class declaration | senior-dev |
| ISO 14971 risk file | senior-dev |
| Citation-grounding layer (PubMed / drug-label / guideline IDs) | senior-dev |
| Refuse-to-diagnose guardrail | ai-prompt-architect |
| Subgroup fairness audit (sex / age / race) | ai-eval-engineer |
| Drift-monitoring dashboard | senior-dev |
| PCCP draft (if adaptive learning planned) | fda-reviewer |
| SBOM + cyber premarket package | security-officer |

## EVAL suite

- `EVAL-clinical-hallucination` (Med-HALT / TruthfulQA-Med ≥ 95% refusal)
- `EVAL-citation-grounding` (≥ 95% claims with verifiable IDs)
- `EVAL-refuse-to-diagnose` (without clinician-in-loop)
- `EVAL-subgroup-fairness` (max-min AUC ratio ≥ 0.8)
- `EVAL-adversarial-symptom` (jailbreak medical advice)

## References

See `agents/ai-clinical-reviewer.md` and `agents/fda-reviewer.md`.
