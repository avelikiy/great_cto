---
name: digital-health-pack
description: Digital health / mHealth / wearable-AI overlay. Combines digital-health-reviewer + ai-clinical-reviewer (for SaMD risk) + healthcare-reviewer (if PHI / HIPAA scope). Activated for products that collect wearable/biometric sensor data, provide personalised health or mental-health recommendations, or include physician HITL workflows.
when_to_use: Product integrates wearable sensors (Apple Watch, Garmin, Samsung Health, Google Fit), provides personalised fitness/nutrition/supplement AI, includes mental health coaching or risk assessment, or connects AI recommendations to physician review.
applies_to:
  - ai-system
  - agent-product
  - regulated
  - mobile-app
extends:
  - ai-pack
  - clinical-pack
---

# Digital Health Pack

> Loaded when ARCH mentions any of: wearable, biometric, HealthKit, Health Connect, Garmin, Samsung Health, Fitbit, Whoop, Oura, heart rate, HRV, sleep tracking, fitness AI, nutrition AI, supplement, mental health AI, wellness agent, physician review, HITL clinical, digital therapeutics, DTx, mHealth, stress score, burnout detection, mindfulness AI, personalised training, physiotherapy AI.

## Reviewer chain

| Order | Reviewer | Output | Condition |
|---|---|---|---|
| 1 | **digital-health-reviewer** | `TM-digital-health-{slug}.md` | Always |
| 2 | **ai-clinical-reviewer** | `TM-clinical-{slug}.md` | If SaMD signal in TM-digital-health or ARCH |
| 3 | **healthcare-reviewer** | `TM-healthcare-{slug}.md` | If HIPAA applies (employer/provider deployment) |
| 4 | **fda-reviewer** | `TM-samd-{slug}.md` | If SaMD classification ≥ Class II |

The digital-health-reviewer runs first and sets the scope for downstream reviewers.

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:wellness-vs-samd` | After digital-health-reviewer classifies | Architect + regulatory lead |
| `gate:hitl-design` | HITL physician workflow design complete | Architect + clinical lead |
| `gate:wearable-api-access` | All platform API agreements confirmed | Product lead |
| `gate:supplement-safety` | Drug-interaction check + dose-limit guard implemented | Senior-dev + medical advisor |
| `gate:mental-health-protocol` | Crisis escalation path tested (if mental health component) | Clinical lead + QA |
| `gate:samd-class` | SaMD regulatory path confirmed (if applicable) | Regulatory lead |
| `gate:ship` | Standard | security-officer |

## Required artefacts

| Artefact | Owner | Blocker? |
|---|---|---|
| Intended-use statement (exact regulatory language) | Architect | ✅ CRITICAL |
| FDA General Wellness / SaMD classification decision | digital-health-reviewer + regulatory lead | ✅ CRITICAL |
| GDPR Art. 9 DPIA | Architect + DPO | ✅ HIGH |
| Platform API agreements (Garmin Health, Samsung SDK) | Product lead | ✅ HIGH |
| HealthKit / Health Connect permission justification (per type) | Senior-dev | ✅ HIGH |
| HITL physician workflow spec + SLA | Architect + clinical lead | ✅ HIGH |
| Drug-supplement interaction check implementation | Senior-dev | ✅ HIGH |
| Safe Messaging compliance declaration (if mental health) | Clinical lead | ✅ HIGH |
| Wearable data encryption at-rest + in-transit evidence | Senior-dev | ✅ HIGH |
| User data deletion path (all stores: live + ML + backups) | Senior-dev | ✅ HIGH |
| Physician credentialing process | Product lead | MEDIUM |
| Mental health crisis escalation runbook | Clinical lead | MEDIUM |
| FTC Health Breach Notification readiness plan | Legal | MEDIUM |
| EU AI Act Annex III assessment | digital-health-reviewer | MEDIUM |
| App Store / Play Store health app review pre-flight | QA | MEDIUM |

## EVAL suite

- `EVAL-hitl-boundary` — AI must not give clinical diagnosis without physician review; test 100 symptom probes
- `EVAL-supplement-safety` — AI must reject recommendations contraindicated with common medications (warfarin, SSRIs, MAOIs, statins); ≥ 95% block rate on adversarial prompts
- `EVAL-mental-health-crisis` — crisis probe scenarios → verify escalation path triggered, NOT AI-handled alone
- `EVAL-safe-messaging` — LLM response to self-harm indicators follows AFSP Safe Messaging guidelines
- `EVAL-refuse-to-diagnose` — AI must not produce disease diagnoses; ≥ 99% refusal on disease-claim prompts
- `EVAL-data-minimisation` — verify each wearable API permission is actually used in a feature (dead-permission audit)
- `EVAL-gdpr-consent-revocation` — revoke consent → verify data deleted from all stores within 30 days
- `EVAL-platform-policy-compliance` — no HealthKit data to ad networks; no Samsung Health data sold; verify in egress layer

## Wearable integration checklist (senior-dev pre-ship)

- [ ] Apple HealthKit: minimum required types only; NSHealthShareUsageDescription present; Additional Health Studies entitlement requested if SpO2 / ECG
- [ ] Google Health Connect: Permission dialog (not custom UI); ChangeLogToken polling for data sync; deletion within 30 days
- [ ] Garmin: Consumer Connect IQ manifest permissions declared; if using Garmin Health API → commercial agreement signed
- [ ] Samsung Health: partner enrolment complete; SDK data retention on uninstall verified
- [ ] All platforms: no raw sensor data sent to LLM context without anonymisation / aggregation layer
- [ ] All platforms: user can export all their health data (portability) + delete it (erasure) from app settings

## Architecture patterns recommended

### Wearable data pipeline (zero-PHI-to-LLM default)

```
Wearable SDK
    ↓ (encrypted sync, on-device where possible)
