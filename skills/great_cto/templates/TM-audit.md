# TM-audit-{slug} — SOX ITGC / IT General-Controls Audit Threat Model

**Owner:** sox-itgc-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Issuing an audit opinion is a regulated professional act; the dominant failure mode is **issuing or
> supporting an opinion the evidence does not justify** (auditor liability), not a product bug. This
> model forces a licensed CPA / engagement-partner sign-off into the pipeline. The opinion is never
> auto-issued.

## 1. Scope
- Pipeline: system evidence → ITGC control tests → exceptions → workpapers → audit opinion → engagement partner
- Autonomy: assist-the-auditor (assistant) · autonomous-testing-with-partner-signoff (autopilot)
- ITGC domains: logical access · change management · IT operations · backup/recovery …
- Frameworks: PCAOB AS 2201 (ICFR) · AICPA · SOX §302 · SOX §404 …
- Setting: integrated audit · ICFR-only · SOC examination …

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| PCAOB AS 2201 (ICFR audit) | | only a licensed CPA may issue the opinion |
| AICPA standards | | professional standards |
| Sarbanes-Oxley §302 / §404 | | management assertion + ICFR attestation |
| ITGC — logical access | | provisioning, privileged access, access reviews |
| ITGC — change management | | request → approval → test → migration |
| ITGC — IT operations | | job scheduling, monitoring, incidents |
| ITGC — backup / recovery | | backup + restore testing, DR |
| Segregation of duties | | conflicting access / initiate-and-approve |
| Materiality & scoping | | in-scope systems/controls |
| Auditor independence | | no self-testing; AICPA/PCAOB/SEC |

## 3. Control→evidence trace (evidence sufficiency & competence)
| Control area | Evidence span required (population + sample + result) | Present? |
|---|---|---|
| Logical access | access listing + review sample + result | |
| Change management | change tickets + approval + migration evidence | |
| IT operations | job logs + incident records | |
| Backup / recovery | backup logs + restore-test evidence | |

## 4. Exceptions & severity
- Exceptions evaluated and classified (deficiency / significant deficiency / material weakness): …
- Material weakness forces escalation + changes the opinion (not downgraded/buried): …
- Segregation-of-duties conflicts detected and flagged (not normalised): …

## 5. Autonomy boundary
- The opinion is never auto-issued — drafted by the autopilot, signed by the CPA / engagement partner: …
- Always escalated: every opinion, every material weakness, every independence breach: …
- Workpaper / coder-of-record audit trail (who/what tested each control): … (composes with service-autopilot audit trail)

## 6. Scoping & independence
- Materiality & scoping respected (no silent scope drift): …
- Auditor independence intact — firm does not test controls it designed/operates; breaches escalate: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:engagement-partner-signoff` — CPA / engagement partner signs the opinion; escalated on every opinion, every material weakness, and every independence breach. The opinion is never auto-issued.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
sox-itgc-reviewer-verdict: signed-off | blocked
itgc-domains: [access | change | ops | backup]
frameworks: [pcaob-as2201 | aicpa | sox404]
signoff-required-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Control→evidence trace (population + sample + result; sufficient & competent)
  - Exception evaluation + severity (deficiency / significant deficiency / material weakness)
  - Segregation-of-duties conflict detection
  - Materiality & scoping respected (no silent scope drift)
  - Auditor independence check (no self-testing) + breach escalation
  - Opinion never auto-issued → CPA / engagement-partner sign-off (gate:engagement-partner-signoff)
gate: gate:engagement-partner-signoff
