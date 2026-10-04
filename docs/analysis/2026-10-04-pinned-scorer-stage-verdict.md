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

## Scorer failure-path diagnostic follow-up

Tasks `great_cto-p4o9.5.9.12` and `great_cto-p4o9.5.9.13` remain unresolved.
The PostgreSQL driver's opt-in fd3 trace now reports fixed stage identifiers
for initialization, startup, setup, holder, observations and shutdown, with
monotonic elapsed time only. The existing parser enforces exact keys, known
stages, 64 records and 8192 bytes; no SQL, paths, private rows or raw stderr
are forwarded. Progress does not renew any deadline or establish acceptance.
The migration fixture opts into this trace; production invocations remain
opt-out. The launcher timeout test also reports its bounded startup/ready
observations on the failure path, before cleanup, rather than losing them when
the watchdog rejects. No scorer, watchdog or PostgreSQL phase bound changed.

Focused scorer/migration/initializer regression passed 62/62 with zero skips,
failures or cancellations in 31273.773958 ms. Log:
`/Users/Shared/great-cto-scorer-diagnostics-focused.log`.
The SIGTERM-handling case passed in 1334.16075 ms and observed an actual
ETIMEDOUT/SIGKILL scorer exit. This isolated result does not supersede the
previous canonical failures. Their causes still require loaded replay evidence.

### Diagnostic full-CI terminal verdict

The canonical non-quick run at immutable `7e4fb0f8` terminated exit 1, session
11653, log `/Users/Shared/great-cto-scorer-stage-full-ci-0rotAp`. Root 1270 passed;
library 3115 total, 3108 passed, one failed, zero cancelled, six skipped,
183799.231792 ms. Eval 238, docs 76, browser E2E nine and CLI 361 passed.
Installed Claude L1-L5 retained 33 passed, three failed and nine skipped
(58 seconds), including the unchanged missing-namespace refusals. Installed
parity and skipped runtime boundaries remain unconfirmed.

Neither previous scorer failure reproduced in this canonical run:

- PostgreSQL baseline plus repair passed in 14411.753917 ms. Their traces
  reached `pg-stopped` at 6722 and 4342 ms respectively, then `pg-result`.
- SIGTERM-handling scorer passed in 1611.444333 ms. Ready publication was
  observed, runner-unavailable arrived at parent elapsed 1444 ms, and the
  scorer recorded ETIMEDOUT/SIGKILL after 1003 ms against its 1000 ms bound.

These observations do not resolve the earlier exit-1 or watchdog causes.
Tasks `.12` and `.13` remain open/in progress; no retry-as-pass classification
or deadline extension is justified. The original failures remain above.

The new library failure is `great_cto-p4o9.5.9.14`: actual observer browser
processes stop after dom-refusal, `board-browser-lifecycle.test.mjs:98`,
6170.609583 ms. Registration returned PRESERVED instead of OBSERVING. Its
private refusal stage was not emitted at the assertion, so the cause is
unconfirmed. Normal, owner-term and owner-kill cases passed in the same run;
their passes do not establish dom-refusal resource closure. Preservation must
not be disabled or treated as authority to delete resources.

The rendered contrast case passed in 15557.321958 ms. This is the existing
test's scoped verdict, not measurement of image/gradient text it reports as
unmeasured. Full acceptance remains red. No manual signals were used to
terminate the CI worker.

The fresh 161-file candidate is preserved at
`/Users/Shared/great-cto-scorer-stage-candidate-j8cmyg/great-cto-3.48.0.tgz`,
SHA-256 `4dfe0e1a0e2ac695ccd5fbc043c3765689aa408959ee6ec3334b508a8de24495`.
It has not been installed, released or assigned inherited runtime acceptance.
No merge, security exception, approval or default change was performed.

## Native registration diagnostic replay

Task `great_cto-p4o9.5.9.14`: commit `7291a2a6` changes only the native lifecycle
test. It records the resource registration snapshot and creator-private fixed
cause metadata before asserting OBSERVING, so a failing registration no longer
loses its refusal stage at the assertion. No production state machine, process
ownership, deadline or cleanup rule changed. Focused lifecycle/resource/native
inventory/lineage regression passed 32/32, no skips or cancellations,
10033.194959 ms; log `/Users/Shared/great-cto-registration-focused.log`.

