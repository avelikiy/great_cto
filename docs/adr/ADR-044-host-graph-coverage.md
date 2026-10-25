# ADR-044: Host graph observations and explicit coverage

**Date:** 2026-10-25
Status: Accepted design; implementation and runtime acceptance are separate
Extends: [ADR-040](ADR-040-recorded-execution-graph.md)

## Context

For implementers and reviewers, this decision extends recorded controller graphs
to host observations without giving those observations execution authority.
The operator approved implementation of a shared graph contract for Codex,
Claude Code and mixed controlled runs, followed by native-session coverage and
testing. This approval does not establish that the implementation or live
acceptance has passed.

The current controller records causal transitions in
[`execution-trace.mjs`](../../scripts/lib/execution-trace.mjs). Its bounded run
trace remains authoritative for dispatch, joins, verification and validated
gates. [`codex-exec.mjs`](../../scripts/lib/codex-exec.mjs) already exposes JSON
stream callbacks; [`claude-exec.mjs`](../../scripts/lib/claude-exec.mjs) currently
reads a final JSON result and runs with hooks disabled. Native task observations
in [`work-tasks.mjs`](../../scripts/lib/work-tasks.mjs) are linked Claude session
metadata. They do not currently provide equivalent causal history for either
host. A timestamp or completed role cannot fill this gap.

## Decision

Add a local, bounded observation journal with versioned normalizers and a strict
board projection. Preserve the controller trace and all existing write, approval,
verification and release policies. The journal cannot dispatch, resume, approve,
change task acceptance, publish or authorize an external action.

Each observer binds to a canonical project and explicit run/session identifiers
supplied by the controller or an operator-authorized session registration. Host
payloads cannot choose a project, storage path or control-plane identity.
Native sessions are opt-in observations of explicitly registered sessions;
there is no background discovery or transcript harvesting.

An event stores only identity, source metadata, classified lifecycle/tool
outcome, explicit parent references and allowlisted artifact digests. Strip raw
prompts, command lines, tool arguments/results, reports, URLs, local paths and
credentials before persistence. A digest establishes content identity only.

Coverage is multidimensional: lifecycle, parent/child linkage, tools,
verification, gates and artifacts. Each dimension declares source support and
observed completeness separately. Unknown source versions, missing terminal
events, observer failures, gaps, truncation and unresolved parents remain
visible. Unsupported dimensions never count as passed checks.

Keep Workflow (declared topology), Execution (recorded actions) and Evidence
(bound verification/artifacts) distinct. Edges require explicit source linkage
or an actual controller decision. Timestamps, source sequence and visual order
cannot establish causality. Native claims about gates remain observations;
only the existing validated controller decision establishes gate authority.

## Alternatives considered

| Option | Benefit | Rejection reason |
|---|---|---|
| Infer native edges from role names and time | Small adapter | Invents causality, cannot distinguish retries or missing children |
| Replace controller state with a new event-sourced orchestrator | One new state model | Adds a scheduler and new recovery authority beyond the approved feature |
| Put every host event inside existing run JSON | Reuses storage | Native sessions have no controller run; detailed events amplify every atomic state save |
| Keep controller trace and add bounded observations | Preserves authority, permits explicit native coverage | Chosen; requires deliberate source/completeness reconciliation |

The chosen option fails if observations are treated as control receipts, if
native identity is guessed, or if a journal gap is concealed by a green overall
badge. The acceptance contract must exercise all three failure modes.

## Consequences

No new cloud service, runtime dependency or telemetry endpoint is required.
Filesystem permissions and project membership become part of the observer
contract. CLI format changes require adapter fixtures and capability updates.
Local operators can still modify local files; a local hash chain is not an
external attestation and must not be advertised as one.

Completeness means the required events for a declared source capability and a
specific observation interval are present. It does not mean access to a model's
internal reasoning, proof that every tool effect was observed, or complete
history of arbitrary sessions. A live acceptance matrix is required before
publishing cross-host completion claims.

## Rollback and delivery gates

Disable observation admission and revert the readers/adapters. Existing run JSON
and controller gates retain their old meaning. Leave observation files untouched
and unread by older releases; do not perform automatic deletion or schema rewrite.

Required gates: normalization/storage tests, both-host contract tests, recovery
and privacy checks, board regressions, independent correctness/security review,
and exact-candidate canonical verification. Real provider acceptance remains
separate from offline fixtures. Merge, release, installation and live deployment
remain separate authorizations.
