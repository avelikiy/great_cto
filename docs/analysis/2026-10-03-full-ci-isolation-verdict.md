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

## Fixed signal-test lifecycle observation

The signal-handler fixture now launches a fixed trusted source entrypoint;
private options are bounded on stdin, not supplied as executable text or argv.
Its stdout contains only launcher/invocation/result stage metadata. Shape and
input-limit refusal happen before invocation; a stale receipt is explicitly
distinguished. Other runner refusals without process evidence remain stage
unproven rather than being called prelaunch or completed. No candidate/oracle
payload, path, raw error or signing authority is output.

The existing 50-by-20-ms ready polling window, one-second scorer deadline,
two-second exit watchdog and ten-second test limit are unchanged. Parent
receipt/input preparation still precedes launch. Missing observed ready is
recorded before waiting for the launcher result within the existing watchdog;
late readiness cannot satisfy that assertion. Actual observed PID/parent
identity, ETIMEDOUT/SIGKILL and direct-process disappearance are still required
for the positive signal-handler case. No descriptor/descendant closure is
inferred from direct-process exit.

Final focused macOS execution passed 31/31, zero skips. A separate native
negative fixture produces a timeout without any ready publication and never
manufactures readiness evidence. Input shape, 64-KB input-limit and stale
receipt refusals return bounded metadata without echo. The positive case
observed ready and a scorer timeout of 1005 ms at the unchanged 1000-ms limit.
This proves the new scoped observation path, not the cause of historical
missing readiness. Issue `.5.9.7.2.3` and the overall concurrency diagnosis
remain open pending stronger current evidence. Runtime runner/signature code,
frozen corpus, installed plugin and all gates are unchanged.

### Canonical concurrent library verdict at 25bf6abf

The actual stock library command, including both `tests/lib/*.test.mjs` and
`scripts/lib/*.test.mjs`, completed exit 1 at immutable `25bf6abf`: 3054 tests,
3038 passed, ten failed, six skipped, 463742 ms. Preserved log:
`/Users/Shared/great-cto-fixed-scorer-lifecycle-lib-ci-yYsqez`.
All four native scorer cause cases, both new launcher refusal/no-ready cases
and all three native lineage cases passed under this concurrency.

Eight external browser-helper modes reported message timeouts. The temporary
PostgreSQL cleanup-on-action-failure test refused during initialization before
its intended action; it is tracked separately as `.5.9.7.2.4`, not accepted as
a successful cleanup proof. Private guardian-stage evidence remains `.2.2`.

The tenth failure now has stronger cause evidence: the signal fixture did not
observe ready within its unchanged polling window, but its trusted launcher
exited zero with an actual scorer result ETIMEDOUT/SIGKILL, elapsed 1024 ms at
the 1000-ms limit. Thus this fresh attempt reached scorer process execution;
it is not a prelaunch receipt/input refusal. That still does not prove whether
user code installed its signal handler, whether startup or marker observation
was delayed, or why previous attempts lacked observed readiness. The test
remains failed; no late-ready evidence or launcher exit is substituted for its
required ready/identity assertion. `.2.3` remains in progress.

This is a red canonical library verdict, not a complete CI rerun, improvement
percentage, independent admission or installed/deployed proof. The previous
red logs remain authoritative historical evidence. Current read-only checks
still report Claude unauthenticated, Codex logged in and Docker unavailable.
No models, real approval, installation, release, merge or defaults changed.

### Private inventory cause observation prerequisite

The resource owner now retains creator-private fixed stage/reason metadata and
actual native inventory status, allowlisted error code/signal and elapsed time.
The one-second timeout, SIGKILL and one-MB buffer are unchanged. Raw process
tables, stderr, paths and capability material are not retained. Constructor
inventory refusal has bounded private metadata before scratch creation;
registration refusal preserves its cause through subsequent irreversible
refusals. Public snapshots do not gain diagnostic keys or cleanup/admission
authority. Observation stages are implemented but their injected native-fault
coverage is still missing; helper/broker forwarding is also not implemented.

