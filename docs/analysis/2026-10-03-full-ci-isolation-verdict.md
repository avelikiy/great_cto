# Full CI verdict and cross-run cleanup removal

Related: [owned MCP smoke](2026-10-03-mcp-smoke-isolation.md),
[phase fixture](2026-10-03-phase-smoke-isolation.md), and
[hook lifecycle contract](../HOOKS.md).

The non-quick `ci-local.sh` run at published `adf454b9` completed with exit 1.
Its private log is `/Users/Shared/great-cto-full-ci-ka0ZMQ`. Root/hooks/board
tests passed 1256/1256, eval 238/238, docs 76/76, browser 9/9 and CLI 361/361.
The library suite had 3038 tests: 3029 passed, three failed and six skipped.
Failures were changed-resource broker refusal termination, the external
guardian tainted-continue browser probe and the separate packaged-controller
matrix process. Its retained diagnostic had a null exitCode with empty output;
that alone does not prove the cause or that every descendant stopped.

HOL scanner scored 77 against the unchanged floor of 80: zero Critical,
39 High, including 35 historically reviewed findings. Four new High entries
refer to two files: webhook namespace test secret fixtures and dynamic
SessionEnd bootstrap execution. No new baseline exceptions were added. The
generated architecture reference was stale. Remediation is tracked in
great_cto-p4o9.5.9.5, and the three library failures in .5.9.7.

The stock L1–L5 suite finished with 33 grouped checks passed, three failed,
nine skipped. The selected installed local 3.48.0 lacks the webhook
namespace and board isolation contracts, so the two HMAC and board probes
refused before unsafe mutation/server startup. MCP transport and synthetic
Beads lifecycle checks passed. No skipped or synthetic check establishes real
model execution, independent review, native admission or human approval.

The pack step completed, producing a 161-file candidate preserved at
`/Users/Shared/great-cto-full-ci-candidate-g7psmI/great-cto-3.48.0.tgz`, SHA-256
`99be49033092c3b9ae626d767a52e451cd538f0fe2cf162d27d8679c4e01ec34`.
This is package creation evidence, not successful delivered-runtime closure
or release approval. Existing archives were preserved; installation, defaults,
release and merge state were not changed.

## Cross-run cleanup boundary

The old board-gate startup called `sweepStrays`, scanning process cwd values
and deleting temporary directories by a shared prefix. The full run reported
zero processes killed and one directory removed; its exact path was not logged
and recovery is unproved. A prefix is not proof of exclusive ownership.

The sweeper and its only call are removed. Other reap/rmTemp/reapAndClean APIs
retain their existing signatures and behavior; this change is not a universal
OS process-ownership certificate. Board-gate fixture directories now use
exclusive canonical private roots with repeated cleanup identity checks.
Cleanup refuses unknown roots. An unsuccessful owned-group reap fails the test
and retains its roots instead of deleting underneath a possibly live board.
Startup failures can still retain roots; a later run has no authority to sweep
them. The helper's group behavior is not proof against every PID reuse or
same-UID race.

Five actual board-gate tests pass after the change. The preservation regression
holds an independently owned matching-prefix child/root alive, imports the
helper and verifies they remain untouched; separate ownership regressions cover
directory/symlink replacement and widened permissions. All eighteen remaining
caller test files passed 128/128 with zero skips; manual import review found no
other consumer of the removed sweeper. They use unchanged reap APIs. The
generated architecture map was refreshed and its sync check now passes.
After [static-bootstrap/random-key remediation](2026-10-03-session-end-smoke-isolation.md),
the unchanged scanner gate reports 83, zero Critical and the same 35 historically
reviewed High entries, with no new exceptions. Guardian/probe remediation and
full-current-CI/delivered-runtime proof remain open.
Source/browser fixtures do not establish deployed UI or
production gate execution. The full epic remains open.

## Process-cause diagnostic follow-up

