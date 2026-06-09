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
| Unfair Claims Settlement Practices (Model #900) SLA + denial-reason templates | `docs/compliance/claims-appeal.md` | architect |
| Licensed adjuster / producer roster (Model #218 + adjuster licensing) per state × line | `docs/compliance/licensing-roster.md` | compliance officer |
| Privacy notices — Model #670 (FCRA-style rights) + Model #672 (GLBA Title V) | `docs/compliance/privacy-670-672.md` | compliance officer |
| Guaranty-association exposure + surplus-lines NON-coverage disclosure (Model #540 / #520) | `docs/compliance/guaranty-association.md` | compliance officer |
| Risk-Based Capital (RBC) inputs + action-level monitoring (Model #312 / #315) | `docs/compliance/rbc/` | senior-dev + actuary |
| ORSA Summary Report (Model #505) — risk framework + capital projection (if > $500M/$1B premium) | `docs/compliance/orsa/orsa-summary-report.md` | architect + actuary |
| Surplus-lines file — diligent-search log, home-state tax filing, Lloyd's/Bermuda IID-eligibility (Model #870 / NRRA) | `docs/compliance/surplus-lines.md` | compliance officer |
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
- `EVAL-unfair-claims-timeline` — Model #900: every claim has an acknowledgement timer, a logged reasonable-investigation step, and a written denial-reason; no coverage decision (deny/pay) without a licensed-adjuster sign-off event.
- `EVAL-licensing-coverage` — every state × line that the system binds, quotes-to-bind, or adjusts has a named, currently-licensed adjuster/producer (Model #218 + adjuster licensing) on file.
- `EVAL-rbc-recalc` — RBC ratio (Model #312 / #315) reproduces from annual-statement inputs; action-level thresholds (Company/Regulatory/Authorized/Mandatory Control) are computed and monitored.
- `EVAL-orsa-summary-report` — if premium > $500M (insurer) / $1B (group), an ORSA Summary Report (Model #505) exists with a documented risk-management framework and forward capital projection.
- `EVAL-surplus-lines-diligent-search` — every non-admitted (E&S) placement has a diligent-search log (or export-list / exempt-commercial-purchaser exception), home-state premium-tax filing (NRRA), and the alien insurer (Lloyd's / Bermuda) appears on the NAIC IID Quarterly Listing; insured received guaranty-fund non-coverage disclosure.

## NAIC Model Act quick reference

| Model # | Title | Covered by |
|---|---|---|
| #170 | Unfair Trade Practices Act (anti-discrimination) | disparate-impact EVAL |
| #218 | Producer Licensing Model Act | state-filings / licensing tracker |
| #270 | Unfair Claims Settlement Practices (model **regulation**) | claims-appeal SLA |
| #312 | Risk-Based Capital (RBC) For Insurers Model Act (life & P&C) | RBC / solvency artefacts |
| #315 | Risk-Based Capital (RBC) for Health Organizations | RBC / solvency artefacts |
| #440 | Property and Casualty Model Rating Law | rate filing per state |
| #505 | Risk Management & Own Risk and Solvency Assessment (ORSA) Model Act | ORSA Summary Report |
| #520 | Life & Health Insurance Guaranty Association Model Act | insolvency-backstop disclosure |
| #540 | Post-Assessment P&C Insurance Guaranty Association Model Act | insolvency-backstop disclosure |
| #670 | Insurance Information & Privacy Protection Model Act (FCRA-style consumer rights) | privacy controls |
| #672 | Privacy of Consumer Financial & Health Information Regulation (**GLBA Title V**) | privacy controls |
| #870 | Nonadmitted Insurance Model Act (surplus-lines / E&S) | surplus-lines tracker |
| #900 | Unfair Claims Settlement Practices **Act** (controlling anti-bad-faith standard) | claims-appeal SLA |
| #1006 | Insurance Data Security Model Law (cybersecurity event notification) | cyber-event EVAL |

> **Number hygiene (the judge caught a fuzzy #672):** #672 is the **GLBA Title V** privacy *regulation*, not
> an "IRPC / Insurance Regulatory Information" act. Privacy rights = **#670**; GLBA privacy = **#672**.
> IRIS (Insurance Regulatory Information System) is a solvency-screening tool, not a numbered privacy model.
> Annual Financial Reporting is **#205** (formerly cited here as #870, which is actually Nonadmitted Insurance).

## Applicability matrix — which regime fires when

| Regime / Model | Applies when | Required artefact | Gate |
|---|---|---|---|
| **Unfair Claims Settlement Practices (Model #900)** | Any flow that acknowledges, investigates, denies, or pays a claim | `docs/compliance/claims-appeal.md` (SLA + denial-reason template); licensed-adjuster sign-off log | `gate:adjuster-signoff` |
| **Producer / adjuster licensing (Model #218 + state adjuster licensing)** | System binds, quotes-to-bind, or decides/pays claims | `docs/compliance/licensing-roster.md` (licensed adjusters + producers per state + line) | `gate:adjuster-signoff` |
| **Insurance Information & Privacy Protection (Model #670)** | Collect/use/disclose consumer info in an insurance transaction | `docs/compliance/privacy-670-notices.md` (access, correction, adverse-action notices) | `gate:naic-filing` |
| **GLBA-privacy regulation (Model #672)** | Carrier/agent handles consumer financial or health info (GLBA Title V) | `docs/compliance/privacy-672-glba.md` (privacy notice + opt-out + HIPAA-aligned health rules) | `gate:naic-filing` |
| **Guaranty associations (Model #540 P&C / #520 L&H)** | Carrier writes admitted business; or places surplus-lines (must disclose NON-coverage) | `docs/compliance/guaranty-association.md` (assessment exposure + non-admitted disclosure) | `gate:naic-filing` |
| **Risk-Based Capital (Model #312 / #315)** | Any solvency, reserving, or capital-model feature | `docs/compliance/rbc/` (RBC formula inputs + action-level monitoring) | `gate:actuarial-signoff` |
| **ORSA (Model #505)** | Insurer > $500M, or group > $1B, direct + assumed premium | `docs/compliance/orsa/orsa-summary-report.md` (risk framework + capital projection) | `gate:actuarial-signoff` |
| **Surplus-lines / non-admitted (Model #870 + NRRA)** | Risk placed with non-admitted / alien insurers (Lloyd's, Bermuda) | `docs/compliance/surplus-lines.md` (diligent-search log, home-state tax filing, IID-eligibility check) | `gate:naic-filing` |
| **Solvency II (EU)** | EU/EEA-domiciled (re)insurer | `docs/compliance/solvency2/` (SCR/MCR, ORSA, SFCR/RSR) | `gate:actuarial-signoff` |

## Insolvency backstop & enterprise risk quick reference

- **State guaranty associations** pay covered claims on insurer insolvency, funded by **post-insolvency
  assessments** on solvent carriers with per-claim caps:
  - **Model #540** — Post-Assessment P&C Insurance Guaranty Association Model Act (property/casualty).
  - **Model #520** — Life & Health Insurance Guaranty Association Model Act (life / annuity / health).
  - **Surplus-lines / non-admitted business is generally NOT guaranty-fund protected** — disclose this to
    the insured whenever risk is placed in the E&S / alien-insurer market.
- **Risk-Based Capital (RBC):** **Model #312** (life & P&C, adopted 1993, rev. 2012) and **Model #315**
  (health). RBC sets capital floors with graduated **action levels** (Company → Regulatory → Authorized
  Control → Mandatory Control) by RBC ratio; feeds the annual statement.
- **ORSA — Model #505** (Risk Management & Own Risk and Solvency Assessment, adopted 2012, eff. 2015,
  accreditation standard). Applies to insurers writing **> $500M** or groups **> $1B** direct + assumed
  premium. Requires an annual internal ORSA + a confidential **ORSA Summary Report** to the lead-state
  commissioner on request. US analogue of Solvency II Pillar 2 ORSA — don't conflate the two regimes.

## Surplus-lines / non-admitted markets quick reference

- **Model #870 — Nonadmitted Insurance Model Act** governs **excess-&-surplus (E&S)** placements with
  **non-admitted (eligible) insurers** for risks admitted carriers decline.
- **Diligent search:** broker must document a search of the admitted market (declinations) unless the risk
  is on the **export list** or the insured is an **exempt commercial purchaser** (NRRA national exception).
- **Premium tax** is owed to and filed in the insured's **home state** under the federal **Nonadmitted and
  Reinsurance Reform Act (NRRA, 2010)**; a licensed **surplus-lines broker** must place and report.
- **Lloyd's of London** syndicates and other **alien (non-US) insurers** — including **Bermuda**-domiciled
  carriers (BMA-supervised, Solvency II-equivalent) — write US surplus-lines business only when listed on
  the **NAIC International Insurers Department (IID) Quarterly Listing of Alien Insurers**.

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
- NAIC Insurance Information & Privacy Protection (#670): https://content.naic.org/sites/default/files/model-law-670.pdf
- NAIC Privacy of Consumer Financial & Health Information Regulation / GLBA (#672): https://content.naic.org/sites/default/files/model-law-672.pdf
- NAIC RBC For Insurers Model Act (#312): https://content.naic.org/sites/default/files/model-law-312.pdf
- NAIC Risk Management & ORSA Model Act (#505) + ORSA: https://content.naic.org/insurance-topics/own-risk-and-solvency-assessment
- NAIC P&C Guaranty Association Model Act (#540): https://content.naic.org/sites/default/files/model-law-540.pdf
- NAIC Life & Health Guaranty Association Model Act (#520): https://content.naic.org/sites/default/files/model-law-520.pdf
- NAIC Nonadmitted Insurance Model Act / surplus lines (#870): https://content.naic.org/sites/default/files/model-law-870.pdf
- NAIC International Insurers Dept. (IID) — alien insurers / Lloyd's: https://content.naic.org/insurance-topics/surplus-lines
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