Ten native fault-seam cases passed: construction and registration each cover
exit seven, timeout, output limit, self-SIGKILL and malformed zero-exit rows.
The seam replaces only the test process's fixed ps call with a fixed trusted
native child, not arbitrary candidate code. Registration uses real test-owned
scratch but does not claim successful process registration. These tests do not
prove an actual OS ps failure, recursive closure or independent admission.

The six-file scoped regression completed exit one: 53 tests, 38 passed,
15 failed, zero skipped. Browser/broker cases did not establish their required
static DOM/readiness assertions. All ten new fault cases, resource refusal
tests and three lineage cases passed. This scoped run is red, not a replacement
for canonical concurrent CI; the cause of browser refusal remains unproved.
The previous process handle was unavailable, so no terminal verdict is inferred
for that earlier run. Issue `.5.9.7.2.2` remains in progress. No deadlines,
concurrency defaults, installed artifacts, frozen corpus or gates changed.

### Private helper/broker stage forwarding

The unactivated fixture now forwards bounded diagnostics only on its existing
creator-private fork channel. The protocol snapshots and successful reply
shapes are unchanged; unavailable private replies gain `privateDiagnostic`.
Broker records fixed lifecycle stages and the first refusal stage, private
resource-owner metadata and actual direct-process exit. Probe failure stages
are accepted only from an exact frame and a fixed allowlist. Raw exceptions,
arguments, paths and payloads are not copied. Direct exit still does not imply
descendant/descriptor closure, cleanup or admission.

Two actual native fixed-fixture fault-seam cases pass: accepted browser-launch
failure and a rejected arbitrary stage sentinel, both exiting seven. They
verify immutable private broker metadata, no sentinel/root leak, retained
scratch, preserved refusal cause and unchanged false public authority flags.
They do not exercise Chromium or establish an OS failure cause.

The actual two-file helper/broker execution is red: 26 tests, 15 passed,
11 failed, zero skipped. Eleven malformed/unauthorized IPC cases passed their
new bounded diagnostic/no-echo/public-snapshot assertions. All eight main
browser modes now report fixed `browser-launch` failure while construction
inventory exited zero. Thus this attempt refused before resource registration,
not at that registration's ps call. The cause inside Chromium launch remains
unknown; this observation does not explain previous concurrency timeouts.
The other three failures remain broker transition and active-parent-browser
checks. Observation inventory fault coverage and complete native lifecycle
diagnostics remain open under `.5.9.7.2.2`; no successful whole-CI or isolation
proof is asserted. No pinned scorer or frozen corpus bytes changed.

Final-byte three-file execution including the two new native fault cases:
28 tests, 17 passed, eleven failed, zero skips, exit one. Documentation and
classification checks passed 94/94. Earlier red runs are not discarded or
called flaky; this rerun covered the final diagnostic edits.

### Missing local browser prerequisite and post-registration fault coverage

The next bounded native launch diagnostic established a current prerequisite
failure: pinned Playwright entry exists, package version 1.60.0, expected
Chromium executable absent, no browser child spawned. The tool explicitly
reported missing executable, not timeout. No raw exception, paths or browser
logs were published. Scratch from this diagnostic was retained; no closure
authority was inferred. This does not explain earlier full concurrent runs.

The fixed probe now forwards only the enum `missing-browser-executable` for
that explicit tool error; other launch errors remain `launch-refused`, never
classified from duration alone. The broker rejects unknown reasons and invalid
stage/reason combinations. Current actual helper/browser execution remains red:
29 tests, 18 passed, eleven failed, zero skipped. All eight main browser modes
report missing executable before resource registration. Dependency recovery is
tracked in `.5.9.7.2.5`; shared-cache installation requires separate approval.
The installed plugin, system Chrome and frozen artifacts have not been changed.