A sequential-file run of the three failing library files completed 33/33 with
zero skips, including the actual Chromium refusal scenarios and separate-process
controller matrix. This does not explain their historical full-CI failures.
The old controller diagnostic retained only a null exit code and empty output;
it cannot prove a timeout, startup failure or descendant termination.

Extraction, CLI and controller process diagnostics now retain bounded error code,
signal, outcome, wall timestamps and monotonic elapsed milliseconds. Private error
messages are excluded. Existing private output capture and 30-second limits are
unchanged. Timeout and output-limit classifications require the corresponding
process API error codes; duration alone is not causal evidence. Every record
explicitly leaves descendant quiescence unverified. These diagnostics do not grant
admission, cleanup authority, artifact provenance, benchmark eligibility or gate
approval. Historical evidence is preserved, not retroactively reclassified.

The affected caller suite passes 10/10 without skips, including actual missing
executable, nonzero exit, 30-second timeout, output overflow and signal cases.
The classification-only unit cases are not substituted for these native process
checks. Controller construction/selection passed in a separate process; neither
this scoped run nor a scanner pass closes the three historical full-CI failures.

The concurrent stock library run at immutable `4e3f4aaa` completed exit 1:
3043 tests, 3036 passed, one failed, six skipped, duration 246862 ms. Private log:
`/Users/Shared/great-cto-lib-ci-lc4mwc`. Both historical Chromium scenarios passed
(broker completion refusal 2324 ms; helper tainted continuation 1770 ms).
The packaged controller matrix failed again. Retained process diagnostics in
`/private/var/folders/xf/8mjkgbt91mgg9b0m_gyrh92w0000gn/T/great-cto-package-smoke-7lKp8c`
record ETIMEDOUT, SIGTERM, null exit code and 30012 ms with no output. This proves
the fresh timeout, not its historical cause or descendant termination.

The trusted controller harness now writes bounded last-stage progress through
an exclusively opened private inode. Stages bracket candidate imports, fixture
Git commands, construction and specialist selection. No prompt, oracle or raw
command output is included. The descriptor closes on success and thrown errors;
the file remains diagnostic data, never admission or provenance evidence.
The next concurrent run is needed to locate the timeout within the matrix.
Both affected caller suites pass 12/12 without skips after checkpoint changes,
including private progress success and refusal checks; scanner remains 83/80.
Fresh Claude CLI auth reports loggedIn false / authMethod none; live mixed-host
execution remains unavailable. No installation, default, merge or release changed.

The stage-instrumented concurrent run at `8d9f9a1e` completed exit 1, 3043 tests:
3036 passed, one failed, six skipped, 226724 ms. Log:
`/Users/Shared/great-cto-lib-stage-ci-ZufHp0`. The controller again reached its
30000-ms deadline (ETIMEDOUT, SIGTERM, elapsed 30005 ms). Retained evidence root:
`/private/var/folders/xf/8mjkgbt91mgg9b0m_gyrh92w0000gn/T/great-cto-package-smoke-jDCqQl`.
Last checkpoint was sequence 218, `git-rev-parse-complete` for the final
`project-drift` case at 29377 ms. This identifies cumulative matrix time near
the deadline; it does not establish a stalled child or descendant quiescence.

Tool resolution audit found the smoke allowlist preferred `/usr/local/bin/git`,
Git 2.15.0 (x86_64/i386), while the direct host probe used Homebrew Git 2.53.0
(arm64). System `/usr/bin/git` reports 2.54.0 (Apple Git-157), including arm64e.
The smoke allowlist now prefers `/usr/bin:/bin:/usr/local/bin`; it does not
inherit operator PATH and still permits local Python if missing from OS paths.
Actual Git version is bounded and recorded in private diagnostic progress.
All matrix cases, refusal assertions, policy floors and 30-second limits remain
unchanged. Toolchain mismatch is a measured hypothesis for cumulative latency,
not yet proof that the original three failures share one cause. A concurrent
post-change run is still required; no test scheduling/retry workaround was added.

