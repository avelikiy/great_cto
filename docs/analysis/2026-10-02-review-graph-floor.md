# Structural review boundary hardening

This is source-branch controller hardening, not proof that the installed plugin
has changed or that a comparative benchmark is eligible.

## Failure addressed

A ship gate somewhere in a graph does not protect every review exit. A base
rule with a quorum can also be overridden by a verdict-specific rule without
that quorum. An implementation fan-out that includes the required reviewers
can still include an extra direct release edge.

`scripts/lib/review-graph-floor.mjs` now checks a bounded structural contract:

* Implementation fans out to exactly the mandatory and selected post-build
  reviewers, with no direct release or extra terminal branch.
* Every review role has exactly one exit to `devops`, joins every other review
  role, has no unknown/self join partner, and declares `gate:ship`.
* Security's boundary declares security and compliance gates. Their runtime
  activation remains governed by the existing risk policy; this audit does
  not activate them for every low-risk task.
* Review verdict overrides and skip rules are refused rather than assumed to
  inherit the base rule. Implementation permits only the existing
  `SPEC-OBJECTION` repair edge to `pm` guarded by `gate:plan`.
* Preparation has its own complete symmetric barrier before `senior-dev`,
  with its plan and selected regulatory gates.

Adaptive policy validation checks the initial boundary. Scheduling checks the
expanded boundary. Every specialist epoch check, including resume and gate
approval, checks the current boundary again. Current post-build roles and hard
gates are compared with a newly derived specialist plan from the project
declaration and actual changed artifacts, not merely with the stored role list.
Preparation can retain a wider selection after implementation, but cannot
narrow the current assessed selection or remove its regulatory gates.

## Evidence and limits

Tests exercise the shipped parsed graph and mutations of fan-out, exit,
quorum, hard gate, repair and verdict rules. Controller fixtures additionally
exercise resumed graph tampering, altered preparation metadata and a
self-consistent smaller post-build graph that omits a required PCI reviewer.
No test invokes real models or authorizes a release.

The structural audit returns `domainSelectionVerified`, `executionVerified`
and `approvalsVerified` as false. Controller-side recomputation protects the
adaptive selection, but is not an independent comparative auditor. The helper
is intentionally not a universal graph theorem prover: alternate review
topologies and verdict overrides fail closed. It does not prove product-entry
reachability, all native host paths, independently executed hidden scoring,
provider identity or package-to-running-code provenance.

The benchmark collector's `graphFloorCoverageVerified`,
`executionArtifactProvenanceVerified` and `benchmarkEligible` remain false.
Both registered arms still need independently assessed matched fixture floors
and real execution/scorer provenance before quality comparisons are valid.
No installed plugin, default policy, merge or release is changed by this work.
