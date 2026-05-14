# Emerging-Markets Fintech — Jurisdictions Knowledge Base

> Reference for `emerging-markets-fintech-reviewer` (W7).
> 8 priority jurisdictions; per-country licensing matrix, ID systems, rails, data-residency.

## How to use

1. List countries served (PROJECT.md `geo:` field or product roadmap).
2. For each country: pick license model (own / partner-bank), pin ID system, integrate rails per spec, enforce data-residency.
3. Map every transaction class × jurisdiction → applicable regulator + statute.

## Per-country deep-dive

### 1. India — RBI + MeitY

| Aspect | Detail |
|---|---|
| Primary regulator | Reserve Bank of India (RBI) + Ministry of Electronics & IT (MeitY) |
| Privacy law | DPDP Act 2023 — consent manager architecture, Significant Data Fiduciary (SDF) tier, cross-border to "trusted countries" only |
| Licenses | RBI Payment Aggregator (PA), Payment Gateway (PG), Account Aggregator (AA), Prepaid Payment Instrument (PPI). For lending: NBFC license |
| Rails | UPI (NPCI), IMPS, NEFT, RTGS, Bharat BillPay |
| Card-on-file | RBI tokenization mandatory since Oct 2022 |
| ID system | Aadhaar (UIDAI), PAN, Voter ID; eKYC via DigiLocker |
| AML | PMLA Reporting Entity; FIU-IND filings |
| Penalty | DPDP fines up to ₹250 crore |
| Notes | RBI circular cadence is high — subscribe to weekly bulletins |

### 2. Nigeria — CBN + NDPR/NDPA

| Aspect | Detail |
|---|---|
| Primary regulator | Central Bank of Nigeria (CBN), Nigerian Data Protection Commission (NDPC) |
| Privacy law | NDPR 2019 + NDPA 2023 — Data Controllers / Processors registration |
| Licenses | CBN PSSP, Switching, Mobile Money Operator, PTSP. Sandbox available |
| Rails | NIBSS Instant Payment (NIP), USSD, Paystack/Flutterwave (aggregators) |
| ID system | BVN (Bank Verification Number) — mandatory for KYC; NIN (National ID Number) |
| AML | EFCC + SCUML reporting |
| Cyber | CBN cybersecurity framework for OFIs |
| Notes | NDIC for deposit insurance; check OFAC + EU sanctions for Nigeria-listed PEPs |

### 3. Brazil — BCB + ANPD

| Aspect | Detail |
|---|---|
| Primary regulator | Banco Central do Brasil (BCB), ANPD (Autoridade Nacional de Proteção de Dados) |
| Privacy law | LGPD (Lei Geral de Proteção de Dados) |
| Licenses | Instituição de Pagamento (IP) — emissor de moeda eletrônica, emissor de instrumento, credenciador. SCD/SEP for fintech credit |
| Rails | PIX (instant, mandatory for banks > thresholds), TED, boleto, DOC |
| ID system | CPF (individuals), CNPJ (companies) |
| Open finance | BCB Open Finance — phased rollout; FIs participate by tier |
| AML | COAF reporting |
| Notes | PIX has high fraud — built-in MED (special return mechanism) |

### 4. Mexico — CNBV + CONDUSEF

| Aspect | Detail |
|---|---|
| Primary regulator | CNBV (banking), Banxico (FX/payments), CONDUSEF (consumer protection) |
| Privacy law | LFPDPPP (federal data protection law) |
| Licenses | Ley Fintech (2018) — IFPE (electronic money), IFC (crowdfunding). Sandbox in operation |
| Rails | SPEI (instant), CoDi (QR), domiciliación (direct debit) |
| ID system | CURP, RFC, INE (voter ID) |
| AML | SAT tax reporting on transactions ≥ MX$15k; UIF filings |
| Open finance | Pending — Mexico's open-finance rules in development |

### 5. Indonesia — OJK + BI

| Aspect | Detail |
|---|---|
| Primary regulator | OJK (Otoritas Jasa Keuangan) for fintech P2P + e-money; Bank Indonesia (BI) for rails |
| Privacy law | UU PDP 2022 — broad personal-data protection |
| Licenses | OJK fintech P2P lending, BI Payment Service Provider (PJP) |
| Rails | QRIS (national QR), BI-FAST, GoPay, OVO, DANA, ShopeePay |
| ID system | KTP (national ID), NPWP (tax) |
| Data localization | PP 71/2019 — strategic financial / health / consumer data must reside on Indonesian soil |
| AML | PPATK (Indonesian FIU) reporting |

