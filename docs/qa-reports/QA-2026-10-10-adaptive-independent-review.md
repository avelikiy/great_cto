# Adaptive candidate: independent review and Git execution boundary

Date: 2026-10-10. Tracking: great_cto-932g.3.3 and great_cto-932g.3.5.
Scope: PR #167. This report does not authorize merge or release.

Related contract: [adaptive runtime gates](../architecture/ADR-adaptive-runtime-gates.md).

## Independent verdict on c33ae765

An explicitly authorized separate read-only reviewer inspected
c33ae7658cf6d420a3e1b72b846cc56680ec742b and returned REQUEST_CHANGES.
The reviewer did not edit files, Beads, host configuration or plugins, and did
not execute paid models, deployment or a separate canonical test suite.
Author-run c33 CI exit0 with 15 disclosed skips remains separate evidence.

One blocking P1: new adaptive risk/dependency observers invoke Git with the
project configuration before worker sandbox admission. core.fsmonitor can run
an executable even for ls-files; diff also permits configured clean/process
filters despite --no-ext-diff. A later unknown/failure result does not undo
the executable side effect.

Affected c33 code: runtime-gate-policy.mjs wrapper line11 and diff line24,
specialist-plan.mjs inventory line15, scoped-review-reuse.mjs wrapper line11
and tracked dependency validation line68. Reachable from newRun specialist
policy validation (codex-pipeline.mjs:268), advance gate policy (431), scoped
input before runStage worker dispatch (679), and native adaptive hooks.

The reviewer used GIT_TRACE with an ephemeral command-line setting
core.fsmonitor=/usr/bin/false. Both diff --no-ext-diff --name-only HEAD and
ls-files --cached actually launched that harmless executable; persistent Git
configuration was not changed. This is Git helper execution, not shell
injection via an unescaped filename.

The reviewer found no further confirmed P0/P1/P2 in the inspected deltas and
confirmed mandatory quorum/gate floors, current dependency/epoch invalidation,
fresh scoped attestation, budget fencing, namespace separation and honest
guardian cleanup/admission limitations. Skipped live paths remain unverified.
The installed-board synchronous Beads P1 is a separate baseline defect, not
proved fixed or caused by adaptive scheduling.

## Proposed fix and author-run regression

Adaptive readers now share the existing bounded receipt evidence Git helper,
exported as readOnlyGit, rather than copying a third independent policy.
Every call disables fsmonitor; diff disables external drivers/textconv and
enumerates filter names within 64KiB/128-driver/5s bounds, disabling clean,
process and required drivers only for that child. Existing 8MiB/4MiB caller
buffers, NUL inventory, literal pathspec and unknown semantics are preserved.
No release/commit/push command uses these diagnostic overrides.

New real fixture regressions cover risk, specialist and scoped-reuse observers
under configured fsmonitor, clean, process, external and textconv helpers.
An unprotected harmless witness writes an owned temporary marker, proving the
helper is live; protected observers return actual evidence without that marker.
Invalid repository configuration and excessive filter inventory fail closed.
All fixtures are isolated; no operator Git configuration is changed.

Combined executable-boundary/runtime-policy/specialist/reuse regression:
84 pass, zero failures, zero skips. This is focused author evidence only.
The c33 pass is not inherited by this fix.

## Independent delta review at 735554b9

The authorized read-only reviewer APPROVED the exact application
735554b98021681ce54f38641c0fb5ede5c8cce4. Independent ephemeral Git probes
confirmed fsmonitor was not executed, literal/NUL inventory was preserved,
clean diff remained empty and a missing revision returned null. No new
confirmed P0/P1/P2 was found. This source verdict is not canonical execution.

## Canonical execution at 735554b9

The first attempt was interrupted before suite totals: INCOMPLETE, not green
or red. An unchanged-source complete replay then exited with code 1. Its sole failure
was doc-links: this newly added QA report was an orphan, 49 versus the frozen
48. Do not increase the baseline or inherit green from the previous application.

| Suite | Pass | Fail | Not checked |
| --- | ---: | ---: | ---: |
| Root, hooks and board | 1360 | 0 | 0 |
| Libraries | 3316 | 1 | 6 |
| Eval | 242 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Browser board scenarios | 14 | 0 | 0 |
| CLI | 369 | 0 | 0 |
| Archetypes | 34 | 0 | 0 |
| Candidate pipeline L1-L5 | 36 | 0 | 9 |

