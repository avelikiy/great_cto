# ADR-032: Evidence-backed domain candidates and private overlays

**Status:** Proposed; opt-in developer foundation, not approved default activation.
**Date:** 2026-10-14
Tracking: great_cto-0b3o
Related: [Stage context](ADR-026-stage-context-packet.md),
[Skill candidate promotion](ADR-017-skill-candidate-promotion.md).

## Decision

Keep the generic execution and safety core. Preserve the role catalog and
existing regulatory pack routing. Introduce a separate knowledge-candidate
contract for money, crypto execution, telemedicine workflow integrity, venture
evidence and mental wellbeing safety engineering. Domain knowledge is not a
reviewer authority, jurisdiction certification or clinical qualification.

Each candidate has a version, digest, three engineering invariants and negative
check descriptions. These descriptions are NOT executed domain tests. All five
remain candidate and explicit-only. No default activation or role retirement.

Private project overlays are outside the public repository and installed
package. They bind an opaque project ID, source lineage, canonical root digest,
commit, exact working-file hashes, source kind, line spans, review window and
selected invariant IDs. Documentation, implementation and test specification
are separate evidence kinds. A dirty source can be pinned explicitly but is
never represented as commit content. Execution evidence is currently null;
this foundation cannot mint runtime receipts or promote a pack.

## Context

The catalog combines engineering capabilities, industries and jurisdiction
reviewers. Repository presence alone does not establish expertise or product
quality. We need small project-bound observations before changing positioning,
default activation or specialist prompts. The existing regulatory routing must
continue protecting configured projects throughout that experiment.

The developer command [domain-pilot](../../scripts/domain-pilot.mjs) audits only
explicitly listed, tracked engineering files. It does not crawl repositories,
follow symlinks, read secret/data directories, write state or call a model.
Reads are size-bounded and descriptor-checked. This is cooperative-controller
protection, not a same-UID OS sandbox or atomic snapshot of an entire repository.
Lineage identifiers are operator-declared, not a content-dedup attestation.

Host-specific packets share the same invariant knowledge but have different
host-bound digests. Packets contain no raw project text or file paths. They are
private untrusted task context and cannot override permissions, required
reviewers, approval gates or host policy. Preparation does not inject them into
either live host; explicit dispatch integration follows independent review.
No source-derived material is automatically published. Sanitization alone
does not establish permission to publish intellectual property.

## Matched outcome experiment

[The domain benchmark contract](../../scripts/lib/domain-benchmark.mjs) freezes
the core digest, task/source/acceptance/overlay/pack digests, independent scorer
digest, each host's model/policy, and shared token/context/time/spend caps.
Each task gets core and core-plus-pack arms on each host with at least three
counterbalanced repetitions. Every arm needs a unique run and isolated
workspace. Repetitions and derived project forks are not independent evidence.

Metrics: acceptance, serious regressions, rework rounds, human corrections,
active time and actual cost per accepted task. Cost includes rejected trials,
not only successful ones. Missing trials and measurements remain visible;
unknown acceptance/cost is null, not zero. Completed-pair differences are
explicitly conditional/descriptive; the report also exposes planned coverage
so incomplete arms cannot silently disappear. Serious regressions or measured
budget violations cannot be accepted.

Supplied receipt digests are identity pins, NOT independent runtime/scorer
attestations. This module does not verify signed receipts, execute native hosts,
claim significance, calculate a causal quality-uplift percentage or enable a
default. It revalidates canonical preregistration before accepting rows.

The [developer benchmark command](../../scripts/domain-benchmark.mjs) accepts
explicit JSON inputs and prints JSON only. No project auto-discovery, transport,
model execution or file writes:

```sh
node scripts/domain-pilot.mjs catalog
node scripts/domain-pilot.mjs audit /absolute/project /private/overlay.json project-a
node scripts/domain-pilot.mjs packet /absolute/project /private/overlay.json project-a codex
node scripts/domain-benchmark.mjs preregister /private/frozen-input.json
node scripts/domain-benchmark.mjs describe /private/protocol.json /private/observations.json
```

## Alternatives

Deleting non-focus roles breaks compatibility and removes shared preventive
controls. One new persona per project duplicates prompts and increases leakage.
Adding these candidates to existing broad keyword detection would confuse
engineering evidence maturity with regulatory risk routing. All are rejected.

## Consequences

Knowledge candidates and reviewer routing now have distinct contracts. Private
evidence expires and fails closed on source drift; maintenance is explicit.
No migration or installed host changes are required for this foundation.
An operator can prepare bounded context today but cannot claim live host
admission or validated domain quality from that preparation.

## Promotion and rollback boundary

Private observations may propose a sanitized invariant and counterexample.
Promotion requires publication authority, independently reviewed provenance,
reproduced failure/fix and a frozen holdout experiment on both hosts. Global
promotion additionally needs independent non-derived evidence. Clinical efficacy,
legal compliance and investment performance need separate professional proof.
Changed source invalidates the overlay; changed pack version/digest requires
explicit re-pin. Keep old version artifacts for rollback; no auto-learning or
permission expansion. Neither a passing software fixture nor repository
presence grants expertise.

## Delivery phases

The Beads epic tracks candidate contract, matched protocol, three private source
overlays, canonical verification/independent review, then authorized native-host
experiments. This foundation implements the first three engineering layers.
Controller admission, signed scorer receipts, representative hidden executable
fixtures and live trials remain separate work, not implied by this ADR.

## Verification

Unit/integration tests cover wrong project/root, stale windows, changed source,
unknown invariants, authority-field injection, link escapes and byte budgets.
Benchmark tests cover unmatched pins, duplicate/shared workspaces, protocol
mutation, missing metrics, lineage grouping, budget and safety refusals, failed
arms and total spend across rejected tasks. Synthetic fixture checks prove the
contract only. Full repository gate and independent review precede release.
