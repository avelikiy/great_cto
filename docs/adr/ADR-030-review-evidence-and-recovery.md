# ADR-030: Shared review evidence and recoverable dual-host execution

**Date:** 2026-10-11
Status: Accepted design; first implementation slice in development, not released
Deciders: great_cto maintainers
Tracking: Beads epic great_cto-qnq6

## Context

This extends the [task cockpit](ADR-028-task-cockpit.md) and
[stage context packet](ADR-026-stage-context-packet.md) decisions.

Claude Code and Codex must produce comparable evidence without treating a
provider response, passing tests, review approval, publication and deployed
runtime as the same state. Existing cross-review logs, projectWork/taskInspector
read models, scoped-review-reuse, attempt-effects, Beads and updater remain the
integration points. This branch starts from released main bfeafd02; it does not
assume a separate canonical ledger is shipped merely because a Beads issue was
closed in another workstream.

Research inspiration: [Databasus review runner](https://github.com/databasus/databasus/blob/9ee25ed8f47b1b537468417e1bb52ed2d76218a0/.agent-hooks/review_gate.py)
at 9ee25ed8f47b1b537468417e1bb52ed2d76218a0, especially its review runner,
verification run ownership, recovery checks and temporary-file updater.
No upstream code, prompts, assets or hooks are copied or installed.

## Options and decision

| Option | Benefit | Cost / risk | Decision |
| --- | --- | --- | --- |
| Import another hook-driven review pipeline | Ready-made routing | Duplicate gates, changed authority, extra reviewer latency | Rejected |
| Add a host-neutral evidence contract to existing adapters | Comparable results and incremental adoption | Must preserve legacy consumers and distinguish unavailable evidence | Chosen |
| Treat model consensus as quality score | Simple dashboard | Correlated errors, no reproducible outcome proof | Rejected |

The contract is a pure projection, not an approval receipt or gate authority.
Missing evidence never becomes PASS. P0 blocks regardless of a claimed PASS;
P1/P2 retain the existing advisory policy. No policy threshold is silently
changed. Reviewer identity is adapter-declared metadata, not proof of isolation,
read-only execution, independence, authenticity or model-family diversity.

## Input and result contract

Version 1 input binds exact submitted UTF-8 diff/spec hashes and byte lengths,
optional task ID and source SHA to a SHA-256 digest. Null specification differs
from an empty specification. Raw source bodies are not persisted by this
binding. The digest does not certify that a supplied diff is complete or that
the worktree stayed unchanged during review.

Result normalization checks the expected input digest, adapter availability,
PASS/BLOCK verdict and bounded findings with repository-relative paths,
positive integer lines, P0/P1/P2 severity and concrete issue text. Invalid or
unavailable data yields not-checked with no verdict. This validates structure,
not the truth or diff membership of a finding. Findings require later verifier
evidence and existing gate admission checks.

The existing Codex/OpenRouter cross-review adapter adopts the legacy protocol
parser first. A verdict line must be exact and unique; conflicting or malformed
verdicts cannot approve. Concrete P0 findings may conservatively block when a
verdict is absent. Limits remain 24,000 diff characters and 4,000 specification
characters, but excess input is now explicitly not checked rather than silently
clipped. Empty diffs also yield SKIPPED, not a fabricated review approval.
Legacy log fields remain; review_input is additive and null on old call sites.

This slice does not add a Claude subprocess adapter, structured model output,
review admission authority or a live two-host review benchmark. Direct legacy
callers have no input pin unless they supply one; only the CLI binds its input.

## Delivery sequence and boundaries

The executable backlog and dependencies live in Beads, not this document.
great_cto-qnq6.1 establishes the contract and legacy adapter. The task-level
evidence drawer (qnq6.2) consumes existing project-scoped read-model observations
and keeps execution, verification, review, publication and runtime separate.
It must not poll external systems in a blocking page-load path.

Ownership fencing (qnq6.3) adds attempt ID and monotonic lease epoch to existing
controller transitions. Late completion from a prior owner is rejected. A lost
heartbeat never authorizes replay of an ambiguous external effect.
Crash drills (qnq6.4) depend on ownership and exercise interruption before edits,
after edits, before verdict and after externally visible effects. Resume must
preserve source, prompt, budget and approval bindings.

Update activation (qnq6.5) extends existing machinery with integrity checks,
isolated smoke, protocol compatibility, active-run protection and recoverable
rollback. Available, installed and running versions remain distinct.

No new database service, mandatory Docker, extra always-on reviews, automatic
merge, publication, installed-plugin replacement or board restart is authorized
by this design. Recovery drills start in isolated local fixtures. A production
rollout and an independent review are separate delivery stages.

## Consequences

Comparable observations become possible without inventing a quality percentage.
Strict parsing and oversized-input refusal can increase explicit NOT CHECKED
results; callers must surface them rather than weakening checks. A future
large-diff strategy needs explicit dependency-scoped partitioning and combined
coverage verification, not implicit prefix truncation.

The first slice is verified with deterministic unit and fake-provider CLI
tests. Native Claude/Codex runtime parity, UI acceptance, crash recovery and
rollback are not established by those tests.
