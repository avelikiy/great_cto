# RFC: Task tracker, kanban and a mandatory task key bound to the PR

- Status: **direction accepted by the owner on 2026-11-11** (option B, see "Owner's decisions" at the end). Nothing is implemented; questions 2–12 are open. No product code or test changed.
- Date: 2026-11-11
- Related: [RFC-accounts-sso-and-hosting.md](RFC-accounts-sso-and-hosting.md),
  `RFC-cockpit-for-non-developers.md` and `RFC-board-desktop-app.md` (both still in another
  worktree, not on `main`), [ADR-028 task cockpit](../adr/ADR-028-task-cockpit.md),
  [ADR-047 one task, one worktree](../adr/ADR-047-worktree-per-task.md),
  [ADR-009 gates follow reversibility](../adr/ADR-009-gates-follow-reversibility.md),
  gate naming (`docs/agents/GATE-NAMING.md`),
  the UX audit `docs/design/UX-AUDIT-board-2026-11.md`

## The question

> If we are moving to an app, the app needs a task tracker with a kanban board. Do we keep
> Beads and visualise its tasks, or move to something else? Every task, depending on the
> project, must have a mandatory `key_id`, which is then bound to the PR in CI.

## Summary

1. **Recommended: keep Beads as the store for now, but put it behind one great_cto task API
   (option B).** The kanban, the agents, the hooks and the key allocator all go through that
   API. Nothing else talks to `bd` directly.
2. The API is the prerequisite for every other option. A great_cto-owned store (option C) and
   an external mirror (option D) both need it first, so building it loses nothing. Whether the
   packaged app ships Beads or a built-in store is decided **after** phase 1, by a spike with
   written pass/fail numbers (section 6).
3. The kanban is a view of the same data the Work screen shows. A card is a **feature**, not a
   phase task. Gates are a **state of the card** ("Needs you"), not a separate column of gate
   cards. Dragging never approves a gate and never starts agents.
4. **Task key:** `<KEY>-<number>`, for example `GCTO-412`. `KEY` is declared once per project;
   the number is allocated by the task API. It is an **alias**: the Beads id stays the internal
   id. The key must appear in the PR title and in a `Task:` commit trailer.
5. **Enforcement is in four places**, and only the last one is the wall: `commit-msg` (shape),
   `pre-push` (shape + the task exists), CI (shape, and existence where CI can read a key
   registry), and a **merge guard** that refuses a PR without a valid **open** task key and
   treats "tracker not read" as a refusal, never as "no task".
6. All UI in this RFC is words only. The kanban view, the card, the phone layout and where the
   key is shown need a Claude Design mockup approved by the owner before any of it is coded
   (section 6 lists what can ship without one).

## 1. What exists today (measured)

### Three task sources, not one

| Source | Where | Id | What it holds | Read by |
|---|---|---|---|---|
| **Beads issues** | `.beads/` in the project (embedded Dolt; the database is git-ignored) | `<prefix>-<hash>`, children `<id>.<n>` (for example `great_cto-ki1x.5`) | backlog, epics, phase tasks, gates (label `gate` / title `gate:<name>`), findings | board (`packages/board/lib/beads.mjs`), gate checks, hooks, agents via the `bd` CLI |
| **Work tasks** | operator-owned store outside the project, default `~/.great_cto/work-tasks/<uuid>.json` (`scripts/lib/work-tasks.mjs`) | UUID | one controlled run: goal, acceptance, phase, evidence, `links.issues`, publication state `prepared → pushed → pr-linked` | Work screen (`packages/board/lib/work.mjs`), ADR-028 |
| **`.great_cto/tasks.md`** | markdown tables in the project | free text | tasks of projects without Beads | board fallback (`beads.mjs`, `parseTasksMd`) |

The Work screen already joins the first two. A tracker decision that looks only at Beads
misses that a "task" a non-developer sees is already a join.

### Beads cost, from the repository's own records

| Fact | Value | Source |
|---|---|---|
| `bd --version` (process start, no query) | 1.13 s | comment in `packages/board/lib/beads.mjs` |
| `bd list` on this repository | 3.0–4.6 s, later 6.8 s | same file |
| `bd init` alone / with ten test files in parallel | 1.9 s / up to 8.7 s | `tests/pipeline-contracts.test.mjs`, `tests/lib/bd-timeout-floor.test.mjs` (`MEASURED_WORST_MS = 8700`) |
| Cap on every `bd` call in shipping code | 20 s, `SIGKILL` | `bd()` in `beads.mjs`; the class is held by `tests/lib/bd-timeout-floor.test.mjs` |
| Why `SIGKILL` | `bd` holding a Dolt lock ignored `SIGTERM` and blocked the board's event loop for four minutes | `beads.mjs`; `packages/board/bd-sigterm-hang.test.mjs` |
| Board task cache | 300 s TTL, invalidated on board writes and on `.beads/interactions.jsonl` changes; an empty answer is cached 5 s only | `BD_CACHE_TTL_MS`, `EMPTY_TTL_MS` |
| Write concurrency | one in-process promise chain, `bdWriteSerialised` | `beads.mjs` |
| Failed read | last good data is served; the reason is kept and sent as `X-Board-Degraded` | `beads.mjs` (`bdFailures`), `renderDegradedBanner` in the page |
| A project directory with a dot in its name | `bd` refuses to open the database ("invalid database name") | comment in `beads.mjs` |
| Installed binary | `bd` 1.3.1, 136 MB on disk (`du`); the Homebrew formula depends on `dolt` and `icu4c` | this machine |
| Licence | MIT (per the Homebrew formula metadata) | `brew info` |
| Store size of this repository | 523 MB (`du` of `.beads/`; `du` can overstate on APFS) | this machine |

