# TM-climate-{slug} — Climate MRV Threat Model

**Owner:** climate-mrv-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Product role
- Role: calculator · project-developer · registry · verifier · disclosure platform
- Standards in scope: GHG Protocol · ISO 14064 · Verra VCS · Gold Standard · Puro.earth · SBTi · CDP · CSRD · CBAM · GHGRP

## 2. Boundary + methodology
- Boundary: operational | financial | equity control
- Scope 1: …
- Scope 2: location-based + market-based
- Scope 3: categories covered ___
- Methodology + version pinning (per project): …
- Emission-factor library: DEFRA / EPA eGRID / IEA / ecoinvent vN

## 3. Data lineage
- Activity-data hash chain: …
- Verification trail per number: …
- Re-statement policy: …
- Audit retention: ___ years (≥10 for corporate)

## 4. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 5. Required artefacts
- [ ] Methodology pinning + boundary doc
- [ ] Activity-data lineage hash chain
- [ ] Double-counting retirement state machine
- [ ] Verification trail
- [ ] Re-statement policy + audit retention
- [ ] Emission-factor library versioning
- [ ] Anti-fraud anomaly detection
- [ ] Public-claims marketing constraints (FTC + EU)

## 6. EVAL required
- EVAL-carbon-attribution-stability · EVAL-double-counting · EVAL-mrv-tamper

## 7. Gates
- gate:mrv-methodology · gate:ship

<!-- HANDOFF -->
climate-mrv-reviewer-verdict: signed-off
product-role: …
critical-findings: 0
biosec-handoff: yes (synbio scope) | no