Suite counts overlap, not unique tests. The candidate pipeline used an explicit
private artifact, not the operator's installed plugin. Its real isolated MCP/
SSE, HMAC, Board API and Beads lifecycle checks ran; the 15 live/fixture absences
remain not checked. Canonical red log SHA-256:
2ec7f61b4964832ef031abbc2a13d46942cbd979a1b4738c19ce2520b2a50c0f.

The follow-up integrates current main's updater delivery report and connects
both QA reports to their existing contracts. It changes documentation only;
application files remain byte-identical to independently approved 735554b9.
A fresh full canonical replay is required before merge/release. The installed
board P1 remains open; no new paid-model quality measurement is claimed.

## Complete canonical execution at 1babcab2: FAIL

The unchanged exact1b replay completed with exit1. Libraries:3314pass3fail6skip.
Root/hooks/board1360,eval242,docs76,browser14,CLI369,archetypes34 passed without
failures/skips; candidate pipeline36pass0fail9skip. Counts overlap, not unique
tests. Full log SHA-256:
4eac057aa8bea5fbbe0bc6215435fe788acee1fd97ff6600e3690d5e8b647e32.

The three failures require captured processes to stop before fixture fallback:
direct owner-kill (case457,9.87s), external helper scorer-kill (case557,9.46s)
and helper-kill (case558,8.91s). Normal/refusal/TERM and parent-disconnect passed.
Failure-time surviving identities were not captured; the specific remaining
process and cause are Unknown. This is retained canonical red evidence.

Six predetermined raw-owner diagnostic repetitions each passed1/0fail/0skip.
A two-case helper crash run passed2/0fail/0skip. A paired concurrent lifecycle
inventory passed30/0fail/0skip in55.6s (log SHA-256
3673abfa32eed9ac26d99bb624267f6faab0c03bdeb5f903eda06540b8db78e8).
These diagnostic runs used a private copy with bounded failure metadata only,
unchanged budgets/assertions, and do not replace the canonical verdict.

## Independent lifecycle assessment: delivery REQUEST_CHANGES

The same authorized read-only reviewer examined the exact application735 and
confirmed the1b delta is QA-only. Source-level Git-boundary approval stands;
delivery remains REQUEST_CHANGES. The reviewer did not run cleanup or edit code.

The [guardian ADR](../adr/ADR-028-browser-profile-guardian.md) remains Proposed.
Abrupt scorer SIGKILL cannot execute the observer's JavaScript finally, and the
read-only resource owner has no independent signal/deletion authority. Natural
Chromium drain after such a crash is a measured result, not an implemented
complete-tree guarantee. A future characterization correction must refuse
quiescent/completed/eligible outcomes when captured resources remain, retain all
false authority flags, and add a deterministic surviving-real-process negative.
That correction has not been implemented or used to clear these failures.

Helper SIGKILL is different: scorer IPC disconnect rejects the held barrier and
must unwind through observer finally/browser.close. Its strict closure assertion,
normal/refusal and TERM assertions must remain. Increasing deadlines or treating
these reds as green retries is not an accepted fix. No independent teardown is
activated, no runtime-policy closure changed, and no release waiver was granted.

After the canonical run finished, the two lifecycle test files gained bounded
failure-time PID/start/state, executable-basename and recent allowlisted stage
diagnostics before fallback; raw argv, paths, environment and capabilities stay
withheld. Existing closure assertions/deadlines remain. Direct SIGKILL also now
explicitly requires no completed scoring result. This observability follow-up
is not a runtime repair or inherited full-gate approval. Installed3.61.0 and
main remain unchanged; PR167 is not merged, tagged or published.

Author-run post-instrumentation checks: paired actual lifecycle30pass0fail0skip
(39.4s), documentation/link81pass0fail0skip. Focused lifecycle log SHA-256:
75769081d1a8122a1f0661304e735ec38ce5ad44a0d733f7aa7db09f55c04a6e.
The failure-only metadata branch did not fire in this focused pass; its utility
for identifying the original orphan remains unproven. No new canonical pass or
independent approval of a runtime fix is inferred.

