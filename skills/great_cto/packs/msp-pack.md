---
name: msp-pack
description: Change-control + access overlay for managed-IT / MSP products — autonomous patching, configuration, monitoring remediation, and access provisioning across client fleets. Covers change management (approval + rollback + record), staged rollout / blast-radius control, JIT least-privilege + PAM, SOC 2 Trust Services Criteria, multi-tenant client isolation, backup/DR-before-destructive-change, and a mandatory human change-approval gate.
when_to_use: Product autonomously patches, configures, remediates, or provisions access on client systems (RMM / endpoint / IdP / monitoring automation) or holds standing privileged access to customer environments. Pairs with service-autopilot-pack when changes run autonomously.
applies_to:
  - msp
extends: [infra-pack]
---

# Managed-IT / MSP Pack

> Loaded automatically when ARCH or PROJECT.md mentions: msp, managed it, managed service provider,
> rmm, remote monitoring, endpoint management, patch management, fleet, client environment, jit
> access, privileged access, pam, break-glass, soc 2, change management, remediation, provisioning.
> Routes through `msp-reviewer` (change-control + blast-radius + PAM threat model) + adds the change gate.

## Reviewer

- **msp-reviewer** runs BEFORE senior-dev → writes `TM-msp-{slug}.md`
  - Change management (pre-change backup + tested rollback + change record per change)
  - Staged rollout (rings + health gates) + auto-halt-and-rollback; no fleet-wide auto push
  - JIT least-privilege + PAM (no standing admin, break-glass + session recording)
  - Multi-tenant credential scoping; backup/DR before destructive change

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:change-approval` | Fleet-wide / above-blast-threshold changes, privileged actions, destructive changes | MSP engineer / change manager (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the change-control + blast-radius + PAM obligations. The change
> manager is the escalation target for high-blast-radius and privileged autonomous actions.

## Required artefacts in every MSP project

| Artefact | Location | Owner |
|---|---|---|
| Change-management policy (approval path, rollback per class, change record) | `docs/msp/change-management.md` | architect |
| Staged-rollout design (rings, health gates, auto-halt-and-rollback) | `docs/msp/staged-rollout.md` | senior-dev |
| JIT / PAM design (no standing admin, break-glass + session recording, MFA) | `docs/msp/jit-pam.md` | architect + security-officer |
| Multi-tenant isolation design (per-tenant credential scope, no cross-tenant) | `docs/msp/multi-tenant-isolation.md` | architect |
| Backup/DR-before-destructive-change policy | `docs/msp/backup-dr.md` | architect |
| SOC 2 control mapping (Security / Availability / Confidentiality) | `docs/msp/soc2-controls.md` | security-officer |
| Blast-radius autonomy threshold + change-approval workflow | `docs/msp/blast-radius.md` | architect |

## EVAL suite

- `EVAL-change-has-rollback` — every autonomous change records a pre-change backup and a tested
  rollback; a change with no rollback path is blocked.
- `EVAL-no-fleet-wide-auto-push` — a change to more than the blast threshold is staged through
  rings with health gates, not pushed fleet-wide at once; regression auto-halts + rolls back.
- `EVAL-no-standing-admin` — privileged actions use JIT time-boxed grants; no standing admin
  credential; break-glass is session-recorded.
- `EVAL-tenant-isolation` — one client's automation/credentials cannot reach another client's
  environment (no cross-tenant access).
- `EVAL-destructive-requires-dr` — a destructive change (delete/decommission) is blocked without a
  verified backup/DR point + approval.

## Decision trees

### Can this change run autonomously?

```
Is the change within the blast threshold (≤ canary ring), reversible (tested rollback + backup),
non-privileged or JIT-scoped, single-tenant-isolated, and non-destructive?
  ├─ YES → autonomous apply with a health gate; auto-halt + rollback on regression; logged.
  └─ NO  → stage through rings and/or escalate to a human (gate:change-approval). Fleet-wide,
            privileged, and destructive changes are never a straight-through auto push.
```

## What this pack does NOT do

- It does not replace your client-facing SOC 2 audit or MSA — it forces change control, staged
  rollout, JIT/PAM, and tenant isolation, and makes the blast-radius surface explicit.
- For your own product infrastructure (not client fleets) use `infra-pack`; this pack is for
  operating *other organisations'* systems as a service.