Two limits of the present design matter for the decision:

- **`bdWriteSerialised` only orders writes inside one board process.** Agents, hooks, gate
  scripts and other sessions call `bd` themselves and are outside that queue. The stale
  `.beads/.lock` problem described in `beads.mjs` is exactly this case.
- **The store is not an authorization boundary.** `scripts/lib/gate-state.mjs` says so itself:
  anything that can run `bd create … --label gate` and `bd close <id>` can manufacture an
  approval signal, and every pipeline agent has the `bd` CLI.

### How widely `bd` is called directly

Files containing a `bd <subcommand>` instruction or call:

| Area | Files |
|---|---|
| `agents/` | 12 |
| `commands/` | 7 |
| `skills/` | 14 |
| `scripts/` (including 2 hooks) | 16 |
| `packages/board/lib/` | 5 |
| `tests/` | 25 |

Mentions by subcommand in agents, commands, skills, scripts and the CLI source: `list` 69,
`create` 65, `dep` 26, `update` 18, `close` 14, `ready` 13, `init` 12, `show` 8, others 17
(about 240 in all).
Pipeline pieces that depend on Beads by name: gates (`scripts/lib/gate-state.mjs`,
`gate-check.mjs`, `scripts/gate-to-bd.mjs`), phase tasks (`scripts/phase-task.sh`), findings
(`scripts/lib/finding-beads.mjs`), the gate-expiry and pipeline-dispatcher hooks, the inbox
and digest data scripts, flow metrics, and the board watcher on `.beads/interactions.jsonl`.
Receipts exclude Beads' own files from the tree digest (`scripts/lib/receipt.mjs`).

### What is left of the kanban

The kanban was removed from navigation in the September redesign and kept as a deep link.
In 3.78.x the code is still in `packages/board/public/index.html`:

- `renderKanban` and the panel `#panel-kanban`; five columns in `COLUMNS`:
  **Gates · Backlog · In Progress · Done · Blocked**; a 25-card cap per column with "Show more".
- Card: id, priority dot (click cycles priority), title, description preview, agent chip,
  labels, a status picker, Approve / Reject on an open gate card.
- Reached by the ⌘K entry "Tasks board (#/kanban, deep link)", the `g k` hotkey, and
  `drillToStage` from the pipeline strip. `j` / `k` move between cards.
- API behind it: `GET /api/tasks`, `POST /api/tasks`, `POST /api/tasks/:id/status`
  (`open | in_progress | blocked | closed`), a priority update, `POST /api/gates/:id`.
- **No drag-and-drop**: there is no `draggable` or drop handler in the page.
- **No actor check**: the status route accepts any of the four statuses from any local caller.

Status mapping today (`mapStatus` in `beads.mjs`): `closed → done`, `blocked → blocked`,
label `gate` or type `decision` → `gate`, `in_progress → in_progress`, everything else →
`backlog`.

### Task ids in git today

- Of the last 400 commits, **1** subject line contains a `great_cto-<hash>` id; ids are
  mentioned 39 times in commit bodies. **1** of 237 branches has an id in its name.
- There is **no `commit-msg` hook** in `scripts/hooks/`. Beads installs its own
  `prepare-commit-msg` under `.beads/hooks/`. `scripts/hooks/pre-push.sh` checks private
  names, personal paths and authorship, not task ids.
- GitHub Actions is disabled for this repository; the gate is local (`scripts/ci-local.sh`).
  I found no script in `scripts/` that runs `gh pr merge`; the merge is done by release chain
  scripts kept outside the repository, or by hand.
- Branches created by the agent harness are named `wt-<digits>-<digits>`. A rule that
  requires the key in the **branch name** would be broken by every such session.

### What I could not measure

> **Update 2026-11-11.** Live `bd` timings were taken later the same day, outside the
> sandbox: one issue read 6.7 s, a full list 8.1 s, three reads started together 31.9 s;
> the store holds 1132 issues. `bd` 1.3.1 queues callers across processes itself, so
> "agents race for the Dolt lock" below is out of date: they wait in line. Details and
> consequences: [ARCH-task-api.md](../architecture/ARCH-task-api.md), section 1.

