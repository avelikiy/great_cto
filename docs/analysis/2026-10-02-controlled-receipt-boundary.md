# Complete receipts at controlled delivery boundaries

The [receipt-reader hardening](2026-10-02-receipt-executable-boundary.md) returns
null when Git inspection is unavailable. Comparing null with null cannot attest
unchanged source, and a pending gate's missing receipt cannot authorize a run.

## Enforced state-machine checks

Delivery attempts require a complete input receipt before creating an attempt,
charging admission or calling a worker. A prepared response must retain its own
original input receipt; it cannot inherit the current tree when that field is
missing. After a normal worker response, the tree must remain complete and match
the input before any proposed files are written. Parallel application instead
uses the controller's frozen-wave and already-applied-sibling receipt checks.

After applying a proposal, the controller requires a complete output receipt.
It rechecks completeness and identity before and after verification, including
after deterministic checks. Losing Git identity, exceeding the receipt's changed
file cap, or a verifier mutating source prevents a verified result and gate.
Partial writes remain visible and require operator inspection; this is not rollback.

Delivery transitions also reject historical results without complete receipts,
even on gate-free rules. The existing verified release-adapter devops result has
its separate artifact-release proof and is not reinterpreted as a worker stage.
Gate creation requires both a complete current tree and the verified result's
receipt. Approval requires complete pending/result/current receipts, the exact
pending token and current result digest, and unchanged pending-tree identity.
Legacy null, absent, malformed or truncated records require reassessment in a
fresh run; no receipt is filled in retrospectively and no approval is inherited.
Recovery likewise requires a complete recorded and current receipt.

Receipt completeness checks include SHA-1/SHA-256 object identities, dirty SHA-256
or null, recognized base metadata, bounded file inventory and safe relative paths.
The shared reader's 200 changed-file cap remains explicit: exceeding it is not
permission to silently verify only a prefix of the change.

## Discovery and compatibility

Controlled **delivery** in a non-Git or uncommitted project now refuses dispatch.
Prepare a real repository and initial commit before starting evidence-bearing
delivery. The controller does not create a repository, commit operator files or
bootstrap history implicitly. A new assessed run is required after preparing
the baseline; do not retrofit an existing trial binding or gate.

Explicit `intent=research` remains report-only and auditor-only, with no release
policy or implementation write paths. Non-Git research may produce independently
checked report artifacts, labeled `receiptEvidence=report-artifacts-only`, not
Git-tree attestation. It cannot raise or approve a receipt-bearing human gate.
It is not a verified delivered product or benchmark-eligible observation.

Tests previously using non-Git delivery mocks now initialize actual committed
fixture repositories. Their context store is outside the candidate tree and
their temporary repository signing configuration is explicit. This strengthens
the evidence model instead of adding an unsafe compatibility escape flag.

## Test plan

| Boundary | Integration coverage |
| --- | --- |
| Input admission | Missing, unreadable and truncated tree: zero workers/verifiers/attempts/approvals |
| Worker response | Lost identity or tree mutation: no proposal writes and no verification |
| Verification | Identity loss before/after verifier: no verified result or pending gate |
| Stored gates | Null, absent, malformed, truncated and stale-digest records refuse approval |
| Historical results | Null receipt cannot reach gate or done through a gate-free rule |
| Frozen wave | Incomplete input refuses both hosts; serialized null wave cannot apply reports |
| Research | Non-Git report-only success has explicit limited evidence; injected gate refuses |
| Recovery | Unavailable/truncated recorded/current identity cannot be reused |

Fixtures are real local Git trees but workers/verifiers are callbacks, not real
provider executions. These tests do not prove Claude/Codex model connectivity,
serialized scorer provenance or installed artifact parity. Benchmark eligibility
remains false and live evidence remains a separate requirement.

## Checkpoint regression exposed by real fixtures

Actual Git fixtures revealed an existing turn-snapshot failure when activity paths
were gitignored, including previously tracked activity under a newly ignored
directory. Snapshotting now stages with the normal ignore policy, then resets
only the three activity paths to the baseline inside its **private temporary
index**, with `--no-refresh`. The user's index, HEAD and working tree remain
unchanged; ignored runtime files are never force-staged and tracked activity keeps
its prior HEAD bytes. Separate regression tests exercise both cases.

This does not prove that automatic snapshotting suppresses all executable Git
helpers. That separate P1 audit is tracked as great_cto-p4o9.4.3.1.4. Do not confuse
pure receipt-reader suppression with universal diagnostic execution isolation.
No installed plugin, default policy, real gate approval, merge or release changes.
