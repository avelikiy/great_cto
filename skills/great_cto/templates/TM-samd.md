# TM-samd-{slug} — SaMD / FDA Threat Model

**Owner:** fda-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Intended use + classification
- Intended-use statement: …
- Significance of information: treat-diagnose | drive-mgmt | inform-mgmt
- State of condition: critical | serious | non-serious
- **Proposed IMDRF Class:** I | II | III | IV
- **Proposed FDA path:** exempt | 510(k) | De Novo | PMA
- **Proposed FDA path:** EU classification (MDR/IVDR): Class I/IIa/IIb/III  | Class A/B/C/D

## 2. Predicate analysis (510(k) path)
| 510(k) # | Device | Indication | Similarity | Diff. requiring perf data |
|---|---|---|---|---|

## 3. Lifecycle artefacts gap
| Standard | Status |
|---|---|
| IEC 62304 SW safety class A/B/C declared | |
| ISO 14971 risk file | |
| IEC 81001-5-1 cybersecurity | |
| FDA cyber premarket package (SBOM + threat model + vuln-mgmt) | |
| EU MDR/IVDR notified body engagement | |

## 4. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 5. Required artefacts before senior-dev
- [ ] SaMD intended-use statement signed by clinical lead
- [ ] Predicate analysis document (or De Novo rationale)
- [ ] IEC 62304 software safety class declaration
- [ ] ISO 14971 initial risk file
- [ ] SBOM + cyber premarket package outline
- [ ] IDE plan if PMA path

## 6. Gates
- gate:samd-class (class confirmed by human)
- gate:clinical-validation (validation plan before patient data)
- gate:ide-approval (PMA path only)
- gate:ship

<!-- HANDOFF -->
fda-reviewer-verdict: signed-off
proposed-class: II
proposed-path: 510(k)
predicate-candidate: K{number} or "none"
critical-findings: 0
