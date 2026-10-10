# Required review dispatch integrity

Scope: `great_cto-p4o9.4.3.1.6`. This is a prerequisite to independent matched workflow coverage, not its completion. Related: [bound collector](2026-10-02-benchmark-bound-collector.md), [signed scorer reports](2026-10-02-signed-scorer-report.md) and [review boundary contract](2026-10-02-review-graph-floor.md).

## Failure and decision

The collector previously required a returned verifier record for each required role, but did not establish a matching worker invocation. Removing a worker record or changing its role/host could leave an assessed report admissible. A result/attempt/verification object is not sufficient controller trace evidence.

Before permitting an assessed score, the read-only audit now requires a complete, valid, nonduplicated invocation ledger. Each required role, including selected specialists, must identify exactly one verified attempt. Result and attempt must agree on host, receipt and verification; input and output receipts must not be missing or truncated. The host must match the pinned routing policy. The independent verifier must be a returned `codex-verifier` invocation on Codex, as used by the current controller contract.

There are three distinct execution paths:

1. Direct execution requires a returned worker with ID `<attempt>:worker`, matching role and host, completed no later than verifier invocation.
2. Mixed-host execution records `workerCallId` on the prepared attempt and binds it to `<wave>:<role>`. The corresponding wave must have a verified history entry containing the role and matching host. Merely finding a worker with a similar role is insufficient. Interrupted/fetched waves do not certify completion; old wave attempts without this durable link cannot be retroactively inferred as assessed coverage.
3. Scoped reuse deliberately does not invoke a domain worker. It requires explicit policy source/scope, matching prior identity and source digest, result/attempt agreement, and a fresh complete dependency-attestation tied to the current scoped input digest. Mandatory code, QA, security and AI evaluation roles cannot use this exception. No historical gate approval is imported.

Runs without scores preserve their unassessed/blocked/failed semantics. Incomplete dispatch histories still yield null call counts and timing rather than fabricated zero. Scores on incomplete histories are refused.

## Test plan

| Surface | Test type | Cases |
| --- | --- | --- |
| Direct controller collection | Actual temporary Git repository and callback controller | Valid sequential roles; remove worker; alter role, host or outcome; wrong verifier identity; worker after verifier |
| Ledger integrity | Serialized-state mutation and recollection | Duplicate record/attempt; incomplete history; missing/truncated input receipt; result receipt drift |
| Mixed-host execution | Actual concurrent callback wave, not live models | Three workers/verifiers across two hosts; persist call IDs; reject missing link, discarded wave, wrong wave host or another role's call ID |
| Reuse exception | Actual adaptive scoped-reuse callback controller | Domain worker skipped, fresh verifier retained; audit accepts valid scoped evidence and refuses removed completeness attestation |
| Compatibility | Collector regression | No-score incomplete history remains unassessed with null metrics; signed scorer integration remains valid |

Coverage target is every listed negative boundary plus all three valid paths, without relaxing existing quality gates. The fixtures do not produce provider evidence or operator approval for a real release.

Focused collector, signed scorer, mixed-host and controlled-specialist regression passed 82/82 without skips. Documentation links and recall passed 9/9 with unchanged ranking floors. The first negative-test run rejected the duplicated attempt through an earlier final-receipt guard; placing the duplicate inside the history now exercises the intended attempt-identity rejection directly. No guard was weakened to make the test pass.

## Evidence limitations

The state and ledger are still trusted controller observations. This audit does not prove a provider executed an inference, independently derive all mandatory domain roles from a fixture, certify that the registered package is executing, or isolate processes sharing the same OS user. A malicious trusted operator can fabricate pinned state. Independent matched-arm floor and artifact/provider proofs remain separate requirements. `graphFloorCoverageVerified`, `executionArtifactProvenanceVerified` and `benchmarkEligible` remain false; no installed plugin, default, release or merge is changed.
