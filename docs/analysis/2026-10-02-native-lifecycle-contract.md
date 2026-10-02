# Native lifecycle completion boundary

Date: 2026-10-02. Scope: PR167 worktree, not installed plugin.

## Observed platform contract

Primary sources checked on this date:
[hooks reference](https://code.claude.com/docs/en/hooks),
[tools reference](https://code.claude.com/docs/en/tools-reference).

An Agent tool response distinguishes completed from async_launched and supplies
agentId. A successful tool return therefore does not necessarily mean agent
execution ended. SubagentStart supplies agent_id and agent_type but its documented
schema lacks parent tool_use_id, and that event cannot prevent creation.
SubagentStop can continue the agent through other hooks. Internal feature agents
can emit that stop event without a normal Agent launch.

SendMessage can resume agents. Workflow can orchestrate agents in the background.
The documented TaskOutput tool is deprecated in favor of reading an output file;
such a read does not by itself certify execution termination. These surfaces need
identity and lifetime evidence before admitting them under a shared budget.

## Implemented correction

The native budget pre hook now checks actual PreToolUse event identity. The post
hook releases only on PostToolUse with status completed and a valid agentId, plus
the existing foreground environment and exact session/tool reservation. Missing,
unknown, async, running, failed or malformed completion retains capacity and asks
for reconciliation. Stop/teammate-idle/tool-failure events cannot release it.
Budget counts are not refunded. Existing async/team/nested denial is unchanged.

The subprocess regression checks retained capacity also blocks a Codex admission,
not just that a warning was printed. The focused budget suite passed 15/15. An
expanded budget/mixed-host/manifest/scoped-evidence group passed 57/57, zero skips.
Pinned HOL scanner passed at83: zero new critical/high; existing35 high retain the
same baseline. These are source/hook subprocess checks, not an authenticated
native model lifecycle run. Claude auth status still reports loggedIn:false.

## Required evidence for full native support

Tracked in Beads great_cto-p4o9.2.2. Completion requires actual payload capture,
unambiguous prelaunch reservation to host-agent generation binding, terminal
evidence independent of stoppable hooks, duplicate/out-of-order/resume fencing,
alternate entry-point handling and quiescent ledger migration. A start observer
that notices a new agent after creation is not prelaunch admission control.

Do not enable asynchronous release from absence in a background list, output-file
existence, elapsed time, controller PID death or SubagentStop. None demonstrates
that another hook/process cannot continue that specific generation. Platforms or
launch paths that cannot provide authoritative lifecycle/interception must remain
explicitly unsupported until an adapter/upstream contract supplies that evidence.
Refusing those paths is safety coverage, not completed functionality. No native
parity, release, installed-artifact or quality-uplift claim follows from this fix.
