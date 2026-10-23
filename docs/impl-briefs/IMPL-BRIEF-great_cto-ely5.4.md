# IMPL-BRIEF-great_cto-ely5.4.md

[archetype:devtools] [compliance:openssf,api-stability,soc2-type-2] [feature:four-domain-conditional-graphs] [phase:implementation] | Why: see docs/plans/PLAN-four-domain-conditional-graphs.md

## Task

- **bd task:** `great_cto-ely5.4` — Shared four-domain registry and read-only graph proposal.
- Source: approved `docs/architecture/ARCH-four-domain-conditional-graphs.md`, ADR-041. REQ-1 through REQ-12 within shared metadata/proposal scope.
- Frozen 2026-10-23 by PM. A fresh builder may start after PM task closes; approval-level helper excludes a separate plan gate. Architecture gates are closed. No code is authorized beyond this packet.

## Files to modify

| File | Purpose |
|---|---|
| `scripts/lib/focus-registry.mjs` | Shared registry, core IDs, safe candidate metadata |
| `scripts/lib/conditional-graph-proposal.mjs` | Pure bounded advisory graph from supplied evidence |
| `tests/lib/focus-registry.test.mjs` | Exact mapping, core and metadata contract tests |
| `tests/lib/conditional-graph-proposal.test.mjs` | Proposal, negative controls, privacy and host contract tests |

## Files NOT to modify

| File / glob | Boundary |
|---|---|
| `packages/board/**` | Exclusive later board writer, task .5 |
| `shared/**` | Existing scheduler map, catalog and pack definitions frozen |
| `agents/**` | Full catalog and role contracts preserved |
| `scripts/lib/codex-pipeline.mjs` | Controller authority unchanged |
| `scripts/lib/controlled-specialists.mjs` | Current epochs/quorum unchanged |
| `scripts/lib/review-graph-floor.mjs` | Review floor unchanged |
| `scripts/lib/runtime-gate-policy.mjs` | Existing risk authority unchanged |
| `scripts/lib/specialist-plan.mjs` | Consume existing plan, do not redefine selection |
| `scripts/lib/domain-admission.mjs` | No private-policy activation |
| `scripts/lib/domain-evidence.mjs` | Consume public pack metadata only |
| `scripts/lib/execution-trace.mjs` | No proposal promoted into observed execution |
| `docs/gates/**` | Frozen acceptance owned by root/PM |
| `.great_cto/**` | No project/policy/runtime state writes |
| `package*.json` | No dependency or packaging policy changes |

## Step-by-step

1. Write contract tests for four mappings, candidate metadata and eight core IDs; implement pure registry.
2. Write known/unavailable and composable route tests; implement pure projection over supplied existing specialist-plan data.
3. Add limits, hostile-input, schema/fingerprint, floor-retention and no-side-effect tests. Run the focused command and existing floor regressions frozen in the gate artifact.
4. Hand the board owner exact exports and envelope samples. No shared-file edits; any needed API revision serializes before board work.

## API-CONTRACT

Exports: `focusRegistry()`, `focusDirection(id)`, `coreRoleIds()` from registry, and `conditionalGraphProposal({ focusId, host, plan, base, requiredGates = [] })` from proposal. Modules are synchronous, deterministic and do not read project trees, invoke subprocesses, call models, make network requests or mutate supplied objects. The registry may read existing bundled public pack metadata through `listDomainPacks`; never call admission or read private overlays.

`focusRegistry()` returns `{ schemaVersion: 1, registryVersion: 1, directions, coreRoles }`. Directions in display order: fintech-crypto → money + crypto-execution; telemedicine → telemedicine-workflow; venture-pipeline → venture-evidence; mental-care → mental-wellbeing-safety. Each includes id, English label, packIds and allowlisted public candidate metadata (version, digest, maturity, activation, exactly three descriptive invariants per pack). Preserve separate finance packs. `coreRoleIds()` returns the eight ARCH IDs. Return independent values or freeze immutable objects. `focusDirection(id)` returns the supported entry; unknown ID returns `{state:'unavailable', reason:'unsupported-focus'}`; no alias/inference.

