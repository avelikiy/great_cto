# Bound benchmark observation collector

Date: 2026-10-02. Beads: great_cto-p4o9.4.3. Status: read-only pinned-evidence
collection implemented; live runtime/scorer provenance and graph-floor certification
remain unverified. This is not a completed comparative experiment.

## Trust and evidence boundary

The [protocol](2026-10-02-adaptive-benchmark-contract.md) validates supplied rows.
The [dispatch telemetry](2026-10-02-controller-dispatch-evidence.md) records callback
attempts. The collector connects those two boundaries to actual outside-workspace
state files, artifact package bytes, scorer code bytes and a current Git receipt.
It does not reinterpret those bytes as proof that a particular provider executed
a model, that the package was the running controller, or that the scorer executed
its hidden test suite. Explicit operator attestation is not cryptographic identity
or independent process provenance. Cooperative same-user controls are not a sandbox.

Consequently every emitted observation labels its evidence
`operator-pinned-controller-and-score-not-provider-attested`. It retains
executionArtifactProvenanceVerified=false, graphFloorCoverageVerified=false and
benchmarkEligible=false. This prevents a connected-but-unproven observation from
being described as the matched live benchmark or default-enablement evidence.
The descriptive protocol continues to leave quality uplift unknown.
The [structural review boundary audit](2026-10-02-review-graph-floor.md) hardens
adaptive controller exits and quorum metadata, but is not independent matched
graph-floor or execution provenance evidence for the collector.

## Registration and execution

Before dispatch, a private external registration contains the whole digest-bound
protocol, trial task/repetition/arm, scorer identifier/code SHA256 and required
review roles. At least code review, QA and security are mandatory in this collector.
Both arm policies must contain complete `benchmarkPolicySnapshot` values generated
from their prepared controller states. Neither arm may remove its own selected
domain reviewers when scored. This checks declared/selected role evidence; a full
domain/risk-floor matching audit between arms still requires its own verifier.
Snapshots include the exact admission configuration; mutable stand-down audit
entries are not mistaken for policy changes. Audit bytes still remain bound by
the collected state SHA256.

`bindBenchmarkTrial` accepts only fresh ready states, before any steps, attempts,
approvals or invocation entries. It refuses release authority. The exact prompt and
acceptance strings must match the protocol scenario. It pins the registration,
initial Git receipt and normalized controller policies. It cannot be applied to an
old or resumed run to manufacture preregistration. The registration and binding are
not inserted into worker prompts or prior-result context.

Controlled CLI start supports `--benchmark-trial <canonical external registration>`.
Use a prepared work task whose goal and acceptance match the registered scenario;
an ordinary start with empty criteria intentionally does not satisfy this contract.
This option does not supply a corpus, silently select a baseline, approve a gate or
change installed defaults. A benchmark runner still needs actual matched fixtures,
resolved arm artifacts/model assignments and operator decisions.

## Collection and assessment

Run the read-only entrypoint with explicit private state byte pin and package/scorer
files. An optional score requires its own byte pin:

```sh
node scripts/adaptive-benchmark-collect.mjs \
  --registration /absolute/operator/registration.json \
  --state /absolute/operator/run.json --state-sha256 "$STATE_DIGEST" \
  --artifact /absolute/operator/package.tgz \
  --scorer /absolute/operator/hidden-scorer.mjs \
  --score /absolute/operator/score.json --score-sha256 "$SCORE_DIGEST"
```

Those paths and variable names are examples, not generated trial evidence. Omit
both score arguments for an unassessed observation. State/registration/score must
be private regular canonical files outside the target project, with symlink paths
refused. Bounds are8 MiB state,64 KiB registration/score,1 MiB scorer and100 MiB
package. Package/scorer code can be public regular files; they still must be external
and match the registration's SHA256. Source paths and report payloads are not copied
into the output; receipts retain their normal relative file identities.
Reads use a no-follow/nonblocking file descriptor, verify its regular-file identity
and permissions, and allocate only the observed bounded size plus one byte to
detect growth. Written candidate artifacts retain the controller's1 MiB-per-proposal
bound. Malformed private JSON diagnostics never include its input payload.

With no score, even controller done remains unassessed with acceptance null.
Blocked and cancelled states remain blocked/failed with acceptance null. Known
controller telemetry can be retained for those incomplete trials; unavailable
counts/time remain null. Human pauses, actionable findings, escaped defects and
actual cost are not derived from approval-counts, verifier messages or usage tokens.
Those metrics remain null until their own independent measurement is supplied.

A supplied report must explicitly say source=operator-attestation and bind run ID,
exact state SHA256, registration digest, scorer identity and current receipt. Every
ordered acceptance criterion needs passed/failed status and nonempty evidence.
Only a settled done controller without active work/pending gate/wave/rework, with
current artifacts, current final receipt, required independently verified role
results and non-stale approval references can consume that report. A failed scored
criterion yields completed/accepted=false, not an execution failure.

This checks consistency and identity of supplied operator evidence. It does not
claim that arbitrary same-user files cannot be forged, that all declared gates
were human-approved, or that required role callbacks actually contacted models.
Missing actual execution/scorer provenance and graph-floor matching must be resolved
before benchmarkEligible can become true. No current path enables it.

## Test strategy and remaining evidence

The testing-strategy skill informed the integrity/failure coverage: fresh binding,
exact byte pins, criteria identity, replay/mutation refusal, current receipt/artifact
drift, unsettled state, required-role evidence, null/incomplete semantics, private
external bounds and CLI argument handling. Integration tests run real controller
state transitions with explicitly synthetic callbacks and invoke the collector CLI.
The scorer/package bytes are explicitly fixture data, not published artifacts or
executed representative hidden checks. No live models or automatic gate approvals.

The parent task remains in progress. Resolve actual controller artifact provenance,
matched domain/risk floors, preregistered representative fixtures and an executed
independent hidden scorer; then perform the matched experiment after authentication.
This implementation cannot inherit earlier live phase tests as collector validation.

## Current verification

Expanded collector/protocol/dispatch/controller/mixed-host/specialist/budget/state
regression passed138/138 without skips. Docs/links/test-substance passed87/87 and
the npm Codex bridge unit tests3/3. The actual controller CLI integration deliberately
uses /usr/bin/false, not a model: it verifies binding-before-invocation and a blocked
run with no approval or verifier launch. Collector CLI tests are read-only.

Final broad quick gate GREEN with11 explicitly NOT CHECKED: root1255, library2609
passed/6 skipped, eval238, docs76, browser9, layout8 and L1+L2 passed/5 quick omissions.
Pinned HOL83, zero critical,35 high in the unchanged reviewed baseline; no new
high/critical. Syntax/diff/reference checks passed. No current full L1-L5, full CLI
package/export suite, independent security approval or installed-artifact proof is
inherited. Claude auth was rechecked and remains loggedIn:false.

A public candidate baseline package was downloaded without install or lifecycle
scripts to a private operator directory. Registry integrity and fifty packaged
controller/shared-module/graph files were verified against the exact remote release
tag commit; the package SHA256 is recorded in the protocol document. No package
code ran and no actual arm registration or matched experiment is declared complete.