First post-change affected-suite run had 11 passes and one failure before smoke
execution: the archive fixture writer (`python3.12`) reached its unchanged
10000-ms deadline. This is tracked separately as `great_cto-p4o9.5.9.7.1`; no
controller diagnostic existed for that failure. A subsequent focused controller
scenario passed in 8615 ms with OS-first Git version verification. This scoped
pass is not an explanation of the writer failure or a replacement for full CI.
The subsequent affected-suite run passed 12/12 without skips, with the controller
scenario taking 8613 ms. Scanner, reference, syntax and diff checks passed.
The archive-writer issue remains open; no post-change full concurrent verdict
is claimed from this later scoped pass.

## Archive fixture writer diagnostics

The test archive writer now uses a fixed Python helper, with payload bytes on
stdin rather than executable text or argv. It runs in an OS-first allowlisted
environment with the unchanged 10000-ms timeout. The parent writes private
0600 process-result metadata; the helper records Python version/executable and
last stage through an exclusively created private inode. No error message or
payload is included in the raised exception. Private stdout/stderr stay in the
retained diagnostic file, not the public test report.

Writer failures retain their private fixture root rather than losing evidence
in teardown. Fixed timeout and nonzero scenarios verify this retention after
teardown and preserve their diagnostics. They do not certify descendant
quiescence, admission or benchmark eligibility. Successful writer fixtures still
follow their existing owned-root cleanup. The original unexpected startup/write
failure remains unexplained; synthetic refusal coverage does not close it.
Both affected suites passed 13/13 without skips after the diagnostic change;
scanner remains 83/80 with unchanged reviewed baseline. A fresh concurrent
library run is needed for the OS-first toolchain and writer instrumentation.

## Terminal postfix verification at 3f6f06bc

The concurrent library run completed exit 0: 3044 tests, 3038 passed, zero failed,
six skipped, 133738 ms. The full non-quick CI subsequently completed **exit 1**
at the same immutable source head, Node v22.14.0 on Darwin. Authoritative log:
`/Users/Shared/great-cto-full-postfix-ci-aRFUI6`.

| Source check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Root/hooks/board | 1257 | 0 | 0 |
| Libraries | 3038 | 0 | 6 |
| Eval | 238 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Board browser E2E fixture | 9 | 0 | 0 |
| CLI | 361 | 0 | 0 |

Scanner passed 83/80, zero Critical and the unchanged 35 historically reviewed
High entries. No new scanner exception or independent security receipt exists.
The three historical library scenarios passed; this does not retroactively
recover the cause of discarded historical failures. Writer diagnostic coverage
does not prove why the original unexpected writer invocation timed out.

The stock installed-plugin L1-L5 suite retained 33 grouped passes, three failures
and nine skips in 72 seconds. Its selected artifact is
`/Users/avelikiy/.claude/plugins/cache/local/great_cto/3.48.0`. Webhook invalid/valid
signature and board namespace tests refused before operator mutation or server
launch because this installed artifact lacks isolated namespace support. These
failures remain failures; the candidate checks below do not replace them.

### Actual packed candidate, without installation

The full build/pack produced 161 files. A separate preserved candidate is
`/Users/Shared/great-cto-postfix-candidate-02Y0pg/great-cto-3.48.0.tgz`, SHA-256
`99be49033092c3b9ae626d767a52e451cd538f0fe2cf162d27d8679c4e01ec34`.
It is byte-identical to the earlier candidate: recent changes affect private
harnesses, not the distributed runtime. This is not a new release or install.

The exact pinned archive passed actual CLI version/empty-store checks and a
separate-process controller probe: 12 construction/selection cases, eight
refusals, process exit 0 in 2740 ms. Private extraction/process diagnostics:
`/private/var/folders/xf/8mjkgbt91mgg9b0m_gyrh92w0000gn/T/great-cto-package-smoke-QLgqK4`.
Execution-artifact provenance and benchmark eligibility remain false; provider
calls remain null, not measured zero. Descendant quiescence is unverified.

