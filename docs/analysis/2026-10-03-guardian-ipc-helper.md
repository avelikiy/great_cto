# Separate guardian IPC protocol helper

Scope: great_cto-p4o9.5.8.3.4. Related: [protocol core](2026-10-03-guardian-protocol-core.md), [Proposed ADR-028](../adr/ADR-028-browser-profile-guardian.md).

## Implemented transport boundary

scripts/lib/browser-guardian-helper.mjs runs the unattested protocol core in a separate fixed Node child with private fork IPC. It launches no scorer/browser, creates/deletes no directory and sends no process signal. There is no launcher/controller/default activation. It is an executable prototype entry, not a library to import into an ordinary host process.

Initialization requires exact version/kind/attempt/receipt/registration fields. The helper creates its own core instance and returns its fresh capability only over the private bootstrap channel, never stdout/stderr or public snapshots. It reports its own PID and private bootstrap runtime metadata (execArgv count and environment key names, not credential values); neither is independent process/runtime attestation. The test launcher uses the fixed repository helper, explicit empty execArgv and a minimal LANG/TZ environment. Tests verify those properties in the actual child, including refusal to inherit a deliberately invalid ambient NODE_OPTIONS and a unit-only sentinel. This demonstrates this test launch, not that arbitrary production callers cannot start a compromised/preloaded helper.

Transport frames must be canonical dense JSON strings, no more32768 bytes. Step frames have exact version/kind/requestId/raw keys; requestId increments once, and nested protocol wire data is bounded8192 bytes. Object frames, malformed/oversized JSON, repeated init, missing/skipped/replayed requests and extra path/scope fields terminate with a generic unavailable reply and exit1. Valid protocol failures still return a terminal preserved core snapshot; they cannot restart the attempt. No raw frame, capability or hidden payload appears in unavailable diagnostics.

Explicit close and unexpected IPC disconnect have different exit semantics. Close sends a bounded closed reply, preserves the local core, disconnects and exits0 for channel disposal only. Parent loss preserves the core and exits1. An initial actual test found that the disconnect listener overwrote explicit close0 with exit1; the handler now leaves an already-terminal explicit close unchanged. Channel exit0 is not a scorer result, gate approval or cleanup proof.

## Test plan and actual process evidence

| Requirement | Check | Scope |
| --- | --- | --- |
| Separate process / full trace | Actual fork PID, private handshake and ready/register/stop/quiescent messages | Unattested protocol consistency, all OS/cleanup/eligibility flags false |
| Ambient execution metadata | Invalid ambient preload option/sentinel plus child metadata | Test factory's actual filtered environment/empty execArgv; no universal runtime certificate |
| Malformed/order/extra-scope transport | Seven actual helper cases | Unavailable, exit1, stdout/stderr empty, no payload/capability echo |
| Helper termination | SIGKILL only the forked test-owned child | Signal exit, no scoring result; not browser-resource cleanup |
| Actual parent death | Fixed trusted supervisor launches helper, then receives SIGKILL | Helper IPC closes and helper stops before fallback cleanup |

The parent-death test verifies helper parent PID and captures its start identity before killing only the owning test Node parent. It then checks the helper is no longer running; zombies count as stopped, not independently reaped. If assertions fail, fallback signaling is confined to the captured PID/start identity and requires the original parent ownership check. Reparenting/state changes are not treated as a new start identity. These are practical PID/start safeguards, not atomic kernel authority against a hostile same-user race. No user browser, broad process group or filesystem cleanup is involved in these tests.

## Remaining boundary

The prototype does not own Chromium or a temporary profile, verify complete process trees, supervise a scoring deadline, perform ownership-bound deletion or recover a killed helper's resources. Parent loss currently ends an empty-resource transport; a future resource-owning guardian must first stop/validate bound resources as ADR-028 requires. A helper-death signal test is not evidence of browser cleanup after helper death. Real trusted bootstrap, parent-side bounded supervision, late descendants/inherited stdio, actual OS authority and independent signed admission remain required under .5.8.3/.5.8.

Private IPC capability transport and canonical parsing do not prove same-user isolation, loaded helper/runtime closure or hardware/process provenance. No bootstrap/runtime policy is preregistered by these tests. Existing sealed scorer/corpus bytes remain unchanged. This helper cannot be retroactively added to old trials or the delivered candidate2454685f as if that archive contained it. All core OS quiescence/resource closure/cleanup/admission/benchmark eligibility flags remain false. No model, actual approval, install/default/merge/release or benchmark methodology changed.

Application frame bounds apply after Node delivers an IPC message. They do not certify hard memory limits on Node IPC decoding, aggregate queue backpressure or a malicious parent sending oversized serialized data before validation. Independent supported-host resource budgets remain part of admission; the bounds are parsing/consistency checks, not an OS resource sandbox.

Validation: helper11/11 and combined helper/core/real-browser57/57, no skips; docs76/76. Stock quick CI exited0: root1256, libraries2979 passed/6 skipped, eval238, docs76, browser9, pipeline22 passed/5 skipped;11 explicitly NOT CHECKED. HOL83,0 Critical/35 reviewed High unchanged without new exemptions. Generated architecture map was refreshed by the normal reference generator before CI. The original8-scenario frozen corpus/runtime pins reverified unchanged, benchmarkEligible:false. The initially failing explicit-close test passed after the terminal-disconnect fix; parent-death success is observed before test fallback cleanup. This closes only the separate transport prerequisite .3.4, not the resource-owning guardian or independent admission.
