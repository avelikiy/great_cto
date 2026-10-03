# ADR: Opt-in adaptive runtime gates

Status: Proposed, implemented for review. Date: 2026-10-02.

## Context

The operator requested fewer obligatory agents and repeated human pauses without
losing independent review. A role catalog is not a concurrent agent count. Native
Claude dispatch uses approval-level while the controlled Codex runtime historically
enforces all declared gates. The planning-only `effectiveGates()` is not a safe
runtime substitute: its T0 result can omit ship on unregulated projects.

## Decision and alternatives

Keep legacy defaults. Add an explicit operator opt-in to a shared runtime policy.
Do not replace approval-level with the planning-only table, remove roles from the
catalog, or disable verification. Those alternatives reduce visible ceremony but
can also remove checks or change existing projects without consent.

For gates-only, a known T0/T1 diff may remove the architecture human pause. The
architect itself still runs. Product and import remain; ship is required for every
known assessment even if the supplied level is auto. Strict, expert and
step-by-step retain their architecture pause. Regulated security/compliance floors
survive. Known T2 adds security/compliance/ship. Unknown evidence keeps every
declared gate, not an invented low-risk classification.

Assessment reads tracked changes (staged and unstaged, including rename source)
and nonignored untracked files relative to an explicit pinned Git commit. It
ignores worker tier labels and caller-supplied file lists. Sensitive paths include
auth, payments, migrations, permissions, infrastructure, dependency locks, agent
prompts and pipeline configuration. Ten behavioral files escalate to T2.
Fingerprints bind base, paths, current bytes, file modes, deletions and tier.
Unsupported artifacts, empty changes and failed Git reads are unknown.

This is a conservative path heuristic, not a proof of semantic safety: a payment
algorithm can live in an innocently named file. Opt-in does not authorize external
writes, new write-connectors, provisioning or deployment. Existing operation
authority, verifier, joins, scanners, release policies and receipts still apply.
High-risk operations must not rely solely on filename classification.

## Host integration

Codex start accepts an operator-owned `--gate-policy` JSON file outside the target
workspace: `mode=adaptive`, explicit `level`, `archetype`, and `base`. The base is
resolved once to a commit; policy is copied into controller state outside worker
scope. The current diff is reassessed at advance. An escalation to T2 or unknown
after a skipped gate blocks the run; start a newly assessed run. Existing runs
with no policy keep their all-declared-gates behavior. Unknown custom gates stay
active. A custom graph missing the T2 floor blocks rather than silently proceeding.
Controlled adaptive runs reject ship-only until its mandatory product briefing
exists in that controller; native Claude keeps its existing briefing behavior.

Native Claude requires operator environment `GREAT_CTO_ADAPTIVE_GATES=1` and
`GREAT_CTO_CHANGE_BASE=<commit SHA>`. PROJECT.md still chooses approval-level and
archetype. Before reducing a pause, the hook durably records the exact assessment
in the existing stand-down log; a failed append restores the pause. The read-only
position view uses only a matching recorded assessment and otherwise remains
conservative. Known activity logs are excluded from classification, preventing a
stand-down log from escalating its own diff. Native dispatch is advisory, not a
sandbox or controller-owned run; it does not retroactively rewind earlier stages.

## Plan and acceptance

Work is tracked only in Beads epic `great_cto-p4o9`:

- `great_cto-p4o9.1`: shared opt-in gate policy, host wiring and boundary tests.
- `great_cto-p4o9.2`: shared atomic concurrency leases, delegation depth, crash
  recovery/fencing and telemetry across both hosts, including verification streams.
- `great_cto-p4o9.3`: specialist activation by risk and artifact/dependency-scoped
  review invalidation. Never transfer stale PASS onto changed code.
- `great_cto-p4o9.4`: representative matched study of quality, overhead and escaped
  defects before default enablement or any improvement-percentage claim.

This first increment does not reduce agent count, implement global budgets,
claim semantic risk completeness, or replace full review. Evaluate quality and
elapsed time separately before enabling by default. Acceptance requires legacy
regressions, low-risk and regulated cases, untracked/rename/bulk observations,
unavailable evidence, failed audit recording, model-label injection and Codex
escalation/ship-gate tests. No merge or release approval is implied.
