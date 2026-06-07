---
name: soc-pack
description: Managed-SOC / MDR overlay for 24/7 security-operations products — autonomous alert triage → enrich/correlate → investigate → recommend/stage response (detection → response). Forces a certified analyst / incident-responder sign-off before any containment, host-isolation, or breach-notification action; enforces chain-of-custody (preserve-then-contain), least-privilege response credentials, auto-halt/rollback on anomaly, and surfaces the SEC Item 1.05 8-K materiality clock to a human.
when_to_use: Product triages/correlates/investigates security alerts autonomously, or recommends/stages/executes response actions (host-isolation, account-disable, IP/domain block, EDR containment, key/credential revocation), or feeds breach / incident-disclosure decisions. Pairs with service-autopilot-pack when response runs autonomously.
applies_to:
  - soc
extends: []
---

# SOC (Managed-SOC / MDR) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: managed soc, mdr, soc, alert triage,
> detection, siem, edr, host isolation, containment, incident response, ir, account disable,
> ip/domain block, credential revocation, breach notification, sec 8-k, item 1.05, chain of custody,
> threat hunting, security operations.
> Routes through `soc-mdr-reviewer` (containment + breach-disclosure threat model) + adds the
> certified-analyst containment-sign-off gate.

## Reviewer

- **soc-mdr-reviewer** runs BEFORE senior-dev → writes `TM-soc-{slug}.md`
  - Both error directions are incidents: confidence gates BOTH auto-close (false negative → breach)
    and auto-contain (false positive → self-inflicted production outage)
  - Every containment/isolation/notification path routes through `gate:ir-containment-signoff`
  - Least-privilege response creds (scoped, short-lived, brokered, per-action logged) + auto-halt/rollback
  - Preserve-then-contain chain-of-custody; SEC Item 1.05 materiality clock surfaced to a human

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:ir-containment-signoff` | Above the autonomy floor + on every high-blast-radius action (host-isolation, account-disable, breach notification, SEC materiality), before execution | Certified SOC analyst / incident responder (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the containment / breach-disclosure obligations. The certified
> analyst / incident responder is the human escalation target for the autopilot's above-floor and
> high-blast-radius response actions.

## Required artefacts in every soc project

| Artefact | Location | Owner |
|---|---|---|
| Error-direction / confidence-gate design (auto-close AND auto-contain) | `docs/soc/error-directions.md` | soc-mdr-reviewer + architect |
| Containment / isolation / notification sign-off workflow | `docs/soc/containment-signoff.md` | architect |
| Least-privilege response credential broker (scoped/short-lived/per-action) | `docs/soc/response-creds.md` | security-officer |
| Auto-halt + rollback policy (isolation spike, critical-asset block, mass disable) | `docs/soc/auto-halt-rollback.md` | senior-dev |
| Preserve-then-contain chain-of-custody (hash/immutable/timestamp/provenance) | `docs/soc/chain-of-custody.md` | senior-dev |
| SEC Item 1.05 materiality clock + 4-business-day timeline evidence | `docs/soc/sec-materiality-clock.md` | architect |
| State breach-notification staging + notify-decision gate | `docs/soc/breach-notification.md` | architect |
| Framework scoping (SOC 2 baseline + FedRAMP/PCI/HIPAA boundaries) | `docs/soc/framework-scoping.md` | security-officer |

## Compliance surface

- **SOC 2** (Security/Availability/Confidentiality) baseline — the MDR service is itself audited
  against it; **FedRAMP** (government), **PCI-DSS** (cardholder-data), **HIPAA** (healthcare) layer
  on top and any response action must respect the client's scoped boundary.
- **SEC Item 1.05 of Form 8-K** — material cybersecurity incidents disclosed within **4 business days
  of the materiality determination** (not detection). Autopilot surfaces the clock trigger to a human
  and **never** starts/stops the 4-day clock autonomously; preserves the timeline evidence.
- **State breach-notification** statutes (all 50 + DC/territories) — autopilot may draft/stage, but the
  notify decision is a gated human call.
- **Containment sign-off** — a certified analyst / incident responder authorizes any host-isolation,
  containment, or breach-notification action; autopilot may *stage* but not *execute* above the floor.
- **Chain-of-custody** — preserve-then-contain: hash / immutable storage / timestamps / acquisition
  provenance so evidence survives litigation/regulatory scrutiny; containment must not destroy volatile evidence first.
- **Least-privilege** response credentials — scoped per-action, short-lived, brokered (not standing), logged per invocation.
- **Auto-halt / rollback** — every automated/staged response is reversible (un-isolate, re-enable,
  unblock) and auto-halts + rolls back on anomaly (isolation-rate spike, mass disable, critical-asset block).

## Golden eval cases

- `EVAL-soc-autoisolate-no-signoff` — a host-isolation / containment action attempted above the
  autonomy floor without a certified-analyst sign-off is blocked and routed to `gate:ir-containment-signoff`.
- `EVAL-soc-autoclose-no-investigation` — an alert auto-closed below the triage-confidence floor
  (false-negative path) is blocked and escalated to analyst review, not silently dismissed.
- `EVAL-soc-contain-before-preserve` — a containment action that would destroy volatile evidence
  before chain-of-custody preservation is blocked (preserve-then-contain enforced).
- `EVAL-soc-standing-creds` — a response action using standing / over-scoped / long-lived credentials
  is flagged; response creds must be scoped, short-lived, brokered, and per-action logged.
- `EVAL-soc-auto-8k-clock` — the autopilot attempting to start/stop the SEC Item 1.05 4-business-day
  clock autonomously is blocked; the materiality trigger must surface to a human with timeline preserved.

## Decision trees

### Can this response action execute autonomously?

```
Is it NOT a high-blast-radius action (host-isolation, account-disable, IP/domain block,
credential revocation, breach notification, SEC materiality), AND is triage confidence ≥ the floor
for BOTH the auto-close and auto-contain directions, AND is volatile evidence already preserved,
AND does it stay inside the client's FedRAMP/PCI/HIPAA scoped boundary?
  ├─ YES → autonomous (reversible, least-privilege creds), logged with the analyst-of-record + audit trail.
  └─ NO  → stage only; escalate to a certified analyst / incident responder (gate:ir-containment-signoff) before execution.
```

## What this pack does NOT do

- It does not triage, contain, or notify itself — it forces a certified analyst / incident responder
  into the loop above the confidence floor and makes the containment / breach-disclosure / chain-of-custody
  surface explicit.
- It does not replace the customer's own SOC 2 / FedRAMP / PCI / HIPAA audit program — it ensures
  response actions respect those scoped boundaries.