Five new observation inventory faults use an actual fixed native scorer/browser
process tree successfully registered with real OS inventory before injecting
exit seven, ETIMEDOUT, ENOBUFS, SIGKILL or malformed rows into the subsequent
inventory call. All retain fixed private observation stage/cause, held scratch
and irreversible PRESERVED state without public authority. The fixed fixture
tree and inherited pipe close before test-owned scratch cleanup. Combined
owner/inventory/lineage checks pass 28/28 without skips; these are source fault
tests, not Chromium lifecycle, production isolation or benchmark execution.
Full guardian diagnostic/admission coverage remains unproved under `.2.2`.

### Versioned source initializer refusal retention

Source-only migration scorer safety change under `.5.9.7.2.4`: an absent server
guardian handle no longer permits deleting the generated cluster root after
initializer refusal. Initialization errors now retain private fixed stage,
actual exit/error/signal/time, scratch-retained state and false eligibility /
descendant-quiescence flags. The existing ten-second initialization timeout,
default termination signal, 64-KB buffer and startup/shutdown deadlines are
unchanged. Raw initdb output, arguments, paths and private rows are withheld.

Original source SHA256:
`ae21be78bfb8cd6b09b3033b148322bc93757444053e85f5a230b1551487fc5c`.
New source SHA256:
`de4278f6a550384a524ddadaa5415522b3afa1ac127db186541c2271f860072e`.
This is a separate source revision, not a rewrite or new admission of the
frozen corpus/scorer/oracle/runtime artifacts. Existing archived bytes and
installed plugin are not changed. Fresh runtime closure registration and
independent review remain necessary before this source can become an admitted
benchmark runtime; a local source digest is not such a certificate.

Native fixed-fixture fault tests first reproduced deletion on nonzero exit,
SIGKILL and an initializer leaving a live descriptor-holding descendant.
After remediation, final four-case execution passed without skips: exit seven,
SIGKILL, actual ten-second ETIMEDOUT and the live descendant. Diagnostics match
the actual native spawn result; test-owned root is retained until the fixed
descendant closes its descriptor and is observed stopped before test cleanup.
Version detection is a fixed native test seam, not proof of PostgreSQL presence.

These tests prove refusal retention and bounded metadata, not successful
initialization, the historical concurrent CI cause, recursive server closure,
same-UID isolation or an approved benchmark. Real PostgreSQL regression is
tracked separately; `.2.4` remains in progress. Shared browser-cache recovery
approval is still pending; no installation, release, merge, model call, skip,
deadline expansion or gate bypass occurred.

The actual PostgreSQL regression subsequently completed 25/25, zero skips,
64882 ms. It exercised baseline failure / repair through a newly source-pinned
scorer, rollback/readers/deadlines/privileges, no TCP listener with intentional
action-failure cleanup, and guardian shutdown after real scorer SIGKILL. This
scoped execution does not clear the historical concurrent initialization
refusal or independently attest recursive resource closure. Existing frozen
runtime registration is unchanged; source-only retention mitigation is not a
substitute for a newly approved runtime or complete CI.

### Actor-local scorer readiness timing

The fixed source test launcher now emits bounded wall timestamps and its own
monotonic elapsed values for launch, invocation and result. The parent records
bounded known-stage arrival times and marker-poll elapsed duration separately.
The fixed scorer publishes its ready marker only after installing its SIGTERM
handler; valid handler-ready/PID/timestamp fields plus actual PID/parent
identity remain necessary. Readiness is frozen before awaiting final exit.
Late publication, elapsed values or launcher exit zero cannot satisfy it.

The original parent launch origin, 50-by-20-ms polling loop, 1000-ms scorer
deadline, 2000-ms exit watchdog and 10000-ms test bound are unchanged. Wall
clocks and pipe-arrival latency are diagnostic observations, not cross-clock
ordering or pass authority. No candidate/oracle path, raw native output,
capability or installed runtime is published or changed by this test fixture.

