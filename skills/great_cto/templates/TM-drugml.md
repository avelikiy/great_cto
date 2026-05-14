# TM-drugml-{slug} — Drug-Discovery ML Threat Model

**Owner:** drug-discovery-ml-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Models in scope
| Model | Task | Architecture | Training data + version | Intended use |
|---|---|---|---|---|

## 2. Data discipline
- ChEMBL release: …
- BindingDB snapshot: …
- PDBbind version: …
- DrugBank version: …
- Private datasets — contract version: …

## 3. Split + leakage
- Split type: scaffold · time · cluster · random (NOT acceptable for prod)
- Tanimoto threshold (compound): < 0.4
- Sequence-identity threshold (protein): < 30%
- MMP overlap documented: …

## 4. Applicability domain + uncertainty
- AD method: Tanimoto-NN · leverage · ECFP-density · learned-UQ
- AD bound: …
- UQ method: ensembles · MC-dropout · conformal · Bayesian
- Calibration plot in model card: yes / no

## 5. Generative safeguards
- Validity filter: …
- SA score threshold: …
- PAINS / BRENK filters: …
- IP / patent FTO step before nomination: …

## 6. Wet-lab feedback loop
- Predicted-vs-measured dashboard: …
- Active-learning loop integration: …
- Drift monitoring: …

## 7. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 8. Required artefacts
- [ ] Scaffold/time/cluster split with leakage threshold doc
- [ ] AD detector with bounds in prod
- [ ] Calibration plot + selective prediction policy
- [ ] Retrospective validation report
- [ ] Generative output filter chain
- [ ] Wet-lab feedback dashboard + drift alerts
- [ ] Patent FTO check workflow
- [ ] Model card complete
- [ ] Biosec handoff for dual-use designs

## 9. EVAL required
- EVAL-affinity-prediction-calibration · EVAL-applicability-domain-coverage · EVAL-data-leakage-target-similarity

## 10. Gates
- gate:model-card-signoff · gate:ship

<!-- HANDOFF -->
drug-discovery-ml-reviewer-verdict: signed-off
critical-findings: 0
biosec-handoff: yes (protein/peptide/toxin-adjacent) | no