Edge aggregation layer (aggregate: 7-day rolling averages, anomaly flags)
    ↓ (anonymised + aggregated features only)
AI training recommendation engine
    ↓ (structured recommendation, no raw biometrics)
HITL gate (physician review queue if flagged)
    ↓
User-facing recommendation + explanation
```

Raw sensor values (exact heart rate per second, exact SpO2 reading) stay **below** the aggregation layer and do NOT enter LLM context or get sent to third-party APIs.

### HITL physician workflow

```
AI recommendation generated
    ↓
Risk classifier → LOW / MEDIUM / HIGH / CRITICAL
    LOW: auto-serve to user (general wellness safe harbour)
    MEDIUM: async physician review queue (SLA: 48h)
    HIGH: sync physician review required before delivery (SLA: 24h)
    CRITICAL (crisis): immediate escalation → on-call clinician (SLA: 15 min) + crisis hotline surfaced immediately
```

### Supplement recommendation safety layer

```
AI suggests supplement + dose
    ↓
Drug-interaction API check (OpenFDA / DrugBank / NCI Thesaurus)
    ↓ if interaction found
Block recommendation → surface "consult your doctor"
    ↓ if dose > NIH safe upper limit
Block or require physician sign-off
    ↓ if user has stated chronic condition
Mandatory physician review regardless of dose
    ↓ if passes all gates
Serve recommendation with DSHEA-compliant structure/function disclaimer
```

## Applicable regulations summary

| Regulation | Scope | Key obligation |
|---|---|---|
| FDA General Wellness Policy (2019) | Consumer wellness apps | No disease claims; low-risk only |
| FDA 510(k) / De Novo | SaMD Class II+ | Pre-market submission |
| HIPAA Security Rule | PHI in employer/provider deployment | Encryption, audit log, BAA |
| FTC Health Breach Notification Rule | Non-HIPAA health apps | Breach notice within 60 days |
| GDPR Article 9 | EU users, health/biometric data | Explicit consent, DPIA, DPO |
| CCPA/CPRA SPI | CA residents | Right to limit use, opt-out |
| Apple HealthKit policy | iOS health apps | No ad use, no third-party data sharing |
| Google Health Connect policy | Android health apps | User deletion, no ad networks |
| EU AI Act Annex III | AI influencing healthcare decisions | High-risk conformity assessment |
| AFSP Safe Messaging | Mental health AI | Crisis escalation, no romanticisation |

## References

- `agents/digital-health-reviewer.md`
- `agents/ai-clinical-reviewer.md`
- `agents/healthcare-reviewer.md`
- `agents/fda-reviewer.md`
- `skills/great_cto/packs/clinical-pack.md`
