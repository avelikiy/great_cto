# ADR-041: Four Domain Focus with Advisory Conditional Graphs

**Date:** 2026-10-23

For cross-host implementers and reviewers, this decision adds shared focus metadata and conditional graph proposals while retaining the current execution and review authorities.

Date: 2026-10-23. Status: ACCEPTED for the three-component read-only slice; explicit operator approval on 2026-10-23, human gate `great_cto-0ane` resolved. Tracking: great_cto-ely5, great_cto-ely5.1. Full contract: [ARCH-four-domain-conditional-graphs](../architecture/ARCH-four-domain-conditional-graphs.md).

## Context

The operator approved four visible directions: Fintech + crypto, Telemedicine, Venture Pipeline and Mental Care. The complete 72-role catalog and eight core contracts remain available. A focus label should explain applicable work without requiring every core contract to run on every task.

Existing `scripts/lib/specialist-plan.mjs` already selects reviewers from change/project evidence. `scripts/lib/controlled-specialists.mjs` enforces preparation/review epochs; `scripts/lib/review-graph-floor.mjs` requires the independent code-reviewer, qa-engineer and security-officer quorum. `shared/pipeline.toml` remains the shared declared transition map. No evidence presently supports lowering that floor.

ADRs 032/033 keep five domain packs candidate, explicit-only and separate from reviewer authority. ADR-034 makes focus a presentation projection. ADR-040 records actual causal decisions in existing run state and refuses timestamp-inferred edges. These constraints remain in force.

The primary checkout declares gates-only. This worktree has no local PROJECT.md; absence does not authorize skipping architecture approval. Product approval is not architecture approval.

## Decision

Implement three components after gate:arch: a versioned shared registry, a read-only risk/graph proposal and board projection. Map `fintech-crypto` to `money` + `crypto-execution`, `telemedicine` to `telemedicine-workflow`, `venture-pipeline` to `venture-evidence`, and `mental-care` to `mental-wellbeing-safety`.

Use existing assessment and required-reviewer selection. Proposals carry schema version, advisory/non-executing flags, evidence state/fingerprint, composable ordinary/architecture/sensitive/publication classes, bounded nodes, typed proposed-dependency edges, required roles/gates and explicit limits. Unknown or stale evidence prohibits selective omission. Unknown versions render unavailable.

Native Claude and controlled Codex consume the same proposal semantics through their existing adapters. Neither proposal nor focus selection changes dispatch, approval, domain admission, permissions or publication. Actual causal topology remains separately sourced from controller records; native partial/unavailable evidence stays visible.

Preserve all current review roles and hard gate floors. Shorten unnecessary preparation only in a later separately approved execution slice. A literal implementation → checks → independent review path with only three LLM nodes conflicts with the current mandatory delivery quorum. Defer activation rather than silently merging or removing QA/security identities.

## Attack on the Recommendation

Shared metadata can imply equal host enforcement where only display parity exists. Advisory graphs can look authoritative. Require explicit host limitations and proposal labels, no observed-status fields, no scheduler writes, and regression snapshots showing unchanged run queues, gates and domain admission. If an implementation cannot keep these boundaries, restrict it to registry display until the proposal contract passes negative controls.

## Alternatives Considered

- **Delete non-focus roles and activate a fixed three-node execution path:** fewer visible contracts, but breaks catalog compatibility and current reviewer/QA/security floor. Rejected.
- **Create a domain orchestrator with per-host routing:** offers a separate customization point but duplicates state and gate/retry authority. Rejected.
- **Keep only presentation labels:** smallest reversible change, but cannot explain task-dependent paths or unavailable risk evidence. Rejected as insufficient to the requested first slice.

## Consequences

Positive: one stable focus vocabulary, explainable risk selection and preserved current enforcement. No new service, vendor, private source access or paid model invocation is required.

Negative: the first slice cannot claim fewer LLM calls or faster accepted delivery. Three mandatory independent delivery contracts remain, and host evidence limits require distinct states in the board.

Risks: proposal/trace confusion, missing-evidence underclassification, false host parity and inferred domain expertise. ARCH R-1 through R-5 define controls and deciding gates. Cost per accepted task, latency, quality differences and domain efficacy remain unknown.

## Migration and Rollback

No database or run-state migration. Revert additive registry/proposal consumers and board changes; discard derived proposals only. Preserve execution trace and private evidence. Unknown schema versions fail to unavailable. A future execution-policy change must bind reviewed policy versions and handle in-flight runs separately; this decision does not alter them.

## Validation and Approval Boundary

Freeze acceptance commands before builders run. Check four mappings, complete catalog, existing floor tests, unknown/stale/malformed inputs, malicious rendering, project response races, host limits, no scheduling mutations and no proposal-to-trace promotion. Independent review and current QA/security remain required after deterministic checks.

The operator approved gate:arch for the three-component read-only slice only. PM must freeze the implementation plan before builders start; whether a human plan pause applies is derived from the canonical approval-level helper. The current gates-only/devtools policy does not require gate:plan. Runtime/default reduction, true three-LLM-node activation, publication, release and installation remain separate decisions with baseline and negative controls. This ADR records architecture approval, not a clinical conclusion, compliance certification or vendor/model quality claim.
