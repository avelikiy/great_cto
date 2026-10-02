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
and cancelled. `Stop`, `SessionEnd`, host exit 0 and controlled `done` never infer
user acceptance or completed work. A finished run remains waiting for acceptance
evidence. No verified/completed transition or decision-execution API is introduced.

Measured fields are first observed execution timestamp, milliseconds from task
creation to that observation, and transition-based interruption counts. Repeated
identical observations do not inflate counts. These are observations, not model
latency or end-to-end productivity measurements. A resume receipt records host
return/exit status; it does not prove semantic resume success. Cross-host research
outcomes and adaptive pipeline depth remain future work.

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
