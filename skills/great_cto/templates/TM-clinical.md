# TM-clinical-{slug} — Clinical-AI Threat Model

**Owner:** ai-clinical-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Scope
- Intended use: autonomous | assistive | informational
- Clinical task: diagnosis | triage | CDS | scribe | summary | risk-score | imaging
- Patient population + exclusions
- Clinician-in-loop required: yes / no

## 2. GMLP-10 applicability matrix
| GMLP Principle | Status | Evidence |
|---|---|---|
| 1. Multi-disc expertise | | |
| 2. SW engineering + security | | |
| 3. Representative data | | |
| 4. Train/test independence | | |
| 5. Reference standards | | |
| 6. Model fits available data | | |
| 7. Human-AI team performance | | |
| 8. Clinically-relevant testing | | |
| 9. Clear user info | | |
| 10. Monitored deployment | | |

## 3. PCCP scope (if adaptive)
- Locked: …
- Allowed to change: …
- Modification protocol: …
- Impact assessment trigger: …

## 4. Findings
### Critical / High / Medium / Low
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 5. Required artefacts before senior-dev
- [ ] Intended-use statement signed
- [ ] Citation-grounding (≥95% claims w/ verifiable ID)
- [ ] Refuse-to-diagnose guardrail + clinician-in-loop trigger
- [ ] Subgroup fairness audit (sex × age × race) on held-out set
- [ ] Drift-monitoring dashboard with weekly canary
- [ ] PCCP draft if adaptive
- [ ] Model card with training data + version + AD bounds

## 6. EVAL required
- EVAL-clinical-hallucination · EVAL-citation-grounding · EVAL-refuse-to-diagnose · EVAL-subgroup-fairness · EVAL-adversarial-symptom

## 7. Gates
- gate:clinical-validation · gate:samd-class (if SaMD) · gate:ship

<!-- HANDOFF -->
ai-clinical-reviewer-verdict: signed-off
critical-findings: 0
samd-handoff-to-fda-reviewer: yes | no
