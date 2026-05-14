# TM-robot-{slug} — Robotics Safety Threat Model

**Owner:** robotics-safety-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Category + standards
- Category: industrial · cobot · service · surgical · AV · drone
- Standards stack: …
- **Declared SIL/PL:** SIL___ / PL___ with diagnostic coverage ___%

## 2. HARA summary
| Hazard | Severity | Exposure | Controllability | SIL/PL | Mitigation |
|---|---|---|---|---|---|

## 3. E-stop architecture
- Category: 0 · 1 · 2
- Independent path: yes / no
- Latency budget: ___ ms (target < 200 ms)
- Periodic test: …

## 4. ML controller safety (if ML)
- OOD detector: …
- Action bounding: …
- Inference timeout fail-safe: …
- Adversarial-perception probing: …

## 5. ROS 2 security
- SROS2 enabled (not INSECURE): yes / no
- Keystore + permissions XML: …
- DDS transport encryption: …

## 6. Sim-to-real
- Domain randomization coverage: …
- Distribution-shift metrics + bounds: …
- Failure-mode catalog (sim → real): …

## 7. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 8. Required artefacts
- [ ] HARA signed by safety engineer
- [ ] SIL/PL declaration per hazardous function
- [ ] E-stop independent path test report
- [ ] Cobot force-limit verification (if applicable)
- [ ] SROS2 enforced
- [ ] Sim-to-real report + failure catalog
- [ ] OOD + action bounding on ML controller
- [ ] Watchdog + fail-safe behavior
- [ ] OTA signed + secure-boot chain
- [ ] Black-box telemetry

## 9. EVAL required
- EVAL-policy-safety · EVAL-ood-detection · EVAL-e-stop-latency · EVAL-sim2real-divergence · EVAL-watchdog-failsafe

## 10. Gates
- gate:hara-signoff · gate:functional-safety-test (surgical/AV) · gate:ship

<!-- HANDOFF -->
robotics-safety-reviewer-verdict: signed-off
category: …
declared-sil: …
critical-findings: 0
fda-handoff: yes (surgical) | no