## Diagnostic inventory at 9eed8808

One predetermined diagnostic replay on exact commit
9eed88088d69b061ee31d8d879d19cd32ce666e0 ran all tests/lib files with concurrency
2 and the canonical per-child signing overrides: 3297 passed, 0 failed, 6 skipped
(715s). It was not the canonical command: the latter also includes scripts/lib.
Those two files ran separately: 20 passed, 0 failed, 0 skipped.
Do not label the separate executions a new canonical gate. Log SHA-256 values:

- tests/lib:8e38479be9dfa2e7879ada4c54c6b9b4df33b24cf42ecab0c616551ecffc59e4.
- scripts/lib:6059346b234066fa624403e9d127d318059aeba10fe567f28844598cf3a6c6bb.

All three target crash cases passed, so failure-only metadata did not fire.
The original remaining PID/cause is still Unknown; no runtime repair or delivery
approval is inferred. The exact1b full canonical red remains authoritative.

A separate private deterministic negative used a real detached Node child and
synthetic scratch, not Chromium. It survived actual owner SIGKILL; the unchanged
resource owner observed liveProcesses=1 and retainedScratchDirectories=2 with all
authority flags false. The fixed private caller sent fault, not quiescent, and
the protocol remained PRESERVED. This is not a production-controller automatic
refusal proof, browser teardown, independent admission or a committed regression.
Log SHA-256:0b5894a947708e3969e4fa689781b2921827b8a7d94215e9e9fe63d7acf8487f.
No experimental guardian was activated and no OS cleanup authority broadened.

## Narrow characterization correction after ea6a24f2

The follow-up implements the recommended experimental-only scope. The earlier
exact1b canonical red is retained above, not rewritten as a pass. Application
runtime files are unchanged. Raw owner-kill and helper scorer-kill now measure
bounded abrupt-death outcomes rather than assert an unimplemented complete-tree
drain guarantee. Profile and artifacts are measured independently before fixture
fallback. Actual SIGKILL and absence of a completed scoring result remain strict.
Direct scorer-death protocol characterization sends fault/PRESERVED, never
quiescent, even when the local process sample happens to reach zero. All OS
closure, cleanup, independent admission and benchmark eligibility flags stay false.

Three committed-source negative tests use fixed real Node subprocesses and
synthetic scratch, explicitly not Chromium or a production supervisor. The
captured child survives actual parent SIGKILL with liveProcesses=1. The fixed
test caller sends fault, not quiescent. Separate guaranteed-retained fixtures
exercise profile-mode mutation and artifact inode replacement without relying on
Playwright crash retention. Exact fixture identities are reclaimed only after
the refusal observation; that fallback is not product lifecycle evidence.

Helper-kill, parent-disconnect, normal/refusal and TERM retain their strict
closure assertions and budgets. The original helper-kill failure cause remains
Unknown. Focused author verification ran the three changed test files together
with concurrency2: 43 passed, 0 failed, 0 skipped, 35.66s. This includes the
existing fixed 20s absent-reply deadline and three new real-process negatives.
The same authorized independent read-only reviewer approved this test-only delta
for the narrow scope, finding no new blocking issue. This source-level approval
is separate from delivery readiness; a fresh full canonical gate is still required.
PR167 is not merged or released; installed3.61.0 and the local board are unchanged.

## Complete canonical execution at 8542e41e: GREEN WITH 15 NOT CHECKED

Exact source commit 8542e41e1796a86f977b01e0b8a9c62ddbed6eb7 ran
`bash scripts/ci-local.sh --e2e` with a fresh archived candidate plugin and freshly
built CLI dist. It completed with exit0. Source stayed frozen during execution.
The complete private log is
`/Users/Shared/great-cto-adaptive-characterization.sESAhq/ci-local.log`, SHA-256
99972f581bcf4ef90935491b506fce2fd4c09ed7a565b0919df5ce0553ecc44f.

| Suite | Passed | Failed | Not checked |
| --- | ---: | ---: | ---: |
| Root/hooks/board | 1360 | 0 | 0 |
| Libraries, including scripts/lib | 3320 | 0 | 6 |
| Eval | 242 | 0 | 0 |
| Docs | 76 | 0 | 0 |
| Browser E2E | 14 | 0 | 0 |
| CLI | 369 | 0 | 0 |
| Archetype E2E | 34 | 0 | 0 |
| Candidate pipeline | 36 | 0 | 9 |

