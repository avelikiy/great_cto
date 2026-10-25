---
date: 2026-10-25
---

# ARCH: Host graph coverage

Design: [ADR-044](../adr/ADR-044-host-graph-coverage.md)
State: Implementation contract; no completion or live-provider claim

## Problem and decision

For implementers, QA and independent reviewers, keep controller-owned causality
and add bounded host observations so operators can inspect controlled and native
sessions without mistaking missing history for success. The operator's approved
plan is the product brief for this work; there is no separate numbered product
brief for this slice.

Reuse the controller, task links and Canvas focus UI. Add normalized host events,
a private journal and explicit coverage. Reject inferred native graphs and a
replacement orchestrator for the reasons in ADR-044. This is Large work with
correctness/privacy signals: untrusted events cross into project-scoped UI,
concurrent writers can duplicate events, and false approval provenance would
mislead the operator.

## Current constraints verified in source

| Component | Present behavior | Required addition |
|---|---|---|
| `scripts/lib/execution-trace.mjs` | Controller causality; 512 nodes, 2048 edges, 64 snapshots | Preserve these limits and semantics; supplement with explicit coverage |
| `scripts/lib/codex-exec.mjs` | JSON event callback; final parsing; timeout cleanup | Classify source events; surface observer health independently of execution |
| `scripts/lib/claude-exec.mjs` | Final JSON only; safe mode disables hooks | Structured event observation without enabling hooks or weakening restrictions |
| `scripts/lib/work-tasks.mjs` | Explicit Claude session links and lifecycle observations | Host-neutral registered observation binding |
| `packages/board/lib/work.mjs` | Exactly linked controlled graph; native topology unknown | Bounded native projection with provenance and coverage |

Installed CLI version/help and official event documentation must be checked
before enabling an adapter capability. A fixture is evidence for a parser, not
evidence that the installed host emits that event. Version/auth detection alone
does not certify event coverage.

## Components and ownership

```text
Controller run/lease --------> existing controller trace ------+
       |                                                     |
       +--> restricted host runner --> normalized observations|
Registered native session -----------> normalized observations|
                                          |                  |
                                 private bounded journal     |
                                          |                  |
                                 project-scoped projection <-+
                                          |
                                  read-only board canvas
```

There is no return edge from the projection/journal to dispatch, gate approval,
task acceptance or publication.

| Stream | Write zone | Depends on | Why parallel-safe |
|---|---|---|---|
| Contract | This ARCH and ADR-044 | Operator plan | No runtime writes |
| Normalization | `scripts/lib/host-graph-events.mjs` and its new tests | Contract | Pure functions, no runner/storage mutation |
| Journal | `scripts/lib/host-graph-journal.mjs` and its new tests | Normalized envelope | Own persistence boundary |
| Adapters | Existing two runners, native observation entrypoint and their tests | Normalization/journal interfaces | Sequential within this stream; no board files |
| Projection/UI | Board Work projection and graph renderer/tests | Envelope/coverage contract | Does not change event production or controller |
| Integration/QA | Cross-host scenarios and reports | All preceding streams | Read-only verification after candidate stabilizes |

Shared files have one owner at a time. Integration changes to `work-tasks.mjs`
and controller glue are serialized with adapter work. Tracking belongs in Beads,
not unchecked Markdown implementation lists.

## Event and binding contracts

`normalizeHostEvent({ host, mode, sourceVersion, event, binding })` returns
`{ event, diagnostics, capabilities }`. `event` is null for unsupported or
non-observational input. Host is `codex` or `claude-code`; mode is `controlled`
or `native`. The trusted binding contains canonical `projectId`, an explicitly
registered `sessionId`, and controller-owned `runId`/`attemptId` when present.
Never copy these authority fields from the source payload over the binding.

Normalized event v1 fields:

| Field | Rule |
|---|---|
| `id`, `sourceEventId` | Stable bounded identity; source ID scoped by host, source and trusted binding |
| `sequence` | Nonnegative safe integer or null; detects source gaps, never proves dependency |
| `host`, `mode`, `sourceVersion` | Allowlisted host/mode; bounded version metadata |
| `kind`, `phase`, `outcome` | Closed enums; unknown values are diagnostics |
| `sessionId`, `attemptId` | Exact binding; absent linkage stays absent |
| `parentIds` | Bounded explicit references; no automatic previous-event parent |
| `occurredAt`, `observedAt` | Valid date or null for source time; collector time is separate |
| `toolClass` | Closed classification, such as shell/read/patch/mcp/search/other; no raw names or arguments |
| `artifactDigest` | Valid digest of an admitted artifact; never a path or bearer token |

