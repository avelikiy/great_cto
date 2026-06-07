# TM-soc-{slug} — Managed-SOC / MDR Threat Model

**Owner:** soc-mdr-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> The autopilot sits between the customer's telemetry and their production estate, so **both error
> directions are incidents**: a false positive that isolates a healthy host is a self-inflicted outage;
> a false negative that closes a real intrusion is a breach. This model forces a certified analyst /
> incident-responder sign-off before any containment, host-isolation, or breach-notification action.

## 1. Scope
- Pipeline: telemetry → alert triage → enrich/correlate → investigate → recommend/stage response (detection → response)
- Autonomy: suggest-to-analyst (assistant) · autonomous-above-confidence (autopilot)
- Response actions: isolate · disable · block · revoke …
- Frameworks: soc2 · fedramp · pci-dss · hipaa …
- Clients: government · cardholder-data · healthcare · commercial …

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| SOC 2 (Security/Availability/Confidentiality) | | MDR service audited against it (baseline) |
| FedRAMP | | government clients, scoped boundary |
| PCI-DSS | | cardholder-data environments |
| HIPAA | | healthcare clients, PHI scoping |
| SEC Item 1.05 (Form 8-K) | | 4-business-day clock from materiality determination |
| State breach-notification (50 + DC/terr.) | | varying triggers/timelines/content |
| Chain-of-custody / forensic preservation | | litigation/regulatory integrity |
| Least-privilege response credentials | | scoped/short-lived/brokered |

## 3. Error-direction / confidence classification
| Decision | False positive cost | False negative cost | Gate above floor |
|---|---|---|---|
| Auto-close alert | missed breach | — | analyst review |
| Auto-contain / isolate host | production outage (self-inflicted incident) | dwell time | gate:ir-containment-signoff |
| Auto-disable account | locked-out user / outage | lateral movement | gate:ir-containment-signoff |
| Breach / SEC materiality | false disclosure | undisclosed breach, 4-day clock | gate:ir-containment-signoff |

## 4. Response safety & guardrails
- Every containment/isolation/notification path routes through `gate:ir-containment-signoff`: …
- Least-privilege response creds (scoped, short-lived, brokered, per-action logged): …
- Auto-halt + rollback on anomaly (isolation-rate spike, critical-asset block, mass disable): …
- Preserve-then-contain: volatile evidence captured before containment destroys it: …

## 5. Autonomy boundary
- Confidence floor gating BOTH auto-close (false negative) and auto-contain (false positive): …
- High-blast-radius actions always escalated (host-isolation, account-disable, breach notification, SEC materiality): …
- Analyst-of-record audit trail (who/what authorized each action): … (composes with service-autopilot audit trail)

## 6. Chain-of-custody & disclosure
- Evidence preservation: hash / immutable storage / timestamp / acquisition provenance: …
- SEC Item 1.05 materiality trigger surfaced to human; 4-business-day timeline preserved; clock never started/stopped autonomously: …
- State breach-notification staging + gated notify decision: …
- Framework scoping: containment respects FedRAMP/PCI/HIPAA scoped boundaries (SOC 2 baseline): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:ir-containment-signoff` — certified analyst / incident responder signs off above the confidence floor and on every high-blast-radius action.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
soc-mdr-reviewer-verdict: signed-off | blocked
frameworks: [soc2 | fedramp | pci-dss | hipaa]
response-actions: [isolate | disable | block | revoke]
high-blast-radius-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Containment/isolation/notification → certified analyst sign-off (gate:ir-containment-signoff)
  - Confidence gates BOTH auto-close (false negative) and auto-contain (false positive)
  - Least-privilege response creds: scoped, short-lived, brokered, per-action logged
  - Auto-halt + rollback on anomaly (isolation spike, critical-asset block, mass disable)
  - Preserve-then-contain: chain-of-custody (hash/immutable/timestamp/provenance)
  - SEC Item 1.05 materiality trigger surfaced to human; 4-business-day timeline preserved
  - Response respects FedRAMP/PCI/HIPAA scoped boundaries (SOC 2 baseline)
gate: gate:ir-containment-signoff