- **Live `bd` timings today.** The session sandbox refuses the lock file `bd` opens even for a
  read (`openat LOCK: operation not permitted`), so every Beads number above is the
  repository's recorded one, not a fresh run. The number of tasks in this repository's store
  is unknown for the same reason.
- **Lock incidents per week** under parallel sessions. They are described in code comments
  and memory, not counted anywhere.
- **Any SQLite number.** Nothing in the repository uses SQLite; write latency and
  multi-process behaviour are textbook expectations until a spike measures them.
- **Beads features I only saw in `--help`**: `--id`, `--external-ref`, `--metadata`,
  `bd rename`, `bd rename-prefix`, `bd linear`, `bd github`, federation. None was exercised.
- **Custom git refs and required commit statuses on GitHub** for this repository (section 5).
- **Size of a packaged app with and without `bd`.** The cockpit RFC estimates the app at
  100–130 MB, also unmeasured.

## 2. Tracker options

- **A — Beads direct.** Keep Beads; build the kanban on the existing `beads.mjs` reader.
- **B — Beads behind a task API.** One module and one CLI (`great-cto task …`) own every
  read and write. Beads is its first backend.
- **C — great_cto-owned store** (for example SQLite) behind the same API, with import from
  Beads.
- **D — external tracker as source of truth** (Linear, GitHub Issues / Projects) with a
  local mirror.

| Criterion | A. Beads direct | B. Beads behind a task API | C. Own store + import | D. External source of truth |
|---|---|---|---|---|
| **What a non-developer sees** | The kanban, plus Beads' failure modes in the UI ("bd timed out — a stale .beads/.lock can cause this"). `bd` must be installed, or the board falls back to `tasks.md` | The same kanban; errors are great_cto's own words. Beads can be absent: the API picks the backend | The same kanban; nothing extra to install | A second product to sign up for and learn; the kanban in the app is a copy of theirs |
| **Offline / local-first** | Full | Full | Full | Reads from the mirror only; creating and closing tasks offline needs a queue and conflict rules |
| **Parallel sessions, several projects** | Writes are ordered only inside the board process; agents and hooks race for the Dolt lock; each project has its own store and a 3–7 s read | One writer queue for **all** callers on the machine (the API owns the lock and the retries); reads from one cache. Raw `bd` speed is unchanged | One file per project in WAL mode: many readers, one writer, short waits — expected, **not measured** | The provider handles concurrency; the mirror adds its own sync races |
| **Agents' write path** | the direct `bd` instructions in 33 prompt files (agents, commands, skills) stay as they are | Prompts and scripts move to `great-cto task …`; one place enforces who may do what | Same as B (the move is the same work) | Every create/close is a network call with rate limits and a token on the machine |
| **Migration cost and risk** | None now. Cost comes later, in every feature that needs a rule Beads cannot hold (actor checks, keys) | Medium: the API, the CLI, and moving 33 prompt files and 16 scripts. Existing stores untouched | B's cost **plus** an importer and a cut-over per project; Beads ids must survive as aliases; dependency edges, labels, notes and gates must map exactly | High: B's cost plus sync, auth, mapping of gates and phase tasks to a foreign model |
| **What breaks in the pipeline** | Nothing | Nothing if the API keeps today's fields; `gate-state.mjs`, `phase-task.sh`, `gate-to-bd.mjs`, `finding-beads.mjs` and the watcher switch to the API one by one | The same list, plus the change feed: the board watcher reads `.beads/interactions.jsonl` today and needs an equivalent | Gates would depend on a third party being reachable; a gate that cannot be read must block, so an outage stops every pipeline |
| **Weight in a `.dmg`** | A 136 MB binary (MIT) with `dolt` and `icu4c` behind it, to be signed inside the bundle; or no Beads and the `tasks.md` fallback, which has no concurrency control | Same as A while Beads is the backend; the choice can change without touching callers | No extra binary if the bundled Node provides `node:sqlite`; its stability level in the Node version we bundle **must be checked**. The npm channel on Node 20 has no built-in SQLite and would keep Beads | No store to ship; an account, a token in the Keychain and network access instead |
| **Privacy** | Local | Local | Local | Task titles of every project leave the machine; for a private project that is the owner's call each time |
| **Can hold the task-key rules** | Only as convention; any agent can bypass with raw `bd` | Yes: allocation, uniqueness and state checks live in the API | Yes | Yes, in the provider's key format, not ours |

### Reading of the table

- **A loses** because the two new requirements — "who may move a card" and "a mandatory,
  unique key" — are rules, and Beads called directly from 33 prompt files cannot hold a rule.
  `gate-state.mjs` already documents the same weakness for gates.
- **D loses as source of truth** because it breaks "yours and local" (cockpit RFC, key
  message 5), makes gates depend on a third party, and sends private task titles off the
  machine. It stays possible as an **optional outbound mirror** later; Beads has `bd linear`
  and `bd github` commands, untested here.
