# TM-procurement-{slug} — Procurement / Source-to-Pay Threat Model

**Owner:** procurement-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> The failure mode here is **moving company money to the wrong party** — a sanctioned entity, a
> bribe, or a fraudster. This model forces sanctions screening + SoD + a human payment-release gate.

## 1. Scope
- Pipeline: supplier onboarding → RFx / negotiation → PO → invoice → payment
- Autonomy: recommend-to-buyer (assistant) · autonomous-below-threshold (autopilot)
- Supplier geos: us · eu · uk · apac …
- Spend autonomy ceiling (auto-approve): $…
- Payment rails: ACH · wire · card · marketplace payout

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| OFAC SDN + consolidated | | strict liability |
| EU consolidated / UK HMT lists | | per supplier geo |
| FCPA / UK Bribery Act (ABAC) | | incl. third parties |
| PEP / UBO screening | | beneficial ownership |
| Invoice/PO fraud controls | | three-way match, BEC |
| Segregation of duties | | conflicting roles |
| Tax (VAT/GST, W-9/1099) | | vendor validity |
| GDPR (supplier PII) | | sole traders |
| EU Late Payment / P2B | | marketplace procurement |

## 3. Money-movement autonomy map
| Action | Autonomous? | Control |
|---|---|---|
| Supplier onboarding | post-screen | sanctions + UBO + ABAC |
| PO ≤ threshold | yes | budget + SoD |
| Invoice approval | if 3-way match clean | match + duplicate check |
| Bank-detail change | **never auto** | out-of-band verification |
| Payment > threshold | **never auto** | gate:payment-release |

## 4. Screening & fraud controls
- Sanctions/PEP at onboarding + continuous; hard block on hit; audit record: …
- Three-way match (PO↔receipt↔invoice) + duplicate-invoice detection: …
- Bank-detail-change out-of-band verification (BEC defence): …
- Vendor-master change control + amount/frequency anomaly detection: …

## 5. Segregation of duties + thresholds
- Enforced roles; agent cannot create-vendor AND approve-payment in one transaction: …
- Spend autonomy floor + human approver above it: …
- Approval/PO/payment audit trail (who/what): … (composes with service-autopilot audit trail)

## 6. ABAC due diligence
- Third-party risk rating + red-flag (shell co, unusual commission, govt-official/PEP ownership): …
- Gifts & entertainment limits; no facilitation payments; high-risk → compliance escalation: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:payment-release` — human approver for payments above the autonomy threshold + any sanctions/ABAC red flag.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
procurement-reviewer-verdict: signed-off | blocked
supplier-geos: [us | eu | uk | apac]
spend-autonomy-usd: <auto-approve ceiling>
sanctions-screening: continuous | onboarding-only | MISSING
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Sanctions/denied-party + UBO + PEP screening; hard block on hit; audit record
  - ABAC third-party due diligence + red-flag detection (FCPA / UK Bribery Act)
  - Three-way match + duplicate-invoice + out-of-band bank-detail-change verification (BEC)
  - Segregation of duties (no create-vendor + approve-payment by one actor)
  - Spend-threshold human payment-release (gate:payment-release)
gate: gate:payment-release
