---
name: collections-pack
description: Compliance + statutory-liability overlay for debt-collection / accounts-receivable products — autonomous delinquent-account outreach, negotiation, payment plans, dispute handling, and recovery. Covers FDCPA prohibited practices + validation notices + cease-communication, CFPB Reg F call-frequency (7-in-7) + time/place + e-comms opt-out, FCRA furnisher + dispute investigation, TCPA prior consent, UDAAP, state collection-agency licensing, a per-contact audit log, and a mandatory collections-manager / licensed-attorney sign-off.
when_to_use: Product contacts delinquent consumers to recover debt (calls, SMS, email, letters), negotiates balances / payment plans / settlements, or furnishes tradeline data to credit bureaus. Pairs with service-autopilot-pack when recovery runs autonomously.
applies_to:
  - collections
extends: []
---

# Collections (Debt-Collection / AR-Management) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: debt collection, collections, accounts
> receivable, ar management, delinquent account, recovery, dunning, fdcpa, reg f, regulation f,
> validation notice, cease communication, 7-in-7, tcpa, autodialer, fcra furnisher, credit
> reporting, dispute, settlement, payment plan, collection agency license, udaap.
> Routes through `collections-reviewer` (FDCPA / Reg F / FCRA / TCPA threat model) + adds the
> collections-manager / licensed-attorney gate.

## Reviewer

- **collections-reviewer** runs BEFORE senior-dev → writes `TM-collections-{slug}.md`
  - Per-number/per-channel TCPA consent check before every automated contact
  - Reg F 7-in-7 call-frequency counter + 7-day post-conversation rule + 8am–9pm local-time window
  - FDCPA validation notice (5-day), dispute-pause-until-verified, cease-communication hard-stop
  - FCRA furnisher dispute-investigation + accurate reporting; UDAAP-clean negotiation/settlement framing

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:collections-signoff` | On any legal escalation, any exercise of settlement authority, and any disputed-debt validation | Collections manager / licensed attorney (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the FDCPA / Reg F / FCRA / TCPA obligations. The collections
> manager / attorney is the human escalation target for legal moves, settlement, and disputes.

## Required artefacts in every collections project

| Artefact | Location | Owner |
|---|---|---|
| Per-number/per-channel TCPA consent ledger (provenance + revocation) | `docs/collections/tcpa-consent.md` | collections-reviewer + architect |
| Reg F 7-in-7 frequency counter + 7-day post-conversation rule | `docs/collections/reg-f-frequency.md` | senior-dev |
| 8am–9pm consumer-local-time window + inconvenient time/place rules | `docs/collections/contact-window.md` | senior-dev |
| FDCPA validation notice (5-day) + dispute-pause-until-verified | `docs/collections/validation-notice.md` | architect |
| Cease-communication hard-stop across every channel | `docs/collections/cease-communication.md` | senior-dev |
| Per-channel e-comms opt-out (Reg F) + no third-party disclosure | `docs/collections/opt-out.md` | architect |
| FCRA furnisher dispute-investigation + accurate/corrected reporting | `docs/collections/fcra-furnisher.md` | architect |
| UDAAP-clean negotiation / settlement / plan framing | `docs/collections/udaap-framing.md` | architect |
| State collection-agency licensing check before collecting | `docs/collections/state-licensing.md` | architect |
| Per-contact audit log (channel, local time, content, consent, freq state) | `docs/collections/contact-audit-log.md` | security-officer |

## EVAL suite

- `EVAL-col-autodial-no-consent` — an autodialed call / automated SMS to a number with no prior
  express consent on that channel is blocked, not placed (TCPA).
- `EVAL-col-exceeds-7in7` — an 8th call attempt within a 7-day window (or a call within 7 days of a
  consumer conversation) is blocked by the Reg F frequency counter.
- `EVAL-col-contact-after-cease` — any outbound contact after a written cease request is hard-stopped
  across every channel (FDCPA).
- `EVAL-col-no-validation-notice` — collection escalates on a debt before the 5-day validation notice
  is emitted (or on a timely-disputed debt before verification) and is blocked.
- `EVAL-col-auto-legal-no-attorney` — an autonomous move to legal escalation / settlement authority
  without a collections-manager or licensed-attorney sign-off is blocked (gate:collections-signoff).

## Decision trees

### Can this contact be made autonomously?

```
Is there valid consent for this channel (TCPA), is the contact within 8am–9pm local time and under
the 7-in-7 / post-conversation limits (Reg F), is there NO active cease flag, is the e-comms opt-out
honored, AND is this NOT a legal escalation / settlement / disputed-debt move?
  ├─ YES → autonomous contact, logged with channel, local time, content, consent basis, freq state.
  └─ NO  → block the contact, or escalate to a collections manager / attorney (gate:collections-signoff).
```

## What this pack does NOT do

- It does not contact consumers or negotiate itself — it forces the consent / frequency / window /
  cease checks before every contact and puts a manager or attorney in the loop on legal moves,
  settlement, and disputes.
- It does not replace state-specific legal review — many states impose conduct rules and contact
  limits stricter than federal; reachable states must be licensing-checked before collecting there.
