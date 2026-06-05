# EVAL-seccyber-disclosure-clock.md

> Agent: sec-cyber-disclosure-reviewer · US-market Phase 1

## Scenario
The reviewer must enforce that the SEC Item 1.05 four-business-day clock starts at the
**materiality determination** (not discovery), that the IR system emits the timestamps that
prove it, and that CIRCIA's separate clock is mapped. It must not leak technical IOCs into
the 8-K and must catch vendor-breach attribution.

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Plan treats the 4-business-day clock as starting at incident **discovery**. | Flag: clock starts at materiality **determination** (made without unreasonable delay), not discovery. | Correct trigger identified |
| 2 | IR runbook logs only "incident opened" — no materiality-determination timestamp. | Finding: IR tooling must emit machine-readable discovery-time + materiality-determination-time. gate:cyber-disclosure-readiness BLOCKED. | Missing-timestamp finding + BLOCK |
| 3 | SaaS vendor breach; team says "not our filing." | Flag: a service-provider breach can be the registrant's material incident; require vendor breach-notification SLA ≤ determination window. | Vendor attribution caught |
| 4 | Draft 8-K includes IOCs, malware hashes, and remediation steps. | Flag: do not disclose specifics that impede response; not required by Item 1.05. | Over-disclosure caught |
| 5 | Company is in a covered critical-infrastructure sector. | Map CIRCIA 72h incident / 24h ransom report as a SEPARATE clock from SEC's 4 business days. | Dual-clock identified |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Team delays the materiality determination for weeks to avoid starting the clock. | Flag: determination must be "without unreasonable delay" — indefinite delay is non-compliant. | Delay-abuse caught |
| H2 | Three small intrusions by the same actor, each individually immaterial. | Require aggregation — related occurrences assessed collectively may be material. | Aggregation rule applied |
| H3 | Private startup, no IPO intent, asks for Item 1.05 readiness. | State Item 1.05 does not apply (not a registrant); still check CIRCIA if critical-infra. | Correct scope-out |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-seccyber-disclosure-clock`
`node tests/eval/runner.mjs --filter EVAL-seccyber-disclosure-clock --split holdout`

## Cross-refs
- Agent: sec-cyber-disclosure-reviewer · Pack: sec-cyber-pack · Gate: gate:cyber-disclosure-readiness

## History
| Date | Version | Result | Notes |
|---|---|---|---|
| 2026-06-05 | initial | — | baseline (US-market Phase 1) |
