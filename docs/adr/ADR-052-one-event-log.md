# ADR-052: One ordered event log for what every engine observed — authority stays where it is

**Date:** 2026-11-14
**Status:** Proposed
**Deciders:** owner (gate:arch); independent code and security review before each phase merges
**Extends:** [ADR-040 controller-recorded execution graph](ADR-040-recorded-execution-graph.md) (folded in: its trace becomes this log's controller stream)
**Related:** [ADR-021 live agent events](ADR-021-live-agent-events.md) · [ADR-046 verdict seals](ADR-046-verdict-seals.md) ·
[ADR-051 verdict authority](ADR-051-verdict-authority.md) · [plan](../plans/PLAN-archon-lessons.md), item 3

## Context

What happened in a run is spread over seven stores, written by three engines, with three orders:

| Store | Writer | Order | What it is |
|---|---|---|---|
| `.great_cto/events.jsonl` (ADR-021) | native hooks via `agent-events.mjs` | append order, one rotation at 5 MB | facts: agent start/stop, tool, denied, hint |
| `.great_cto/pipeline-runs.jsonl` | `pipeline-dispatcher.mjs` via `pipeline-journal.mjs` | append + fsync | every dispatcher decision, including "nothing" |
| `codex-runs/*.json` → `executionTrace` (ADR-040) | controller (`codex-pipeline.mjs`, `execution-trace.mjs`) | node/edge ids inside one run JSON | causal graph of one controlled run |
| `.great_cto/verdicts/<role>.log` | `log-verdict.sh` → `verdict-record.mjs` | per-role file | **authority**: sealed verdicts gates and deploys read |
| `.great_cto/verdict-attestations.jsonl` (ADR-051) | `verdict-attest.mjs` | append | sealed attestation of who wrote a verdict |
| `work-tasks/*.json` | `work-task.mjs`, `work-tasks.mjs` | one file per task | task phase, decisions, publication |
| `.great_cto/tasks.db` → `events` | `task-backend-sqlite.mjs` | `seq` | task mutations — only in projects that opted into the SQLite backend |

Three costs follow, each observed rather than predicted:

- **No total order.** "Did the qa verdict land before or after the gate opened?" needs a join of
  three files by wall-clock timestamp from different processes. ADR-040 refuses to infer causality
  from timestamps, rightly, and so the board's native-host runs have `topology: unknown`.
- **Every reader re-implements parsing and failure states.** `receipt.mjs`, `merge-readiness.mjs`,
  `hint-report.mjs`, `outcomes.mjs` and the board routes each read their own files and each decide
  what "missing", "unreadable" and "empty" mean.
- **Native runs have no execution graph.** ADR-040 covers the controller only; the hooks already
  see the same facts (agent start, verdict written, gate decided) and write them to three places.

Archon (v0.14.0) keeps one append-only event table with `event_order`, derives resume state from it,
and stops a stale executor with a CAS `execution_claim`. The first half is what is missing here. The
second half is an authority change, and ADR-040 already rejected "a new event store / orchestrator"
because it "adds competing state and recovery authority". That objection holds and shapes this ADR.

## Decision

### 1. One log, observational only

A single append-only SQLite table is the ordered record of what every engine observed. It is
**never an authority**: it does not approve, resume, schedule or publish. Every authoritative record
stays where it is — sealed verdict logs for gates and deploys, run JSON for the controller, the task
store for tasks — and an event that mirrors one carries the **digest** of that record (as ADR-051's
attestations already do), so a reader can check the event against its source and never needs to
trust the event alone.

### 2. Where it lives: `.great_cto/events.db`, not `tasks.db`

`tasks.db` exists only in projects that chose the SQLite task backend; Beads and `tasks.md` projects
have none, and the log must exist in every project. So: its own file, `node:sqlite`, WAL mode,
`busy_timeout`, one `BEGIN IMMEDIATE` per append. Gitignored with its `-wal`/`-shm` siblings
(`state-gitignore.mjs`), like `events.jsonl` today. Created only by an explicit init path or the
first append inside a great_cto project — the same `isProjectState` rule `agent-events.mjs` keeps,
so a hook in a foreign repository still writes nothing.

```sql
CREATE TABLE events (
  seq      INTEGER PRIMARY KEY AUTOINCREMENT,  -- the order: commit order across processes
  ts       TEXT    NOT NULL,                   -- writer's clock; display only, never ordering
  stream   TEXT    NOT NULL,                   -- hook | dispatcher | controller | verdict | attestation | task
  kind     TEXT    NOT NULL,                   -- per-stream allowlist
  run      TEXT,                               -- controller run id or native pipeline run id
  session  TEXT,
  agent_id TEXT,  agent_type TEXT,             -- harness identity when the host gives one
  subject  TEXT,                               -- stage, role, task id or gate name
  ref      TEXT,                               -- sha256 of the authoritative record mirrored, if any
  facts    TEXT    NOT NULL DEFAULT '{}',      -- allowlisted, typed JSON; never content
  v        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX events_run ON events (run, seq);
CREATE INDEX events_kind ON events (stream, kind, seq);
```

### 3. Facts, never content — the ADR-021 rule, kept

Each stream has an allowlist of `facts` keys with types, enforced in one writer module
(a new `event-log` module in `scripts/lib/`, written in P1). Command text, file contents, prompts, tool output, tokens and absolute
paths never enter. Recording never breaks a hook or a dispatch: every failure returns
`{ok:false, why}`. Nothing is sent anywhere; `docs/PRIVACY.md` does not change.

### 4. Readers say which of four things they found

`events` (rows), `none` (no file — not "idle"), `unreadable` (a file it could not open — not "zero"),
`unavailable` (this Node has no `node:sqlite`). The last one is why engines move to `>=22.13` in the
same change set as this ADR: below that the log is absent by construction, and a reader must say so
rather than look empty.

### 5. Phases — each its own PR, each reversible on its own

| Phase | What | Exit condition | Size |
|---|---|---|---|
| **P1 dual-write** | a new `event-log` writer module; `agent-events`, `pipeline-journal`, the verdict writer, `verdict-attest` and `execution-trace` also append. Legacy files unchanged, every reader unchanged. `event-log --parity` compares log and legacy files per run. | parity holds on the repository's own runs and the e2e fixtures; append p95 ≤ 5 ms measured on the hook path | ~2 days |
| **P2 readers switch** | board stream, execution graph (now for native runs too), merge-readiness, `receipt --verify` read the log; on `none`/`unreadable`/`unavailable` they fall back to the legacy file and say so. | a release with both paths and no parity alarms | ~2 days |
| **P3 legacy as views** | `events.jsonl` and `pipeline-runs.jsonl` stop being written; `export` regenerates them on demand. Verdict logs, attestations and run JSON stay authoritative and are **not** retired. | owner decision at that time | ~1 day |
| **P4 authority** | resume derived from events; CAS `execution_claim(run, executor, epoch)` so a stale executor cannot overwrite a new one. | **separate ADR and gate:arch** — this is the competing-authority question ADR-040 rejected, and it is not decided here | — |

### 6. Retention

Tool events are the bulk: one per tool call. A busy native run is on the order of 10³ events at
~300 bytes, so ~0.3 MB a run — an estimate to replace with P1's measurement. Rule: decision, verdict,
attestation, gate and controller events are kept; `hook`/`tool` and `hint` events older than 30 days
are pruned in one transaction at most once a day, inside an append. A cap of 256 MB triggers the same
prune early and says so in the log.

## Options considered

| Option | Total order | Native execution graph | New authority | Cost |
|---|---|---|---|---|
| Status quo, seven stores | no | no | no | readers keep diverging |
| Promote `events.jsonl` (append-only file, one more writer each) | per file only, no `seq` across writers | partial | no | no SQLite dependency; rotation resets the board's byte-offset cursor |
| **One SQLite log, observational (chosen)** | yes (`seq`) | yes | no | Node ≥ 22.13, one more file |
| Event-sourced store as the authority (Archon) | yes | yes | **yes** | rewrites recovery; ADR-040's objection |

## Consequences

- A native run gets the same execution view a controlled run has, from the hooks' own facts.
- One reader module replaces five ad-hoc parsers over P2; their failure states become one vocabulary.
- One more local file per project, gitignored. No data leaves the machine.
- Node below 22.13 runs the plugin without the log and every reader says `unavailable`.
- **Easy to undo:** P1 and P2 are additive; deleting `events.db` and the writer calls restores the
  present behaviour, because no legacy file stops being written before P3.

## What this does not do

It does not make anything more trustworthy than its source: an event mirroring a verdict is only as
good as the verdict's seal, which is why it carries the digest. It does not stop a process running as
the operator from editing `events.db`; like ADR-040's trace, it is observational. It does not decide
P4.

## Verification

- P1: unit tests for the allowlist (a full hook payload records only facts), `seq` order under
  concurrent appends from separate processes, `busy` handling, `unavailable` on a Node without
  `node:sqlite` (simulated), foreign-repository refusal, parity tool on fixtures; the append-latency
  budget measured in `ci-local.sh`.
- P2: each switched reader tested against `events`, `none`, `unreadable`, `unavailable`, and a log
  whose `ref` does not match its source (reader trusts the source and reports the mismatch).