Timing assertions first failed on missing metadata, then the final scorer
suite passed 31/31 without skips. This actual positive observed launcher start
arrival at 27 ms, runner invocation arrival at 28 ms, marker publication about
115 ms after parent launch and parent readiness observation at 134 ms. Native
scorer timeout reported ETIMEDOUT/SIGKILL, elapsed 1007 ms at the unchanged
1000-ms limit; the observed owned scorer was no longer live. The explicit
no-ready timeout case and prelaunch refusal cases also retain bounded timing
without fabricating ready evidence.

This scoped pass does not identify the historical concurrent missing-ready
cause or clear the red canonical verdict; `.5.9.7.2.3` remains in progress
pending equivalent concurrent evidence. Current Claude auth still reports
loggedIn false/authMethod none. Native async correlation/live scoped reuse,
shared-cache Chromium recovery, matched benchmark baseline choice, independent
runtime/security admission and delivered-artifact verification remain separate
unfinished requirements; no percent quality uplift is inferred.

### Concurrent source regression after evidence-reader v2

Canonical library command `node --test tests/lib/*.test.mjs scripts/lib/*.test.mjs`
finished at immutable published source
`0d9fc0ed546ce5052ef77829bc3800e87d8dd3a8`, exit 1. Retained log:
`/Users/Shared/great-cto-evidence-v2-lib-ci-UJeEra`.
Totals: 3093 tests, 3060 passed, 15 failed, 18 skipped, zero cancelled,
91508.480083 ms. No deadline, concurrency, skip policy or gate was changed.

All 15 failures are actual-browser scenarios: four observer lifecycle modes,
two broker resource-mutation phases, eight external-helper modes and one
active-parent SIGKILL case. The eight helper modes explicitly report
`browser-launch` / `missing-browser-executable`, with successful resource-owner
creation inventory, before browser registration. The remaining seven failures
are unmet readiness or mutation prerequisites, not evidence that the intended
browser fault or cleanup scenario executed. Their assertion text alone does not
prove a separate historical root cause. Shared-cache Chromium recovery still
needs operator approval; no substitute executable, added skip or cache change
was used to obtain a pass.

The 18 skips are twelve browser/DOM checks whose existing prerequisites report
Chromium unavailable, three opt-in live Docker cases and three opt-in live model
cases. All are NOT CHECKED, not successful coverage. This run is the full stock
library group, not the full ci-local/root/eval/CLI/installed L1-L5 pipeline.

The scorer signal-handler readiness case passed in this concurrent run. Its
owned launcher observation recorded ready publication at 214 ms after parent
launch and parent observation at 219 ms, with launcher stage arrivals at
44/45 ms. The actual scorer timed out at the unchanged 1000-ms limit, reporting
ETIMEDOUT/SIGKILL and elapsed 1005 ms. This verifies this execution, not the
cause of the earlier missing-ready failure or universal concurrency stability.
The real PostgreSQL baseline/repair and all four initializer-refusal retention
cases passed, including the unchanged ten-second native timeout. Earlier
concurrent initialization failure and recursive closure remain unproved.

All evidence-reader v2 unit cases passed, including native FIFO refusal at
117.007541 ms and incremental aggregate-cap refusal. The controlled scoped
reuse/fallback/rework cases also passed, using scripted verifier results rather
than independent live model evidence. Native admission, complete lifecycle,
security approval, comparative model quality and installed-artifact parity
remain unfinished. The parent concurrent diagnosis remains in progress.

### Shared admission ledger container and fence guards

Source review under `great_cto-p4o9.2.4` found that truthy JSON arrays or scalars
could pass the map-container guard for leases/calls/retired identities. Text-keyed
properties on an array disappear when serialized; the shared ledger therefore
could fail to retain admitted capacity. Nine of ten new persisted-file negative
cases failed against the previous implementation (the invalid call-count string
already refused). They passed after requiring JSON object containers and checking
whole-wave fence capacity before incrementing the monotonic safe integer.

