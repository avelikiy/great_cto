# Spike: the task store on Node's built-in SQLite

- **Date:** 2026-11-11
- Status: measured once; a decision for the owner, not a design
- Question: [RFC-task-tracker-and-kanban.md](../rfc/RFC-task-tracker-and-kanban.md), phase 6 —
  does a built-in store behind the task API remove the cost of Beads?
- Contract it was held to: [task-api.md](../reference/task-api.md)

## Answer

Yes, by a wide margin on this machine. One operation in a fresh process costs 0.1–0.25 s on
SQLite against 3–15 s through `bd`, on the same 1135 tasks. Three writers at once produced
150 tasks and 150 distinct sequential keys with no error. What the spike did **not** cover is
listed below, and it is most of the migration work.

## What was built

A throwaway backend with the same interface as `scripts/lib/task-backend-beads.mjs`
(`list`, `get`, `create`, `move`, `close`, `link`, `note`), about 90 lines, on `node:sqlite`:

- one file per project, WAL mode, `busy_timeout` 5 s, every write in `BEGIN IMMEDIATE`;
- tables: `tasks`, `deps`, `events` (who did what, when), `counters`;
- a key allocator as one transaction: increment the project's counter, return `GCTO-<n>`.

It was kept outside the repository; nothing in the product imports it.

## Measurements

Node 22.19, load average about 50 (other sessions were working). Each row is five runs of a
**new process** per operation — the way an agent or a hook calls the tracker.

| Operation | SQLite, ms | Through `bd` today |
|---|---|---|
| read one task | 245, 189, 193, 162, 191 | 5.9–14.8 s |
| list all 1135 | 168, 276, 185, 138, 193 | 4.3–8.1 s |
| append a note | 161, 203, 155, 159, 117 | 5.2 s |
| create | 100, 115, 107, 116, 102 | under 1 s only in an empty store |
| Node start alone, for scale | 98, 92, 120, 108, 114 | — |

| Check | Result |
|---|---|
| the phase-1 contract sequence (create, read back, absent, move, note, link, close, gate, deferred) | passed |
| three processes, 50 creates and 50 key allocations each, started together | 233 ms in all; 150 tasks, 150 distinct keys, numbered 1–150 with no gap |
| store size with 1135 tasks | 1.5 MB (the Beads store of the same project is 523 MB by `du`) |

The `bd` column is from [ARCH-task-api.md](../architecture/ARCH-task-api.md), measured the
same day on the same store.

## What this does not show

- **Stability of `node:sqlite`.** Node 22.19 prints an experimental warning when it loads. Its
  status in the Node version the app would bundle has to be read from that version's
  documentation, not assumed. Node 20 does not have the module at all, so the npm channel on
  Node 20 would keep Beads.
- **Import.** Tasks were loaded from the task API's list, which carries no dependency edges,
  comments or history. A real migration has to bring those, keep every Beads id as an alias,
  and be proven on a copy first.
- **What Beads does beyond storage:** readiness from dependencies, its own gate type,
  history, federation between workspaces, the session hook that primes an agent.
- **The board's change feed.** The board watches `.beads/interactions.jsonl`; a SQLite store
  needs an equivalent signal.
- **Crash safety and corruption.** No process was killed mid-write.
- **A quiet machine.** Both columns were measured under load; the ratio, not the absolute
  numbers, is the finding.

## Reading it against the RFC's rule

The RFC says: move to a built-in store if the median write through the API is above 1 s.
Through Beads it is about 5 s on this store; on SQLite about 0.15 s. The rule is met. The
remaining question is cost, and it is the owner's: the migration is real work with a real
failure mode (the earlier schema migration is the precedent), while staying means every
agent call keeps costing seconds.

## Options for the owner

| Option | Gain | Cost |
|---|---|---|
| **A. SQLite becomes the default backend for new projects; existing projects stay on Beads until migrated one by one** | new users never meet the slow path; no forced migration | two backends to keep passing one contract |
| B. Migrate everything now | one backend | highest risk; every project at once |
| C. Stay on Beads | no work | the seconds stay; a 136 MB binary in the app |

Recommended: **A**, after phase 2 (keys) lands — the allocator is the same transaction in
either backend, and phase 4 (moving callers to the task API) is what makes a backend switch
invisible to agents.
