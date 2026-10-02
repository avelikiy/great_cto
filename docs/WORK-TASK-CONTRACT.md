# Shared work task contract v1

Status: implemented in source; publication and installed-runtime verification are separate.

## Identity and authority

A task persists the user's goal, optional acceptance criteria, immutable host,
canonical project identity, explicit run/session links, revision and operation
receipts. Run and session IDs remain owned by their host. Unlinked legacy state
is not automatically adopted. Shared metadata does not authorize edits, approve
gates, release products or replace the controlled verifier.

The operator store is `~/.great_cto/work-tasks` (`GREAT_CTO_TASKS_DIR` override).
It must be outside the worker project, including after resolving symlink parents.
Directory permissions are 0700, task files 0600; symlink task files are refused.
Writes use temporary files and atomic rename under per-record write locks.
Malformed records degrade selection and block execution. Public projection omits
canonical root, request digests, lease tokens and raw observation history. Goals
and criteria are intentionally visible on the local board and must not contain secrets.

## User operations

```bash
great-cto run 'Export CSV' --accept 'Export authorized rows only'
great-cto run 'Export CSV' --host codex --allow src,tests --accept 'Export authorized rows only'
great-cto status --task TASK_UUID --json
great-cto resume --task TASK_UUID --revision REVISION --operation OPERATION_UUID
```

`--task` selects the exact project task and infers its stored host unless an
explicit host conflicts. Status invokes no model. A start receipt includes the
canonical request; repeating `--operation` returns its receipt without dispatch.
A changed request with the same key fails. Resume checks revision before reserving
an operation; replay validates the original request even after revision changes.
A running receipt returns an unknown exit result (code 2), not a retry permission.
Legacy controlled run UUID selection remains available without task receipt flags.

A project lease excludes concurrent managed operations across both hosts. The
controller accepts a CLI handoff only with the parent's token and PID. The token
is removed before worker dispatch. Controller per-run locks and approval checks
remain in force. Ownership spans the subprocess lifetime; exceptions finish the
receipt before release. Creation and replay are rechecked under the lease.

A crash may leave a running receipt or lease. Recovery is deliberately manual:
inspect the private task/owner records, establish whether the recorded host still
runs, reconcile its actual outcome, then remove only the verified orphan lock.
PID absence, elapsed time and missing hooks do not prove a safe retry. No automatic
lease expiry or cross-host takeover is implemented.

## Native Claude and controlled execution

Managed Claude launches preallocate `--session-id`; resume uses that exact
`--resume` ID. `/start` and criteria are passed as data arguments, with native
interactive permissions. Hooks record only exact linked session observations.
An explicit direct `/start` or `/great-cto:start` event can register an observed
native task (`managed=false`). Ordinary chat does not infer a task goal. Observed
sessions have no full-lifetime CLI lease and cannot be resumed through the managed
CLI; continue them in the native host. Existing sessions stay unlinked.

Controlled starts persist task ID and acceptance criteria in run state. Execution
and the independent verifier receive criteria as task data. Run transitions update
the shared projection, including pending host decisions and role verdict evidence.
Existing approval tokens, stale approval protection and bounded rework remain host
responsibilities; the shared layer does not reduce gate count automatically.

## State and evidence

Implemented phases: accepted, working, needs_decision, blocked, waiting, unknown,
cancelled, verified and completed. `Stop`, `SessionEnd`, host exit 0 and controlled `done` never infer
user acceptance or completed work. A finished run remains waiting for acceptance
evidence. Verified/completed require the explicit operator evidence described below; no
browser decision-execution API is introduced.

Measured fields are first observed execution timestamp, milliseconds from task
creation to that observation, and transition-based interruption counts. Repeated
identical observations do not inflate counts. These are observations, not model
latency or end-to-end productivity measurements. A resume receipt records host
return/exit status; it does not prove semantic resume success. Research outcomes and resume progress evidence are implemented in stage 3 below.
Adaptive pipeline depth activation remains gated on real measurements and review.

The board overlays shared tasks only through explicit links, displays goals and
criteria, and prepares revision-bound resume commands where ownership and host
state permit. It continues to refuse `POST /api/work`; browser execution and
native decision controls are separate work.

## Validation boundaries

Tests cover private storage, canonical scope, corrupt state, receipt replay and
conflicts, stale revisions, cross-host exclusion, forged handoff, exact session
binding, observation deduplication, and refusal to infer acceptance. A real CLI
fixture exercises a subprocess with native hook events and exact-session resume.
Fixtures do not prove execution against a paid model or an installed plugin.

