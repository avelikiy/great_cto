# TM-accounting-{slug} — Accounting / Financial-Close Threat Model

**Owner:** accounting-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> The failure mode here is a **misstated financial statement** and broken internal control. This
> model forces segregation of duties, an immutable balanced ledger, and a close sign-off gate.

## 1. Scope
- Pipeline: source txn → journal entry → reconciliation → revenue recognition → period close
- Autonomy: suggest-to-accountant (assistant) · autonomous-below-materiality (autopilot)
- Framework: us-gaap · ifrs
- SEC issuer (SOX ICFR in scope?): yes · no
- Materiality (auto-post ceiling): $…

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| GAAP / IFRS measurement | | basis of accounting |
| ASC 606 / IFRS 15 (revenue) | | 5-step model |
| SOX §302/§404 ICFR | | SEC issuers |
| ITGC (access/change/ops) | | reliance on app controls |
| Segregation of duties | | post ≠ approve |
| Immutable ledger + audit trail | | append-only, balanced |
| Cutoff / accruals / reconciliations | | close controls |
| PCAOB / external-audit reperformance | | evidence export |

## 3. Journal-autonomy map
| Action | Autonomous? | Control |
|---|---|---|
| Standard recurring ≤ materiality | yes | SoD, balanced, logged |
| Non-standard / manual entry | escalate | gate:financial-close |
| Revenue (non-standard contract) | escalate | accountant review (ASC 606) |
| Reconciliation | agent prepares | human reviews (preparer ≠ reviewer) |
| Period close / lock | **never auto** | controller sign-off |

## 4. Control review
- SoD enforced roles (agent cannot post AND approve, prepare AND review): …
- Append-only, always-balanced ledger; corrections = reversing entries with evidence: …
- Cutoff + accrual + reconciliation controls; materiality threshold: …
- Entry-level audit trail (who/what/source/timestamp + evidence): … (composes with service-autopilot audit trail)

## 5. Revenue recognition (ASC 606 / IFRS 15)
- 5-step applied (contract → obligations → price → allocation → recognition): …
- Variable consideration + multi-element allocation + over-time vs point-in-time: …
- Non-standard contracts escalate to a human accountant: …

## 6. ICFR / ITGC (if SEC issuer)
- Control matrix (design + operating effectiveness) + management assertion support: …
- Change management + access controls over the accounting system: …
- Auditor-reperformable evidence export (entry detail + control-operation log): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:financial-close` — controller / accountant sign-off for non-standard entries, non-standard revenue, and the period-close lock.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
accounting-reviewer-verdict: signed-off | blocked
accounting-framework: us-gaap | ifrs
sec-issuer: yes | no
materiality-usd: <auto-post ceiling>
icfr-in-scope: yes | no
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Segregation of duties (post ≠ approve, prepare ≠ review) as enforced roles
  - Append-only, always-balanced ledger; corrections via reversing entries with evidence
  - ASC 606 / IFRS 15 five-step for revenue; non-standard → accountant review
  - Cutoff + accrual + reconciliation (preparer ≠ reviewer) controls; materiality threshold
  - Period-close lock + controller sign-off (gate:financial-close)
  - ICFR/ITGC control matrix + auditor-reperformable evidence export (if SEC issuer)
gate: gate:financial-close
