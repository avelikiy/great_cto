---
name: robotics-pack
description: Robotics / physical AI safety overlay. Pairs robotics-safety-reviewer (+ fda-reviewer for surgical).
when_to_use: Product controls physical actuators, cobot shares workspace with humans, or ML drives perception/control.
applies_to:
  - iot-embedded
  - ai-system
  - agent-product
  - regulated
---

# Robotics Safety Pack

> Loaded when ARCH mentions: robot, cobot, manipulator, AMR/AGV, autonomous, surgical robot, ROS 2, drone.

## Reviewers

1. **robotics-safety-reviewer** → `TM-robot-{slug}.md`
2. **fda-reviewer** (paired for surgical) → `TM-samd-{slug}.md`

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:hara-signoff` | HARA document signed before design freeze | Licensed safety engineer |
| `gate:functional-safety-test` | Formal test report (surgical, autonomous, high-risk only) | QA-lead |
| `gate:ship` | Standard | security-officer |

## Required artefacts

| Artefact | Owner |
|---|---|
| HARA (Hazard Analysis and Risk Assessment) | safety-engineer |
| SIL/PL declaration per hazardous function + diagnostic coverage | safety-engineer |
| E-stop independent path (latency ≤ 200ms) | senior-dev |
| Cobot force-limit verification report (ISO/TS 15066) | safety-engineer |
| SROS2 keystore + permissions (ROS 2 — never INSECURE in prod) | senior-dev |
| Sim-to-real validation report + failure-mode catalog | ml-engineer |
| OOD detector + action bounding on ML controller | ml-engineer |
| Watchdog with fail-safe on inference timeout | senior-dev |
| OTA update signed + secure-boot chain | firmware-engineer |
| Black-box telemetry for incident reconstruction | senior-dev |

## EVAL suite

- `EVAL-policy-safety` (action stays within safe envelope under adversarial input)
- `EVAL-ood-detection` (OOD perception inputs flagged ≥ 95%)
- `EVAL-e-stop-latency` (< 200ms total system response, 100 trials)
- `EVAL-sim2real-divergence` (distribution-shift metrics within bounds)
- `EVAL-watchdog-failsafe` (inference timeout → safe-state behavior)

## Category routing

| Category | Standards stack |
|---|---|
| Industrial robot | ISO 10218-1/-2 + IEC 61508 |
| Cobot | ISO/TS 15066 + ISO 10218-2 |
| Service / personal | ISO 13482 |
| Surgical | FDA 21 CFR 880 + IEC 60601-1 + IEC 60601-2-77 → fda-reviewer |
| Autonomous vehicle | ISO 26262 + ISO/PAS 21448 SOTIF + UNECE WP.29 |
| Drone | FAA Part 107 + ASTM F3322 (US) / EASA |

## ROS 2 security mandates

- **Never deploy production with default INSECURE profile**
- SROS2 keystore + permissions XML per node
- DDS Security on transport