Full non-quick CI at immutable `7291a2a6` terminated exit 1, session 23440,
log `/Users/Shared/great-cto-registration-full-ci-jaN796`. Root 1270 passed;
library 3115 total, 3109 passed, zero failed/cancelled, six skipped,
141842.711125 ms. Eval 238, docs 76, browser E2E nine and CLI 361 passed.
HOL passed 83/80, zero Critical, unchanged 35 baseline-reviewed High.
Installed Claude L1-L5 selected the same local 3.48.0 cache and recorded
33 passed, three failed, nine skipped (66 seconds). The missing isolated
namespace support remains a real installed-artifact failure; full CI is red.

Native dom-refusal passed in 1752.526625 ms. Actual registration recorded
OBSERVING, five registered processes and two scratch directories; inventory
exited zero after 102 ms against its unchanged 1000 ms bound. Four captured
browser processes stopped and its profile was removed before test cleanup.
Normal, owner-term and owner-kill also passed. These captured-tree observations
are not independent admission, general descendant-quiescence proof or cleanup
authority. The older PRESERVED failure was not reproduced and its cause is
still unknown; `.14` remains unresolved, not closed by retry-as-pass.

PostgreSQL baseline/repair passed in 9443.520541 ms, with pg-stopped observed
at 5264/2815 ms respectively. SIGTERM-handling scorer passed in 1606.012083 ms
with actual ready evidence and ETIMEDOUT/SIGKILL after 1004 ms against its
1000 ms bound. Historical `.12` and `.13` causes also remain unconfirmed.
No manual CI-worker termination or timeout extension was used.

The freshly verified 161-file package is preserved at
`/Users/Shared/great-cto-registration-candidate-l7DBmI/great-cto-3.48.0.tgz`,
SHA-256 `4dfe0e1a0e2ac695ccd5fbc043c3765689aa408959ee6ec3334b508a8de24495`.
It was not installed or released. Source passes and identical candidate bytes
do not replace installed parity, skipped acceptance or historical diagnostics.
No merge, defaults, security exception or human approval was changed.

## Private installed-candidate namespace verification

Task `great_cto-p4o9.5.9.15`, verified from source `bb6b47c5`. Selected active
Claude cache remains `/Users/avelikiy/.claude/plugins/cache/local/great_cto/3.48.0`.
Its webhook config, events and DLQ paths use homedir directly; board state does
not honor GREAT_CTO_HOME and discovery lacks GREAT_CTO_DISCOVERY_ROOT support.
Source and the current packed candidate contain those namespace changes.
Both artifacts report 3.48.0: version equality is not byte or runtime parity.

Observed SHA-256 prefixes (12 hex digits; archive pin below is full length):

| File | Active Claude cache | Private npm candidate |
| --- | --- | --- |
| CLI webhook-config.js | 262b15304040 | b47ae3d1f87f |
| CLI webhook-dispatch.js | 885c40a9167f | 98a9d0579909 |
| CLI serve.js | ede24138d702 | e741926b7042 |
| Board config.mjs | abb2eb089ed3 | fa86f1f9a849 |
| Board projects.mjs | 761f32049ba3 | 7fc0e6d2c6a2 |

All five active-cache file hashes were unchanged before/after the probes.
Both active-cache HMAC fixtures refused WEBHOOK_SMOKE_ISOLATION_UNSUPPORTED;
board refused BOARD_SMOKE_ISOLATION_UNSUPPORTED before global mutation or
server launch. These are compatibility refusals, not successful runtime tests.

The current archive was verified by the bounded pinned-package extractor and
controller probe, then actually installed by npm offline into an exclusively
owned private prefix with --ignore-scripts, --no-audit, --no-fund,
--omit=dev and a private npm cache. HOME/CODEX_HOME were not repurposed.
The first npm attempt had exit 127 because its sanitized PATH omitted the
actual /usr/local/bin npm; it performed no installation. The corrected fixed
PATH installed one package successfully. No postinstall, global plugin cache,
marketplace, managed agents/commands or active board was changed.

Private evidence root:
`/private/var/folders/xf/8mjkgbt91mgg9b0m_gyrh92w0000gn/T/great-cto-package-smoke-FSsjvv`.
Actual npm package is under `npm-install/node_modules/great-cto` there.
Archive SHA-256:
`4dfe0e1a0e2ac695ccd5fbc043c3765689aa408959ee6ec3334b508a8de24495`.
All 161 installed regular files matched the pinned extraction by relative name
and SHA-256 before probes, and remained identical afterward. The pinned
extraction inventory digest is
`6ca454d540a909b25db0a61abd8ca7e230df19770a703370838d0101fd36b625`;
entry SHA-256
`e90b93e5a01ce84ac430c905e093fee493da385e793f11e6a0f244e4c200d9df`.
The archive pin was rechecked after npm installation.