### 6. Philippines — BSP + NPC

| Aspect | Detail |
|---|---|
| Primary regulator | Bangko Sentral ng Pilipinas (BSP) for payments + EMI; NPC for privacy |
| Privacy law | Data Privacy Act 2012 (RA 10173) |
| Licenses | BSP EMI (electronic money issuer), VASP, OFB (Operator of Payment System) |
| Rails | InstaPay (instant), PESONet (batch), GCash, Maya, Coins.ph |
| ID system | PhilSys (Philippine National ID), TIN |
| AML | AMLA Act; AMLC reporting |

### 7. Vietnam — SBV + Decree 53

| Aspect | Detail |
|---|---|
| Primary regulator | State Bank of Vietnam (SBV); MIC (cybersecurity); MPS (police, data localization enforcement) |
| Privacy law | Decree 13/2023 (Personal Data Protection Decree) |
| Data localization | **Decree 53/2022** — onshore storage mandatory for: personal data of VN citizens, data created in VN by users in VN, data on relationships of VN users |
| Licenses | SBV intermediary payment service license — required for non-bank rails |
| Rails | NAPAS (national switching) |
| ID system | CCCD (Citizen ID Card, chip-based) |
| Notes | Strictest data-localization in SE Asia — pre-clear before launch |

### 8. Singapore — MAS + PDPC

| Aspect | Detail |
|---|---|
| Primary regulator | Monetary Authority of Singapore (MAS); PDPC (privacy) |
| Privacy law | PDPA (Personal Data Protection Act) |
| Licenses | Payment Services Act (PSA): Major Payment Institution (MPI), Standard Payment Institution (SPI), Money-Changing License. DPT (digital payment token) for crypto |
| Rails | FAST (instant), PayNow, GIRO, Nets |
| ID system | NRIC (citizens/PR), FIN (foreigners); Singpass for eKYC |
| AML | MAS Notice 626; STR filings to STRO |
| Cyber | MAS TRM (Technology Risk Management) guidelines |
| Notes | Regional gateway — many cross-border products domicile here |

## Cross-cutting requirements (all jurisdictions)

| Requirement | Detail |
|---|---|
| Sanctions screening | Daily refresh of OFAC SDN + EU + UN + UK + local list. PEP overlay with EDD trigger |
| FATF Travel Rule | ≥ $1k transfer → VASP-to-VASP info exchange (originator + beneficiary) |
| Currency rounding | Per local market convention; document at adapter layer |
| Local-language disclosures | Each regulator-listed language required at consumer touchpoints |
| Tax reporting | Per-jurisdiction transaction thresholds; map to internal reporting jobs |
| Cross-border egress | Per country-pair: SCC (EU subject), DPDP "trusted countries" (India), Decree 53 (Vietnam onshore), LGPD international transfer (Brazil) |

## Activation matrix (for /em-fintech-review)

```
geo: in,ng,br,mx,id,ph,vn,sg  →  load this full matrix
geo: in,ng                     →  load India + Nigeria sections only
geo: latam                     →  expand to br,mx,co,ar (extend matrix when needed)
```

## Cross-refs

- `agents/emerging-markets-fintech-reviewer.md`
- `skills/great_cto/packs/em-fintech-pack.md`
- `tests/eval/EVAL-emfin-data-residency.md`
- `tests/eval/EVAL-emfin-sanctions-coverage.md`
- `tests/eval/EVAL-emfin-local-rail-idempotency.md`

## Sources

- RBI: https://www.rbi.org.in/ · MeitY DPDP: https://www.meity.gov.in/digital-personal-data-protection-act-2023
- CBN: https://www.cbn.gov.ng/ · NDPC: https://ndpc.gov.ng/
- BCB: https://www.bcb.gov.br/ · ANPD: https://www.gov.br/anpd/
- CNBV: https://www.gob.mx/cnbv · CONDUSEF: https://www.gob.mx/condusef
- OJK: https://www.ojk.go.id/
- BSP: https://www.bsp.gov.ph/
- SBV: https://www.sbv.gov.vn/
- MAS: https://www.mas.gov.sg/
- FATF: https://www.fatf-gafi.org/
