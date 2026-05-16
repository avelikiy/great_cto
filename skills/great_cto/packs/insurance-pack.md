---
name: insurance-pack
description: Regulatory + compliance overlay for US/EU insurance products — NAIC Model Acts (50-state filing), Solvency II capital adequacy, IFRS 17 contract accounting, ACORD standards.
when_to_use: Product underwrites policies, processes claims, prices premiums, or operates as a managing general agent (MGA) / reinsurer / aggregator.
applies_to:
  - insurance
extends: []
---

# Insurance Compliance Pack

> Loaded automatically when ARCH or PROJECT.md mentions: naic, acord, ifrs 17, solvency, policy, premium, claim, underwrit, actuar, reinsur, MGA, P&C, L&H.
> Routes through `insurance-reviewer` (threat model + state filing matrix) + adds compliance gates.

## Reviewer

- **insurance-reviewer** runs BEFORE senior-dev → writes `TM-insurance-{slug}.md`
  - Generates 50-state filing matrix (US scope)
  - Generates Solvency II Pillar 1/2/3 readiness check (EU scope)
  - Generates ASOP 41/56 actuarial documentation checklist per pricing/reserving model
  - Generates disparate-impact analysis plan per pricing model

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:naic-filing` | After TM, before senior-dev claims tasks | Compliance officer (human) |
| `gate:disparate-impact` | After pricing model EVAL run, before launch | Chief actuary + legal (human) |
| `gate:actuarial-signoff` | After pricing/reserving model artefacts complete | Qualified actuary (ASB member) |
| `gate:ship` | Standard | security-officer |

## Required artefacts in every insurance project

| Artefact | Location | Owner |
|---|---|---|
| NAIC Model Act compliance matrix (~30 model acts × business line) | `docs/compliance/naic-matrix.md` | insurance-reviewer |
| 50-state filing tracker (admitted vs. surplus lines, rate + form filings) | `docs/compliance/state-filings.yaml` | insurance-reviewer |
| Solvency II SCR/MCR calculation evidence (EU only) | `docs/compliance/solvency2/` | senior-dev + actuary |
| ORSA report template (Solvency II Pillar 2) | `docs/compliance/solvency2/orsa.md` | architect |
| SFCR + RSR templates (Solvency II Pillar 3) | `docs/compliance/solvency2/sfcr.md` | architect |
| IFRS 17 measurement-model decision record (GMM / PAA / VFA per portfolio) | `docs/architecture/ADR-ifrs17-model.md` | architect |
| IFRS 17 CSM movement + fulfilment cash-flow reconciliation | `src/accounting/ifrs17/` | senior-dev |
| ACORD XML/JSON schema bindings (policy / claim / quote) | `src/integrations/acord/` | senior-dev |
| ACORD message conformance test fixtures | `tests/fixtures/acord/` | senior-dev |
| ASOP 23 (data) audit trail — data source, validation, limitations | `docs/actuarial/asop23-{model}.md` | actuary |
| ASOP 41 (communications) — methods, assumptions, reliance | `docs/actuarial/asop41-{model}.md` | actuary |
| ASOP 56 (modeling) — model risk, validation, governance | `docs/actuarial/asop56-{model}.md` | actuary |
| Disparate-impact analysis report (4/5ths rule + state-specific tests) | `docs/compliance/disparate-impact-{model}.md` | senior-dev + actuary |
| CA Prop 103 rate-filing package (if CA admitted, P&C) | `docs/compliance/ca-prop103/` | compliance officer |
| EU Gender Directive 2004/113/EC unisex-pricing evidence (EU only) | `docs/compliance/eu-gender-directive.md` | actuary |
| Bordereau template per treaty (reinsurance cessions) | `docs/reinsurance/bordereau-{treaty}.csv` | senior-dev |
| Claims fraud detection model card (no protected-class proxies) | `docs/models/fraud-detection-card.md` | senior-dev + actuary |
| Claims appeal-path SLA + override log | `docs/compliance/claims-appeal.md` | architect |

## EVAL suite

- `EVAL-naic-filing-completeness` — every state in scope has its required rate filing, form filing, and license artefacts present and current (≤ filing-cycle window).
- `EVAL-naic-cyber-event-notification` — Model #1006 / 23 NYCRR 500 notification workflow fires within mandated window (72h NY, 3 business days in most adopted states).
- `EVAL-disparate-impact-4-5-rule` — selection-rate / pricing-output ratio across protected classes (race, sex, age in applicable states) ≥ 0.80; failures gate launch.
- `EVAL-proxy-variable-audit` — for each model input, run correlation test against protected attributes on holdout; flag ZIP / credit-score / occupation proxies in CA, MD, OR, WA.
- `EVAL-ifrs17-csm-monotonicity` — CSM movements reconcile period-over-period; no negative CSM (unless loss-component carved out per IFRS 17 ¶47–52).
- `EVAL-ifrs17-paa-eligibility` — contracts measured under PAA satisfy ≤1y coverage OR demonstrate no material GMM difference (IFRS 17 ¶53).
- `EVAL-solvency2-scr-recalc` — SCR can be reproduced from inputs + standard formula (or approved internal model) on demand; QRT (Quantitative Reporting Template) export validates against EIOPA taxonomy.
- `EVAL-acord-schema-validation` — every outbound ACORD message validates against the declared ACORD Reference Architecture version; round-trip parses without loss.
- `EVAL-fraud-model-bias-audit` — fraud classifier evaluated on synthetic claims set with balanced protected-class distribution; FPR delta across classes < 5pp.
- `EVAL-asop56-model-documentation` — every model in scope has ASOP 23 / 41 / 56 docs, validation report, and named qualified actuary on file.
- `EVAL-bordereau-reconciliation` — bordereau totals tie to cession ledger ±$0.01 per treaty per reporting period.

## NAIC Model Act quick reference

| Model # | Title | Covered by |
|---|---|---|
| #170 | Unfair Trade Practices Act | disparate-impact EVAL |
| #270 | Unfair Claims Settlement Practices | claims-appeal SLA |
| #275 | Producer Licensing Model Act | state-filings tracker |
| #440 | Property and Casualty Model Rating Law | rate filing per state |
| #670 | Insurance Information & Privacy Protection | privacy controls (parallel to GLBA) |
| #672 | Insurance Information Privacy Protection (consumer data) | privacy controls |
| #870 | Annual Financial Reporting Model Regulation | financial reporting cadence |
| #900 | Unfair Claims Settlement Practices (revised) | claims-appeal SLA |
| #1006 | Insurance Data Security Model Law (cybersecurity event notification) | cyber-event EVAL |

## Solvency II (EU) quick reference

- **Directive 2009/138/EC** + **Delegated Regulation (EU) 2015/35** (Level 2 implementing measures).
- **Pillar 1 (quantitative):** Technical provisions = best estimate + risk margin; SCR (99.5% VaR, 1-year); MCR (lower bound, 25–45% of SCR).
- **Pillar 2 (governance):** ORSA — annual self-assessment of risk + capital; key functions (actuarial, risk, compliance, internal audit).
- **Pillar 3 (disclosure):** SFCR (public, annual); RSR (supervisor, annual); QRTs (quarterly).
- **Standard Formula vs. Internal Model:** Internal Model requires regulatory approval and adds Pillar 2 model-governance overhead.

## IFRS 17 quick reference

- **Effective:** annual reporting periods beginning on or after 1 January 2023 (with comparative restatement).
- **Measurement models:**
  - **GMM (General Measurement Model)** — default; fulfilment cash flows + risk adjustment + CSM.
  - **PAA (Premium Allocation Approach)** — eligible for contracts with coverage ≤1y or no material difference vs GMM; simplified.
  - **VFA (Variable Fee Approach)** — direct participating contracts; CSM moves with underlying items' fair value.
- **CSM (Contractual Service Margin):** unearned profit, released over coverage period; cannot be negative (loss component carved out).
- **Onerous contracts:** loss recognised immediately at initial recognition + loss-component tracked.
- **Transition options:** full retrospective (default), modified retrospective, fair value.

## Disparate-impact / anti-discrimination quick reference

- **Federal (US):** FCRA (Fair Credit Reporting Act) when credit data used in underwriting; ECOA via Reg B if credit-related; **insurance is mostly state-regulated** — no federal disparate-impact rule analogous to ECOA for non-credit pricing.
- **California Prop 103 (1988):** P&C rates require prior approval by CDI; mandatory rating factors restricted (driving safety record → annual miles → years of driving experience first); ZIP code is a permitted but optional factor with constraints.
- **State restrictions on ZIP / credit / occupation / education:**
  - CA, MD, MI, MA, HI: credit score restricted in auto.
  - CA, NY (auto post-2024 rule), WA, MD: education / occupation restricted as rating factors.
- **EU Gender Directive 2004/113/EC** + **Test-Achats CJEU ruling (Case C-236/09, 2011):** unisex pricing required for all insurance contracts entered after 21 Dec 2012 in the EU.

## ACORD quick reference

- **ACORD Reference Architecture (ARA):** cloud-native interoperability layer; JSON + GraphQL bindings on top of canonical model.
- **Key message families:** PolicyTransaction, ClaimTransaction, Quote, BillingTransaction, Party, Producer.
- **Versioning:** ARA releases are quarterly; pin schema version per integration partner.
- **Conformance:** ACORD Solution Provider Program — third-party conformance certification.

## Detection signals

Auto-attach when ARCH / PROJECT.md / package manifests contain any of:

- Strings: `naic`, `acord`, `ifrs 17`, `ifrs17`, `solvency`, `policy`, `premium`, `claim`, `underwrit`, `actuar`, `reinsur`, `bordereau`, `bordereaux`, `MGA`, `MGU`, `TPA`, `P&C`, `L&H`, `admitted carrier`, `surplus lines`.
- Packages (npm / PyPI / Maven): `@naic-org/*`, `acord-xml`, `acord-ara`, `actuarial`, `chainladder`, `lifelib`, `pyliferisk`, `pymort`.
- Files: `bordereau*.csv`, `*acord*.xml`, `*.qrt.xml`, `orsa-*.md`.
- Roles in `OWNERSHIP.md`: `chief actuary`, `appointed actuary`, `chief underwriting officer`.

## What this pack does NOT cover

- General PCI / KYC / AML — fintech-pack territory.
- General OWASP / app-sec — security-officer.
- Health-specific HIPAA — pair with `healthcare-pack` if L&H carrier touches PHI.
- Voice / telephony claims intake — pair with `voice-pack`.
- AI-driven underwriting threat model — pair with `ai-pack` + `ai-security-reviewer`.

## References

- NAIC Model Acts: https://content.naic.org/model-laws
- NAIC Insurance Data Security Model Law (#1006): https://content.naic.org/sites/default/files/MO668.pdf
- Solvency II Directive 2009/138/EC: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02009L0138-20210630
- Solvency II Delegated Regulation 2015/35: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02015R0035-20240102
- IFRS 17 Insurance Contracts: https://www.ifrs.org/issued-standards/list-of-standards/ifrs-17-insurance-contracts/
- ACORD Reference Architecture: https://www.acord.org/standards-architecture
- Actuarial Standards Board (ASOPs): http://www.actuarialstandardsboard.org/standards-of-practice/
- EU Gender Directive 2004/113/EC: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004L0113
- CJEU Test-Achats (C-236/09): https://curia.europa.eu/juris/liste.jsf?num=C-236/09
- California Prop 103 / CDI rate filings: https://www.insurance.ca.gov/0250-insurers/0300-insurers/0200-prior-approval/
- NYDFS Cybersecurity Reg 23 NYCRR 500: https://www.dfs.ny.gov/industry_guidance/cybersecurity

See `agents/insurance-reviewer.md` for full reviewer workflow and threat-model template.