Actual installed-candidate results, log
`/Users/Shared/great-cto-private-install-namespace.log`:

- Invalid HMAC returned 401, valid HMAC returned 200 with zero outgoing dispatch;
  private event and DLQ checks passed.
- Actual board listener/router verified eleven JSON APIs, isolated discovery,
  eleven memory layers and 71 copied fixture agents. Actual Beads/git execution,
  notification delivery and release discovery were stubbed/unexecuted and are
  NOT CHECKED. The synthetic task rate ratio 500 is arithmetic, not quality.
- Actual MCP SSE listener, health, initialize and tools/list passed with seven
  tools. No tools/call or model/provider execution was performed.
- Pinned extracted CLI --version and codex-host list passed; controller probe
  covered twelve construction/selection cases and eight refusals with zero
  dispatch attempts and zero approvals. Provider provenance remains unknown,
  not inferred from these local checks; benchmarkEligible remains false.

This resolves current candidate namespace verification only. The last canonical
full CI still failed against the active cache (33 passed, three failed, nine
skipped); this private installation does not replace or green that result.
Independent review, installed host parity, real mixed-host execution, quality
benchmark and release/distribution boundaries remain separate. Historical
scorer/registration causes above remain unresolved. No release, merge, global
installation, defaults or approval was performed.

## Independent namespace review attempt and active refresh boundary

Task `great_cto-p4o9.5.10`. A separate Claude CLI reviewer was invoked at
source `82929742`, using safe mode, restricted mode, no tools, strict MCP,
permission mode dontAsk/no prompts and no session persistence. Supplied input
covered five namespace files, install-local.sh, runtime-gate-policy and
review-graph-floor plus their main-to-head diff. It explicitly excluded whole
branch signoff, host admission, merge, release or installation approval.
Input identity and the actual terminal result are retained in
`/Users/Shared/great-cto-independent-namespace-review-NyJu8e/review.log`.

The reviewer terminated exit 1 after 1176 ms, with null signal/errorCode:
`Failed to authenticate: OAuth session expired and could not be refreshed`.
Its actual JSON response recorded is_error true, terminal_reason api_error,
zero token usage, zero total cost and no model usage. No review verdict exists;
this is unavailable review, not request-changes or approval. Authentication
must be restored before a genuine independent review can proceed.

Read-only installer inspection found it rsyncs the entire source tree with
--delete into the same versioned Claude cache, optionally refreshes managed
agents/commands, writes plugin registration, may restart an existing board,
and refreshes Claude/Codex marketplaces. It is not a narrowly scoped namespace
update. This branch differs from origin/main across 216 files; approving the
five namespace files alone would not authorize activating the whole branch.
The broader adaptive-policy security task `great_cto-p4o9.5` remains open;
the earlier PR149 exception is not applicable. install-local.sh was not run.

Current Claude/Codex caches, registrations, managed agents, live board,
marketplaces and defaults were not updated. No merge/release or security
receipt was manufactured. The private npm candidate proof above remains valid
within its scope; canonical installed L1-L5 remains the historical red result.

## Auth-restored independent review: REQUEST_CHANGES

After the operator completed Claude auth login, the read-only auth check reported
loggedIn true with authMethod claude.ai. The retry reused the same 89,806-byte
input, SHA-256
`169798ab0449af85e62e6204d65fa261ed09023f1e9eac17bab1cf6ca0cdb4f7`,
at pinned source `829297425b030e1484022713d9b7abc3bc20e285` and the archive
identity above. The eight reviewed files were unchanged through `1f895871`.
Log: `/Users/Shared/great-cto-independent-namespace-retry-YD0xEN/review.log`.
The prior failed auth attempt remains historical evidence, not overwritten.

The Claude CLI review terminated exit 0, terminal_reason completed, is_error
false; model claude-opus-5-5, duration_ms 167963, total_cost_usd 0.7054662.
Safe/restricted/no-tools/strict-MCP/no-prompts/no-session-persistence settings
remained in force. No subagents or web requests were recorded. Verdict:
REQUEST_CHANGES, not an approving receipt or whole-branch security signoff.