- **C is not rejected; it is premature.** Its cost is B's cost plus a migration, and its
  benefit (speed, no lock incidents, no 136 MB binary) is expected but unmeasured. The project
  already has one rule bought by a bad migration ("never migrate from a second clone", after
  the v23 → v53 schema move). Moving every project's tasks on an estimate repeats that risk.
- **B wins** because it is required by C and D anyway, changes no data, and fixes the
  cross-process write race and the missing actor check on its own.

## 3. Kanban requirements (words only — needs a mockup)

### What a card is

A card is a **feature**: a top-level task or epic. Phase tasks (`scripts/phase-task.sh`),
child tasks (`<id>.<n>`) and findings are items **inside** the card, shown as progress
("4 of 7 steps"). A board of every phase task is the "50 cards flying past" that
`docs/DEMO-SCRIPT.md` warns against.

### Columns

| Column | Beads status and labels | Pipeline stages | Who puts a card here |
|---|---|---|---|
| **To do** | `open`, no phase task started | before product / architecture | human (create), agent (create) |
| **In progress** | `in_progress`; phase label of a building role | product-owner, architect, pm, senior-dev | the pipeline |
| **Checking** | `in_progress`; latest open phase task belongs to a checking role | code-reviewer, qa-engineer, security-officer, domain reviewers | the pipeline |
| **Needs you** | an open gate linked to the card (label `gate` or type `decision`), or `blocked` with the need addressed to the owner | `gate:product`, `gate:plan`, `gate:ship` and the conditional gates | the pipeline, by raising a gate |
| **Done** | `closed` | deployed, or closed with a reason | the pipeline with evidence; a human for a task that never had a run |

- **Blocked is a flag, not a column.** A blocked card keeps its column (the stage it stopped
  in) and gets a red marker with the `tried / failed_because / need` text. It moves to
  **Needs you** only when the need is the owner's. Today `blocked` replaces `in_progress` in
  Beads and the stage is lost; the API has to keep the last phase.
- **Gates are a state of the card.** The gate stays a record in the store, as today
  (`docs/agents/GATE-NAMING.md`); the kanban shows it as "Needs you: approve the
  plan" on the feature card. A gate with no parent is shown as its own card. The full
  decision is made on the decision screen the owner already approved, not on the board.
- The current remnant has five columns (Gates · Backlog · In Progress · Done · Blocked). The
  proposal splits In Progress in two, folds Gates and owner-blocked into Needs you, and turns
  Blocked into a flag.

### Who may move a card

| Move | Human | Agent |
|---|---|---|
| Create in To do, edit title and description, change priority, reorder within To do | yes | yes (create, re-prioritise with a reason) |
| To do → In progress | **not by dragging.** This starts agents; it is the "start from the board" action and belongs to its own ADR (draft in the cockpit work) | yes, by claiming the task |
| In progress ↔ Checking | no; it reflects the pipeline | yes |
| Anything → Needs you | no | yes, by raising a gate or a blocker |
| Needs you → next column | **only** through Approve / Send back with the gate token (`packages/board/lib/gate-tokens.mjs`), never by dragging | **never** |
| → Done | only for a task with no pipeline run; otherwise Done needs the run's evidence | yes, with a verdict |
| Done → To do (reopen) | yes, with a reason | no |
| Close as "won't do" | yes, with a reason | no |

Every write carries an actor (`human` or `agent:<role>`) and goes through the task API,
which refuses a move the table forbids. A refused drag snaps back and says why. Today
neither the actor nor the refusal exists: `POST /api/tasks/:id/status` accepts any status.

### WIP, filters, views

- **WIP.** No hard limit on agent columns in the board itself: how many features run at once
  is a cost decision and belongs with the start-from-board gate. The board **shows** the
  count per column and the age of the oldest card in Needs you; that age is the one number
  a person can act on.