Using this extracted candidate, actual private webhook HTTP checks returned
401 for an invalid signature and 200 for a valid signature, with zero outgoing
dispatches in the empty fixture. Its board answered all 11 fixture HTTP APIs,
reported 11 memory layers and isolated discovery. The 71-agent inventory was
supplied from source as fixture data, not proved bundled or installed. Synthetic
task rate ratio 500 is a fixture assertion, not economic or product-quality
uplift. Actual Beads/git, notification delivery and release discovery were not
verified. Board fixture provider calls were zero under child-local stubs.
No installed defaults, plugin cache, merge, release or human approval changed.

### Runtime requirements still unproven

Six library skips are three opt-in live Docker scenarios and three opt-in live
mixed-host scenarios (scoped reuse, frozen QA/security wave, pre-build quorum).
Fresh read-only checks report Codex logged in using ChatGPT, Claude CLI
loggedIn false/authMethod none, and an unavailable local Docker daemon.
These are external prerequisites, not passing native admission evidence.

Construction/selection and source fixtures do not establish live phase execution,
independently attested reuse, background/team/fork terminal correlation, release
or installed runtime parity. Comparative quality trials, independent security
sign-off and delivered execution provenance remain open in epic great_cto-p4o9.
No percentage improvement or full coverage conclusion follows from this report.

## Pinned-scorer cause retention and repeated concurrency failures

The lineage-postfix quick-CI at `282e7970` remained red, as recorded in
[scratch inventory evidence](2026-10-03-guardian-scratch-inventory.md).
Its generic pinned-scorer error discarded the actual child error code, signal,
exit status and monotonic execution duration. Those historical fields cannot
be recovered from a later success or from elapsed time alone.

The pinned runner now attaches and includes bounded cause metadata in its
failure error: PID/status, validated error code/signal, outcome, wall timestamps,
monotonic duration and the selected unchanged deadline. It excludes raw error
text, argv, oracle, candidate paths and stdout/stderr. Timeout and output-limit
classification require ETIMEDOUT and ENOBUFS respectively, not slow elapsed
time. Descendant quiescence and benchmark eligibility remain explicitly false.
The successful execution/signed-report process schema is unchanged, and no
failure is converted into a completed acceptance assessment.

Four actual native subprocess cases first failed on discarded metadata, then
passed for nonzero exit, timeout, output overflow and signal. A separate unit
case verifies private-text exclusion and absence of a duration-based timeout
guess. The full focused scorer file completed 28 passes and one failure: its
older signal-handler test did not observe the private ready marker within its
fixed polling window. This proves missing observed readiness, not signal-handler
behavior. Follow-up `.5.9.7.2.3` preserves that distinction; its deadlines were
not extended and the failure was not waived.

A subsequent concurrent `node --test tests/lib/*.test.mjs` completed exit 1:
3032 tests, 3012 passed, 14 failed, six skipped, 452065 ms. Preserved log:
`/Users/Shared/great-cto-scorer-cause-lib-ci-PZMKpY`. Every pinned-runner caller
file was exercised, including the bound signer and collector; all four new
native cause cases passed. The 14 failures include the repeated broker/helper
and direct-browser cases, initial inventory refusal in the new lineage fixture,
and missing signal-test readiness. This command did not include the 20 tests
under `scripts/lib`; it is not the stock complete CI library command or a new
full-CI verdict. Its failures remain real even where earlier scoped checks passed.

Three contemporary read-only inventory samples with the identical one-second
limit completed exit 0 in 177, 185 and 339 ms, about 56 KB each. They do not
explain earlier null statuses or certify process identity/isolation. The current
shell selects Homebrew Git 2.53.0, so the previous package-smoke legacy-Git cause
is not established for these current failures. Private guardian/OS-inventory
refusal-stage evidence remains a separate prerequisite `.5.9.7.2.2`.

Scanner remains 83/80, zero Critical and the unchanged 35 historically reviewed
High findings. No new exception, timeout/scheduling/skip workaround, model call,
independent admission, installation, defaults, merge, release or frozen-corpus
rewrite occurred. Root causes and overall readiness remain unproved.
