# ADR-033: Explicit domain context admission at host dispatch

**Status:** Proposed; local candidate, not installed or released.
**Date:** 2026-10-14
Tracking: great_cto-0b3o.6
Related: [Domain foundation](ADR-032-domain-evidence-pilot.md),
[focused presentation and experiment design](ADR-034-focused-domain-experience.md).

## Context

The foundation prepares data-only packets but does not deliver them to workers.
Admission must not change permissions, gate floors or specialist routing. A task
workspace can change during implementation; its provenance source must therefore
be separate, or an intended repair would invalidate the source before verification.

## Decision

Add an explicit private `--domain-policy` file at controlled-run start. Freeze
its digest in the operator run store. The policy binds `schemaVersion: 1`,
`projectId`, a canonical `sourceRoot`, `workspaceDigest`, the existing private
`overlay` and `maxBytes` (at most 16384). Source and worker roots may not overlap.
The policy file is operator-owned, bounded and outside the worker workspace.

Use the existing shared controller for both routed host workers, mixed waves and
the independent Codex verifier. Revalidate frozen policy, source commit/bytes and
expiry immediately before each invocation. Inject only the data-only packet,
not private source text or paths, labelled untrusted task data without authority.
Capture packet/overlay/pack digests and bytes in private attempt provenance.
Domain and earlier stage context share the existing 64 KiB context cap; refusal
does not silently truncate a pack. This byte cap is not a measured token or spend
budget and is not a full prompt-length limit.

No policy means existing behaviour. Resume cannot replace policy. Source drift
requires operator reassessment, not automatic repinning. Same-UID/ABA and OS
sandbox limitations from ADR-032 remain. Sources are cooperative provenance,
not cryptographically attested workspace lineage or verified clinical expertise.

## Alternatives

Separate host implementations duplicate admission rules. Hook emulation would
misrepresent Codex capabilities. Using the mutable worker root as provenance
invalidates context during intended repairs. Implicit discovery and automatic
activation cannot establish project authority. These alternatives are rejected.

## Verification contract

Test both actual injected controller runner seams, the verifier, mixed waves,
source drift, expiry, policy mutation, external/private policy files, absence of
raw source, context limits and preservation of gates/sandbox. Tests use stub
host responses and synthetic repositories, not paid model invocations.

Benchmark summaries distinguish raw acceptance from measured-cap-qualified
acceptance; incomplete budget metrics remain unknown. Reject inconsistent known
context/total token metrics. Supplied measurements remain unattested data.

## Consequences

Admission is opt-in and fails closed on changed source pins, expired review or
workspace binding mismatch. Operators must maintain a separate provenance root
and reassess changed evidence; normal worker edits cannot silently repin it.
Each invocation incurs fresh source observation and consumes the shared context
byte allowance. Provenance receipts describe delivery, not model adherence or
measured quality. Existing permissions and human gates remain authoritative.

## Remaining live experiment boundary

Prepare independent executable holdouts and pinned scorer, freeze models and
budgets, verify isolated source/workspace lineage and capture real receipts before
launch. Three projects, two hosts, two arms and three repetitions require at
least 36 planned trials. No live launch, promotion, quality claim, merge, release
or installation is authorized by this local implementation.
