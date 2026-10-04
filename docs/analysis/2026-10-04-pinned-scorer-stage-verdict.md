# Pinned board scorer stage diagnostic verdict

Date: 2026-10-04. Source branch: `codex/adaptive-pipeline`.
Scope: `great_cto-p4o9.5.9.10`, remaining canonical-load scorer timeout.

Previous evidence: [full CI isolation verdict](2026-10-03-full-ci-isolation-verdict.md).

## Reproduction and evidence boundary

The previous canonical library run at the phase-deadline increment completed
exit 1: 3112 total, 3105 passed, one failed, six NOT CHECKED. The failing case
was `browser behavior refuses console-error`: pinned scorer timeout 30000 ms,
elapsed 30017 ms, SIGKILL, descendantQuiescenceVerified false and
benchmarkEligible false. Preserve that result at
`/Users/Shared/great-cto-phase-deadline-ordered-load-m7dhIj`. Its isolated
diagnostic passed; neither an isolated pass nor later success identifies the
historical timeout stage.

Code inspection shows external requests are already blocked by CSP and a
context route abort. The `example.invalid` image is not a demonstrated network
cause. No network allowance, fixture mutation, deadline extension, concurrency
reduction, retry-as-pass or frozen corpus change was applied.

## Diagnostic contract

The pinned runner now supports explicit boolean `stageDiagnostics`, default
false. When enabled, a dedicated fourth stdio pipe receives only fixed stage
names and monotonic elapsed milliseconds. Parsing accepts exact two-field
frames, at most 64 records, at most 8192 bytes, known stages only and elapsed
values from 0 to 60000. Malformed, unknown-field, nonmonotonic and overflowing
streams return no usable trace rather than echoing private payloads. Timing is
diagnostic only, not an attestation, success condition, heartbeat, cleanup
authority or descendant-quiescence receipt. Generic scorer stdout/stderr,
oracle values, HTML and paths are not exposed. Timeout and output process
boundaries remain unchanged (maximum 30 seconds, SIGKILL, bounded capture).

The board observer emits inventory, browser import/launch, per-viewport
context/page/content/safety/keyboard/layout/targets, context and browser close,
and result stages only for the explicit diagnostic invocation. The standard
runner result remains unchanged when diagnostic mode is disabled.

Focused scorer/board tests passed 57/57, no skips, 17997.896 ms, including an
actual killed timeout with retained allowlisted stage and no private stderr
echo. The exact canonical command
`node --test tests/lib/*.test.mjs scripts/lib/*.test.mjs` completed exit 0:
3114 total, 3108 passed, zero failures, six NOT CHECKED, 150848.48575 ms.
Log: `/Users/Shared/great-cto-scorer-stage-canonical-x8HU1O`.
Console-error reached browser-loaded at 1088 ms, launch complete at 1230 ms,
third context close at 1991 ms, browser close complete/result at 2140 ms.

This is a current successful instrumented canonical run, not proof that the
historical 30-second timeout was corrected. The cause remains unlocalized and
`great_cto-p4o9.5.9.10` remains open/in progress. Browser close completion itself
does not establish native descendant quiescence. Existing resource ownership
and cleanup acceptance requirements remain independent.

## Scanner regression

Initial HOL score was 77/80: zero Critical, 37 High, with two new native
HARDCODED_SECRET findings at the synthetic unknown-key fixture (line 21).
Actual scanner report: `/Users/Shared/great-cto-scorer-scanner-bhGLIe`.
The test key `secret` was replaced with `unexpectedField`, preserving the
unknown-field rejection assertion and payload sentinel. No baseline waiver or
threshold change was added. Recheck passed 83/80, zero Critical and the same
35 previously reviewed High findings. Syntax, reference and diff checks pass.

No plugin installation, merge, release, workflow enablement, production
activation, security approval or comparative quality claim is authorized by
these diagnostics. Full non-quick CI and installed-artifact parity require
their own terminal evidence.