## Stage 3: decisions, accepted outcomes and measured resume

Stage 3 completes the shared backend contract. Daily entry remains run/status/resume;
advanced operator operations live under the existing `task` command:

```bash
great-cto run 'Investigate CSV authorization' --intent research --accept 'Report the authorization findings'
great-cto run 'Investigate CSV authorization' --host codex --intent research --allow docs --max-attempts 2 --accept 'Report the authorization findings'
great-cto task work decisions --task TASK_UUID --dir PROJECT
great-cto task work approve --task TASK_UUID --decision DECISION_ID --revision N --operation OPERATION_UUID --dir PROJECT
great-cto task work verify --task TASK_UUID --revision N --operation OPERATION_UUID --evidence EXTERNAL_PRIVATE_JSON --dir PROJECT
great-cto task work complete --task TASK_UUID --revision N --operation OPERATION_UUID --dir PROJECT
great-cto task work metrics --dir PROJECT --baseline EXTERNAL_PRIVATE_JSON
```

Research is explicit, never inferred from a small diff or a keyword. Controlled
research enters project-auditor, writes only beneath docs/research/reports and
cannot supply a release policy. Native research invokes /audit; Claude's own
interactive permissions remain authoritative. max-attempts (1..5) bounds controlled
stage retries; native retry authority remains host-owned. Existing rewind, stale
approval and verifier limits are preserved.

Pending decisions have stable opaque IDs bound to their exact host proposal,
receipt and token generation. Shared approval reserves an idempotent operation and
project lease; the controller rechecks the operation, decision identity and actual
tree under its run lock. Tokens stay private and never appear in task projection
or copied commands. Approve and resume remain separate. Release approval still
uses the release controller. Native Notification and dispatcher gate events attach
only to an explicitly linked session. Stop and ordinary input do not approve a
pipeline gate. Native gate receipt drift is reported as stale; native permission
and pipeline decisions are resolved in their native session, with no remote bypass.

Verified/completed transitions are now supported through explicit operator
evidence. They do not follow automatically from a verifier or process exit.
An evidence file is a private regular JSON file outside the worker project, <=64
KiB, with this structure:

```json
{
  "taskId": "TASK_UUID",
  "goal": "exact stored task goal",
  "revision": 7,
  "kind": "research",
  "goalSatisfied": true,
  "criteria": [{
    "index": 0,
    "text": "exact stored criterion",
    "state": "passed",
    "evidence": "What the operator actually checked"
  }],
  "artifacts": [{"path": "docs/report.md", "sha256": "SHA256_OF_ACTUAL_BYTES"}]
}
```

Every stored criterion must have ordered passing evidence; an empty acceptance
list cannot verify. Actual artifact bytes, safe paths and the Git receipt are
checked. Research accepts report artifacts only. Controlled runs must be done,
without active workers or pending decisions; any release additionally needs the
controller's verified publication and passing smoke result. An unmanaged native
session must have ended. Completion rechecks artifact hashes and the exact receipt.
New activity invalidates an uncompleted verified outcome. Completed historical
tasks are not reopened by later chat events.

This proof is explicitly labelled operator-attestation. File hashing establishes
identity; the operator supplies the semantic claims about criteria and goal.
Neither the board nor a worker-written file inside the project can manufacture
that attestation. This contract does not claim production service deployment from
local artifacts or a GitHub release.

Resume receipts record progressed/waiting_decision/blocked/unobserved. Progress
requires a new linked verified controlled stage or a new native stage result with
matching receipt and exact session binding. Native stage progress does not imply
independent verification. Exit zero, UserPromptSubmit and Stop alone remain
unobserved. Reports expose known and unknown samples separately.

Metrics group by host and intent: observed starts, median time-to-observed-start,
interruptions by reason, technical interruptions, known resume progress and
verification rework. Baseline comparison requires matched cohorts, at least 20
tasks and 5 known resumes per cohort by default. Missing data produces
insufficient_evidence. A measured improvement is a candidate for review; it does
not auto-approve gates or change authority. Production defect evidence and policy
review are still needed before activating reduced pipeline depth.

The board now shows explicit research/delivery outcomes, bound host decisions,
copy-only approval commands, completed task history and cohort measurements in its
snapshot. POST /api/work remains refused; browser execution and complete decision
card presentation belong to stage 2. Existing v1 records remain readable and their
legacy operation digests can replay without adopting new authority.
