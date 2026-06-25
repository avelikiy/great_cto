# ZRS — bounded headless task-runner (design, ready to implement)

**Ticket:** great_cto-zrs (P3). **Scope:** the *bounded* win — a single persistent worker that
polls a queue, runs ONE agent at a time in an isolated worktree, and lands the result safely.
**Non-goals (separate epic):** multiple parallel workers, the full N-producer merge queue, cost
gates, k8s. Target: **~230–300 lines** across 3 new modules + CLI wiring + one test.

**Borrowed from ctx (ctxrs/ctx) merge-queue** — the one idea we take: **"agent finished" ≠
"change landed."** Between them sits a **two-gate land-step**: Gate 1 *apply-clean* (rebase onto
the live target), Gate 2 *combined-verify* (tests on the rebased result), advance the target only
on clean+green. A single worker is naturally serial, so we don't need the queue-ordering machinery
yet — but the land-step is mandatory even for one worker, because the target moves under it (your
own commits, CI). See [the ctx merge-queue blog](https://ctx.rs/blog/merge-queue-for-agents/).

**Grounding (current code, 2026-06-23):** `startAgentRun` was REMOVED from the board this session —
spawn is now a direct headless `claude -p` (reference: `scripts/ralph-loop.sh`). CLI commands wire
into `packages/cli/src/main.ts` (`command` union + `parseArgs` + handler, mirror the `serve`
command). No worktree helper exists → we call `git worktree add` ourselves. State lives in
`~/.great_cto/` (global → VPS-deployable), per the ticket.

---

## Architecture (components)

```
producer (anywhere)              consumer (one worker per host)
  great-cto task add  ──append──▶  ~/.great_cto/task-queue.jsonl  (append-only intake)
                                          │ poll
                                          ▼
                                   worker loop ──owns──▶ ~/.great_cto/task-state.json (atomic rewrite)
                                          │ per task
                                          ▼
                                   git worktree add  →  spawn `claude -p`  →  LAND-STEP (2 gates)
                                          │
                                   GET /status (state.json + current task)
```

**Why two files, not one:** the producer only ever *appends* to `task-queue.jsonl` (no locks, atomic
append). The single worker *owns* `task-state.json` and rewrites it atomically (temp + rename). This
separates produce/consume cleanly and is crash-safe without a DB (ctx uses SQLite; at this scale a
worker-owned JSON is enough).

---

## `task-queue.jsonl` — intake format (append-only, one task per line)

```json
{"id":"t_1718900000_a1b2","created_at":"2026-06-23T07:00:00Z","repo":"/srv/great_cto","target":"main","prompt":"Fix the flaky retry test in src/foo.ts","model":"sonnet","verify":"npm test","timeout_s":3600,"priority":0}
```

| field | req | meaning |
|---|---|---|
| `id` | ✓ | `t_<unixsec>_<rand4>` — stable, used everywhere |
| `repo` | ✓ | absolute path to the git repo to work in |
| `target` | — | branch to land onto (default `main`) |
| `prompt` | ✓ | the task for the agent (verbatim into `claude -p`) |
| `model` | — | sonnet/opus/haiku (default sonnet) |
| `verify` | — | Gate-2 command (default: repo's `npm test`, else `true`) |
| `timeout_s` | — | hard kill for the agent run (default 3600) |
| `priority` | — | higher first; ties broken by `created_at` (default 0) |

---

## `task-state.json` — worker-owned state map (atomic rewrite)

```json
{
  "t_1718900000_a1b2": {
    "status": "landed",
    "branch": "zrs/t_1718900000_a1b2",
    "worktree": "/srv/great_cto/.worktrees/t_1718900000_a1b2",
    "attempts": 1,
    "started_at": "2026-06-23T07:00:05Z",
    "ended_at": "2026-06-23T07:18:40Z",
    "gate1": "clean", "gate2": "green",
    "commit": "9f3c2a1",
    "log": "~/.great_cto/worker-logs/t_1718900000_a1b2.log"
  }
}
```

---

## State machine

```
            ┌──────────── needs-revision  (Gate 1 conflict: can't rebase clean)
            │
queued ─▶ claimed ─▶ running ─▶ landing ─┼──────────── failed          (Gate 2 red, agent error, or timeout)
                                          │
                                          └──────────── landed          (Gate 1 clean ∧ Gate 2 green → ff-only merged)

  cancelled  ← `great-cto task cancel <id>` from any non-terminal state
```

- **queued** — present in queue.jsonl, no state entry yet.
- **claimed** — worker picked it (set BEFORE creating the worktree; makes a crash recoverable).
- **running** — `claude -p` spawned in the worktree.
- **landing** — agent exited 0; running the land-step.
- **landed / failed / needs-revision / cancelled** — terminal.
- **Crash recovery:** on worker start, any `claimed|running|landing` task is reset → `failed`
  (status `interrupted`) with its worktree cleaned, so a restart never double-runs or wedges.

---

## The land-step (the ctx two-gate borrow) — `land.ts`

Runs inside the task's worktree on branch `zrs/<id>`:

```
land(task):
  # Gate 1 — apply-clean onto the LIVE target (target may have moved under us)
  git -C <wt> fetch <origin?> <target>            # local target if no remote
  git -C <wt> rebase <target>
     └─ conflict → git rebase --abort
                 → state: needs-revision, gate1=conflict ; STOP (do not land)

  # Gate 2 — combined verify on the rebased result (A green + B green can still be A+B red)
  ( cd <wt> && <verify> )                          # e.g. npm test
     └─ exit≠0 → state: failed, gate2=red ; STOP (do not land)

  # Land — advance target only on clean ∧ green; ff-only = never force, never clobber concurrent commits
  git -C <repo> checkout <target>
  git -C <repo> merge --ff-only zrs/<id>
     └─ not-fast-forwardable (target moved during verify)
            → re-rebase once (loop back to Gate 1); on 2nd failure → needs-revision
  state: landed, commit=<sha>  ; cleanup worktree + delete branch
```

This is exactly ctx's "replay onto the latest target in a worktree, verify the merged result,
advance only when it applies cleanly." For ONE worker the only concurrent writer is the human, so
the re-rebase-once handles the rare race; the parallel epic generalises this to a real ordered queue.

---

## Worker loop — `worker.ts`

```
worker({repo?, poll=10, statusPort=4319, once=false}):
  flock(~/.great_cto/worker.lock)        # exactly one worker per host; exit if held
  recoverCrashed()                       # reset claimed/running/landing → interrupted
  serveStatus(statusPort)                # GET /status → {current, state.json}
  loop:
    t = nextRunnable()                   # highest priority queued task with no terminal state
    if !t: if once: break; sleep(poll); continue
    setState(t, claimed)
    wt = `${t.repo}/.worktrees/${t.id}`
    git -C t.repo worktree add wt -b zrs/${t.id} ${t.target}
    setState(t, running, {worktree:wt, started_at})
    runAgent(t, wt)                      # spawn `claude -p` (below), tee log, kill after timeout_s
    setState(t, landing)
    land(t)                              # the two-gate step → landed|failed|needs-revision
```

**runAgent (spawn, reference ralph-loop.sh):**
```
spawn("claude", ["-p", t.prompt, "--permission-mode","acceptEdits", "--model", t.model],
      { cwd: wt, stdio: pipe→tee(log) })
timeout: SIGTERM after t.timeout_s, then SIGKILL ; non-zero exit → failed (skip land)
```
(`LOOP_TOOL=codex` parity later via `codex exec`; bounded version is claude-only.)

---

## `/status` endpoint

Tiny `http.createServer` in the worker (mirror `serve.ts`), `GET /status` →
```json
{ "host":"<hostname>", "worker_pid":1234, "current":"t_...|null",
  "counts":{"queued":2,"running":1,"landed":17,"failed":1,"needs-revision":0},
  "tasks": <task-state.json> }
```
Also `GET /healthz` → `ok`. No auth (bind 127.0.0.1 by default; `--status-bind` for a devbox).

---

## CLI surface (wired in `main.ts`)

```
great-cto task add "<prompt>" [--repo .] [--target main] [--model sonnet] [--verify "npm test"] [--timeout 3600]
great-cto task ls                      # table from state.json + pending queue.jsonl
great-cto task status <id>             # one task (status, gates, log path, commit)
great-cto task cancel <id>
great-cto worker [--poll 10] [--status-port 4319] [--once] [--repo /srv/great_cto]
```
Wiring: add `"task" | "worker"` to the `command` union + `parseArgs` branches + two handlers that
lazy-import `./task-queue.js` / `./worker.js` (keeps the hot CLI path light).

---

## Deployment (VPS) — both shipped as examples

**systemd** (`docs/deploy/great-cto-worker.service`):
```ini
[Service]
ExecStart=/usr/bin/great-cto worker --repo /srv/great_cto --status-port 4319
Restart=always
Environment=ANTHROPIC_API_KEY=...
```
**Docker** — reuse the pattern from `~/development/quoting`: `great-cto worker` as the container CMD,
queue/state on a mounted volume, **egress-policy** (the OTHER ctx borrow) as the container's network
mode — this is where the LLM-providers-only / allowlist posture plugs in for an unattended worker.

---

## Safety / invariants (non-negotiable)

1. **One worker per host** (flock) — the whole single-worker-serial assumption depends on it.
2. **Never force-land** — `merge --ff-only` only; a moved target re-rebases or goes to needs-revision.
3. **Crash-safe** — claimed-before-worktree + recoverCrashed on boot; atomic state writes (temp+rename).
4. **Bounded blast radius** — per-task timeout; worktree per task; cleanup on every terminal state.
5. **Cost guard** — reuse the existing cost-guard hook around runAgent; a per-task token ceiling kills
   a runaway run → failed.
6. **Protected target** — if `target` ∈ {main, master} and the repo has a remote, land locally only
   (ff-only merge); `git push` is a separate explicit opt-in (`--push`), never default.

---

## What we take from ctx vs defer

| ctx idea | bounded zrs | deferred to parallel epic |
|---|---|---|
| done ≠ landed | ✅ land-step stage | — |
| Gate 1 apply-clean (rebase on live target) | ✅ | — |
| Gate 2 combined-verify | ✅ (single producer) | full A+B-across-entries verify |
| serial replay, advance on clean+green | ✅ (naturally serial) | ordered N-producer queue |
| conflict → bounce to agent | ⚠️ → `needs-revision` (manual re-add) | auto re-dispatch agent to rebase |
| containerized egress policy | (deploy note) | first-class per-task container + net policy |
| desktop ADE / SQLite / Tauri | ❌ not the form factor | ❌ |

---

## Implementation checklist (~230–300 lines)

- [ ] `packages/cli/src/task-queue.ts` (~80) — types; `appendTask`; `readQueue`; `readState`/`writeState`
      (atomic); `nextRunnable`; `setState`; `recoverCrashed`.
- [ ] `packages/cli/src/land.ts` (~70) — `land(task)`: the two-gate step (rebase / verify / ff-only)
      using `child_process` git calls; returns the terminal status.
- [ ] `packages/cli/src/worker.ts` (~80) — the loop + `runAgent` spawn + `serveStatus`.
- [ ] `packages/cli/src/main.ts` — wire `task` + `worker` commands.
- [ ] `tests/task-queue.test.mjs` — state machine transitions + `land()` against a throwaway temp git
      repo (make A green, B green, A+B red → assert Gate 2 catches it; conflict → needs-revision;
      clean+green → landed). Keep land() pure-ish (inject the git/verify runners) so it unit-tests.
- [ ] `docs/deploy/great-cto-worker.service` + a `Dockerfile.worker` example.

**DoD:** `great-cto task add` + `great-cto worker --once` runs a real one-task cycle to `landed`
on a scratch repo; the test suite covers the two gates + crash-recovery; structural + cli suites green.
