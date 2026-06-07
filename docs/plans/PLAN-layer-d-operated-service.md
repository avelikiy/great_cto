# PLAN — Layer D: operated end-to-end autopilot service (rcm pilot)

Status: in progress · Created 2026-06-07

Turn the autopilots from "flows that run to a gate" into a **real operated service**: a durable run
that pauses at the human checkpoint, waits for a licensed human to **sign in an inbox**, then
**resumes and executes the irreversible action** (the write). Built once on `rcm`, reusable by all 16.

## The gap we're closing

Today `runFlow` walks steps and pauses at the gate — in-memory, one-shot. Layer D adds:
1. **Durable run state** — a run persists across processes; survives restart.
2. **Human-gate inbox** — pending gates listed; a named human approves/rejects; the run resumes.
3. **Post-gate write** — the irreversible step executes only AFTER approval (the 837 is submitted).
4. **Admin console** — board endpoints + an Autopilot inbox page to sign gates.

## Components

### 1. Durable orchestration — `scripts/lib/run-store.mjs`
Runs persisted to `.great_cto/autopilot-runs/<runId>.json`.
- `startRun(vertical, {mode})` → runs to the first gate, persists, returns run (`status: 'awaiting-approval'`).
- `getRun(id)`, `listRuns({status})`, `pendingGates()`.
- `approve(id, who, note)` → resumes past the gate, executes remaining steps incl. the irreversible
  write, persists (`status: 'completed'` or next `awaiting-approval`).
- `reject(id, who, note)` → `status: 'rejected'`, no write happens.
Every transition appended to an immutable `audit[]` (who · what · when).

### 2. Resumable runFlow — `scripts/lib/flow-runner.mjs`
`runFlow(flow, { mode, startAt, approvedGates })`:
- a gate ∈ `approvedGates` → recorded `approved`, run continues (no pause);
- an irreversible step executes ONLY if its protecting gate ∈ `approvedGates` (else blocked/gated).
This models the whole lifecycle: first run pauses (gate unapproved) → approve adds the gate → resume
runs the gate + the irreversible write. The v2.43.0 safety invariant is preserved end to end.

### 3. CLI — `scripts/autopilot.mjs`
`start <vertical> [--live]` · `inbox` · `show <runId>` · `approve <runId> --by <who>` · `reject <runId>`.

### 4. Write connector
rcm's post-gate `clearinghouse:submit-837` already builds a real X12 837P and POSTs when
`GREATCTO_CLEARINGHOUSE_URL` is set. On approval the resume actually invokes it (the write).

### 5. Admin board — `packages/board/`
- server.mjs: additive endpoints `/api/autopilot/runs` (GET), `/api/autopilot/start` (POST),
  `/api/autopilot/approve` (POST), `/api/autopilot/reject` (POST) — backed by run-store.
- a focused **Autopilot inbox** console page (`public/autopilot.html` at `/autopilot`): pending
  gates with the case, the named signer, and Approve / Reject buttons. (Kept separate from the
  220 KB SDLC board to ship safely; links from the board nav.)

## Acceptance

- `autopilot.mjs start rcm` → run persisted, `awaiting-approval` at `gate:coding-signoff`.
- `autopilot.mjs approve <id> --by "CPC coder"` → resumes, `clearinghouse:submit-837` runs, run
  `completed`; audit trail shows the signer. Survives a process restart (durable).
- Reject → run `rejected`, no 837 submitted.
- Board `/autopilot` lists the pending gate and signs it; lib tests cover store + resume.

## After the pilot

Roll the same console to the other 15 (they already pause at their gates). Add multi-tenant
isolation + billing/SLA per run as the next layer.
