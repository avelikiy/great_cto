# ADR: Shared agent execution admission budget

Status: Proposed, implemented for review. Date: 2026-10-02.

## Context and decision

The previous increment reduced human pauses, not agent launches. Per-host limits
also do not bound a mixed pipeline: Codex workers, Claude workers and independent
verifiers must consume the same capacity. Catalog size is not execution count.

Use a same-machine filesystem ledger outside worker projects, enabled only by an
operator-owned private policy file. Do not change installed defaults, delete
specialist roles or treat missing dollar-cost data as measured spend. All hosts
must use the same store and limits; mismatching policy fails closed.

The policy has three bounds: global simultaneous admitted calls, total admissions
for a shared logical run, and delegation depth. v1 supports depth 1 only. A limit
does not replace a reviewer or let failed verification reach a release gate.

Alternatives rejected: independent per-host counters (oversubscription), counting
implementation only (unbounded review/research), and TTL lease expiry (a slow or
orphaned worker may still be running). This is admission control, not a sandbox,
cross-machine distributed scheduler or dollar-spend estimator.

## Protocol

`GREAT_CTO_AGENT_BUDGET_FILE` points to an absolute operator-owned JSON file outside
the target workspace, with private permissions. Example values, not new defaults:

```json
{"maxConcurrent":3,"maxCallsPerRun":24,"maxDepth":1,"runId":"workflow-2026-10-02-a"}
```

`runId` is operator-owned and shared between hosts. It is hashed as the logical
run key, independent of worktree/root, so another worktree does not reset the call
cap. Rotate runId deliberately for a new logical run, not to bypass an exhausted
budget. The default common store is `~/.great_cto/agent-execution`; an absolute
`GREAT_CTO_AGENT_BUDGET_STORE` override is for controlled/test deployments. Giving
hosts different stores partitions the budget and is unsupported.

The private ledger contains policy digest, limits, monotonic fence counter,
active leases, admitted-call counts, retired call identities and a bounded tail
of admission/release/denial events. These are admissions, not measured model
completions, costs or tokens. Denials do not increase the admitted-call count;
completed, failed and reconciled admissions are not refunded.

Transitions are serialized by atomic mkdir of a transaction lock. The ledger is
written to a private temporary file, fsynced, then atomically renamed before the
lock is released. A wave reserves all its worker slots or none. Repeated hooks
for an active call reuse the same token/fence without charging twice. Retired
call identities cannot be reused, preventing a delayed completion from releasing
a newer reservation with the same host tool ID.

```text
request -> validate limits/depth/identity -> atomic admission -> execute
    |                 |                         |
    +-- denial -------+                         +-> exact-token release
                                                  (count retained)
interruption -> lease retained -> operator confirms stopped -> reconciliation
```

Release requires the exact token, fence and run key. A result returning after its
lease was reconciled fails fencing before the controller can accept that result.
Unknown/corrupt state, policy mismatch and lock acquisition failure refuse new
admission. No expiry or PID-only reclamation of execution slots is performed.

## Host coverage

Controlled Codex pipeline start freezes policy and store in controller state.
Every dispatched worker and independent verifier consumes an admission, including
Claude-routed workers and both sides of a parallel review wave. Slots are released
when runner promises finish, before result acceptance; stale fencing prevents
acceptance. A cap of one disables the parallel-pair path and uses the existing
serial stage path. Gates, joins, receipts and verifier requirements are unchanged.
These bounds cover controller launches, not arbitrary third-party calls to runner
libraries or the Codex desktop app's unrelated native delegation tools.

Native Claude reserves in PreToolUse on Agent/Task, not SubagentStart. The latter
cannot block creation. SubagentStop can be blocked by another completion hook,
so it is not a safe point to release execution capacity. v1 requires operator
environment `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`; background requests, named
agents/team launches and nested calls identified by agent_id are denied. Slots
release only on successful foreground PostToolUse for the exact session/tool ID.
An error, failed permission/tool call or interrupted hook retains the slot for
reconciliation. Other hooks denying a previously admitted call may therefore
leave a conservative reservation rather than falsely claim it ended.

Native semantics checked against the official references:
[hook lifecycle and decision control](https://code.claude.com/docs/en/hooks),
[foreground/background precedence](https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background).

Native hooks are cooperative same-user enforcement, not a security boundary
against a process deliberately changing its environment/configuration, spawning
an uninstrumented CLI via Bash, using context-fork skills or other launch APIs.
Full background/team/fork lifecycle coverage is follow-up work. Enabling a policy
does not constitute permission to launch those unsupported paths.

## Recovery and operations

Inspect with `node scripts/agent-execution-budget.mjs status --dir <project>`.
After independently confirming a particular execution has stopped, use
`reconcile --token <token> --fence <fence> --confirm-stopped --dir <project>`.
This invalidates the old identity, not its admitted-call charge. Never reconcile
on age alone. An old process may still exist even when its controller PID died.

For a crashed transaction lock with an intact owner record, `recover-lock --token
<owner-token> --confirm-stopped --dir <project>` additionally requires the recorded
lock-owner PID to be absent. A reused/live PID refuses recovery. A missing/torn
owner record needs manual operator investigation; the implementation will not
guess that the lock is safe to remove. Limits cannot silently change within an
existing ledger. Operator migration after quiescing hosts is separate work.

## Validation and remaining scope

Tests cover competing host processes, all-or-none waves, replay, call cap/depth,
policy mismatch, fenced stale output, explicit crash reconciliation, native hook
subprocess decisions, controller worker/verifier accounting and preserved gates.
No live quality improvement or reduced dollar cost is inferred from these tests.
Risk-driven specialist selection remains `great_cto-p4o9.3`; that is the next
mechanism for avoiding unnecessary work rather than merely bounding it.
