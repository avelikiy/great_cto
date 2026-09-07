# Codex host support contract

Status: implementation in progress. This is an acceptance contract, not a claim
that the complete lifecycle already works. Baseline: GitHub `ad5eb634`, v3.27.6.

## Meaning of complete support

A supported target must complete task intake, specialist implementation, real
checks, semantic review, bounded repair, required human approvals, release of the
approved artifact, and post-release verification. Recovery must not blindly
repeat an external operation whose outcome is unknown.

Native Claude plugin hooks are not a prerequisite. Their required controls must
be enforced by the controller, not merely requested in a skill prompt. Ordinary
Codex sessions outside this controller do not inherit its guarantees.

## Capability boundaries

| Capability | Current implementation | Acceptance evidence required |
| --- | --- | --- |
| GitHub plugin install, skills and MCP configuration | Available | Installation from the supported channel and matching runtime versions |
| Specialist prompts, guarded text proposals, joins and gates | Available | Graph and negative-path regression tests |
| Same-stage verifier rework | Bounded attempts with retained findings | Correction, exhaustion, serialization and artifact-drift tests |
| Cross-role repair and graph back-edges | Not complete | Dependency invalidation and repeat QA/security on the current candidate |
| General crash recovery | Fail-closed interruption marker only | Fault injection at persistence and execution boundaries |
| Dependency installation and write-requiring build/test | Not available | Isolated real executor; filesystem/network/secret-denial tests |
| Release and post-release verification | Manual handoff only | Adapter integration and live lifecycle evidence |
| Board/Beads integration | Separate from controller authority | Consistent projections; task closure cannot authorize release |

## Execution and release requirements

Build/test commands execute repository code. Command-name allowlists alone are
not a sandbox. An executor must enforce writable paths, network policy, secret
access, runtime limits and artifact collection. The semantic verifier cannot
override a failed mandatory deterministic check.

A ship approval binds the candidate digest, evidence set, destination and exact
operation. Release credentials belong only to the release executor. Worker
output cannot grant approval, add a destination or choose arbitrary credentials.

The initial release scope is a local isolated release adapter and a GitHub
Release adapter targeting an explicitly configured repository. Neither implies
npm, registry, Kubernetes or general production-deployment support.

Each adapter needs prepare, preflight, execute, reconcile and verify operations,
plus rollback where meaningful. Persist operation intent before execution.
Use idempotency and reconciliation, not an exactly-once promise. Irreversible
effects and any automatic rollback policy must be visible before approval.

## Evidence and acceptance

Retain attempt IDs, input and output digests, actual commands and exit codes,
test reports, verifier findings, gate approvals and release receipts. A model's
statement or a fake-worker graph test is not live release evidence.

Acceptance requires deterministic fault tests, real executor/adapter integration
tests, and real Codex runs for success, repair and release recovery. Record the
run ID, source revision, tool versions, approvals and resulting artifact for
each. Passing a few live runs proves those scenarios, not statistical reliability.

## First implementation slice

New runs allow three same-stage attempts by default (`--max-attempts 1..5`).
A structurally valid `rework` result with inspection evidence retains feedback
and queues the same role. Only a verified attempt creates a successful stage
result or gate. Exhaustion blocks; `unverifiable`, execution failures and
interruption remain fail-closed. Existing v1 runs without the new policy retain
one attempt. This is not general recovery or cross-role repair.

The installed stable GitHub plugin and an implementation branch are distinct.
Do not describe branch-only changes as released or active in the installed plugin.
