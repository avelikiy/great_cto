# TM-digital-health-{slug} — Digital Health / mHealth Threat Model

**Owner:** digital-health-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Product classification
- Category: consumer-wellness · personalised-fitness · nutrition/supplement-AI · mental-health/DTx · RPM · physician-HITL
- **Wellness vs SaMD decision:** general-wellness (FDA 2019 policy) · SaMD Class I · SaMD Class II+ · undetermined
- Intended-use statement (exact regulatory language): …
- Disease claims present? yes / no  (yes → cannot use General Wellness safe harbour)

## 2. Data surface
| Data type | Source | PHI? | Special-category (GDPR Art. 9)? | Store |
|---|---|---|---|---|
| Heart rate / HRV | wearable SDK | | | |
| Sleep / activity | wearable SDK | | | |
| SpO2 / ECG | wearable SDK | | | |
| Mental-health responses (PHQ-9 / GAD-7) | in-app | | | |

## 3. Wearable platform API rules
- Apple HealthKit: minimum types only · NSHealthShareUsageDescription · no ad use · no third-party sharing
- Google Health Connect: permission dialog (not custom) · deletion within 30 days · no ad networks
- Garmin: Connect IQ manifest · Garmin Health API commercial agreement (if used)
- Samsung Health: partner enrolment · retention-on-uninstall verified
- Raw sensor values kept **below** aggregation layer; never sent to LLM context or third-party APIs

## 4. HITL safety architecture (if AI health guidance)
- Risk classifier: LOW (auto) / MEDIUM (async 48h) / HIGH (sync 24h) / CRITICAL (15-min escalation)
- Refuse-to-diagnose guardrail: …
- Physician review queue + SLA: …
- Crisis escalation path (mental health): …

## 5. Supplement / nutrition safety (if applicable)
- Drug-interaction check (OpenFDA / DrugBank / NCI Thesaurus): …
- NIH safe-upper-limit dose guard: …
- DSHEA structure/function disclaimer: …
- Chronic-condition → mandatory physician review: …

## 6. Privacy + consent
- GDPR Art. 9 explicit consent + DPIA: …
- Consent-revocation → deletion across all stores (live + ML + backups) within 30 days: …
- CCPA/CPRA SPI right-to-limit: …
- FTC Health Breach Notification readiness (non-HIPAA apps): …

## 7. Findings
| ID | Finding | Severity | Mitigation | Gate |
|---|---|---|---|---|
| DH-01 | … | | | |

## 8. Required artefacts
- [ ] Intended-use statement (general-wellness vs SaMD)
- [ ] FDA General Wellness / SaMD classification decision
- [ ] GDPR Art. 9 DPIA
- [ ] Platform API agreements (Garmin Health, Samsung SDK)
- [ ] HealthKit / Health Connect permission justification (per type)
- [ ] HITL physician workflow spec + SLA
- [ ] Drug-supplement interaction check implementation
- [ ] Safe Messaging compliance declaration (if mental health)
- [ ] Wearable data encryption at-rest + in-transit evidence
- [ ] User data deletion path (all stores)

## 9. EVAL required
- EVAL-digital-health-hitl-boundary · EVAL-digital-health-supplement-safety · EVAL-digital-health-mental-health-crisis · EVAL-digital-health-data-minimisation

## 10. Gates
- gate:wellness-vs-samd · gate:hitl-design · gate:wearable-api-access · gate:supplement-safety · gate:mental-health-protocol · gate:samd-class (if SaMD) · gate:ship

<!-- HANDOFF -->
digital-health-reviewer-verdict: signed-off | blocked
wellness-vs-samd: general-wellness | samd-class-I | samd-class-II+ | undetermined
critical-findings: 0
fda-handoff: yes (SaMD ≥ Class II) | no
clinical-handoff: yes (SaMD signal) | no
healthcare-handoff: yes (HIPAA / PHI scope) | no