The High finding was confirmed in source: unvalidated manifest.version selected
the mkdir and rsync --delete destination. Empty version selected the cache root;
traversal could select outside it. Task `great_cto-p4o9.5.10.1` adds a read-only
preflight before any mkdir/sync, requiring a bounded strict semantic version and
a direct-child target, refusing cache/destination symlinks and non-directories.
The shell now passes manifest paths as arguments, without JavaScript interpolation.

The isolated executable-shell regression initially reproduced 16 failures out
of 20 cases. rsync was a marker-only stub and source/cache paths were temporary
fixtures; operator HOME, registries, board and marketplaces were not touched.
After remediation, 23 installer cases cover invalid version types/paths, missing
or malformed JSON, safe versions, existing directories and symlink/file refusal.
This is preflight coverage, not full installer execution or race-free activation:
same-version mutation and filesystem TOCTOU are not resolved by this patch.

Task `great_cto-p4o9.5.10.2` tracks remaining findings and their validation.
Source confirms in-place same-version mutation, non-propagated required-step
failures, a lexical prune guard with a symlink-following directory producer,
and whole-tree copying without a sensitive-local-file allowlist. Namespace
permissions, relative roots, board environment preservation and other model
claims require separate inspection; the reviewer output alone is not proof.
Broader adaptive security review `great_cto-p4o9.5`, OS admission and installed
parity remain open. No install, merge, release or active refresh was performed.
The changed installer bytes need independent re-review before activation.

## Immutable local publication remediation (review pending)

Task `great_cto-p4o9.5.10.2` replaces the in-place whole-tree rsync with a
Git-tracked regular-file snapshot. Local state, environment secrets, key files
and dependency directories are excluded. A checked inventory is staged on the
cache filesystem before rename into an unused version directory. Existing
versions are never overwritten; different files under the same version fail.
Identical repeated publication preserves file mtimes. An exclusive cooperative
installer lock prevents concurrent local publishers and prune from colliding.

Registry activation is a separate atomic write with a unique recovery backup,
preserving non-user entries and retaining the source commit plus content hash.
Invalid/missing registry fails before cache mutation unless cache-only mode was
explicitly requested. Installer-required managed sync now uses --strict;
SessionStart remains advisory. Prune validates every direct-child target before
the first removal, rejects symlinks, traversal, current version, stage and lock
paths, and retains the newest three and observed live roots.

Implicit board restart and marketplace refresh were removed: neither is part
of local publication, and neither can silently select a different source here.
No Codex activation, running-host adoption or release success is claimed.
Managed-file refresh and registry selection are not one global transaction;
partial managed updates or an unused published cache can remain on later error.
Cooperative locks/atomic renames are not OS admission against an adversarial
same-user filesystem writer or CAS against a non-cooperating Claude updater.

Focused installer/prune/sync/root-resolution/drift/docs regression passed
156 tests, zero failures and zero skips. bash syntax, generated-reference check,
diff whitespace, agent-shield (zero blocking; 17 existing advisory findings)
and lesson-rules sweep (424 files, zero findings) passed. Log:
`/Users/Shared/great-cto-immutable-install-regression.log`.
This records source remediation only. Independent re-review and canonical CI
are pending; installed caches, registry, board and marketplace remain unchanged.

## Installer re-review and canonical replay outcomes

The broad static re-review of `f94c9f2c98cc8f74126296d288a3c27c8e9da71c`
did not return a result within 240000 ms: terminal null exit code, SIGKILL,
timedOut true. Input 104854 bytes, SHA-256
`f006ee5db7314253d6665de1eec7cc8b502412315cfbe3ef4355c8a4082a5c5a`;
log `/Users/Shared/great-cto-immutable-review-aJDrxd/review.log`.
The reduced six-file core attempt also timed out at 180000 ms with the same
terminal failure and no verdict: 29617 bytes, input SHA-256
`acc2442794ea5cf47494a41cdbe6ed567efc89579be13de093b4d248444d0945`;
log `/Users/Shared/great-cto-installer-core-review-NQEc4q/review.log`.
Neither log contains a model result or usage; cost/usage are unknown, not zero.

