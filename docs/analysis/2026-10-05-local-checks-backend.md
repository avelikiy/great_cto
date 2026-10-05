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

## Privately installed candidate and fresh full-graph start

The approved follow-up .8.6 built the CLI with tsc, packed the existing version
3.48.0 as a private candidate, and actually installed the archive offline using
--ignore-scripts --no-audit --no-fund --package-lock=false. This is not a new
public 3.48 release or a change to the active marketplace plugin.
Archive: /Users/Shared/great-cto-local-candidate-LeAIO0/great-cto-3.48.0.tgz;
SHA256 ecf86feaa93eb11c39f2e1e44035001cee41720bb8c8dcdff7d1240646aef857.
Runtime: /Users/Shared/great-cto-local-candidate-LeAIO0/install/node_modules/great-cto/board.

Installed bytes match the source runtime at e5fd4b17:

| Module | SHA256 |
| --- | --- |
| scripts/codex-pipeline.mjs | 9343fed8dec92da76269681bbd5ac27cb4e6b98d4d4461c8669aafcd6d4a9ea5 |
| scripts/lib/codex-pipeline.mjs | dbc51fa1d96e00f09294b2b8c7dd022205e4f3719648163ec37f86e01cca73e0 |
| scripts/lib/codex-checks.mjs | c0a3e831a14c49a57f295850de5c2eb410fdda2c52fd7c6d080607193983f910 |
| scripts/lib/codex-release.mjs | 61074d4df3a58d3ce8ec099e6f6aab98e1b41629f4a9b2cc776d8467e2b34561 |

A standalone installed-executor probe read only the already known disposable
Z0af82 fixture's src/add.mjs and tests/test.mjs into a fresh temporary snapshot;
no old run state, source file or approval was changed. Actual local tests/build
ran 16:39:06.503Z to 16:39:06.827Z: 29 passed, zero failed/skipped, TAP duration
39.769917 ms. dist/add.mjs was exported with source-identical SHA256
aab6f8c0de652ab6fb3c3c376bfdcd25993ae95b947a788185b1ea0bfeee35da.
Evidence reports local, isolation none, image null, Node v22.14.0/darwin/arm64;
observed /usr/local/bin/node SHA256
c583851fc85e4618b2374cda13399d59d373ad7cebfc4b55160820b88dcce67b.
Log: /Users/Shared/great-cto-local-installed-executor.log. This standalone probe
does not imply fresh model stages or a new release.

The full-graph harness now accepts explicit GREAT_CTO_LIVE_CHECKS_BACKEND=local
and GREAT_CTO_TRUST_LOCAL_FIXTURE=1; default acceptance remains pinned Docker.
It hashes controller, pipeline, checks and release modules before/after start,
never auto-approves gates and rejects untrusted local/automatic fallback modes.
Entrypoint/fixture tests passed 7/7; combined import-closure/docs/harness suite
passed 86/86, zero skips, 346.363375 ms. Initial test launch used the CLI package
cwd and could not locate the root test file; that was a launcher failure, not a
test verdict. The corrected explicit-root run is the passing evidence above.
Logs: /Users/Shared/great-cto-local-installed-entrypoint.log (initial failure),
/Users/Shared/great-cto-local-installed-entrypoint-v2.log and
/Users/Shared/great-cto-local-installed-harness-regression.log.

Fresh installed run 928d1344-5546-425b-af9c-f1de5e0fec74 starts in
/Users/Shared/great-cto-acceptance-501/mixed-release-M0kgYM with zero approvals,
operator-owned trusted local check and local smoke policies and frozen routes
qa-engineer=claude-code, security-officer=codex. Actual initial Codex
product-owner dispatch began 16:39:07.545Z. No old approvals were inherited.
Log: /Users/Shared/great-cto-local-installed-full-graph-start.log.

Installed full-graph start exited zero and awaits gate:product, active null,
queue empty, approvals zero, release null. Product-owner worker returned at
16:39:38.569Z; real Codex verifier ran 16:39:38.760Z to 16:39:57.405Z and
returned verified with empty findings after inspecting docs/brief.md and scope.
Product result digest:
af3b176f046dbf1e603298290197551ea583c7211e0f9bdc9923a0eccf08a924.
Pending token: c87cf9f4-b93c-4f54-9a81-225419f5a2b5.
The brief specifies package-free ESM add(a,b), primitive finite numbers only,
TypeError on invalid inputs/nonfinite sums, ordinary IEEE754 semantics, builtin
node:test and no production deployment. It accurately disclaims sandboxing and
does not claim implementation/tests/release have already happened. Four runtime
pins remain unchanged. The separate installed-executor probe's 29 passing tests
must not be attributed to this fresh graph, which has not reached senior-dev.
No architecture, PM, developer, Claude QA, security or release ran here yet.
Continuation requires explicit approval of this fresh product result, not reuse
of the prior Docker run's approvals.
