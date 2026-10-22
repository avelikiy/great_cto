# ADR-040: Controller-recorded causal execution graph

**Status:** Proposed
**Date:** 2026-10-22
**Deciders:** Product owner; independent code/security review before delivery

## Context

Sources: [existing controller](../../scripts/lib/codex-pipeline.mjs),
[task-first projection architecture](../architecture/ARCH-task-first-admin-v2.md),
[controlled host contract](../HOST-CODEX.md).

The pipeline template declares possible transitions. Historical attempts record
roles and timestamps, but those do not establish which attempt enabled another.
The board currently returns `topology: unknown`. A visual graph without recorded
edges would turn temporal proximity into false provenance.

## Decision

Persist an additive, bounded execution trace inside the existing operator-owned
run JSON. Its atomic save and run lease remain authoritative. No second scheduler,
event bus, database or browser mutation endpoint is introduced.

Record controller intent before dispatch and outcome after return. Nodes cover
attempts, checks, verification, selected transitions, gates, joins, rework,
recovery, cancellation, manual action and artifact publication. Edges reference
existing node IDs only and state their meaning. Each dispatch binds the actual
graph snapshot and input receipt digests. Transition edges name the producing
attempt/result, not merely its role. Parallel siblings bind their shared frozen
input and have no artificial edge based on serialized proposal application.

Gate approval is recorded only after existing token/receipt validation succeeds.
Recording cannot approve, resume or publish anything. Tokens, prompts, raw
reports, absolute paths and credentials never enter the public projection.
Content digests prove identity, not correctness or independent review.
Historical scoped reuse is a distinct node with a digest of the actual reused
report; it does not imply a fresh worker call or inherit historical approval.
Stage-context digests exclude separately admitted private domain packets.
Repair invalidates all affected scheduling frontiers, including queued partners
that have not dispatched; historical nodes remain inspectable but cannot enable
the replacement attempt.

Historical runs without the trace remain unavailable, native sessions partial.
Missing or malformed records cannot be reconstructed from timestamps. A bounded
trace that reaches its cap marks history incomplete instead of inventing edges
or changing the execution policy. Durable dispatch intent with no outcome means
unknown outcome, not a currently live worker or successful execution.

## Options considered

| Option | Complexity | Correctness | Cost |
|---|---|---|---|
| Infer edges from roles/times | Low | Cannot prove causality or retries | No service cost |
| New event store/orchestrator | High | Adds competing state and recovery authority | New operations burden |
| Add trace to existing run state | Medium | Controller records its actual decisions | No cloud/model cost delta |

The third option preserves atomicity with current state. Snapshot hashes and
typed edges are more verbose than a role-only diagram, but retain retry and join
identity. It is observational: an OS-level operator can still modify run JSON.

## Read model and UI

The project-scoped run reader projects only bounded allowlisted fields. Work
retains explicit single-run linkage. Execution renders recorded nodes and edges
and a keyboard-accessible node list/details view. Native/unlinked and legacy
runs retain their existing observations with a clear reason for missing topology.
The graph is not an arbitrary Mermaid renderer or editable workflow.

## Verification

Unit tests cover malformed/legacy data, caps, digest binding, no secret leakage,
and edge endpoint validation. Offline controller integration covers sequential
dispatch, verified/rework/unverifiable outcomes, valid/stale gate approval,
parallel joins, interruption recovery and cancellation. HTTP/browser tests cover
project isolation, both hosts, node details, mobile/light/dark and graph fallback.
Existing pipeline, approval, release and real-board browser regressions must pass.
The final canonical gate and independent review remain separate delivery gates.

## Consequences and rollback

No model calls, installed-plugin changes or production deployment are required
to test the implementation. Reverting the source leaves unknown additive trace
fields in run JSON; the previous controller ignores them. Native-host causal
adapters and a writable graph editor are separate future work, not implied here.
