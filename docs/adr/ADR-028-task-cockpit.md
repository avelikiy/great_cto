# ADR-028: Task cockpit without a second controller

**Status:** Accepted for read-only projection; mutation stages proposed
**Date:** 2026-10-09
**Deciders:** Product owner request; implementation constrained by existing host authority

## Context

The board already reads task metadata, controlled runs, decisions, turn snapshots and project activity. Users still need to assemble execution status and next actions across views. A terminal dashboard can improve visibility but arbitrary live input would invalidate the controlled pipeline's frozen inputs and verification evidence.

## Decision

Keep the task/controller stores authoritative. Extend the existing project-scoped work projection with a bounded, content-free activity inspector and display stage, acceptance, recorded evidence, blockers and the next supported action together. Link activity exclusively through explicit run/session IDs, never title or role similarity. Successful process events are observations, not verification verdicts. Missing, unreadable and partial history remain distinct.

## Options considered

| Option | Complexity | Safety | Consequence |
| --- | --- | --- | --- |
| Another orchestration service | High | Competing state/lease owners | Reject: duplicated transitions and recovery |
| Raw interactive terminal in task view | Medium | Input can invalidate verification | Defer to an explicitly separate manual mode |
| Existing projection plus controller commands | Low for read side; medium for mutations | Retains one authority | Selected |

## Trade-off analysis

Reuse the board's existing refresh and project isolation. The inspector displays at most 20 linked events from the latest 200 project records. A busy unrelated session can displace older linked events; absence in this window is not evidence of inactivity. No raw prompts, output, paths or permission tokens are added to the projection. This first slice is refreshed observation, not a PTY or guaranteed real-time process monitor.

## Consequences

The board gains useful diagnosis without new execution permissions. Stage and evidence remain explicit. Task history stays readable when events are absent. Controller mutations require revision/content-bound approvals, idempotent partial-failure recovery and audited attempt transitions before exposure in UI.

## Delivery sequence

Tracked in Beads epic `great_cto-3kx7`: read-only cockpit (`.1`), revision-bound commit/push/PR publication (`.2`), audited controller intervention (`.3`), linked PR/CI evidence (`.4`). Publication never implies merge, release or deploy authorization. Unsupported runner capabilities must remain disabled, not simulated. No installed plugin update is part of this source change.
