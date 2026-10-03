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

## What remains unverified

No models, provider calls, real approvals, installed plugin, default, merge or release occurred. Browser binary/dependency closure authority, supported-host signed admission, hostile same-OS-user behavior, resource/metadata side channels, profile-directory cleanup after owner death, and parent termination at every launch/navigation/teardown instant are not certified here. A timeout/reaping failure on another host must remain a failure/unmeasured result, not a skipped success. Linux process inventory is supported by the test code but was not measured in this macOS execution.

This is a local self-run regression, not the independent security reviewer sign-off requested by parent .5.8. Corpus/benchmark eligibility and independent admission flags remain false. Process exit evidence alone cannot authorize executing arbitrary model-produced code or promoting the full pipeline to100%.
