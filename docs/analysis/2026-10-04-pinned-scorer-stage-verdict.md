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
