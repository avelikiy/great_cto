# TM-emfin-{slug} — Emerging-Markets Fintech Threat Model

**Owner:** emerging-markets-fintech-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Jurisdictions served
| Country | Regulator(s) | License(s) (own / partner-bank) | Privacy law | ID system | Local rail |
|---|---|---|---|---|---|

## 2. Data-localization map
| Data class | Country | Storage location | Egress allowed? | Mechanism |
|---|---|---|---|---|

## 3. Sanctions + PEP
- Lists screened: OFAC SDN · EU · UN · UK · local
- Refresh cadence: daily
- Matching algorithm: …
- PEP overlay source: …

## 4. KYC tiering
- Tier 1 (limited): …
- Tier 2 (standard): …
- Tier 3 (enhanced): …
- Local IDs accepted: Aadhaar / CPF / BVN / NIN / KTP / NRIC / …

## 5. Cross-border money + FX
- FX provider(s): …
- Locking mechanism: …
- Settlement currency rules per country-pair: …

## 6. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 7. Required artefacts
- [ ] Data-localization matrix
- [ ] Local-rails adapter interface + per-rail implementations
- [ ] Sanctions + PEP screening (daily refresh)
- [ ] KYC tiering with local IDs
- [ ] License footprint document
- [ ] Cross-border transfer mechanism per country-pair
- [ ] Local-language disclosures
- [ ] Local-tax reporting triggers

## 8. EVAL required
- EVAL-data-residency · EVAL-sanctions-coverage · EVAL-pep-screening · EVAL-fx-controls · EVAL-local-rail-idempotency

## 9. Gates
- gate:license-strategy · gate:ship

<!-- HANDOFF -->
emerging-markets-fintech-reviewer-verdict: signed-off
countries-served: …
critical-findings: 0
