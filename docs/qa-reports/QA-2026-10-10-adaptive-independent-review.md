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