Recommended kinds are session, turn, attempt, tool, child, handoff, verification,
gate, artifact and gap. Phases are start, update and end; outcomes are unknown,
success, failure, cancelled, timeout and rejected. Source mappings are explicit;
an unrecognized host status must not default to success.

An observation is not an execution receipt. Native verification/gate/artifact
events remain reported observations unless an existing trusted adapter provides
the required binding. Public projection retains this distinction.

## Journal, replay and recovery

`appendHostGraphEvent(binding, event, { store })` returns
`{ state: recorded|duplicate|degraded, reason }`.
`readHostGraph(binding, { store, cursor, limit })` returns
`{ events, coverage, cursor, health }`.

The default store is operator-owned outside the worker project. Resolve project
identity from canonical root, validate file components, refuse symlinks and unsafe
permissions, and create directories/files as 0700/0600. Do not include a raw root
path in the public projection. A reader cannot choose arbitrary store paths.

Bound every event before serialization. Initial design limits: at most 16 KiB
per normalized record, 4096 events and 16 MiB per run/session journal, and 512
events per read page. These are resource ceilings, not performance measurements.
Reaching a ceiling produces `partial` and an explicit reason; it never stops,
approves or retries a model invocation. No automatic eviction that could make
lost history appear complete. Any later retention policy must preserve an
explicit retained interval and loss marker.

Use a single writer/lease for each journal and idempotent event identity.
Different journals may append concurrently. Same-ID/same-content delivery is
duplicate; same-ID/different-content is a conflict and degrades coverage. A
crash-torn final record cannot become a successful event. Persist or derive
reader degradation from the damaged tail; do not silently discard it and report
complete. Avoid rewriting a corrupt journal automatically.

Replay operates only on observations. Rebuilding a graph never invokes a host,
repeats a tool, approves a gate or changes a controller recovery frontier.
An observer write failure must remain visible even if the host returns valid
output. It must not silently discard a valid controller result or claim complete
observation. Execution and observation health are separate fields.

## Coverage and causal projection

Each coverage dimension has `support: supported|unsupported|unknown`,
`state: complete|partial|unavailable|not-applicable`, and bounded reason codes.
Dimensions are lifecycle, parentChild, tools, verification, gates and artifacts.
Unknown support never maps to not-applicable. No event is evidence that an
unreported capability is supported.

Lifecycle is complete only for an admitted interval with an explicit start and
terminal event and no known capture loss. Running intervals are in progress,
not complete historical sessions. Duplicate/late delivery is supported;
sequence gaps remain open until actually filled. An explicit capability test
must establish whether the source promises contiguous sequence numbers before
their absence can prove no gap.

Every edge records provenance: controller decision or explicit host reference.
Unknown parents remain unresolved diagnostics; late parents may resolve them.
Self-edges, cycles and cross-project/session references are rejected or isolated
with coverage degradation. Sorting events for display cannot manufacture edges.
Handoffs require an explicit originating attempt, target session and accepted
binding; matching titles or nearby timestamps is insufficient.

Project only exactly linked runs/sessions. Ambiguous multi-run task linkage
keeps separate graphs, rather than silently combining their authority. Legacy
records remain unavailable. Controller graphs remain available when supplemental
native tool observations are unsupported or incomplete.

## UI contract

Keep the existing compact navigation, canvas, zoom/fit controls and keyboard
node inspection. Distinguish Workflow, Execution and Evidence with labels and
provenance. Host lanes are visual grouping, not dependencies. Attempts can
collapse tool observations; selecting one reveals the bounded detail list.

Show source versions, observed interval, coverage dimensions, known gaps,
truncation and unavailable reasons. A stale start event cannot establish current
liveness. Only an actual current lifecycle/lease probe may support Running.
Preserve existing unknown-state fallback, project-bound URLs and mobile focus
restoration. All new interface labels are English; project documents retain
their source language.

For large graphs, use bounded pages and a list fallback. Before setting a new
latency gate, measure fixed synthetic 100/512/4096-event corpora on a recorded
machine, separate parsing/layout/rendering costs, and approve a budget from that
baseline. No claimed percentage speedup is part of this design.

## Security