A third, explicitly smaller review used medium effort and only three complete
helpers: local-install-target, local-install-cache, local-install-registry.
Source pin remained f94c9f2c; input 13568 bytes, SHA-256
`c9f73c7512e65f461ecb4cfecdadcf6342c5db08a1996a6d59b5e024b21a926f`.
It completed exit 0, is_error false, duration_ms 113533, actual model
claude-fable-5-1, total_cost_usd 0.4971595. Log:
`/Users/Shared/great-cto-snapshot-review-IMRbzw/review.log`.
Verdict APPROVE for these helpers only, no High/Medium finding. Caller, prune,
sync, tests, helper dependencies, whole branch, OS admission, installation and
release were excluded. No broader approving receipt exists. Low findings cover
stale crash locks, cleanup-error handling, malformed registry entries, restrictive
replacement mode and backup accumulation. The non-cooperating registry update
race and same-user filesystem authority remain explicit limitations.

Full canonical `ci-local.sh --e2e` at f94c9f2c terminated exit 1. Log:
`/Users/Shared/great-cto-immutable-full-ci.log`. Source root/hooks/board:
1269 passed, one failed, zero skipped; library 3151 passed, zero failed, six
skipped (253287.626833 ms); eval 238, docs 76, browser nine, CLI 361 and archetype
34 passed. CLI pack ran. HOL remained 83/80, zero Critical, 35 historically
reviewed High, no new bypass/baseline. Installed L1-L5 selected the local
3.48.0 cache and failed: 33 passed, three namespace-support failures, nine
skipped, 57 seconds. The local Claude registration is disabled; current enabled
Claude/Codex marketplace installations also report 3.48.0, but this local-cache
replay is not an enabled-marketplace firing test. Both CLI auth checks passed.
Docker app is present but its daemon socket is absent; Docker runtime is unavailable.

The source failure was stale-board.test requiring the removed implicit restart.
It now asserts no restart/claim of running-board adoption. A real isolated shell
fixture additionally traps rsync/lsof/Claude/Codex invocations and confirms none
occur during cache-only publication. Focused contract 43/43 and repeated complete
root/hooks/board 1270/1270 passed with zero skips (66972.192334 ms), before the
following namespace remediation. They do not green the earlier full CI.

Task `great_cto-p4o9.5.10.3` remediates confirmed relative namespace/secret-mode
findings: CLI and board share one packaged stateHome resolver; relative roots
fail before writes. Config/DLQ/VAPID use private descriptor-based reads/writes,
file-symlink/special-file refusal and mode 0600; new directories use 0700 without
chmod of existing parents. Loaded legacy secret files are tightened. The board
excludes relocated global state, its marker-bearing parent and symlink aliases
from project registration, discovery and existing registry output. Observed
/var versus /private/var duplicate auto-registration is prevented by canonical
identity. Unknown scope refuses registration rather than falling through.
Focused privacy/namespace/update/VAPID checks passed 63/63, no skips. Log:
`/Users/Shared/great-cto-state-privacy-tests.log`. CLI build and lesson sweep
(426 files, zero findings) passed. These newer bytes require their own complete
canonical replay and independent scope review before activation.

## Namespace candidate replay and actual simultaneous workers

Full `ci-local.sh --e2e` at `6a58c81bd494e3b7505bbad928c54d87fb566d9a`
terminated exit 1. Log `/Users/Shared/great-cto-state-home-full-ci.log`.
All executed source checks passed: root 1270/1270, library 3157 passed with
six skips and zero failures, eval 238, docs 76, browser nine, CLI 362 and
archetype 34. Installed local-cache L1-L5 still had 33 passed, three namespace
failures and nine skips. This remains red canonical evidence, not a green run.

An actual offline npm install of the private 165-file candidate was verified
against every packaged file hash before and after probes. Archive:
`/Users/Shared/great-cto-state-candidate-PlZPiQ/great-cto-3.48.0.tgz`,
SHA-256 `09f37fecc23934e33455766a47527e0fd1b1d84e9fae9eeab444615bc8527d69`.
Log `/Users/Shared/great-cto-state-private-install.log`. Board JSON APIs,
webhook signature acceptance/refusal and MCP initialization/tool listing passed.
No MCP tool execution, release discovery, Docker build or deployment is proved.
This is a private candidate with new bytes, not a new public 3.48.0 release.

The real mixed-host smoke against that installed candidate passed, exit 0,
one test and zero skips, 230778.853541 ms suite duration. Log:
`/Users/Shared/great-cto-state-live-mixed.log`. Run
`5efebbd0-451f-4a7b-8fdd-d7385f046edf`, frozen wave
`6a44296e-30dd-49be-89c3-4ff2acc8a167`. Actual worker dispatch records show:

