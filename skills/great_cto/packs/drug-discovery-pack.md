---
name: drug-discovery-pack
description: Drug-discovery ML + GLP + lab-automation overlay. Pairs drug-discovery-ml-reviewer + glp-glab-reviewer + lab-automation-reviewer.
when_to_use: Product predicts/generates molecules, supports preclinical GLP studies, or orchestrates wet-lab instruments.
applies_to:
  - ai-system
  - regulated
  - data-platform
  - iot-embedded
---

# Drug-Discovery Pack

> Loaded when ARCH mentions: drug discovery, binding affinity, ADMET, toxicity prediction, generative chemistry/protein, AlphaFold, RFdiffusion, LIMS, ELN, GLP, lab automation, cloud lab.

## Reviewers (trio)

1. **drug-discovery-ml-reviewer** → `TM-drugml-{slug}.md`
2. **glp-glab-reviewer** → `TM-glp-{slug}.md`
3. **lab-automation-reviewer** → `TM-labauto-{slug}.md`
4. **biosecurity-reviewer** (handoff for dual-use protein / peptide / toxin-adjacent)

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:model-card-signoff` | AD + calibration verified before wet-lab spend | ML-lead + clinical-lead |
| `gate:csv-validation` | Validated system before GLP/GMP production | QA-lead (independent) |
| `gate:iq-oq-pq` | Instrument qualification before production | Engineering + QA |
| `gate:ship` | Standard | security-officer |

## Required artefacts — Drug-Discovery ML

| Artefact | Owner |
|---|---|
| Scaffold / time / cluster split with leakage threshold | ml-engineer |
| Applicability-domain detector with bounds in prod | ml-engineer |
| Uncertainty calibration plot + selective prediction policy | ml-engineer |
| Retrospective validation report (held-out targets / clusters) | ml-engineer |
| Generative-output filter chain (validity + SA + PAINS + IP) | ml-engineer |
| Wet-lab feedback dashboard + drift alerts | data-engineer |
| Patent FTO check before nomination | legal + IP team |
| Model card (intended use, data version, AD bounds, calibration) | ml-engineer |
| Biosec handoff for dual-use designs | biosec-lead |

## Required artefacts — GLP/GMP

| Artefact | Owner |
|---|---|
| Raw-data definition + immutable storage | architect |
| Append-only audit trail (signed + exportable) | senior-dev |
| ALCOA+ self-audit checklist | qa-engineer |
| E-signature manifestation | senior-dev |
| SOP catalogue coupled to system release | qa-engineer |
| CSA-aligned risk-based validation plan | qa-engineer |
| Periodic audit-trail review SOP | qa-engineer |
| Change-control linked to risk + validation | qa-engineer |
| Vendor / cloud responsibility matrix (GAMP 5) | architect |

## Required artefacts — Lab Automation

| Artefact | Owner |
|---|---|
| Barcode-based chain-of-custody at every transfer | senior-dev |
| Reagent lot lineage to result | senior-dev |
| Protocol static analysis + simulation before prod run | senior-dev |
| Scheduler with conflict detection + deadlock prevention | senior-dev |
| Error-recovery taxonomy per instrument class | senior-dev |
| E-stop integration on mobile / high-force devices | safety-engineer |
| Chemical compatibility check | senior-dev |
| Calibration / qualification enforcement (block out-of-cal) | senior-dev |

## EVAL suite

- `EVAL-affinity-prediction-calibration` (calibration curve within ε)
- `EVAL-applicability-domain-coverage` (predictions outside AD rejected)
- `EVAL-data-leakage-target-similarity` (Tanimoto / sequence-cluster bounds)
- `EVAL-alcoa-tamper` (audit-trail edits detected)
- `EVAL-sample-chain-of-custody` (lost-sample event triggers alert)
- `EVAL-protocol-simulation-coverage` (simulation catches volume / tip / reagent errors)
- `EVAL-scheduler-deadlock` (no resource deadlocks under load)

## Key thresholds

- **Test-set similarity threshold:** Tanimoto < 0.4 (compound), sequence identity < 30% (protein)
- **AD rejection rate:** documented per model
- **Audit-trail review cadence:** monthly or per-batch
- **Reagent expiration:** block use post-expiration
- **E-stop latency on high-force devices:** < 200 ms
