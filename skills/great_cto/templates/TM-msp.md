# TM-msp-{slug} — Managed-IT / MSP Threat Model

**Owner:** msp-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> The failure mode here is one bad autonomous change becoming a **multi-tenant outage** or a
> **privilege-escalation incident** across the client fleet. This model forces change control,
> staged rollout, JIT least-privilege, and a change-approval gate.

## 1. Scope
- Pipeline: detect → plan change → stage → apply → verify (patch / config / remediation / provisioning)
- Autonomy: recommend-to-tech (assistant) · autonomous-below-blast-threshold (autopilot)
- Fleet: <endpoints / tenants>
- Blast autonomy ceiling (auto rollout %): …
- Standing privileged access: none · MUST-REMOVE

## 2. Applicability matrix
| Control area | In scope? | Notes |
|---|---|---|
| Change management | | approval + rollback + record |
| Blast radius / staged rollout | | rings + health gates |
| JIT least-privilege + PAM | | no standing admin |
| SOC 2 (Security/Availability/Confidentiality) | | evidenced controls |
| Multi-tenant isolation | | per-tenant credential scope |
| Backup / DR before destructive change | | verified restore point |
| Patch validation / CVE priority | | test before broad deploy |

## 3. Change-autonomy map
| Action | Autonomous? | Control |
|---|---|---|
| Patch/config to canary ring | yes | backup + rollback + health gate |
| Fleet-wide simultaneous push | **never auto** | staged rings + change-approval |
| Privileged (admin/root) action | JIT only | time-boxed grant + session record |
| Destructive (delete/decommission) | **never auto** | verified backup/DR + approval |
| Access provisioning | least-privilege | JIT, auto-deprovision, audit |

## 4. Change & rollout controls
- Pre-change backup/snapshot + tested rollback per change class; change record (who/what/when/why/result): …
- Staged rollout (ring 1 → canary % → broader) with health gates + auto-halt-and-rollback on regression: …
- Maintenance-window / freeze respect: …

## 5. Access (JIT / PAM)
- No standing privileged access; JIT time-boxed least-privilege grants; auto-deprovision: …
- Break-glass with session recording; MFA; no shared admin credentials: …
- Per-tenant credential scoping; no cross-tenant access in the orchestration plane: …

## 6. SOC 2 & DR
- Action audit trail feeds SOC 2 control set (access, change, monitoring, IR): … (composes with service-autopilot audit trail)
- Verified backup/DR point before any destructive change: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:change-approval` — human approval for fleet-wide / above-blast-threshold changes, privileged actions, and destructive changes.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
msp-reviewer-verdict: signed-off | blocked
fleet-size: <endpoints / tenants>
blast-autonomy-pct: <auto-rollout ceiling>
standing-privileged-access: none | MUST-REMOVE
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Change management: pre-change backup + tested rollback + change record per change
  - Staged rollout (rings + health gates) + auto-halt-and-rollback; no fleet-wide auto push
  - JIT least-privilege + PAM (no standing admin, break-glass + session recording, MFA)
  - Multi-tenant credential scoping + no cross-tenant access
  - Verified backup/DR before any destructive change
  - Blast-radius / privileged-action human approval (gate:change-approval)
gate: gate:change-approval