Final affected budget/controller/specialist regression passed 92/92, zero skips,
52549.999125 ms. This includes the expanded thirty-case admission suite: malformed
root/container refusal without rewriting state, actual native prelaunch hook
subprocess denials, eight competing admission processes, whole-wave exhaustion,
last-safe-fence admission/replay/release, native asynchronous-response retention
and controlled worker/verifier accounting. Separate mixed-host regression passed
15/15, zero skips, 5850.764208 ms, using scripted host/verifier results rather than
live providers. Documentation checks passed 94/94; syntax/diff checks and local
HOL83/80 passed with zero Critical and 35 High reviewed as false positives.

These source format/integer guards do not authenticate ledger contents, provide
same-UID isolation, enable background/team/fork paths or attest actual model
completion. No live lifecycle evidence or approving independent security receipt
was produced. The earlier canonical run remains red with fifteen browser failures
and eighteen NOT CHECKED skips; it predates this guard change and is not a full
post-change regression. Native lifecycle, independent admission, measured quality
and delivered/installed readiness remain open. No installed policy, defaults,
shared cache, archive, frozen corpus, human gate, merge or release was changed.

### Current candidate guard delivery verification

At published source `2eaf4afe`, CLI build and normal prepack completed. A new local
candidate was retained separately, without publishing or installation:
`/Users/Shared/great-cto-guard-candidate-PAvKgn/great-cto-3.48.0.tgz`.
SHA256: `e89e7d7d56d84ab4e2c1fe68efe05c737a5c7ccf6dff09ff6730de97bef8a005`.
Metadata still states 3.48.0; this is a private candidate, not a new release of
that version. The archive contains 161 files; previous candidate archives and
frozen runtime/corpus remain intact. The unactivated browser guardian prototype
is absent from this runtime import closure.

Actual extracted module bytes match current source:

| Module | Source and candidate SHA256 |
| --- | --- |
| scoped-review-reuse.mjs | 5f05542eea8ce5fe74d87af1169cae3ce4c6119f118d59644e9cafe937f66270 |
| agent-execution-budget.mjs | f9fb48c2a7072d17d5c349459b97187b8b1dcb5f9076cae1aad47e8c59c778c4 |

Pinned extraction/CLI smoke passed. Evidence root:
`/private/var/folders/xf/8mjkgbt91mgg9b0m_gyrh92w0000gn/T/great-cto-package-smoke-Bsnugh`.
Actual `--version` and private empty `codex-host list` exited zero at 251/79 ms.
The separate controller-construction/selection probe exited zero at 2056 ms,
with 12 cases and eight refusals, no dispatch or recorded approvals. This is not
a worker/verifier/full-cycle or independent runtime admission result.

A fixed trusted local helper, `tests/helpers/delivered-guard-probe.mjs`, then
checked expected module pins before importing those exact extracted modules.
Its actual private process exited zero with empty stderr. Eight assertion groups
passed: shared cross-host capacity, malformed-map refusal without rewriting
the corrupt fixture, whole-wave safe-fence refusal, last-safe replay/release,
scope version 2, untracked literal-name refusal, tracked literal-name acceptance
and hardlink refusal. Test-owned Git, project/policy/ledger files were created
under retained `/private/tmp/great-cto-delivered-guards-SwxWI7`; no real operator
store or project was changed. Wrong-pin and oversized configuration negatives
also refused before probe output, without skips. This is a trusted local
candidate test, not a sandbox against candidate-controlled code or a signed
independent certificate; expected pins and the probe originate from this source.

Post-probe archive digest is unchanged. Provider calls remain null (not measured),
approvals zero, executionArtifactProvenanceVerified false,
descendantQuiescenceVerified false and benchmarkEligible false. Documentation
checks passed 94/94 and local HOL83/80 passed with zero Critical and 35 reviewed
High. No new exception, release, install, shared-cache update or gate approval
occurred. Task `.5.9.8` covers this narrow candidate guard delivery check only;
parent full CI, installed parity, actual models and independent admission remain
unfinished.