Source events are hostile input, including successful-looking gate events.
Allowlist before storage; raw prompts, transcripts, tool arguments/results,
commands, reports, URLs and paths never enter normalized storage or public JSON.
No transcript scanner or new automatic telemetry is introduced.

Validate canonical project membership, bounded identity and storage location
before admission. Bound bytes, nesting, arrays and serialized size before costly
projection. Escape every public label; imported labels never become HTML,
Mermaid executable content or shell commands.

Local filesystem access remains a trust boundary. Hashing local events does not
make them independently attested. Test symlink substitution, cross-project IDs,
duplicate conflicts, hostile keys, malformed JSON, large payloads, disk errors,
redaction canaries and unknown source versions.

## Safeguards

| Invariant | Acceptance evidence |
|---|---|
| Observation cannot mutate execution or approval | Before/after controller and task state equality under imported hostile events |
| No inferred causal edges | Reordered timestamp fixtures, explicit-parent and missing-parent tests |
| No private payload persisted or projected | Redaction canaries in source events, journal bytes and board HTTP responses |
| Project isolation survives duplicate source IDs | Two-root fixture with identical native IDs |
| Gaps never become complete | Interrupted writer, cap, unknown-version and missing-terminal fixtures |
| Existing controlled behavior is preserved | Existing pipeline/gate/release and browser regression suites |

## Acceptance matrix and delivery

| Requirement | Deterministic proof | Live proof needed before completeness claim |
|---|---|---|
| HG-1: Both controlled hosts | Same normalized contract fixtures and controller integration | One bounded admitted run per supported host version |
| HG-2: Mixed controlled execution | Join, retry, cancellation and handoff tests | Mixed-host run with known expected causal edges |
| HG-3: Native lifecycle | Explicit registration, start/end/resume fixtures | Registered native run per host; unsupported events remain declared |
| HG-4: Parent/child and tools | Explicit IDs, late parents, unknown types and gaps | Host emits IDs/events promised by its capability profile |
| HG-5: Storage/recovery | Duplicate/conflict, torn write, quota, restart, permissions | Runtime restart/replay of an admitted test session |
| HG-6: Privacy/isolation | Canary, hostile input and cross-project HTTP tests | Inspect safe metadata output only; never publish private source payload |
| HG-7: Board usability | Browser keyboard/mobile/fallback and exact node/edge parity | Installed candidate read-only smoke |
| HG-8: Evidence chain | Artifact/check bindings and native false-approval refusal | Bounded test-repository change through checks/review/PR |
| HG-9: Test release/deploy | Existing release-adapter regressions | Separate explicitly authorized external release/runtime probe |

Record version, candidate commit/tree, fixture corpus digest, commands, failures,
skips and actual runtime evidence separately. Unsupported or unrun live scenarios
are NOT CHECKED, never passed because an offline fixture succeeded. Independent
correctness/privacy review and the canonical exact-candidate gate precede release.

## Non-goals

No replacement scheduler, writable graph editor, automatic approval, automatic
session harvesting, model reasoning capture, hosted telemetry, customer-project
execution or default-on paid benchmark. No modification of existing acceptance
thresholds to accommodate a failing implementation.

## Rollback and migration

Additive schema only. Old controller traces keep version 1 and their meaning.
Unknown journal schemas fail closed in observation readers; do not rewrite them
as the current schema. Revert adapter/read-model admission and leave journals on
disk for an explicit operator cleanup/export decision. No database migration,
cloud resource or traffic cutover is introduced by this feature.

## Cost model and credentials

No new cloud components or runtime dependency; cloud cost delta is zero for the
local feature itself. Disk usage is bounded by the journal limits. Actual live
model cost is unknown until token usage is reported; fixture checks make no paid
calls. Live testing requires existing local host authentication and a separately
bounded invocation budget. GitHub test PR/release and deployment acceptance need
their existing credentials and scoped authority. Missing auth is a blocked live
check, not a successful parser test.

## Risks and gates

The primary risk is honest-looking false completeness: a functioning adapter can
still miss events its host never exports. Mitigation is capability-specific
acceptance with real host evidence and no overall all-green claim for unsupported
required dimensions. Other risks are persistence pressure, duplicate/conflicting
IDs, source-version drift and accidental credential retention. The safeguards
table maps each to a required correctness/privacy test. Gate thresholds must be
fixed before builder acceptance, and independent reviewers must inspect every
changed adapter, storage and projection surface.
