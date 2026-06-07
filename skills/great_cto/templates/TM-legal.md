# TM-legal-{slug} — Legaltech / Transactional-Legal Threat Model

**Owner:** legal-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> **Not legal advice.** This threat model surfaces the legal-tech risk surface and forces a
> licensed-attorney sign-off into the pipeline. A qualified attorney owns the actual legal call.

## 1. Scope
- Product: contract drafting · NDA redline · regulatory filing · e-discovery · IP filing · entity formation
- Output to: end business (autopilot) · attorney (assistant) · pro-se consumer
- Attorney in the loop: yes (of record) · no
- Jurisdictions served: …
- Signing involved: yes (ESIGN/UETA/eIDAS) · no

## 2. UPL boundary matrix
| Output | Information / advice | Attorney-in-loop? | Mitigation |
|---|---|---|---|
| {template / clause library} | information | no | disclosure only |
| {clause selected for user facts} | advice | yes | gate:attorney-signoff |
| {filing from user facts} | advice-adjacent | yes | gate:attorney-signoff |

## 3. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| UPL (per-state) | | advice paths require licensed attorney |
| Attorney-client privilege | | only if attorney in loop; waiver risks |
| Work-product doctrine | | litigation-anticipation materials |
| ESIGN / UETA | | US e-signature |
| eIDAS | | EU e-signature (simple/advanced/qualified) |
| E-sign excluded docs | | wills, some family/notarial, certain UCC |
| Conflict-of-interest | | if matching/representation |
| Matter retention + legal hold | | state-bar retention; spoliation risk |
| GDPR / CCPA | | client PII |

## 4. Privilege & data handling
- Per-matter tenant isolation: …
- No-train-on-client-data default + sub-processor disclosure: …
- Access log (who/what touched each matter): … (composes with service-autopilot audit trail)
- Privilege-waiver risks (vendors, sub-processors, third-party sharing): …

## 5. E-signature controls (if signing)
- Intent + consent capture; attribution; tamper-evident audit trail (signer, timestamp): …
- Excluded-document blocklist (wills, etc.) enforced, not silently accepted: …

## 6. Jurisdiction & conflicts
- Governing-law capture + out-of-scope escalation: …
- Conflict-search gate + auditable record (if representation/matching): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:attorney-signoff` — licensed attorney signs off advice-shaped output before it is client-facing.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
legal-reviewer-verdict: signed-off | blocked
doc-types: [nda | contract | filing | ip | formation]
jurisdictions: [list]
upl-advice-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - UPL disclosure + advice-path attorney sign-off (gate:attorney-signoff)
  - Per-matter isolation + no-train-on-client-data + sub-processor disclosure
  - E-signature ESIGN/UETA/eIDAS controls + excluded-document blocklist (if signing)
  - Jurisdiction capture + out-of-scope escalation
  - Conflict-check gate + record (if matching/representation)
  - Legal-hold-aware retention (no deletion during hold)
gate: gate:attorney-signoff
