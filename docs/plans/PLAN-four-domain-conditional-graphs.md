# Four domain focus and conditional execution graphs

Status: architecture proposal; runtime implementation has not started.
Tracking: `great_cto-ely5`. Architecture decision: `great_cto-ely5.2`;
human approval gate: `great_cto-0ane` (pending).

## Product outcome

Replace the default experience of selecting from a large role catalog with a
task-oriented view: four visible focus directions, an explainable proposed
execution graph, and evidence of what actually ran. Preserve the full catalog,
mandatory project reviewers, and the eight core role contracts.

| Visible direction | Existing technical packs | Boundary |
| --- | --- | --- |
| Fintech + crypto | `money`, `crypto-execution` | Authority, idempotency, ambiguous outcomes, signing, paper/live isolation, finality; not investment performance |
| Telemedicine | `telemedicine-workflow` | Workflow reliability, identity and permissions, prescription state, evidence integrity; not clinical efficacy |
| Venture Pipeline | `venture-evidence` | Provenance, entity identity, contradictory sources and unverified claims; not proven investment judgment |
| Mental Care | `mental-wellbeing-safety` | User-state isolation and safety escalation; no clinical conclusions from software tests |

All four directions are visible. Visibility does not promote a candidate pack
to validated expertise. Pack versions, admission requirements, and explicit
opt-in remain authoritative. Private overlays are not bundled into public
assets, reports, screenshots, or npm packages.

## Contract selection

Core contracts remain `product-owner`, `architect`, `pm`, `senior-dev`,
`code-reviewer`, `qa-engineer`, `security-officer`, and `devops`. A contract is
not an instruction to launch eight model calls for every task.

| Task evidence | Intended selection | First increment |
| --- | --- | --- |
| Ordinary bounded fix | Implementation, deterministic verification, independent review | Explain selection; preserve the existing mandatory review floor |
| Architecture change | Add architecture decision and dependency plan | Existing architecture and planning gates remain |
| Money, authority, personal data, migrations | Add relevant specialist contracts and mandatory checks | Required specialists cannot be removed by a focus filter |
| Publication | Artifact contents, access boundaries, installed and running version | Publication authority remains separate from code acceptance |
| Missing or conflicting risk evidence | Conservative selection with reasons | Never interpret missing evidence as low risk |

The existing review graph requires code-reviewer, QA and security quorum.
Reducing the actual runtime to three model nodes is a separate policy change,
not part of this increment. No decorative graph may imply that a proposed
transition was observed or that a native session has complete causal coverage.

## Delivery sequence

| Beads item | Deliverable | Dependency and acceptance |
| --- | --- | --- |
| `great_cto-ely5.1` | ARCH, ADR and design contract | Source-grounded contracts, risks, privacy, alternatives and ownership |
| `great_cto-ely5.2` | Architecture approval | Human approval under the primary project's current `gates-only` policy |
| `great_cto-ely5.3` | PM implementation plan and planning gate | Only after architecture approval; no implicit approval by task creation |
| `great_cto-ely5.4` | Shared focus registry and read-only graph proposal | Only after planning approval; preserve pack admission and review floors |
| `great_cto-ely5.5` | Board projection and verification | Four directions, retained catalog, reasons, planned/observed distinction, privacy and host boundaries |
| `great_cto-ely5.6` | UI design contract | Architecture gate also waits for this artifact; no production UI edits |
| `great_cto-ely5.7` | Actual conditional execution | Separate approved slice after proposal validation; reuse existing controller entry points, preserve delivery quorum |
| `great_cto-ely5.8` | Matched domain benchmark | Fixed tasks, hosts/models and budgets; paid runs need separate approval |

First production increment is bounded to three components: shared registry,
read-only graph proposal, and board projection. Estimated production/test
surface is 10–15 files; architecture must refine the estimate. This is not a
rewrite of the orchestrator, the role catalog, or every host integration.

Proposed new modules are `scripts/lib/focus-registry.mjs` and
`scripts/lib/conditional-graph-proposal.mjs`. Existing board adapters consume
the shared result rather than maintaining another role-selection policy.
The controller remains responsible for admitted execution transitions.

## Verification and evidence

During architecture work, run only bounded offline baseline checks of existing
domain evidence/admission/benchmark contracts, specialist planning and review
floors. A passing baseline proves existing behavior, not this new feature.

Implementation acceptance must include negative controls for unknown risk,
missing evidence, mandatory reviewer retention, pack admission, cross-project
isolation, private overlay disclosure, and disagreement between the proposed
graph and recorded execution. Both host adapters must consume the same
versioned proposal contract. Native coverage limitations must remain explicit.

Baseline run on 2026-10-23: seven existing test files, 136 passed, 0 failed,
0 skipped, approximately 72.5 seconds. Command:

```sh
node --test tests/lib/domain-evidence.test.mjs tests/lib/domain-admission.test.mjs tests/lib/domain-benchmark.test.mjs tests/lib/domain-pilot-plan.test.mjs tests/lib/specialist-plan.test.mjs tests/lib/review-graph-floor.test.mjs tests/lib/controlled-specialists.test.mjs
```

Use focused feedback while editing. Freeze a clean candidate before the full
canonical gate; independent read-only review follows a green candidate gate.
The current canonical entry point is `bash scripts/ci-local.sh --e2e`.
It must be run against the frozen implementation candidate; its skipped and
NOT CHECKED categories remain explicit. It has not been run for this
architecture-only increment.
No percentage improvement claim is allowed without a paired benchmark on
equivalent tasks and budgets, with acceptance, severe regressions, rework,
human corrections, and cost per accepted task.

## Authority and rollback

This plan does not authorize paid model runs, activation of candidate packs,
default execution-policy changes, removal of specialist obligations, merge,
release, deployment, or installation. Runtime implementation is blocked by
architecture approval, then planning approval. An absent worktree-local
PROJECT.md is not permission to override the primary project policy.

Keep legacy routes and the full catalog available during migration. The first
increment is read-only, so rollback removes the projection without changing
execution receipts or controller state. Any future executable graph reduction
requires its own ADR, compatibility tests, approval, and measured comparison.