Counts overlap; do not add them into a unique-test total. Strict helper-kill,
normal/refusal/TERM and active-parent-death assertions passed in this full run.
The three real-process negatives also passed. Abrupt scorer death is now
characterized without cleanup authority, not repaired by a production guardian.
The original exact1b red and its unknown surviving identity/cause remain recorded.

Candidate smoke exercised actual MCP/SSE, HMAC401/200, 11 isolated board APIs and
five real isolated Beads lifecycle checks. Nine candidate checks still do not
prove actual role/model execution, deployment/human approval, paid learning,
operator inventory, real capture/notification delivery or release cron. Six
library skips remain not checked. This is not live two-host product quality,
production readiness or a fix for the separate installed-board latency P1.
No npm tag/release, plugin installation or local-board restart occurred here.

The same authorized independent reviewer subsequently verified the complete log
hash and trailer, suite summaries, passing strict lifecycle cases and continuity
of all three reviewed test-file hashes. The post-gate source delta was QA-only.
Final delivery verdict: APPROVED for experimental-only PR167, replacing the prior
REQUEST_CHANGES for that limited scope. The author executed the canonical gate;
the reviewer independently read its evidence, did not re-run it, and granted no
merge/release or OS cleanup authority. Original helper failure cause, live skips
and installed-board latency remain explicitly unresolved, not waived.

## Delivered experimental opt-in release 3.62.0

The operator-authorized delivery is now complete. PR167 merged at
ddb55ae3f1f7ff3bb6708e4f2eccf50f231f4018; merge tree is byte-identical to
reviewed head351cab93964586eaa8afe6a82932766c6ef01416. Release source is
08a95f4b2e79f690d145730f9a38dfba08920975. Version-only release preparation
synchronized manifests/CLI, release notes and five new synthetic screenshots;
application runtime did not change. Normal main/tag pushes ran existing guards.
No new privacy exception, security baseline, default enablement or guardian
activation. GitHub Release v3.62.0 published2026-10-10T18:14:40Z.

Build and112focused version/package/documentation checks passed0fail0skip;
screenshot freshness passed. Tested archive contains178files, SHA256
6b108f2d868a17c114ba3d523d791d137fa627bf52d7008bbbf3f97809e4f159,
integrity sha512-bfbLPOcApR112kMfrLlzQgfQBHncK6neG6pMXNCOIpIpuXKwUm3Vl3QLxy9s+isPaE7AKl/MsstELdjSdF6gpQ==.
npm accepted the exact archive with a processing notice; initial404 registry
responses are retained. Later metadata independently returned exact/latest3.62.0.
Downloaded registry archive is byte-identical to tested archive. Fresh isolated
consumer installation used an empty cache and disabled lifecycle scripts.

Actual downloaded-archive smoke verifies CLI3.62.0 and empty isolated controller
store. Controller construction/selection passed12cases/8refusals with zero
dispatch/approvals, providerCalls=null, executionArtifactProvenanceVerified=false
and benchmarkEligible=false. Isolated consumer board returnedHTTP200 for version,
HTML andprojects in165ms/16ms/5ms, using a fixed empty synthetic Beads adapter and
dedicated state/discovery scope. It proves standalone package operation, not real
Beads performance, paid-model execution or a full deployment workflow.

Both Claude user registrations, installed/enabled Codex plugin and user-prefix
CLI independently report3.62.0. CLI installed from tested archive with lifecycle
scripts disabled. Prior3.61CLI archive and host caches retained for rollback.
Existing sessions still require restart and changed hooks require host review.

There was no listener on3141 before scoped installed-board ensure. The started
board returnedHTTP200 version=installed=3.62.0 stale=no in1.148s, then HTML and
version requests each timed out at5s with zero bytes. No unrelated process was
killed. Installed-board latency P1 remains open; no permanent repair or sustained
health is claimed. Private delivery evidence is retained under
/Users/Shared/great-cto-release-3.62.0.PXDEH5. The updated article remains PR177
draft; no external blog publication or fresh model-quality benchmark.
