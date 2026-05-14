---
name: em-fintech-pack
description: Emerging-markets fintech overlay. Pairs emerging-markets-fintech-reviewer.
when_to_use: Product serves financial users outside US/EU/UK or integrates local payment rails (UPI/PIX/M-Pesa/GCash/OVO/DANA).
applies_to:
  - commerce
  - regulated
  - web-service
---

# Emerging-Markets Fintech Pack

> Loaded when ARCH mentions: India, Nigeria, Brazil, Indonesia, Philippines, Mexico, Kenya, M-Pesa, UPI, PIX, GCash, OVO, DANA, RBI, CBN, BSP, OJK, MAS, BCB, cross-border, remittance.

## Reviewer

- **emerging-markets-fintech-reviewer** → `TM-emfin-{slug}.md`

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:license-strategy` | Decide own-license vs partner-bank per jurisdiction | Legal + Compliance |
| `gate:ship` | Standard | security-officer |

## Required artefacts

| Artefact | Owner |
|---|---|
| Per-country jurisdiction matrix (regulators, licenses, ID systems, FX) | architect |
| Data-localization map (data class × country × storage × egress) | architect |
| Local-rails adapter interface + per-rail implementation | senior-dev |
| Sanctions screening (OFAC + EU + UN + UK + local) daily refresh | senior-dev |
| PEP overlay screening | senior-dev |
| KYC tiering with local ID (Aadhaar / CPF / NIN / BVN / KTP / NRIC) | senior-dev |
| Cross-border transfer mechanism (DPDP "trusted countries" / LGPD / etc.) | legal + senior-dev |
| Local-language disclosures | localization |
| Local-tax reporting triggers | finance + senior-dev |

## EVAL suite

- `EVAL-data-residency` (PII never leaves home country when forbidden)
- `EVAL-sanctions-coverage` (known SDN-list cases blocked)
- `EVAL-pep-screening` (PEP cases trigger enhanced due diligence)
- `EVAL-fx-controls` (jurisdiction-specific FX rules enforced)
- `EVAL-local-rail-idempotency` (UPI/PIX/M-Pesa duplicate-transfer prevention)

## Quick jurisdiction matrix

| Country | Regulator | Privacy law | Key rails | ID systems |
|---|---|---|---|---|
| India | RBI + MeitY | DPDP 2023 | UPI, IMPS, NEFT | Aadhaar, PAN |
| Nigeria | CBN + NDPR | NDPR / NDPA | NIBSS Instant, Paystack/Flutterwave | BVN, NIN |
| Brazil | BCB + ANPD | LGPD | PIX, TED, boleto | CPF |
| Mexico | CNBV + CONDUSEF | LFPDPPP | SPEI | CURP, RFC |
| Indonesia | OJK + BI | UU PDP | QRIS, GoPay/OVO/DANA | KTP |
| Philippines | BSP + NPC | DPA 2012 | InstaPay, GCash, Maya | Philippine ID |
| Vietnam | SBV | Decree 53 (local data) | Napas | CCCD |
| Singapore | MAS + PDPC | PDPA | FAST, PayNow | NRIC |
| Kenya | CBK | DPA 2019 | M-Pesa | Huduma Namba |

## Cross-cutting

- **FATF Travel Rule:** ≥ $1k transfer → VASP-to-VASP info exchange
- **Daily refresh** of OFAC SDN, EU, UN, UK consolidated lists
- **Data-localization:** Indonesia PP 71/2019, Vietnam Decree 53, China CSL, India DPDP "trusted countries" list
