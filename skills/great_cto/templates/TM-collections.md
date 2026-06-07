# TM-collections-{slug} — Debt-Collection / AR-Management Threat Model

**Owner:** collections-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Collections is a regulated activity gated on consent, frequency, and content; the dominant failure
> mode is **statutory liability** (FDCPA, Reg F, FCRA, TCPA — all with private rights of action),
> not a missed payment. This model forces a collections-manager / licensed-attorney sign-off on
> legal escalation, settlement, and disputed-debt validation.

## 1. Scope
- Pipeline: delinquent account → outreach → negotiation → payment plan / settlement → recovery
- Channels: call · sms · email · letter
- Autonomy: suggest-to-agent (assistant) · autonomous-contact (autopilot)
- States (licensing footprint): …
- Furnisher (reports tradeline data to bureaus): true | false
- Payers/creditors: …

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| FDCPA prohibited practices | | threats, false repns, harassment, bad time/place, third-party disclosure |
| FDCPA validation notice (5-day) + dispute | | pause collection until verified |
| FDCPA cease-communication | | hard-stop every channel |
| CFPB Reg F call-frequency (7-in-7) | | attempts per debt + post-conversation rule |
| CFPB Reg F time/place (8am–9pm local) | | + inconvenient time/place/workplace |
| CFPB Reg F e-comms opt-out | | per-channel, immediate |
| FCRA furnisher + dispute investigation | | accurate / corrected reporting |
| TCPA prior express consent | | per-number/per-channel for autodial/SMS |
| UDAAP | | negotiation / settlement / plan framing |
| State collection-agency licensing | | per reachable state, stricter rules |

## 3. Contact-eligibility gates (before every autonomous outbound contact)
| Contact | Gate required | Present? |
|---|---|---|
| Autodialed call / automated SMS | prior express consent on this number/channel (TCPA) | |
| Any call attempt | 7-in-7 frequency counter + 7-day post-conversation rule (Reg F) | |
| Any contact | 8am–9pm consumer-local-time window (Reg F / FDCPA) | |
| Email / SMS | per-channel opt-out present + honored (Reg F) | |
| Any contact | no active cease-communication flag (FDCPA) | |

## 4. Content + workflow guardrails
- Validation notice emitted within 5 days; collection paused on timely-disputed debt until verified: …
- Negotiation / settlement / plan language free of false, deceptive, or abusive framing (UDAAP, FDCPA): …
- No third-party disclosure of the debt; no contact at known-bad time/place/workplace: …
- FCRA furnisher dispute-investigation path + accurate, corrected reporting (if furnisher): …

## 5. Autonomy boundary
- Legal escalation, settlement authority, and disputed-debt validation always escalate to a
  collections manager / licensed attorney (the autopilot may draft; a human signs): …
- State collection-agency licensing checked for every reachable state before collecting: …
- Contact-of-record audit trail (who/what made each contact): … (composes with service-autopilot audit trail)

## 6. Audit log (the litigation defence)
- Per-contact log: channel, timestamp (consumer-local time), recipient, content, consent basis,
  frequency-counter state: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:collections-signoff` — collections manager / licensed attorney signs off on legal escalation, settlement authority, and disputed-debt validation.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
collections-reviewer-verdict: signed-off | blocked
channels: [call | sms | email | letter]
states: [<licensing footprint>]
furnisher: <true | false>
legal-escalation-paths: <count requiring collections-manager/attorney sign-off>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Per-number/per-channel TCPA consent check before every automated contact
  - Reg F 7-in-7 call-frequency counter + 7-day post-conversation rule
  - 8am–9pm consumer-local-time window + cease-communication hard-stop
  - FDCPA validation notice (5-day) + dispute-pause-until-verified
  - Per-channel e-comms opt-out (Reg F) + no third-party disclosure
  - FCRA furnisher dispute-investigation + accurate reporting (if furnisher)
  - State collection-agency licensing check before collecting
  - Full per-contact audit log (channel, local time, content, consent, freq state)
  - Legal escalation / settlement authority / disputed-debt validation → manager/attorney sign-off (gate:collections-signoff)
gate: gate:collections-signoff
