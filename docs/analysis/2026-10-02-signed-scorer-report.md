# Registered scorer report signatures

Date: 2026-10-02. Scope: `great_cto-p4o9.4.3.1.5`, draft PR #167.

Related: [bound observation collector](2026-10-02-benchmark-bound-collector.md) and [representative fixture and pinned scorer](2026-10-02-docs-benchmark-fixture.md).

## Contract and trust boundary

A file hash establishes identity, not execution. The new opt-in evidence path binds a trusted launcher's assertion about an actual local scorer subprocess to the exact preregistered trial. It does not establish provider, operating-system, hardware, or running-package attestation. `benchmarkEligible` remains false.

Before the first controller dispatch, registration includes `scorer.oracleSha256` and `scorer.authority`, with `algorithm: ed25519`, canonical base64 DER `publicKeySpki`, and its `publicKeySha256`. The existing registration binding pins that identity. Retrofitting an authority after dispatch is not supported. Registration without authority retains legacy, explicitly ineligible operator observations. Registration with authority requires a signed version-2 report; unsigned downgrade is rejected.

The launcher performs this sequence:

1. Validate the external registration, exact state-file SHA, registered artifact and scorer hashes, settled controller state, required role verification, oracle hash, and candidate receipt.
2. Read a bounded, private, canonical external signing-key file and verify it matches the registered public authority before launching anything.
3. Run the pinned scorer source in a separate Node process, with bounded input/output/time and a minimal environment. Preserve before/after candidate receipts and input digests, including ignored project configuration.
4. Recheck the registered context after subprocess completion. State, registration, artifact, oracle or candidate drift fails without returning a signed report.
5. Sign the canonical payload: run ID, state SHA, registration digest, artifact/scorer/oracle hashes, candidate receipt/input digest, ordered criteria, acceptance, and observed subprocess metadata.
6. Persist a bounded report in a new private external file. The collector independently verifies its signature, current bindings, inputs and criterion order before producing an observation.

The signing key is a trust anchor controlled by the operator. A key holder can fabricate a signed assertion. Separate files and subprocesses do not isolate mutually hostile processes running as the same OS user. PID and timestamps are signed launcher observations, not kernel-backed proof. Wiping the input buffer is best-effort hygiene, not a claim about crypto-library internals or hardware zeroization. Static path checks do not prevent every ancestor-directory race; secure key custody and OS isolation remain separate work.

## Operator interface

Use `node scripts/adaptive-benchmark-score.mjs` with named arguments `--registration`, `--state`, `--state-sha256`, `--artifact`, `--scorer`, `--oracle`, `--signing-key`, and `--out`. Optional `--timeout-ms` is constrained by the scorer runner. Output must be a new file under a canonical private directory outside the candidate. Existing output is refused before subprocess launch. The CLI emits only report location, digest, run ID, acceptance and evidence-level metadata, not key bytes or oracle contents.

Then use `node scripts/adaptive-benchmark-collect.mjs` with the existing collection arguments and `--oracle` for an authority-bearing registration. The report's serialized SHA remains required, but recalculating that outer SHA cannot validate a modified signature payload.

`trustedScorerProcessSignatureVerified: true` means that the registered trusted-launcher signature and current local bindings validated. It does not mean that the provider produced the result or that the registered package was the package executing the controller. `graphFloorCoverageVerified`, `executionArtifactProvenanceVerified`, and `benchmarkEligible` remain false. Unknown model cost remains null.

## Test plan and executed evidence

The new suite uses actual temporary Git repositories, ephemeral fixture-only Ed25519 keys, callback controllers, serialized reports and real Node subprocesses. It does not invoke paid models, manufacture human approvals, or modify the installed plugin.

| Boundary | Exercise | Expected result |
| --- | --- | --- |
| Scoring | Defective and repaired documentation candidates | Fail then pass in separate actual scorer processes |
| Serialization | Change criterion evidence, PID, receipt or state SHA; recalculate outer SHA | Reject signature tampering |
| Identity | Re-sign altered run/state/registration/package/scorer/oracle/input bindings | Reject binding mismatch |
| Authority | Unsigned downgrade, replacement authority, wrong or malformed key | Refuse; invalid private key cannot launch scorer |
| File admission | Public, symlinked or candidate-contained key; candidate-contained, existing or dangling-symlink output | Refuse before launch |
| Stability | Ignored configuration/oracle drift; state/package/registration mutation during scoring | Reject; do not return signed assessment |
| Process failure | Timeout or malformed subprocess JSON | No signed assessment |
| CLI | Write mode-0600 report, collect serialized report, retry same output | Verify report; refuse overwrite without another launch |
| Lifecycle | Unsettled state, attempted retroactive registration | Refuse without approvals |

Focused regression command:

```bash
node --test tests/lib/bound-benchmark-scorer.test.mjs tests/lib/pinned-benchmark-scorer.test.mjs tests/lib/adaptive-benchmark-collector.test.mjs tests/lib/controlled-receipt-boundary.test.mjs
```

The integrated run passed 76/76 tests without skips, including no-relaunch assertions for existing and candidate-contained report output. The last CLI refinement also refuses a dangling symlink before launching a scorer; the bound scorer suite passed 14/14 after that change. Documentation links and recall passed 9/9, preserving hit@3 11/16 and section pointers 5/5. A repeat HOL scan passed at 83 against an 80 threshold, with zero Critical and 35 High classified by the existing scanner review as false positives. Broader local quick CI is a separate check, not proof of full live host parity.

## Remaining acceptance gaps

Independent matched baseline/candidate graph-floor verification, proof of the actual executing package, real model/provider provenance, remaining corpus groups, live scoped reuse, native asynchronous lifecycle admission, independent security review and delivered-artifact parity are still outstanding. This change is a local evidence-integrity increment, not a release, benchmark quality improvement claim, or 100% completion claim.
