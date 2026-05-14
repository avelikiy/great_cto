# TM-labauto-{slug} — Lab Automation Threat Model

**Owner:** lab-automation-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Hardware inventory
| Instrument | Vendor / model | Firmware | Integration (SiLA2 / OPC-UA / SDK / serial) | IQ/OQ/PQ status |
|---|---|---|---|---|

## 2. Protocol-language safety
- Static analyzer: yes / no (catches volume / tip / reagent / waste errors)
- Simulation / dry-run required before production: yes / no
- Hazard / chemical compatibility check: yes / no

## 3. Chain of custody
- Barcode generation + scan-in/out at every transfer: yes / no
- Plate-map provenance: …
- Reagent lot tracking + expiration enforcement: yes / no

## 4. Scheduler + recovery
- Resource conflict detection: yes / no
- Deadlock prevention strategy: …
- Error-recovery taxonomy per instrument class: …
- E-stop integration (mobile / high-force): yes / no

## 5. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 6. Required artefacts
- [ ] Chain-of-custody (barcode at every transfer)
- [ ] Reagent lot lineage
- [ ] Protocol static analysis + simulation
- [ ] Scheduler (conflict + deadlock prevention)
- [ ] Error-recovery taxonomy
- [ ] E-stop integration where applicable
- [ ] Chemical compatibility check
- [ ] Calibration enforcement (block out-of-cal)
- [ ] GLP handoff if regulated

## 7. EVAL required
- EVAL-sample-chain-of-custody · EVAL-protocol-simulation-coverage · EVAL-scheduler-deadlock · EVAL-reagent-expiration-block

## 8. Gates
- gate:iq-oq-pq · gate:ship

<!-- HANDOFF -->
lab-automation-reviewer-verdict: signed-off
critical-findings: 0
glp-handoff: yes (GLP/GMP scope) | no
