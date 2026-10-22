# QA: controller-recorded execution graph

Date: 2026-10-22. Base: released 3.68.1 (`0db13a3b`).
Scope: additive controller trace, project-scoped read model and read-only board UI.
No new scheduler, event store, runtime dependency or execution authority.

## Canonical verification

Command: `bash scripts/ci-local.sh --e2e`, Node 22.19.0 and the native Claude CLI
for declarative plugin tests. Result: exit 0, **GREEN with 15 NOT CHECKED**.
The local evidence log is `gcto-execution-graph-reviewed-gate.log`, SHA-256:
`0d5e2d59c524047eb30473cb5f284c3695ebd58925d95bbdc9d89235e5acd419`.
Candidate commit/tree identity is recorded in the PR, not embedded into a
self-referential committed report. This report was added after that run;
documentation checks were repeated without changing the tested runtime code.

| Suite | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Root, hooks and board | 1504 | 0 | 0 |
| Library | 3503 | 0 | 6 |
| Eval | 242 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Actual board browser scenarios | 19 | 0 | 0 |
| CLI unit | 375 | 0 | 0 |
| Pipeline L1-L5 | 36 | 0 | 9 |
| Archetype scenarios | 34 | 0 | 0 |
| Native declarative plugin tests | 10 | 0 | 0 |

These are suite counts, not unique tasks or quality measurements; some checks
overlap. CLI build and package creation, docs/bundle freshness, installation
fixtures, policy checks and security scans also passed their current gates.
The canonical script's default L1-L5 smoke step selects the operator-installed
3.68.1 plugin. It is not evidence for the new candidate's installed runtime.
The same L1-L5 step is therefore checked separately with an explicit
`--plugin-dir` pointing at this candidate, without replacing installed plugins;
it passed 36 checks with 0 failures and the same 9 NOT CHECKED categories.
Its local log is `gcto-execution-graph-candidate-pipeline.log`, SHA-256
`a0351f2355692a767851293ebe4039bf6f7572629360456afccdaa524002797a`.
This does not turn either run's skipped categories into live acceptance.

## Causal and UI acceptance

Recorded identities bind attempts, shared wave inputs, inline stage context,
verifier results, joins, selected transitions, approval/rejection, repair,
recovery and artifact publication. Context supplied is not context demonstrably
used by a model. Historical scoped reuse records a report digest and explicitly
does not imply a new worker call or inherited approval. Separately admitted
private domain packets are not covered by the stage-context digest.

Tests cover stale gate refusal without trace mutation; mandatory check outcomes;
mixed-host frozen workers versus serialized verifier inputs; unknown legacy
history; malformed/cyclic data; caps before nested-array traversal; project
isolation; no raw prompt, path, receipt or token leakage; and read-only inspection.
The actual browser checks keyboard details, zoom, mobile/light/dark, API node and
edge parity, unknown-project 404 and unchanged persisted run state.

## Defects found and fixed

An earlier full run failed because late bootstrap reset the selected Execution
tab. The browser regression now delays a real metrics response and proves that
the selected graph survives bootstrap. Another self-review correction connects
worker return to mandatory checks and negative reviewer outcomes.

Independent source review found one P1: rework retained an old scheduling parent
for a not-yet-started QA partner. Its regression failed on the previous candidate
and passed after all affected scheduling frontiers were cleared. Historical
nodes remain inspectable, but only the replacement transition enables the new
QA attempt. Reuse visibility, context labels and bounded projection were also
improved following nonblocking feedback.

The earlier green candidate does not verify these later corrections. The table
above comes from the fresh full run after all runtime corrections. Interrupted
diagnostic runs are not counted as passes. Incremental independent source review
is recorded separately and does not grant shipping authority.

## Warnings and unverified boundaries

HOL scored 82 at a threshold of 80: 0 critical, 35 high already classified as
false positives in the unchanged baseline, 9 medium, 8 informational. Passing
this policy is not a zero-findings security claim. Existing agent-shield and
skill-size diagnostics remain; contrast over gradient/image areas is explicitly
unmeasured, not passed.

The six library skips are live Docker isolation, real controller repair,
build-export/release smoke, live scoped-review reuse, live mixed-host QA/security
and live mixed-host pre-build quorum. The nine pipeline skips retain their
fixture/manual boundaries, including real git/Beads capture, lessons merge,
paid learning, notifications, release discovery and role/model/deployment/human
approval execution; the legacy Python board suite is absent from this repository.
Fixture success does not establish those live properties.

Native and old sessions without recorded causal events remain unavailable or
partial. No timestamps, role names or task titles are used to invent edges.
Operator-owned JSON is not tamper-proof against the same OS user. Bounded trace
truncation does not change the controller's execution policy.

No paid model run, quality-uplift benchmark, production deployment, merge, release,
installed-plugin update or operator board replacement is established here.
The public showcase candidates remain separate and depict released 3.68.1
attempt observations, not this unreleased graph.

See [ADR-040](../adr/ADR-040-recorded-execution-graph.md) and
[controlled-host boundaries](../HOST-CODEX.md).
