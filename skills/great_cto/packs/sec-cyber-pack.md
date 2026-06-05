---
name: sec-cyber-pack
description: US public-company cyber-disclosure overlay. Pairs sec-cyber-disclosure-reviewer.
when_to_use: Company is a US public filer (or pre-IPO/S-1) and handles incidents that could be material to investors, or is a CIRCIA covered critical-infrastructure entity.
applies_to:
  - web-service
  - enterprise-saas
  - fintech
  - ai-system
  - data-platform
---

# SEC Cyber-Disclosure Pack

> Loaded when ARCH mentions: public company, 10-K, 8-K, S-1, IPO, SEC filing, material incident, incident response, SIEM, CIRCIA — or stack has PagerDuty/Opsgenie/Statuspage/Splunk/Sentinel.

## Reviewer

- **sec-cyber-disclosure-reviewer** → `TM-seccyber-{slug}.md`

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:cyber-disclosure-readiness` | Pre-implementation — IR path must produce disclosure artifacts | security-officer |
| `gate:ship` | Standard | security-officer |

## Required artefacts

| Artefact | Owner |
|---|---|
| Materiality decision template (decider + inputs + SLA) | architect |
| IR runbook emitting discovery-time + materiality-determination-time (machine-readable) | senior-dev |
| Incident aggregation rule (related incidents assessed together) | architect |
| Dual-clock map: SEC 4-business-day vs CIRCIA 72h / 24h ransom | sec-cyber-disclosure-reviewer |
| Vendor breach-notification SLAs ≤ determination window | architect |
| 10-K Item 106 evidence trail (risk register, governance, pen-test cadence) | security-officer |
