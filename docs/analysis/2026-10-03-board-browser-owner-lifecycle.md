# Board observer owned-process lifecycle

Scope: `great_cto-p4o9.5.8.1`. Parent [executable/browser admission review](2026-10-03-board-accessibility-benchmark.md) remains open. Related: [frozen corpus boundary](2026-10-03-corpus-registration.md).

## Required test plan

| Scenario | Runtime event | Required evidence |
| --- | --- | --- |
| Ordinary observation | Actual observer completes | Captured browser root/descendants no longer running |
| DOM admission refusal | Inline handler refused after static DOM load | Actual observer returns admitted:false and owned processes stop |
| Owner termination | Owning Node scorer receives SIGKILL while static DOM exists | Browser root/descendants stop without test cleanup assistance |
| Missing tool/unsupported host | No observed process tree | NOT CHECKED, never a measured pass |

The test invokes the actual observeBoard/loadPinnedBoardBrowser code and actual pinned Playwright entry, not a fake browser or a different launchServer path. A trusted child replaces child_process.spawn before Playwright imports, recording only processes it launches. A wrapper around actual page.setContent reports readiness after the first static DOM load and waits for a parent continuation message. The parent can therefore inventory a live root and renderer/utility descendants before letting a normal/refusal observation continue or killing the owning Node process. No empty captured inventory may pass. This instrumentation intentionally changes timing at that point; it does not certify every possible owner-death phase or race.

The parent reads only PID, parent PID, process state and start time from ps. Initial roots must belong to the test owner. Descendants are enumerated by those roots; other browsers/processes are not selected. Later checks compare captured PID/start identities and ignore zombies when determining whether a process remains running. This is not proof that every process has been reaped. Emergency cleanup, if an assertion fails, targets only still-live captured identities, and runs after the cleanup assertion. A cleanup signal cannot manufacture a passing assertion. PID/start-time checks are practical scoped safeguards, not atomic kernel identity handles or a same-user security boundary.

All three tested scenarios observed4 owned processes each and zero remaining running before emergency cleanup. SIGKILL is sent only to the test-owned Node child, never to user browsers or broad process groups. Actual Chromium closure therefore does not rely on scorer finally executing in the observed termination scenario. The combined board/lifecycle suite passed27/27, including3 new lifecycle tests, without skips. The observer/scorer implementation and original frozen scorer pin were not changed. An initially uncancelled15-second timeout was replaced with a cancelled bounded timer; acceptance and lifecycle assertions were not weakened.

## Temporary profile follow-up

Task great_cto-p4o9.5.8.2 extends the same actual-launch scenarios with an isolated per-test temporary root. Trusted spawn instrumentation records only the Chromium launch user-data-dir argument; the parent requires one real, test-user-owned directory directly beneath that fresh root, the expected Playwright profile basename, and stable directory inode when retained. Profile contents and host browser command lines are not read or printed. Changing TMPDIR/TMP/TEMP scopes generated artifacts without changing the observer or its frozen pin.

Measured before test cleanup: ordinary completion and DOM refusal removed the profile; owner SIGKILL retained the profile even though all4 captured browser processes had stopped. This is a discovered crash-cleanup gap, not a successful removal assertion. The owner-kill test reports retention rather than requiring it as desired behavior. The test finally removes only its fresh private root after a nonempty captured tree is confirmed stopped; absence of captured process evidence does not authorize recursive removal. Cleanup cannot manufacture the pre-cleanup measurement. This is practical test ownership, not a hostile same-user or atomic kernel filesystem boundary.

The measurement is local macOS evidence, not evidence that all platforms or all termination phases retain profiles. Open remediation great_cto-p4o9.5.8.3 must establish ownership-bound cleanup outside the terminated scorer and test helper failures before this gap can be closed. Existing sealed scorer/corpus pins remain unchanged. No production crash cleanup has been added by this test.

Validation: combined board tests27/27 and final strengthened lifecycle tests3/3, no skips; stock quick CI exit0 (root1256, libraries2924 passed/6 skipped, eval238, docs76, browser9, pipeline22 passed/5 skipped). The11 skipped checks are explicitly NOT CHECKED. Scanner HOL83 remains0 Critical/35 reviewed High without new exemptions. Original frozen registration015a66ba25b718b5713912a87cf0a2bb1a54db33c234352a8138b646fa1bd29a reverified8 scenarios with runtimeBytesChecked:true and benchmarkEligible:false. Quick CI's generic ready-to-merge text is not security approval, release consent or complete benchmark readiness.

## What remains unverified

No models, provider calls, real approvals, installed plugin, default, merge or release occurred. Browser binary/dependency closure authority, supported-host signed admission, hostile same-OS-user behavior, resource/metadata side channels, profile-directory cleanup after owner death, and parent termination at every launch/navigation/teardown instant are not certified here. A timeout/reaping failure on another host must remain a failure/unmeasured result, not a skipped success. Linux process inventory is supported by the test code but was not measured in this macOS execution.

This is a local self-run regression, not the independent security reviewer sign-off requested by parent .5.8. Corpus/benchmark eligibility and independent admission flags remain false. Process exit evidence alone cannot authorize executing arbitrary model-produced code or promoting the full pipeline to100%.
