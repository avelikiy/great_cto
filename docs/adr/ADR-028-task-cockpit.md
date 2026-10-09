# ADR-028: Task cockpit without a second controller

**Status:** Accepted for read-only projection and committed-task CLI publication; autocommit and browser mutation stages proposed
**Date:** 2026-10-09
**Deciders:** Product owner request; implementation constrained by existing host authority

## Context

The board already reads task metadata, controlled runs, decisions, turn snapshots and project activity. Users still need to assemble execution status and next actions across views. A terminal dashboard can improve visibility but arbitrary live input would invalidate the controlled pipeline's frozen inputs and verification evidence.

## Decision

Keep the task/controller stores authoritative. Extend the existing project-scoped work projection with a bounded, content-free activity inspector and display stage, acceptance, recorded evidence, blockers and the next supported action together. Link activity exclusively through explicit run/session IDs, never title or role similarity. Successful process events are observations, not verification verdicts. Missing, unreadable and partial history remain distinct.

## Options considered

| Option | Complexity | Safety | Consequence |
| --- | --- | --- | --- |
| Another orchestration service | High | Competing state/lease owners | Reject: duplicated transitions and recovery |
| Raw interactive terminal in task view | Medium | Input can invalidate verification | Defer to an explicitly separate manual mode |
| Existing projection plus controller commands | Low for read side; medium for mutations | Retains one authority | Selected |

## Trade-off analysis

Reuse the board's existing refresh and project isolation. The inspector displays at most 20 linked events from the latest 200 project records. A busy unrelated session can displace older linked events; absence in this window is not evidence of inactivity. No raw prompts, output, paths or permission tokens are added to the projection. This first slice is refreshed observation, not a PTY or guaranteed real-time process monitor.

## Consequences

The board gains useful diagnosis without new execution permissions. Stage and evidence remain explicit. Task history stays readable when events are absent. Controller mutations require revision/content-bound approvals, idempotent partial-failure recovery and audited attempt transitions before exposure in UI.

## Delivery sequence

Tracked in Beads epic `great_cto-3kx7`: read-only cockpit (`.1`), revision-bound commit/push/PR publication (`.2`), audited controller intervention (`.3`), linked PR/CI evidence (`.4`). Publication never implies merge, release or deploy authorization. Unsupported runner capabilities must remain disabled, not simulated. No installed plugin update is part of this source change.

## Committed-task publication protocol

The first publication slice supports managed, verified delivery tasks on a fully clean repository-root feature branch, with a current verification receipt and an explicit publication path scope. Preview is read-only and binds task revision, GitHub origin, base/head/tree, all historical touched paths and a digest of all outgoing commit patches. It rejects protected heads, merge commits, over 100 commits, over 200 paths, binary patches and previews exceeding 2 MiB. Scan every outgoing commit, not only the final diff: a reverted credential still ships in history.

The board renders preview and an explicit host CLI confirmation. Git/receipt inspection runs in one bounded child worker off the board event loop. GET does not authorize or execute publication. CLI publication takes the existing project lease, rejects pending host work, persists original approval and checkpoints externally in task metadata, pushes an immutable SHA refspec with normal hooks enabled, verifies remote SHA and finds or creates a matching open draft PR. Existing remote branch content must match exactly; no force push or overwrite is permitted. A moved base invalidates publication. A digest is a content binding, not a bearer permission token; running the confirmation command is the authorization action.

State checkpoints are `prepared → pushed → pr-linked`. Repeated confirmation returns the original result. Persist `createIssued` before a PR creation request. After a timeout, retry only searches for the PR; absent/ambiguous results require reconciliation, never a blind second create. A task mutation outside publication checkpoints revokes retry authority. PR identity must match repository, exact head SHA, head/base branches, open and draft state. Task acceptance remains verified, not completed or released, merely because a PR exists.

An absent remote head is created with `--force-with-lease=refs/heads/<branch>:` (empty expected value). Despite Git's flag name this is create-only compare-and-swap: any concurrent branch creation is rejected, even when its SHA would permit a normal fast-forward. Never use `--force` or a nonempty lease to overwrite existing content. Matching existing remote SHA needs no push. Local Git hooks still run.

This slice does not implement dirty-tree autocommit, browser-side approval POST, SSH aliases, arbitrary forges, or cancellation/reapproval of changed unfinished publication. Native tasks without stored write scope can use explicit CLI `--allow` during preview and confirmation; the board does not invent scope. These limits are tracked in `great_cto-3kx7.2.2`. GitHub itself has no cross-process transaction with local task metadata: immutable refs, guard revisions and conservative ambiguous-outcome handling limit races, but do not replace remote branch protection or independent CI/review.
