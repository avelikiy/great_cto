# DURC / PEPP Classification — Decision Tree

> Reference for `biosecurity-reviewer` (W8). Maps research / product activity to NIH 2024 Dual-Use Research of Concern (DURC) and Pathogens with Enhanced Pandemic Potential (PEPP) categories.

## Why this exists

The 2024 NIH policy (effective May 2025) replaced the 2012 + 2017 frameworks. Misclassification at the IRE (Institutional Review Entity) stage delays federally-funded research by months. Use this tree **before** writing protocols.

## Step 1 — Is this DURC (Category 1)?

A study is **DURC** if **both** apply:

A. It involves one or more of the **15 select agents/toxins of concern**:

- Bacillus anthracis, Botulinum neurotoxins, Burkholderia mallei, B. pseudomallei, Ebola virus, Foot-and-mouth disease virus, Francisella tularensis, Marburg virus, Reconstructed 1918 influenza virus, Rinderpest virus, Toxin-producing strains of Clostridium botulinum, Variola major virus, Variola minor virus, Yersinia pestis, SARS-CoV (the 2003 virus, not SARS-CoV-2)

B. The research can be **reasonably anticipated** to provide knowledge / products / technologies that meet **≥ 1 of 7 dual-use outcomes**:

1. Enhance harmful consequences of the agent
2. Disrupt immunity / vaccine efficacy without clinical / agricultural justification
3. Confer resistance to clinically / agriculturally useful prophylactic / therapeutic interventions
4. Increase stability, transmissibility, or ability to disseminate the agent
5. Alter the host range or tropism
6. Enhance susceptibility of a host population
7. Generate a novel pathogen / toxin or reconstitute an eradicated / extinct agent

→ If **A AND B** are true: **Category 1 (DURC)** — IRE review + federal funder pre-approval.

## Step 2 — Is this PEPP (Category 2)?

A study is **PEPP** if it involves research on any "Pathogen with Enhanced Pandemic Potential" — defined as a pathogen that is **both** (i) likely highly transmissible in humans and (ii) likely highly virulent. Includes:

- **Enhanced PPP**: result of laboratory enhancement (gain of transmissibility / virulence relative to wild type)
- **Wild-type PPP**: existing pathogens with pandemic potential (e.g., SARS-CoV-2, certain influenza A subtypes, MERS-CoV, Nipah, Ebola, Marburg, etc.)

→ Category 2 (PEPP) — IRE review + HHS P3CO Framework review for federal funding.

## Step 3 — Decision matrix

```
                          ┌─ DURC criteria A? ──────── no ──┐
                          │                                 │
                          ▼                                 ▼
        Research involves    DURC criteria B?         No DURC.
        select agent/toxin   ↓                        Check PEPP only.
                            yes                              │
                             │                               ▼
                             ▼                       PEPP pathogen?
                          Category 1 DURC               ↓                  ↓
                         + IRE review                  yes                  no
                         + federal pre-approval         │                   │
                                                        ▼                   ▼
                                                Category 2 PEPP         Standard
                                                + IRE review            biosafety review
                                                + HHS P3CO framework
                                                + risk-mitigation plan
```

## Step 4 — Required artefacts per category

### Category 1 (DURC) — required before initiation

- [ ] Pre-screening review by Institutional Review Entity (IRE)
- [ ] Institutional Contact for Dual-Use Research (ICDUR) designated
- [ ] PI risk assessment + mitigation plan
- [ ] Federal funding agency review (NIH / DoD / USDA / etc.)
- [ ] Communication plan for sensitive findings (publication review)
- [ ] Annual reporting to IRE + funding agency

### Category 2 (PEPP) — required before initiation

- [ ] All Category 1 artefacts PLUS:
- [ ] HHS P3CO Review Group submission + approval (for HHS-funded research)
- [ ] Enhanced biosafety risk assessment (BSL-3+/BSL-4 typically required)
- [ ] Containment-failure scenario analysis
- [ ] Pandemic-preparedness coordination plan (informs WHO / CDC if escape)

## Step 5 — AI x biology specific add-ons

If the research involves **generative models for biology** (protein design, genome design, pathogen sequence modeling):

- [ ] Capability evaluation against WMDP-Bio / LAB-Bench benchmarks (pre-registered)
- [ ] Refusal-robustness probe set documented
- [ ] Output filter: homology check against Sequences of Concern (SoC) database
- [ ] Tool-use guardrails: agent cannot autonomously place DNA / protein synthesis orders
- [ ] Open-weights release decision per responsible-scaling framework
- [ ] EO 14110 (US, 2023) and successor AI-bio policy attestation

## Activation logic for /dna-screen

If product or research falls in **Category 1 or 2**:
- `gate:durc-signoff` opens — human + biosec expert review required
- IRE engagement plan must exist before code merges to main
- For generative bio-AI: `gate:open-weights-release` also opens before any model weight publication

## Sources

- NIH 2024 Policy (May 2025 effective): https://osp.od.nih.gov/policies/dual-use-research-of-concern/
- HHS P3CO Framework: https://www.phe.gov/s3/dualuse/Pages/p3co.aspx
- 15 select agents list: 42 CFR 73 (CDC) + 7 CFR 331 (USDA) + 9 CFR 121 (USDA-APHIS)
- EO 14110 (Safe, Secure AI): https://www.whitehouse.gov/briefing-room/presidential-actions/2023/10/30/
- IGSC Harmonized Screening Protocol v2 (2023): https://genesynthesisconsortium.org/

## Cross-refs

- `agents/biosecurity-reviewer.md`
- `skills/great_cto/packs/climate-pack.md` (biosec paired with climate)
- `tests/eval/EVAL-biosec-dna-screen-coverage.md`
- `tests/eval/EVAL-biosec-bio-uplift-resistance.md`