## Full non-quick CI at 91187560

`bash scripts/ci-local.sh` ran against immutable `91187560` and completed
exit 1 (session 39700). Log:
`/Users/Shared/great-cto-stage-full-ci-jGPbKM`.

| Block | Terminal evidence |
| --- | --- |
| Root/hooks/board | 1264 passed, no failures/skips |
| Library | 3114 total, 3106 passed, 1 failed, 1 cancelled, 6 NOT CHECKED; 499058.246042 ms |
| Eval | 238 passed |
| Documentation | 76 passed |
| Actual browser E2E | 9 passed, no skips |
| Installed Claude plugin L1-L5 | 33 passed, 3 failed, 9 NOT CHECKED; 216 seconds |
| CLI unit tests | 361 passed |
| Build/pack | Passed; private candidate, not a release or runtime attestation |

Console-error passed again: browser-loaded 1381 ms, launched 1782 ms,
third context closed 3435 ms, browser closed/result 3480 ms. No actor trace
of the historical failing case exists, so the scorer-cause issue stays open.

The library failure is the new report's missing document-graph link (49
orphans instead of the frozen 48 baseline). Bidirectional links to the prior
full-CI verdict were added after terminal CI; the frozen baseline is unchanged.
Task: `great_cto-p4o9.5.9.10.2`. This correction is not a green rerun of full CI.

The cancelled library case is rendered contrast: its test reported
testTimeoutFailure after 180003.570167 ms, but its worker remained alive for
over five minutes and prevented the library process from finishing. Inspection
verified worker PID 68538, parent runner 84615, birth 2026-10-04 10:13:22
local, and child board PID 69501, parent 68538, birth 10:13:28. Both cwd values
were this exact worktree. The verified board was killed with SIGKILL and the
blocked worker with SIGTERM; no prefix search, foreign process signal, profile
deletion or inferred descendant-quiescence proof was used. The existing
180-second timeout failure is retained, not replaced by success. Remaining
unobserved native browser resources are not claimed to be absent. Task:
`great_cto-p4o9.5.9.11`. The test's finally awaits browser.close before stopping
its board; owned-resource lifetime/abort handling needs a bounded redesign.

L1-L5 selected `/Users/avelikiy/.claude/plugins/cache/local/great_cto/3.48.0`.
Two webhook HMAC cases and the board case refused missing isolated namespace
support before config mutation/server launch. The phase-task fixture passed
its five actual Beads checks while retaining an open synthetic gate; role/model
execution, deployment and actual human approval remain NOT CHECKED. No installed
artifact was replaced to hide these failures.

The newly packed 161-file candidate is preserved at
`/Users/Shared/great-cto-stage-ci-candidate-gBPhY9/great-cto-3.48.0.tgz`,
SHA-256 `84174eff3750cd38edbd1215f934e3daa0ca61ec7898c5201febefc351462053`.
It was not installed, released or given an inherited runtime verdict. Full
acceptance remains incomplete; no merge or security approval follows from pack
success or the two successful scorer observations.

After the document links were repaired, documentation plus document-graph
regression passed 81/81, no skips, 5361.689667 ms. Reference and diff checks
passed. The full-CI result above is still red; this focused check only resolves
the orphan-report regression, not contrast lifecycle or installed parity.

## Contrast lifetime remediation

Task: `great_cto-p4o9.5.9.11`. The old contrast test's framework deadline
cancelled the test but did not cancel its asynchronous browser work. Its finally
awaited browser.close before stopping the independently owned board; the worker
and board therefore outlived the recorded timeout.

