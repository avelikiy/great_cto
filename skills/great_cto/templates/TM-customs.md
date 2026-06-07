# TM-customs-{slug} — Customs / Trade-Compliance Threat Model

**Owner:** customs-trade-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Filing a CBP entry is a regulated professional activity requiring a **licensed customs broker**; the
> dominant failure mode is **19 USC 1592 penalty liability for a false or negligent declaration**, not a
> late shipment. This model forces a broker-of-record sign-off into the pipeline.

## 1. Scope
- Pipeline: commercial invoice / packing list → HS/HTSUS + customs value + origin → denied-party screen → CBP entry (7501, ISF, ACE/ABI) → release
- Autonomy: suggest-to-broker (assistant) · autonomous-above-confidence (autopilot)
- Code sets: hts · htsus · eccn · usml …
- Trade modes: import · export · reexport …
- Setting: importer-of-record · broker-filed · self-filed

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| 19 USC 1592 (misclassification/undervaluation/origin/omission) | | negligence → fraud, up to domestic value |
| Importer reasonable-care standard | | non-delegable duty |
| HS / HTSUS classification (GRI + CROSS) | | drives duty / AD-CVD / 301 |
| Customs valuation + duty stack | | assists, royalties, dutiable freight |
| AD/CVD + Section 301 | | stack by HTS + origin |
| Denied-party screening (OFAC / BIS / CSL) | | every party, current lists |
| UFLPA forced-labor | | rebuttable presumption |
| Country-of-origin marking (19 USC 1304) | | legible marking |
| ITAR / EAR export-control adjacency | | USML / ECCN, end-use/end-user |
| Licensed customs broker requirement | | broker of record signs entry |

## 3. Field→document evidence trace (the reasonable-care / 1592 defence)
| Field | Evidence span required | Present? |
|---|---|---|
| HS / HTSUS code | invoice description + spec / CROSS ruling | |
| Customs value | invoice + terms (assists, royalties, dutiable freight) | |
| Country of origin | mill cert / origin declaration / BOM | |
| Parties screened | OFAC/BIS/CSL screen result, current lists | |

## 4. Edits & guardrails
- HTSUS classification vs current schedule + chapter/section notes + CROSS binding-ruling check: …
- Full duty stack computed (base + AD/CVD scope + Section 301): …
- Denied-party screen on every party (OFAC SDN / BIS Entity List / CSL), current lists, pre-release: …
- UFLPA forced-labor supply-chain screen + rebuttal-evidence path: …

## 5. Autonomy boundary
- Confidence floor below which an entry escalates to a licensed customs broker: …
- 1592-high patterns always escalated (lower-duty reclass, valuation deduction, origin/AD-CVD/301 change, screening hit, ITAR/EAR/UFLPA flag): …
- Broker-of-record audit trail (who/what classified, valued, screened, and signed each entry): … (composes with service-autopilot audit trail)

## 6. Origin marking, export control & reasonable-care record
- Country-of-origin marking (19 USC 1304) enforced: …
- ITAR (USML) / EAR (ECCN, end-use/end-user) recognition, no auto-file of controlled items: …
- Per-entry reasonable-care record (rulings consulted, basis for value/origin): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:broker-of-record-signoff` — licensed customs broker signs off on every CBP entry and on every 1592-high pattern, before transmission to CBP.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
customs-trade-reviewer-verdict: signed-off | blocked
code-sets: [hts | htsus | eccn | usml]
trade-modes: [import | export | reexport]
penalty-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Field→document evidence trace (the reasonable-care / 1592 defence)
  - HTSUS classification vs current schedule + CROSS binding-ruling check
  - Full duty stack (base + AD/CVD + Section 301) and AD/CVD-scope flag
  - Denied-party (OFAC SDN / BIS Entity List / CSL) screen on every party, current lists, pre-release
  - UFLPA forced-labor supply-chain screen + rebuttal-evidence path
  - Country-of-origin marking + ITAR/EAR export-control recognition (no auto-file)
  - Every CBP entry → licensed customs broker sign-off (gate:broker-of-record-signoff)
gate: gate:broker-of-record-signoff
