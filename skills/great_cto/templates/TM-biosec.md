# TM-biosec-{slug} — Biosecurity Threat Model

**Owner:** biosecurity-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

## 1. Product classification
- Flavour: gen-ai-bio · dna-synth · cloud-lab · wet-lab · knowledge-product
- Capability: protein design · genome editing · pathogen-relevant knowledge · sequence ordering

## 2. DURC / PEPP applicability
- DURC (Cat 1) applicable: yes / no — reason
- PEPP (Cat 2) applicable: yes / no — reason
- IRE engagement plan: …
- Federal funder review required: yes / no

## 3. Screening pipeline
- IGSC Harmonized Screening v2 implemented: yes / no
- DB refresh cadence: monthly · weekly · daily
- Customer / institutional KYC: …
- Decision tiers: warn · require-human-review · block

## 4. Generative-model safeguards (if applicable)
- Capability evals (LAB-Bench / WMDP-Bio): …
- Refusal training + adversarial probing: …
- Tool-use guardrails on bio actions: …

## 5. Findings
| ID | Finding | Mitigation | Gate |
|---|---|---|---|

## 6. Required artefacts
- [ ] DURC / PEPP applicability assessment + IRE plan
- [ ] IGSC sequence screening pipeline
- [ ] Customer / institutional KYC
- [ ] Output filters with tiered response
- [ ] Capability evals in model card
- [ ] Refusal-robustness probing
- [ ] Tool-use guardrails (no autonomous order placement)
- [ ] Screening audit log (append-only)
- [ ] Export-control commodity check (Australia Group)
- [ ] Open-weights release decision (if applicable)
- [ ] Incident-response runbook

## 7. EVAL required
- EVAL-dna-screen-coverage · EVAL-bio-uplift-resistance · EVAL-open-weights-decision-trace

## 8. Gates
- gate:durc-signoff · gate:open-weights-release (if applicable) · gate:ship

<!-- HANDOFF -->
biosecurity-reviewer-verdict: signed-off
flavour: …
critical-findings: 0