| Worker | Started UTC | Finished UTC |
| --- | --- | --- |
| Claude Code QA | 16:23:12.791 | 16:23:44.039 |
| Codex security | 16:23:12.805 | 16:23:31.033 |

Worker execution intervals overlap by 18.228 seconds. Sequential application
and verification attempt timestamps do not measure this overlap. Code review
passed after one rework; QA and security reports were verified. The run stopped
at `awaiting-gate`, approvals zero. Scope is two read-only arithmetic fixture
files and report creation, not build/export/release, native-hook parity or
measured product-quality uplift. The Codex worker and verifier share a host;
different-model-family verification is not claimed.

## Caller/prune follow-up after independent REQUEST_CHANGES

The caller/prune/strict-sync/fragment review at 6a58c81b completed exit 0,
is_error false, actual model claude-fable-5-1, duration_ms 160621,
total_cost_usd 0.7051195. Input 19059 bytes, SHA-256
`2165bf4d315c7b4e844955ec96b4b7687bd536fbd13b482d5bda9fab17ab40d8`;
log `/Users/Shared/great-cto-installer-caller-review-8y6TTu/review.log`.
Verdict REQUEST_CHANGES, four Medium findings, confirmed and remediated:

- Reject `--no-register --prune` before mutation; protect every registered
  absolute install path across registry scopes, including canonical aliases.
- Require a fresh environment visibility positive control for process scanning;
  unknown host environments or unreadable registry disable removal.
- Leave non-version cache directories alone rather than failing after activation;
  late prune failure explicitly reports preceding publication/registration.
- Strict managed refresh reports that partial copies/retirements may remain,
  rather than implying failure left managed files unchanged.

Focused installer/prune regression passed 67/67 with zero skips; bash syntax,
diff check and lesson sweep (428 files, zero findings) passed. Log:
`/Users/Shared/great-cto-prune-medium-regression.log`. These fixes require
independent re-review of their new bytes. The three approved immutable helpers
remain byte-identical to f94c9f2c. Neither their narrow approval nor this
regression approves the whole branch, active refresh or release.

## Pinned installer approval and namespace follow-up

At `5a9e39e90fb6569727347c0b37e6375b51427016`, independent caller/prune/
sync/shared-fragments re-review returned APPROVE, no High/Medium, exit 0,
is_error false, duration_ms 161797, actual claude-fable-5-1,
total_cost_usd 0.8949895. Input 20946 bytes, SHA-256
`c3c8f71b498fc41ca3d198f182231c7464185e6cb50e99703c949e7e544bc344`;
log `/Users/Shared/great-cto-prune-rereview-toJJVF/review.log`.
Root/hooks/board 1270/1270, installer/prune 56/56 and privacy/sync/fragments
17/17 passed without skips. Installer task .5.10.2 is closed narrowly;
Low follow-ups .5.10.4 and broad security/activation tasks stay open.

Five-file namespace/privacy/projects review at the same pin returned
REQUEST_CHANGES, exit 0, is_error false, duration_ms 166851,
actual claude-fable-5-1, total_cost_usd 0.8979795. Input 30362 bytes, SHA-256
`2c2e94ec2e2d9bce07781fad485a2470906c1c41fb802255488c41567bb2ad55`;
log `/Users/Shared/great-cto-state-rereview-q9VQuL/review.log`.
Confirmed Medium findings: failed/corrupt webhook read could masquerade as
empty config and be overwritten; truncation preceded mode verification;
board file overrides allowed cwd-relative paths; automatic registration
bypassed the canonical HOME/discovery boundary. Follow-up implementation:

- Only ENOENT means empty config; other read/shape failures abort mutation.
- Already-0600 reads need no chmod; wider modes must tighten or fail closed.
  Writes chmod and validate before ftruncate, preserving bytes on mode failure.
  Read-only permissive secret mounts are deliberately refused, not silently used.
- Both board file override seams require absolute, NUL-free paths.
- Automatic registration canonicalizes and checks HOME or explicit isolated
  discovery scope, including symlink aliases and cwd. Invalid scope refuses.

No atomic/CAS write guarantee or adversarial same-user isolation is introduced.
Low registry-shape/directory-creation findings and platform boundaries remain
follow-up work. New remediation bytes require their own independent review;
prior installed-package and live-wave evidence applies only to its older pin.