- **Filters** (most exist in the remnant's filter bar and search): project, stage, agent,
  priority, label, blocked only, needs me, text. New: filter by key (`GCTO-412`).
- **Per project** is the default view. **Cross-project** starts as one list: Needs you
  across all projects, each card with its project key. A full board with one swimlane per
  project comes later, if asked for.
- **Phone.** One column at a time with a segmented control showing counts; cards are a list.
  No dragging: a "Move to…" menu offers only the moves the table allows (the status picker
  on the current card is the same pattern). Needs you is the first segment.

### What the Work screen already covers

| Need | Covered today |
|---|---|
| List of tasks with filters, task detail with stage, acceptance, evidence, publication state | yes (Work; ADR-028; audit findings F7 on the detail view) |
| "Needs decision" and "blocked" phases | yes (`RUN_PHASE` in `work.mjs`) |
| Decisions with Approve / Send back | yes (Home / decision screen, approved mockups) |
| Read failure shown as unreadable, not empty | yes (`X-Board-Degraded`, degraded banner) |
| Columns by stage, drag, reorder, phone board | **no** |
| One id a person can say aloud | **no** (UUIDs and hash ids) |

So the kanban is a **second layout of Work** (List / Board), not a sixth destination next to
Home · Work · Cost · Knowledge · Settings. That toggle is a design change.

## 4. The mandatory task key

### Format

`<KEY>-<n>` — for example `GCTO-412`.

- `KEY`: 2–6 characters, `[A-Z][A-Z0-9]{1,5}`, declared once in `.great_cto/PROJECT.md`
  (`task-key: GCTO`). Immutable after the first task is created.
- `n`: a positive integer, allocated in increasing order, never reused.
- Pattern for every check: `\b[A-Z][A-Z0-9]{1,5}-[1-9][0-9]*\b`, then `KEY` must equal the
  repository's own.

Why not keep `<prefix>-<hash>` as the visible id: the hash form is collision-free across
clones, which is why Beads uses it, but it cannot be said aloud, sorts by nothing, and the
prefix is the directory name — for a private project that is the private name itself. A
short code chosen by the owner does not have to reveal the project.

### Alias, not replacement

The key is a second name for the task. The Beads id stays the internal id because it is
already in 39 commit bodies, in file names under `docs/impl-briefs/`, in ADR headers and in
dependency edges. The API resolves both; the UI shows the key and keeps the internal id in
the detail view. With Beads as the backend the key is stored in the issue's metadata
(`bd create --metadata`, `bd list --metadata-field`); whether metadata survives
export / import and a schema migration is **not tested**.

### Allocation and uniqueness

| Situation | Mechanism |
|---|---|
| Parallel sessions and worktrees on one machine | One counter per project, kept by the task API in the git common directory (shared by all worktrees), changed under an exclusive lock file. The key is written to the task in the same operation; a crash between the two leaves a gap in the numbering, never a duplicate |
| Two clones or two machines | Local allocation is **provisional** until it is reserved on the remote: a ref `refs/great-cto/task-keys/<KEY>-<n>` created by a push that fails if the ref exists. On a collision the later task is renumbered before its branch can be pushed. **Needs a spike**: custom ref namespaces on GitHub were not tried |
| No remote at all (a non-developer's first project) | The local counter is the whole story; reservation starts with the first push |
| Agents | Agents never choose a number. `great-cto task create` returns the key |

If the spike on refs fails, the fallback for several clones is a clone suffix declared per
machine (`GCTO-412` vs `GCTO-A412`), which is uglier; I would rather learn that from the
spike than design for it now.

### Existing tasks

- Open tasks get keys in order of `created_at` (ties by internal id), in one run of
  `great-cto task backfill-keys`, dry run first.
- Closed tasks keep only their internal id and get a key if they are reopened. Numbering
  thousands of closed phase tasks would spend the short numbers on history nobody opens.
- Phase tasks and children do not get their own key: they belong to the card's key.

## 5. Binding the key to a PR

### Where the key is written

| Place | Rule | Example |
|---|---|---|
| **PR title** — mandatory | conventional type first, key in brackets at the end | `feat(board): columns follow pipeline stages [GCTO-412]` |
| **Commit trailer** — mandatory on every non-merge commit | `Task: <key>`, repeatable | `Task: GCTO-412` |
| **PR body** — mandatory when the title's key is not the whole story | `Closes: <key>` or `Part-of: <key>`, one per line | `Closes: GCTO-412` |
| **Branch name** — recommended, never required | `<type>/<key>-<slug>` | `feat/GCTO-412-kanban-columns` |

The branch is not a required carrier because harness worktree branches are named
`wt-<digits>-<digits>` and a rename mid-task breaks the session's worktree.

A full commit:

```
feat(board): columns follow pipeline stages

Split In Progress into building and checking roles; blocked is a flag.

Task: GCTO-412
```

### Where it is enforced

| Layer | Checks | Reads the tracker | On "tracker not read" |
|---|---|---|---|
| **`commit-msg` hook** (new; none exists today) | a `Task:` trailer is present, well-formed, and uses this repository's `KEY` | no | — |
| **`pre-push`** (new check in `scripts/hooks/pre-push.sh`) | every non-merge commit in the push range has a valid trailer; each key **exists** | yes | push continues with a loud warning; the merge guard re-checks. `absent` blocks |
| **CI check** (projects that have CI; a shipped workflow step running `great-cto task check --pr`) | title, body and commit trailers agree; `KEY` is the repository's own; the key exists, **if** the key registry is readable from CI | only via the remote key refs | check fails with "registry not read", distinct from "unknown key" |
| **Merge guard** — the wall | the PR has at least one key; every key exists and is **open**; `Closes:` / `Part-of:` are consistent | yes | **refuses.** A failed read is never "no task" and never "fine" |

Notes on the wall:

- A local hook can be skipped with `--no-verify`, so the first two layers are help, not
  enforcement.
- **CI cannot read a tracker that lives on the user's machine.** The Beads database is
  git-ignored. Two honest choices: CI checks shape only and the local guard is the
  authority (how this repository already works, with Actions disabled); or the remote key
  refs from section 4 double as a registry CI can read with `git ls-remote` — key and
  open/closed state only, no titles. The second depends on the same spike.
- For a repository without CI, the guard is a script every merge path calls
  (`great-cto task check --pr <n> --require-open`). To stop a hand-typed `gh pr merge`, the
  guard posts a commit status (`great-cto/task-key`) on the PR head and branch protection
  requires that status. Posting a status needs no Actions minutes. Turning on branch
  protection is a repository setting, so it is the owner's action. **Not verified** here.
- For agents, `scripts/hooks/bash-guards.mjs` refuses `gh pr merge` when the guard has not
  passed for that head.
- Three results everywhere: `found`, `absent`, `unread`. The pre-push check is fail-open on
  `unread`, so by the project's own rule the fact must be re-checked when it can be read;
  the merge guard is that re-check.

### Cases

| Case | Rule |
|---|---|
| **One PR, several tasks** | Title carries the main key; the body lists every key with `Closes:` or `Part-of:`; commits carry the trailer of the task they serve. Every listed key must pass the guard |
| **One task, several PRs** | Allowed. All but the last say `Part-of:`; the task closes on the merge of a PR that says `Closes:`. The guard needs the task open at every merge |
| **Release PR** (`chore(release): …`) | **No exemption class.** The release tooling creates a release task and uses its key. An exemption by title or branch name is a hole anyone can use by naming a PR that way |
| **Merge commits** | Skipped by the commit check (two parents, generated by the host); the PR itself is checked |
| **Revert** | The revert carries the key of the reverted work and **reopens** that task, so the normal "open task" rule holds. An urgent revert with no time for that uses a signed exception (the registry `gate-check.mjs` already loads), which is logged |
| **Bot PRs** (dependency updates in projects that have them) | Owner's decision, question 9 |
| **A key from another project** | Refused: only the repository's own `KEY` is accepted, and the guard never opens another project's tracker. This is also the privacy rule: a private project's key cannot enter the public great_cto history. Cross-project links live in the tracker, not in git; in public text a private project is `<private-project>` |
| **Tracker unreachable** | `unread`: commit works, push warns, merge is refused with the cause ("task store did not answer in 20 s"). Never reported as "no such task" |
| **Task closed before the PR merges** | Guard refuses; reopen or use the right key |
| **Key typed wrong but well-formed** | `absent` at pre-push; blocked before review time is spent |

## 6. Recommendation and plan

**Option B: Beads stays the store, behind one great_cto task API; the kanban is a Board
layout of Work; the key is `<KEY>-<n>` allocated by the API and enforced at the merge guard.**

| Option | Verdict | Why |
|---|---|---|
| A. Beads direct | rejected | cannot hold actor rules or key rules; leaves the cross-process write race; fixes none of today's pain |
| **B. Beads behind a task API** | **recommended** | prerequisite of C and D; no data migration; one writer queue and one rule point |
| C. Own store + import | deferred to a measured decision after phase 1 | likely right for the packaged app, but its benefit is unmeasured and its migration risk is real |
| D. External source of truth | rejected; possible later as an optional outbound mirror | not local-first; gates depend on a third party; private titles leave the machine |

### Phases

| Phase | Content | Mockup needed | Done when |
|---|---|---|---|
| **0. Decisions** | owner answers the questions below | no | answers recorded |
| **1. Task API and CLI** | `scripts/lib` task module + `great-cto task create / list / show / move / close / check`; one cross-process writer queue; actor on every write; three-valued reads; Beads backend only | no | contract tests on the real `bd` path; `bd-timeout-floor` still green |
| **2. Keys** | `task-key` in `PROJECT.md`; allocator; backfill (dry run first); spike on remote key refs | no | two parallel sessions create 50 tasks each with no duplicate; spike result written down |
| **3. Binding** | `commit-msg` hook; pre-push check; `great-cto task check --pr`; merge guard; CI step for projects with CI; release tooling creates its task | no | a PR without a key, with an unknown key, with a closed key and with an unread tracker is each refused with its own message |
| **4. Callers move** | agents, commands, skills and scripts call the API instead of `bd`; a scan test forbids new raw `bd` calls outside the backend | no | scan test green; one full pipeline run recorded through the API |
| **5. Kanban** | Board layout of Work, card, Needs you, phone layout, key in list and detail, cross-project Needs you | **yes — Claude Design, current next to proposed, desktop and phone, approved before code** | browser E2E on drag refusal, phone "Move to…", degraded read |
| **6. Store decision** | spike: the same contract tests against a built-in store; measure against Beads | no | numbers below written down; owner decides |

Phases 1–4 change no screen. The only visible change before phase 5 would be showing the
key where the hash id is printed today; that is a value in an existing field, but I would
still put it in the phase-5 mockup rather than argue the boundary.

### Numbers that decide phase 6

Move to a built-in store for the packaged app if **any** holds after phase 4, measured
through the API on this machine:

- median task write above 1 s, or p95 above 5 s, with three sessions working;
- more than one stale-lock incident per week that needs a person;
- bundling `bd` adds more than 100 MB to the signed app, or its signing inside the bundle
  fails notarization;
- the bundled Node provides a built-in SQLite at a stability level we accept.

If none holds, Beads stays and the question is closed with the numbers.

> **Update 2026-11-11.** The spike was run early, on the owner's word:
> [SPIKE-task-store-sqlite-2026-11.md](../research/SPIKE-task-store-sqlite-2026-11.md). One
> operation in a fresh process costs 0.1–0.25 s on built-in SQLite against 3–15 s through
> `bd` on the same 1135 tasks; three concurrent writers produced 150 distinct keys. The first
> rule above is met. The decision between the options in that document is the owner's.

Kanban mockup for phase 5, approved by the owner on 2026-11-11 in the version published that
day: https://claude.ai/artifact/1bw4YPY79hGrfsgPoDH6p9. Phase 5 builds exactly that version;
any deviation goes back to the mockup for a new approval.

### Risks

| Risk | Mitigation |
|---|---|
| The API becomes a second place where state can disagree with Beads | the API holds no task state of its own in phases 1–5, only the key counter and the writer lock |
| Agents keep calling raw `bd` from habit | the phase-4 scan test, and `bash-guards.mjs` can refuse raw `bd` writes once the move is done |
| The guard blocks real work when Beads is slow | `unread` blocks only at merge; the message names the cause; a signed exception exists for emergencies |
| Key numbering collides across clones | provisional keys until the remote reservation; the spike decides the mechanism |
| A project key reveals a private name | `KEY` is chosen, not derived from the directory; a repository accepts only its own key |
| Mandatory keys turn into noise ("misc" tasks created to satisfy the hook) | accept it for small fixes: a one-line task is still a record of why; review the rate after a month |
| Kanban duplicates Work and the two drift | one read model (`work.mjs`), two layouts; no separate kanban endpoint |
| Backfill misnumbers on a store that could not be fully read | backfill refuses to run on a degraded read; dry run prints the mapping first |

## 7. Additions from the takt research (proposals)

Source: [RESEARCH-takt-2026-11.md](../research/RESEARCH-takt-2026-11.md). takt is licensed PolyForm Noncommercial 1.0.0 and great_cto is MIT, so only
ideas are taken — no code, text, icons or design. takt has no task key and no PR binding;
sections 4 and 5 of this RFC already go further than it does.

Nothing below is implemented. Each item names where it would land and what it needs first.

### 7.1 Acceptance items with evidence, shown as "k of n verified"

**Today.** A Work task holds `acceptance` as a list of strings
(`scripts/lib/work-tasks.mjs`). Nothing records which criterion was checked, or by what.

**Proposal.**

- An acceptance item becomes `{ text, status, evidence? }` with `status` one of `pending`,
  `verified`, `waived`, and `evidence` as `{ kind, ref, at }`. An existing list of strings
  reads as all `pending`.
- An item changes only through a helper that records the evidence: a command with its exit
  code, a verdict line, or a receipt id. A box an agent ticks for itself does not count.
- A task is done only when every item is `verified` or `waived`. A waiver names who waived
  it and why.
- A record that cannot be read is an error. It is never shown as "0 of 0".
- `scripts/hooks/subagent-stop-completion.mjs` reports unverified items as advice first;
  `GREAT_CTO_ENFORCE_COMPLETION=block` keeps its current meaning.

**Where it shows.** The kanban card's progress (section 3) becomes "k of n verified" in
place of "4 of 7 steps" when the task has acceptance items. That is a visible change and
goes into the phase-5 mockup.

### 7.2 Handoff at a limit, with lineage

**Today.** When a session hits its usage limit the work stops, and nothing on the task says
that it stopped for that reason or who continued it.

**Proposal.**

- Attempt-level fields: `handedTo` on the attempt that stopped, `takeoverOf` on the attempt
  that continues, and `stopReason` (`limit:session`, `limit:weekly`, …).
- Detection reuses the limit classification in `scripts/lib/session-usage.mjs` and
  `scripts/hooks/quota-check.mjs`. No reading of screen text.
- The handoff payload is the stage context packet of
  [ADR-026](../adr/ADR-026-stage-context-packet.md): a file and its SHA-256. The new attempt
  records that it started from that packet.
- `scripts/hooks/pipeline-stall-guard.mjs` and `session-pipeline-resume.mjs` **propose** the
  takeover. Starting it is the operator's decision while the capacity costs money
  ([ADR-009](../adr/ADR-009-gates-follow-reversibility.md)).

### 7.3 One precedence table for the state a person sees

**Today.** Several board readers classify a task on their own (fleet, the Work view, gate
affordances), so two screens can disagree about the same task.

**Proposal.** Stored transitions stay in the tracker, behind the task API. The **displayed**
state is derived in one module (for example `scripts/lib/task-display-state.mjs`) from the
stored status, the acceptance counts, the session status (working, waiting, blocked on a
prompt), the limit status and any open gate, in a fixed order:

`limit` > `waiting at a gate` > `blocked` > `asking` > `done` (all items verified) >
`failed or killed` > `running` > `idle`

- A table-driven test pins the order.
- Board readers call the module and stop classifying themselves.
- A task whose process exited with unverified items is **not** done.

This is the rule behind the kanban columns in section 3: "Needs you" is `waiting at a gate`,
`asking`, and `blocked` when the need is the owner's; a new visible state (`limit`) needs the
mockup.

### 7.4 Two small conventions

- A done task names the merge commit and its date.
- The task file layout takt uses (goal, scope, do not, who edits what, context, acceptance)
  is the layout of the existing implementation briefs under `docs/impl-briefs/`. Reuse that
  format; do not add a second one.

### How these fit the phases

| Item | Earliest phase | Needs a mockup |
|---|---|---|
| 7.1 data model and helper | after phase 4 (callers go through the task API) | no |
| 7.1 "k of n" on the card | phase 5 | yes |
| 7.2 lineage fields and proposal | independent of the kanban; after phase 1 | no, unless a `limit` state is shown |
| 7.3 display-state module and test | before phase 5 — the board layout reads it | no for the module; yes for any new visible state |
| 7.4 merge commit on a done task | phase 3 (the merge guard knows the commit) | no |

## Decisions only the owner can make

1. **Direction.** Accept option B now, with the store decided in phase 6 by the numbers
   above — or choose a built-in store (C) from the start and accept the migration?
2. **Key format.** `<KEY>-<n>` as proposed (`GCTO-412`)? What is great_cto's own `KEY`?
3. **Alias or replacement.** Keep the Beads id as the internal id (recommended), or make the
   key the only id?
4. **Who names `KEY` for a new project** created from the app: the user in the first-run
   flow, or derived automatically with the option to change it before the first task?
5. **Strictness for small changes.** Does every commit need a task, including a typo fix,
   or is there a size below which a PR may merge without one? (Recommended: every PR, no
   size exemption.)
6. **Release PRs.** A release task created by the tooling (recommended), or an exemption?
7. **Public key registry.** May great_cto's task keys and their open / closed state be
   visible as refs in the public repository (needed for CI-side checks and cross-clone
   uniqueness)? Titles are never published.
8. **Branch protection.** Will you turn on a required `great-cto/task-key` status for
   `main`? Without it a hand-typed merge cannot be stopped.
9. **Bot PRs** in projects that have them: auto-created task, or exempt by author?
10. **Kanban placement.** A List / Board toggle inside Work (recommended), or a separate
    destination in the navigation?
11. **Mockup go-ahead.** May I prepare the phase-5 mockup in Claude Design (board, card,
    Needs you, phone, key display) while phases 1–4 are built?
12. **External mirror.** Is a one-way mirror to Linear or GitHub Issues wanted at all, and
    for which projects? Not part of this plan unless you say so.
13. **Completion by acceptance evidence (7.1).** Advice first, or blocking for managed
    tasks from the first day?
14. **Handoff at a limit (7.2).** Propose the takeover only, or start it automatically when
    the other harness is on a flat subscription?

## Owner's decisions (2026-11-11)

| # | Question | Decision | Consequence |
|---|---|---|---|
| 1 | Direction | **Option B**: Beads stays the store behind one great_cto task API; the store is decided in phase 6 by the numbers in section 6 | Phase 1 go-ahead given on 2026-11-11. Architecture: [ARCH-task-api.md](../architecture/ARCH-task-api.md), approved at gate:arch and built the same day; reference: [task-api.md](../reference/task-api.md). The CLI there is `great-cto tracker`, because `great-cto task` is already used |
| 2 | Key format | `<KEY>-<n>`; great_cto's own `KEY` is **`GCTO`** | Phase 2 uses it |
| 3 | Alias or replacement | **Alias**; the Beads id stays the internal id | — |
| 4 | Who names `KEY` | Derived from the project name, editable until the first task exists | First-run flow of the app; needs the phase-5 mockup for the field |
| 11 | Mockup go-ahead | **Yes**, prepare the kanban mockup now; the mockup was **approved** the same day | Phase 5 implements the approved mockup exactly; deviations go back for approval |
| — | Order of work | Phase 1 PR after main is green; then keys (phase 2), the store spike and the mockup in parallel; then phase 3 | The store spike moves forward from phase 6: one read through `bd` already costs about seven seconds, above the 1 s threshold. Its decision stays the owner's |
| 5–10, 12–14 | Strictness, release PRs, public key registry, branch protection, bot PRs, kanban placement, external mirror, completion evidence, limit handoff | **Open.** Recommendations given on 2026-11-11: every PR needs a task; release tooling creates its task; no public registry until the spike; required status after one or two weeks of the guard; bot PRs exempt by author; List / Board toggle inside Work; no mirror; advice first; propose only | Phase 3 needs 5–9; phase 5 needs 10 |
| — | Additions from the takt research (section 7) | Added on 2026-11-11 at the request of the research session, which relayed the owner's approval; questions 13–14 are open | Proposals only; nothing is scheduled |
