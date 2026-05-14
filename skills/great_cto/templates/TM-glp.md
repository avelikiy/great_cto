# TM-glp-{slug} — GLP / GMP / GxP Threat Model

**Owner:** glp-glab-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Scope
- Regime: GLP (21 CFR 58) · GMP (21 CFR 211) · OECD GLP · EU GMP Annex 11 · GxP-adjacent
- System type: LIMS · ELN · CTMS · MES · QMS · standalone calculator

## 2. ALCOA+ self-audit
| Principle | Implementation | Status |
|---|---|---|
| Attributable | …user binding via auth | |
| Legible | …UTF-8 / PDF export | |
| Contemporaneous | …server-side time + client-tz | |
| Original | …raw-data definition + immutability | |
| Accurate | …validation + audit edits | |
| Complete | …no orphan rows / missing fields | |
| Consistent | …schema constraints | |
| Enduring | …archival policy | |
| Available | …retrieval drill | |

## 3. Validation lifecycle
- CSA (FDA 2024) risk-based approach: yes / no
- Risk assessment per system function
- Requirements / design / test / release artefacts
- Periodic review cadence: …

## 4. Audit-trail design
- Append-only: yes / no
- Signed records: yes / no
- Export to inspector-readable format: yes / no
- Periodic review SOP: …
- Reviewer independent of admin: yes / no

## 5. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 6. Required artefacts
- [ ] Raw-data definition + immutable storage
- [ ] Append-only audit trail (signed + exportable)
- [ ] ALCOA+ self-audit checklist
- [ ] E-signature manifestation
- [ ] SOP catalogue coupled to release
- [ ] CSA-aligned validation plan
- [ ] Periodic audit-trail review SOP
- [ ] Change-control linked to risk + validation
- [ ] Archive plan with retrieval drill
- [ ] Vendor / cloud responsibility matrix (GAMP 5)

## 7. EVAL required
- EVAL-alcoa-tamper · EVAL-audit-trail-export · EVAL-csv-traceability

## 8. Gates
- gate:csv-validation · gate:ship

<!-- HANDOFF -->
glp-glab-reviewer-verdict: signed-off
scope: glp | gmp | gxp-adjacent
critical-findings: 0
