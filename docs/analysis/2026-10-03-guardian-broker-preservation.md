# Broker execution transitions honor resource preservation

Fix for `.5.8.3.7.3`, extending the
[scratch identity registry](2026-10-03-guardian-scratch-inventory.md) and
[fixed probe broker](2026-10-03-guardian-browser-broker.md) under the still
[Proposed guardian ADR](../adr/ADR-028-browser-profile-guardian.md).

## Reproduced defect and implementation

With actual held Chromium registered, adding an unknown directory before
`probe-continue` previously yielded `probe-ended` rather than `unavailable`.
The real integration regression failed exactly on that distinction. The
sampler's local refusal did not control the broker's execution transitions.

The broker now requires a fresh OBSERVING resource snapshot before emitting
readiness, releasing continuation and accepting the child's completion frame.
Every failed check reaches the existing unavailable path and scorer IPC
disconnect, without browser signals or directory deletion. On scorer exit it
checks again; a failed/preserved attempt cannot publish an admitted completion,
even if a child's DOM result was received earlier. Failed state is terminal.

Fault tests additionally reproduced missing ChildProcess `close` notification
after parent-driven IPC disconnect: readiness/completion tests timed out while
waiting for the broker's terminal event. Direct scorer lifetime is now tracked
with `exit`. That event alone never proves browser-tree, filesystem, inherited
descriptor closure or reaping; resource/admission authority flags remain false.

## Test plan and evidence

- Real helper integration: capture live scorer/browser lineage and profile plus
  artifacts, add an owned unknown directory before continuation, require
  unavailable and helper exit1, and verify captured processes stop before
  fixture fallback. No admitted completion is emitted.
- Readiness seam: in an isolated test process, inject an unknown directory at
  the real sampler's second enumeration, after registration but before ready.
  Preserve the actual owner/fork/Chromium behavior; require no ready emission,
  unavailable, terminal preserved snapshot and null completion.
- Completion seam: intercept the actual fork's private done frame before the
  broker handler, after existing observer cleanup; create an unknown directory.
  Require unavailable and null completion despite the actual child's DOM result.
- Regression: existing direct observer, protocol, sampler, helper, parent death
  and scorer/helper fault scenarios. Fixture-only fallback signals/removal are
  confined to captured unchanged process identities and the exact fresh root.

Focused final macOS execution passed **82/82 with no skips**. The continuation
test was red against the previous implementation, then green. Initial readiness
and completion tests were red on missing close notification, then green after
the exit-event correction. Both deterministic seams still run actual Chromium;
they are test-only mutations of built-in bindings, restored before fixture
cleanup, not replacement OS verdicts or production authority. Unknown entries
and creator root remain untouched by the broker before fallback. Evidence:
`/tmp/great-cto-broker-preservation-red.log`,
`/tmp/great-cto-broker-preservation-green.log`, and
`/tmp/great-cto-broker-preservation-focused.log`.

## Remaining full goal boundary

This closes the local broker transition bug, not the full guardian/pipeline.
The fixed-fixture probe remains unactivated in production. No stronger
same-UID/process/filesystem isolation, recursive closure, inherited-descriptor
deadline certificate, signed supported-host admission or delivered/installed
runtime proof is supplied by these tests. Frozen registrations and old archives
are not rewritten or retroactively admitted. There are no model calls, actual
gate approvals, merge, release, installation or default changes. Parent resource
guardian, independent admission and full comparative benchmark remain open.
