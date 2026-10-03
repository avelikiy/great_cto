# ADR: Controlled specialist scheduling and post-build review epochs

Status: Proposed, implemented for review. Date: 2026-10-02.
Deciders: maintainer and independent security reviewer.
Beads: great_cto-p4o9.3.2.1; full phase coverage and attested reuse remain follow-up.

## Context and decision

Native specialist plans are advisory; a Codex controller previously neither
scheduled domain specialists nor included them in the release join. Add an
explicit post-build scheduling policy without changing existing defaults or
claiming that post-build inspection replaces pre-implementation threat models.

`codex-pipeline.mjs start --entry senior-dev --specialist-policy <outside-file>`
accepts an operator-owned JSON file outside the worker workspace:

```json
{"mode":"adaptive","workflow":"existing-change","base":"<pinned commit SHA>"}
```

This v1 is for authorized existing-change delivery only. It does not enter the
greenfield contract workflow or authorize implementation, release or deployment
by itself. Explicit allowed paths must include `docs` or `docs/specialist-reviews`.
The declared graph must contain the original three independent reviewers and
their symmetric joins to devops, plus a ship gate. The controller freezes the
project declaration digest and pinned base in its outside-worker run state.
Project/archetype/compliance changes require a newly assessed run.

After verified implementation, assess the actual current diff again. Mandatory
code-reviewer, qa-engineer and security-officer remain. Add selected supported
domain roles to senior-dev's fan-out. Each reviewer joins every other required
reviewer; every review edge retains its gates and has gate:ship. Do not raise the
ship gate before the full successful quorum. Existing independent verifiers,
receipts, mandatory checks, shared admission budget and human approvals remain.
Selected PCI/regulated/GDPR/healthcare/US-privacy roles additionally impose
security/compliance/ship on the security-officer edge, even when an adaptive
gate policy asks for auto or declares a less restrictive archetype.

Domain roles have explicit read-only capability descriptions, not imported
executable Claude prompts. This increment adds profiles for PCI, regulated,
GDPR, AI security, enterprise SaaS, API platform, infrastructure, healthcare,
US privacy and oracle review. Existing db-migration review is also supported.
Unknown profiles refuse scheduling. Selected contract/eval roles not ending in
`-reviewer` refuse this phase instead of being silently dropped or moved after
implementation. Full archetype coverage is therefore not claimed.

## Review epoch and invalidation

The epoch binds base, selected roles/reasons and bounded Git-visible dependency
content, using the shared specialist-plan fingerprint. Report outputs are
controller-tracked exclusions only after successful independent verification.
Reviewers may create new Markdown reports under `docs/specialist-reviews/`;
they cannot edit implementation, existing reports or arbitrary docs. A new
attempt after rework must use a new report path when the old report remains.
Only exact new verified report paths are excluded, never an entire directory or
worker-provided dependency list. Report contents remain protected by the normal
controller writes/hash checks and pending-gate tree receipt.

Before a worker/wave or human gate approval, recheck the epoch. Changed source,
dependencies, selected roles or project policy refuse progression. An epoch
failure is not automatic rollback or consent to discard artifacts; inspect and
start an assessed run. Rejected domain review or verifier rework uses the same
bounded senior-dev repair path as baseline reviews. Rewind invalidates all
affected review results/approvals, restores the original graph and discards the
old epoch. A new verified implementation schedules a fresh epoch.

`reusablePass=false`: no old PASS, fresh log, matching notification cache or
successful process exit substitutes for current review and verification. Scope
is conservative and includes unrelated visible-tree changes; ignored runtime
inputs are not attested. Broad unknown scope, unsupported artifacts, symlinks
and bounds exceeded refuse optimization. This is not cross-project caching.

## Alternatives and consequences

Advisory-only selection is simple but cannot enforce a release quorum. A generic
reviewer prompt for every domain appears complete but supplies no domain-specific
capability; rejected. Reusing historical PASS by age/path is cheaper but lacks
independent scope attestation; rejected. Explicit capability profiles and an
all-member join cost more on regulated changes while avoiding unrelated catalog
launches on a low-risk web-service change. Conservative full-tree epochs can
block on unrelated changes; narrower scope requires trusted dependency contracts.

## Validation and remaining scope

Test default-off behavior, unsupported phase/profile refusal, mandatory joins,
fintech domain selection, new payment implementation, project downgrade refusal,
dependency invalidation before approval/launch, reviewer write confinement,
negative/rework invalidation, verified report exclusions and mixed-host waves.
Run legacy controller, native plans/hooks, budget, gates, checks, receipts, host
CLI and release regressions. Simulated runners exercise the real controller but
are not a live model quality/cost benchmark.

Remaining: remaining domain capabilities, pre-implementation/contract/eval phase
dispatch, independently attested scoped PASS reuse, native asynchronous admission
coverage, representative live benchmark, independent security review and scanner.
Installed plugin, global defaults, merge and release are not changed here.
