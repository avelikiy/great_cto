# External guardian browser probe broker

Prerequisite `great_cto-p4o9.5.8.3.6` integrates the
[read-only resource owner](2026-10-03-guardian-resource-observation.md) into the
[separate IPC helper](2026-10-03-guardian-ipc-helper.md). The
[proposed guardian ADR](../adr/ADR-028-browser-profile-guardian.md) remains
Proposed: this development probe is not its approved production bootstrap.

## Implemented boundary

An explicit capability-bound private `probe-start` request accepts only fixed
normal/refusal fixture modes. It accepts no executable, candidate directory,
HTML, oracle, path or environment. The helper creates a fresh private root and
forks its fixed local probe with empty execArgv and minimal environment plus
the owned temporary-directory variables. That probe generates the repository's
board fixture itself and exercises actual `observeBoard` / `chromium.launch`.
The existing test-style spawn/API instrumentation is explicitly evidence
scaffolding, not silently approved production launch registration.

The helper owns its launched scorer; the scorer reports actual browser roots
and profile through its own private fork channel. The helper checks bounded
canonical frames and lineage through the resource owner before reporting
`probe-ready`. Recovery root/scorer coordinates are returned only in private
`probe-started`; public resource snapshots omit paths and IDs. Continuation is
one-shot and requires registration. Duplicate starts, caller paths, wrong
capabilities, missing starts and unknown modes fail closed. Terminal protocol
preservation cannot start another probe. The helper cannot adopt a caller PID.

Successful observation sends a completion frame before the scorer itself
disconnects IPC. Parent-driven disconnect was not a reliable child-close
notification path in the initial experiment; normal completion is now owned
by the scorer and measured to terminate. A probe-completion boolean is not a
signed score or gate approval. IPC disappearance before completion rejects the
held probe barrier; existing observer `finally` closes its browser. No guardian
signals or deletions are introduced. Helper disconnect requests scorer IPC
shutdown, not arbitrary process termination.

## Test strategy and measured scope

Integration covers actual Chromium normal/refusal, scorer SIGKILL, helper
SIGKILL, parent IPC loss and duplicate start while observing. Every case first
captures a live scorer/browser descendant tree and checks direct helper-to-
scorer lineage. Process stop and profile retention are measured before fixture
fallback cleanup. Fixtures reclaim only their captured unchanged PID/start
identities and exact newly created root after quiescence; no global signals.
Transport negatives reject malformed/oversized/duplicate frames, wrong
capability, arbitrary path, unknown mode and continuation without launch.
Existing protocol, resource-owner and direct observer lifecycle tests remain.

Scorer SIGKILL leaves a retained profile and no probe completion while the
helper survives to observe it. Helper SIGKILL and parent IPC loss cause the
held scorer to unwind and close its browser/profile in this measured phase.
The root itself is retained in all cases. PID inventory excludes zombies from
running counts, not a reaping certificate. Parent IPC loss is not evidence of
actual parent SIGKILL with active Chromium; that distinct scenario remains
required by the parent ADR. No test here proves arbitrary late descendants or
inherited descriptor closure.

The first integration test incorrectly assumed one root entry. Actual launch
creates more than the profile, and the installed pinned Playwright source
creates an artifacts directory. The test identifies exactly one profile and
one actual artifacts directory, binds their fixture identities and measures
both lifetimes. Both remain after scorer SIGKILL; both disappear on measured
normal/refusal/IPC-unwind paths. The sampler still registers only the profile,
not the artifacts directory or every possible late scratch entry. Full inventory
is tracked in `.5.8.3.7`; this correction never authorizes root deletion.

## Unfinished authority and delivery

No production controller/scorer uses this broker. Frozen corpus registration
and prior candidate archives remain unchanged. Helper/bootstrap/tool closure
has not been preregistered or independently admitted and the installed plugin
has not been updated. The fixed probe imports fixture/tool code; static paths
and a private channel are not a hostile same-UID isolation certificate.
Bounded application frames do not certify aggregate queue/RSS or Node IPC
decoding budgets. Worker input cannot select this bootstrap through this API,
but actual adversarial candidate execution still requires full supported-host
review. All OS quiescence/resource closure/cleanup/independent admission and
benchmark eligibility flags remain false. Parent fault cleanup, full scratch
inventory, stronger process/filesystem authority and delivered-artifact proof
remain requirements, not delegated to successful local tests.

Focused final execution on macOS passed 77/77 tests with no skips, including
the added artifacts-lifetime assertions. Documentation/link checks passed
81/81. Each broker scenario captured five live scorer/browser processes before
interruption/continuation. Evidence: `/tmp/great-cto-guardian-broker-focused.log`
and `/tmp/great-cto-guardian-broker-docs.log`. The frozen eight recipe runtime
pins were reverified unchanged with benchmark eligibility false.