`plan` is supplied output of existing `specialistPlan`, never computed by this pure module. `host` is `codex` or `claude-code`, otherwise evidence is unavailable. `base` is the supplied pinned identity used to check assessment consistency, never read from disk. Known requires supported plan version, state planned, known assessment, matching pinned base, nonempty valid fingerprint and complete metadata. Planning-only/empty diff, unknown/missing policy/evidence, mismatch or malformed input is unavailable. Caller must supply the actual current evidence; a pure projector cannot attest freshness independently. Preserve mandatory code-reviewer + qa-engineer + security-officer and every supplied specialist, including conservative superset on unavailable input.

Output follows ARCH: schemaVersion 1, kind conditional-graph-proposal, advisory true, changesExecution false, focusId, registryVersion, assessmentState known|unavailable, assessmentFingerprint (null when unavailable), routeClasses, nodes, edges, requiredRoles, requiredGates, reasons, limitations. Base/fingerprint bindings stay opaque; no public root/files/raw assessment/reason strings. Ordinary, architecture, sensitive and publication classes compose. No proposal implies PASS/approval or publication. Native host limitations remain explicit even with known proposal evidence.

Edges are proposed-dependency only; nodes use ARCH kinds. No attempts, observed statuses, result IDs, fabricated timestamps, approval receipts or scheduler directives. Use bounded reason codes, not upstream free text or paths. Validate unique IDs, no dangling edges, supported enums, collection limits ≤128 nodes/256 edges and UTF-8 serialized size ≤65536 bytes. Overflow/unsupported schema becomes bounded unavailable with preserved mandatory/supplied roles; never truncate required roles into an apparently valid selective graph. Unknown enum/reason inputs cannot yield known assurance. No raw hostile strings may escape through unavailable errors.

## TEST-SPEC

| Case | Expected |
|---|---|
| Exact four mappings, five packs, core IDs | Preserve public pack digests, candidate/explicit-only, 3 invariants per pack; catalog unchanged |
| Ordinary / architecture / sensitive / publication and architecture+sensitive | Explain preparation; retain mandatory quorum, declared specialists and gates |
| Missing base/policy/plan, empty diff, unknown host/schema, mismatched fingerprint/base | Unavailable, null fingerprint, no selective omission; upstream superset retained |
| QA/security/reviewer removed in input | Mandatory floor restored in proposal; no mutation to authoritative floor |
| Duplicate/dangling/unknown node/edge and node/edge/byte overflow | Bounded unavailable; no partial known graph |
| Malicious raw reasons, paths, prompts, tokens, overlay bindings | No forbidden canary in serialized public output; allowlisted codes only |
| Native and controlled same evidence | Shared semantics; native causal/enforcement limits remain explicit |
| Deep-frozen input and repeated calls | No writes/side effects; stable output; no trace/scheduler/admission changes |

Run: `node --test tests/lib/focus-registry.test.mjs tests/lib/conditional-graph-proposal.test.mjs`.
Regression: `node --test tests/lib/review-graph-floor.test.mjs tests/lib/specialist-plan.test.mjs tests/lib/controlled-specialists.test.mjs tests/lib/runtime-gate-policy.test.mjs tests/lib/domain-evidence.test.mjs tests/lib/domain-admission.test.mjs tests/lib/domain-benchmark.test.mjs tests/lib/domain-pilot-plan.test.mjs`.

## ACCEPTANCE

- [ ] All TEST-SPEC rows are exercised with passing deterministic tests; counts and skipped checks reported accurately.
- [ ] All four owned files only; scope validator has zero violations and zero allowlist warnings.
- [ ] Public projection has no private-source or raw-file disclosure and no authority side effects.
- [ ] Exact exported API and bounded unavailable semantics are passed to board owner.
- [ ] Existing floor/admission regressions pass; no actual execution reduction or efficacy claim.

## Out of scope / deferred

Board integration is .5. Actual execution activation is .7; matched paid/quality experiments are .8 with separate authority. No default/policy change, merge, release, deployment or installation.

## Revision history

2026-10-23 PM v1: frozen shared packet after approved architecture.
