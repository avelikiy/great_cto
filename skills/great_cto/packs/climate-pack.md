---
name: climate-pack
description: Climate-MRV + biosecurity overlay. Pairs climate-mrv-reviewer + biosecurity-reviewer (for synbio dual-use).
when_to_use: Product computes/reports carbon, issues/trades credits, supports CDP/SBTi/CSRD/SEC, or operates synbio platform.
applies_to:
  - data-platform
  - ai-system
  - regulated
---

# Climate / Biosecurity Pack

> Loaded when ARCH mentions: carbon, emission, GHG, MRV, Scope 1/2/3, Verra, Gold Standard, Puro, SBTi, CDP, CSRD, CBAM, OR synbio dual-use signals (gene synthesis, pathogen, gain-of-function, DURC).

## Reviewers

1. **climate-mrv-reviewer** → `TM-climate-{slug}.md`
2. **biosecurity-reviewer** (paired for synbio + dual-use AI bio) → `TM-biosec-{slug}.md`

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:mrv-methodology` | Methodology choice (cannot change retroactively) | Climate-lead + Verifier |
| `gate:durc-signoff` | If DURC/PEPP applicable | IRE + biosec expert |
| `gate:open-weights-release` | Generative bio-model release decision | Responsible Scaling Board |
| `gate:ship` | Standard | security-officer |

## Required artefacts — Climate

| Artefact | Owner |
|---|---|
| Methodology version pinning per project + boundary definition | architect |
| Activity-data lineage with tamper-evident hash chain | data-engineer |
| Double-counting prevention via retirement state machine | senior-dev |
| Verification trail per reported number | senior-dev |
| Re-statement policy + audit retention ≥ 10 years | architect |
| Versioned emission-factor library | data-engineer |
| Anti-fraud anomaly detection on Scope 3 self-reports | ai-eval-engineer |
| Green-claims marketing constraints (FTC + EU) | legal + product |

## Required artefacts — Biosecurity

| Artefact | Owner |
|---|---|
| DURC/PEPP applicability assessment | biosec-lead |
| IGSC sequence screening pipeline (monthly DB refresh) | senior-dev |
| Customer / institutional KYC | senior-dev |
| Output filters on generative models (homology + tiered response) | ai-prompt-architect |
| Capability evals (LAB-Bench, WMDP-Bio) in model card | ai-eval-engineer |
| Refusal-robustness probing | ai-security-reviewer |
| Tool-use guardrails (no autonomous order placement) | ai-prompt-architect |
| Append-only screening audit log | senior-dev |
| Export-control commodity check (Australia Group) | legal |
| Incident-response runbook | security-officer |

## EVAL suite

- `EVAL-carbon-attribution-stability` (re-calc consistency across input perturbations)
- `EVAL-double-counting` (issuance + retirement state-machine invariants)
- `EVAL-mrv-tamper` (hash-chain tamper detection)
- `EVAL-dna-screen-coverage` (known SoC sequences flagged ≥ 99%)
- `EVAL-bio-uplift-resistance` (WMDP-Bio adversarial probes)
- `EVAL-open-weights-decision-trace` (release went through formal review)

## Standards quick map

| Need | Standard |
|---|---|
| GHG inventory | GHG Protocol Corp + Scope 3 |
| Project credit | Verra VCS / Gold Standard / Puro.earth |
| Engineered removal | Puro.earth + Frontier methodologies |
| Target validation | SBTi |
| Corporate disclosure | CDP / CSRD / SEC climate |
| Border adjustment | EU CBAM (Q reporting; charges Jan 2026) |
| DURC oversight | NIH 2024 policy + P3CO |
| DNA synthesis screening | IGSC Harmonized Screening v2 |