The test now uses a creator-held Playwright BrowserServer handle and a test-only
contrast lifetime. Abort starts browser kill and board child stop independently;
neither a hung protocol close nor its rejection postpones the board stop. Each
stop waits for its actual child exit and the API result with a fixed three-second
cleanup bound. Stop timeout/refusal is an error, never quiescence or success.
Late handles acquired after abort are stopped and refused before use. The
operation checks abort before scheduling and after completion; a late result
cannot become a pass. No raw PID/process-group search or manual profile removal
is used by the lifetime. This contract is for creator-held test resources only,
not production cleanup or a general descendant-quiescence attestation.

The contrast acceptance deadline remains 180 seconds. Launch and connect now
have explicit ten-second phase limits instead of an implicit launch timeout.
Missing Playwright/Chrome remains NOT CHECKED; other launch/connect failures
are errors rather than skipped acceptance. All 14 panels and both themes,
contrast floors, font-axis checks and the legacy ratchet remain unchanged.

Six fault/edge-case tests cover hung browser stop, late acquisition, idempotency
and an unrelated child, delayed operation completion after abort, cancellation
before scheduling, and a stop API resolving without actual child exit. Native
abort additionally captures board/browser process identities and descendants,
verifies captured processes no longer run, and verifies an unrelated sentinel
retains its original identity and remains alive. A native focused run captured
eight owned processes. This is scoped captured-tree evidence, not proof about
unknown or future descendants.

Focused lifetime/native/contrast regression passed 9/9, zero skips or
cancellations, 20996.655208 ms; contrast case 20750.893667 ms. Log:
`/Users/Shared/great-cto-contrast-lifetime-focused-UawKZg`. HOL passed 83/80,
zero Critical and the same 35 baseline-reviewed High; no new waiver. Syntax,
reference and diff checks pass. The prior full-CI failure remains in the record
until the complete remediation replay has its own terminal result.

## Full CI after contrast lifetime remediation

The full non-quick CI at immutable source commit `60974120` terminated with
exit 1 (session 2181). Log:
`/Users/Shared/great-cto-contrast-full-ci-WhlXIn`.
Root tests passed 1270/1270. Library tests recorded 3115 total, 3107 passed,
two failed, zero cancelled and six skipped, 565357.13425 ms.
The rendered contrast case passed in 23946.859625 ms. Native abort captured
eight owned processes, confirmed their stop and retained the unrelated sentinel.
No manual process signals were needed in this replay. This resolves the scoped
contrast lifetime task `great_cto-p4o9.5.9.11`, not historical timeout causality
or arbitrary descendant cleanup.

The two library failures remain separate unresolved defects:

- `great_cto-p4o9.5.9.12`: the real PostgreSQL baseline's initial pinned scorer
  exited 1 with null signal/error code after 15137 ms, below its 30000 ms deadline.
  This is not evidence of a timeout; its underlying cause remains unconfirmed.
- `great_cto-p4o9.5.9.13`: the SIGTERM-handling scorer test exceeded its launcher
  watchdog after the scorer deadline (4244.817 ms). An earlier focused pass does
  not replace this canonical failure or establish its cause.

Eval tests passed 238, documentation 76, browser E2E nine and CLI 361.
HOL passed 83/80 with zero Critical and the same 35 baseline-reviewed High,
without a new exception. Installed Claude L1-L5 retained 33 passes, three
failures and nine skips (125 seconds); the three namespace refusals were not
bypassed and the installed artifact was not replaced. Skips are NOT CHECKED,
not acceptance. Full CI task `great_cto-p4o9.5.9` remains open, as do scorer
diagnosis, installed parity, security and live-model acceptance boundaries.

The current 161-file package is preserved at
`/Users/Shared/great-cto-contrast-ci-candidate-U2EqIa/great-cto-3.48.0.tgz`.
Its freshly verified SHA-256 is
`84174eff3750cd38edbd1215f934e3daa0ca61ec7898c5201febefc351462053`.
Identical bytes to the earlier candidate do not confer inherited runtime proof.
No plugin installation, merge, release, default change or human/security
approval was performed. The lifecycle fix is verified; full acceptance is not.
