# Explicit trusted local checks: implementation evidence

Date: 2026-10-05
Tracking: great_cto-p4o9.8.5; installed full-graph follow-up great_cto-p4o9.8.6
Decision: docs/adr/ADR-trusted-local-checks.md

## Implemented scope

The controller check executor accepts explicit backend local with trusted true.
Omitted backend remains Docker and still requires an image digest. Unknown
backends, null backend, implicit local trust and a local image claim are rejected.
Docker unavailability never selects local. Input allowlists, snapshot limits,
secret scanning and artifact validation remain mandatory for both backends.

Local execution uses argv, private temporary cwd, a minimal credential-free
inherited environment replacement, total command deadline and bounded output.
Failures request repair; timeout, signal, missing executable and output-limit
failures are unverifiable. Ordinary POSIX process groups are cleaned up. This
is NOT a security sandbox: host filesystem, disk credentials, network, memory
and CPU are not isolated. Deliberately escaped descendants are not contained.

Evidence records backend local, isolation none, image null, controller Node
version, OS/architecture and observed executable SHA256 values. The controller
passes backend/runtime provenance through stage and verifier check summaries.
Observed executable hashes are not immutable runtime pins. Release publication
adapter and smoke execution backend are independent: trusted local smoke still
requires release approval and exact checked-artifact/source bindings.

## Validation

- Initial checks/release run: 34 passed, zero failed, three opt-in Docker skips,
  57752.518542 ms; /Users/Shared/great-cto-local-backend-tests.log.
- Expanded pipeline/context/mixed-host CLI/import-closure/release-entrypoint
  regression: 102 passed, zero failed, three opt-in Docker skips,
  143016.977042 ms; /Users/Shared/great-cto-local-backend-regression.log.
- Final changed checks/release/context/mixed-host CLI tests, including null-backend
  rejection and output bounds: 46 passed, zero failed, three Docker skips,
  46127.556709 ms; /Users/Shared/great-cto-local-backend-final.log.
- Documentation: 76 passed, zero failed/skipped, 2140.0995 ms;
  /Users/Shared/great-cto-local-backend-docs.log.
- Host entrypoint examples: two passed, zero failed/skipped, 217.867834 ms;
  /Users/Shared/great-cto-local-backend-entrypoint.log.

Suites overlap and their counts must not be added as unique coverage. Local
checks/export, failed-check repair, bounded subprocess failures, actual CLI QA
check execution and post-release smoke use real child processes. Workers and
verifiers in controller/CLI tests are fixtures, not live models. Docker flags and
no-fallback behavior are covered with mocked Docker invocation; real Docker
execution is skipped, not inferred. All runtime results here use the checkout,
not a newly installed npm artifact or active marketplace plugin.

## Caller audit and boundaries

newRun validates and snapshots policy unchanged; runStage gates mandatory checks
before verifier; stage/verifier summaries now retain backend identity. CLI start
already loads operator-owned policy outside the project, so no new CLI flag or
default change is needed. Both local publication and GitHub downloaded smoke
forward backend/trust into checks. Existing default Docker release policy keeps
its canonical shape and digest semantics. Runtime import closure tests pass.

The live GitHub publication harness and live Codex host harness were inspected
and syntax-checked. They remain explicit Docker-image opt-ins. No real GitHub
release was created and no live model full graph was run for this feature. The
older installed Docker run retains its four approvals and original policies;
neither its runtime files nor JSON state was rewritten. Public release, plugin
distribution and claimed full lifecycle compatibility remain outside this change.
