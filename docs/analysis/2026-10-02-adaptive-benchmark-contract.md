# Matched workflow benchmark contract

Date: 2026-10-02. Beads: great_cto-p4o9.4.1 under great_cto-p4o9.4.
Status: protocol implementation, not a live benchmark result or run-ready corpus.

## Experiment boundary

The [existing phased pipeline](../architecture/ADR-phased-specialist-workflow.md)
and [scoped evidence](../architecture/ADR-scoped-review-evidence.md) require an
experiment broader than three arithmetic/retry/dedup microtasks. The protocol
declares eight separate task clusters: documentation-only maintenance, tenant
authorization, billing webhook idempotency, bounded import, prompt injection,
API compatibility, migration safety and browser accessibility. Each task needs
a representative isolated fixture and independent hidden checks before execution.
The descriptions in the module are acceptance contracts, not completed fixtures.

Both arms must pin exact artifact commit and package SHA256, complete execution
policies and matched role/model assignments. Latest release metadata presently
names v3.48.0 with targetCommitish main; that mutable branch label is not an exact
baseline pin and is not substituted for one. The caller must resolve and verify
the actual supplied artifact. Installed plugin state is not changed by this work.

The default design has three repetitions per task:24 paired blocks/48 workflow
trials. Arm order alternates by task/repetition. This does not make24 independent
task clusters; the unit of analysis is the eight task clusters. It is a bounded
initial design, not a power calculation or representative product-population claim.

Legacy and adaptive must execute the same task/acceptance criteria and preserve
the same mandatory domain/security/compliance floors. Comparing adaptive full
specialist review to a legacy fixture with required domain reviewers missing is
not a valid control. Before execution, the collector must resolve actual graphs
and confirm those floors, not rely on policy labels. Human gate approvals must
come from the operator; no scripted approval is included. Both arms stop at a
gate until it is approved. Gate dwell time is distinct from active processing time.

## Evidence and outcomes

Every observation binds protocol, task/repetition/arm, specification digest,
acceptance digest and artifact digest. Duplicates and mismatched pairs are refused.
Protocol changes after registration invalidate observation identity. The protocol
requires active elapsed time, worker/verifier calls, human pauses, actionable
findings, escaped defects and actual cost when independently available.

Missing data must be null. Blocked, failed and unassessed execution is retained
and does not become a completed acceptance failure. A completed independently
assessed candidate may pass or fail acceptance. Paired acceptance divides only
by jointly completed blocks; incomplete blocks remain explicit. Each descriptive
metric reports its own paired measured denominator. Cost is not inferred from
token estimates or unavailable usage. No failed trial is silently replaced.

`describeMatchedObservations` validates supplied observation structure and identity,
not runtime provenance. Its output labels that limitation. A trustworthy collector
must bind actual controller attempts/receipts, independently scored artifacts and
outside-worker evidence before results can support a product claim. The current
module always leaves qualityUpliftPercent null and defaultEnablementAllowed false.
It does not compute uncertainty or claim causal significance from supplied rows.

## Current verification and remaining work

Protocol tests passed15/15, including null/denominator semantics, partial pairs,
counterbalanced order, changed identity, duplicate trials and post-hoc edits.
No models were called, gates approved or trial results generated. Claude auth
still reports loggedIn:false, so no live comparative measurement was attempted.

Representative fixtures, hidden scorer, graph-floor validation and attested
controller observation collection remain required. The first
[controller invocation telemetry](2026-10-02-controller-dispatch-evidence.md)
records actual callback attempts and union elapsed intervals; it does not attest
provider requests, billing or independently scored outcomes. Then execute the matched
experiment and calculate task-cluster uncertainty with explicit failures/missing
costs. Parent benchmark remains open and depends on scoped/native validation.
The protocol is an implementation increment, not completion of those requirements.
