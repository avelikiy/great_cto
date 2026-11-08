# ADR-047: One task, one worktree — the workspace is the unit of delegation

**Date:** 2026-11-05
**Status:** Accepted (2026-11-06, owner)
**Issue:** great_cto-ldws.1
**Related:** [ADR-009 gates follow reversibility](ADR-009-gates-follow-reversibility.md) · [ADR-045 verified distribution](ADR-045-verified-distribution.md) · [ADR-046 verdict seals](ADR-046-verdict-seals.md) · [project capabilities](../reference/project-capabilities.md)

Read this if you run more than one agent session on one machine. It decides where
a task's files live, who may delete them, and which port its servers get.

## Context

Several Claude Code sessions on this machine work in ONE working tree on ONE
branch. `scripts/hooks/shared-tree-guard.mjs:5-18` records the consequence: edits
belong to whichever session made them, sit in neither the index nor the history,
and a command that resets the tree destroys them with no way back. Three loss
classes have actually happened here:

- **Reset.** `git stash`, `git checkout -- <path>`, `git reset --hard`,
  `git clean -f` take the whole tree, not the caller's part of it. The guard now
  refuses them at the tool layer, and it was bought by a measurement, not a
  worry: in the effort A/B, senior-dev ran `git stash -u && npm test; git stash
  pop` in 2 of 3 runs to check a baseline (`scripts/hooks/shared-tree-guard.mjs:19-23`).
- **Sweep.** A commit naming one file carries a neighbour's uncommitted edit in
  that file. Nothing is lost, but authorship is, and the neighbour's half-done
  work ships.
- **Upload.** A build loads the working *directory*, not HEAD, so an
  uncommitted neighbouring edit reaches a deploy.

The guard addresses only the first class, and it is a refusal, not an
alternative: its own remedy text tells the caller to go make a separate tree
(`scripts/hooks/shared-tree-guard.mjs:103`). So the tooling already knows the
answer and leaves the operator to assemble it by hand.

**Half the model is built, and the half that is missing is the half that holds.**

- `scripts/lib/worktree-state.mjs:29` fixes the location: `.claude/worktrees/`.
  Its header records the incident that bought it — senior-dev produced 381 lines
  plus 394 of tests in a worktree, wrote its verdict into that worktree's own
  `.great_cto/`, and the main tree read "no verdict recorded". The work was found
  because a `cp` happened to say "files are identical".
- `scripts/lib/handoff-state.mjs:164-166` already computes whether the current
  directory is a linked worktree, by comparing `--git-dir` with
  `--git-common-dir`.
- `scripts/lib/project-registry.mjs:42` already classifies
  `/.claude/worktrees/` as a scratch location and keeps it off the board.
- `scripts/lib/check-lane-overlap.mjs:4-7` already requires disjoint file sets
  per lane, "each builder in its own worktree", and
  `scripts/lib/lane-diff.mjs:8-13` checks the result as well as the plan.
- `agents/senior-dev.md:166` declares `isolation: worktree`.

And then `agents/senior-dev.md:170` says: on a worktree error, "do NOT abort,
continue in the main working directory without isolation." The isolation degrades
to exactly the condition the guard exists for, depends on host hooks the operator
must hand-write into settings (`agents/senior-dev.md:177-178`,
`commands/start.md:728-735`), and `commands/start.md:775` reports the degraded
state as a pre-flight warning nobody has to clear.

Conductor (conductor.build) resolves this with a rule worth borrowing: **the
workspace is the unit of delegation; the branch/PR is the unit of integration.**
Each task gets its own worktree and branch, per-workspace `setup` / `run` /
`archive` scripts declared in `.conductor/settings.toml`, and a per-workspace
port in `CONDUCTOR_PORT`. We want the model, not the app — great_cto is a plugin,
and a Mac app cannot be a dependency of a CLI that also runs under Codex.

## Decision

### 1. One Beads task is one worktree and one branch

| | |
|---|---|
| Worktree | `.claude/worktrees/<task-id>` — the path `scripts/lib/worktree-state.mjs:29` already fixes |
| Branch | `task/<task-id>`, created from the integration ref at claim time |
| Claim | idempotent: one task never has two worktrees |

Claiming resolves to exactly one of five states, and "create" is the last of
them, not the default:

1. **adopt** — already inside a linked worktree (§4). Use it; create nothing.
2. **reuse** — `.claude/worktrees/<task-id>` exists, `git worktree list` knows
   it, and its branch is `task/<task-id>`. Use it.
3. **conflict** — the directory exists but git does not know it, or its branch
   is something else. **Refuse and report.** Do not re-point, do not delete: an
   unregistered directory at that path is unexplained work, and
   `scripts/lib/worktree-state.mjs:38-40` already holds the rule that a
   directory we cannot ask about is not evidence of anything.
4. **create** — none of the above, and the repo has at least one commit
   (`commands/start.md:742`).
5. **unavailable** — not a git repo, or no commits. Report; do not silently fall
   back to the shared tree. This reverses `agents/senior-dev.md:170`.

**What stays shared.** Three tiers, and the distinction is load-bearing:

| Thing | Where | Why |
|---|---|---|
| Beads database | the main checkout's, always | One board, one ready-queue. A per-worktree Beads db splits the queue and two agents claim the same task. |
| `~/.great_cto/` | machine-global, unchanged | Seal key (ADR-046), project registry, global memory. Nothing per-task belongs here — the cross-project privacy rule in CLAUDE.md is unaffected. |
| `.great_cto/` | **per-worktree, and that is the known defect** | It is gitignored (`.gitignore:8`) and a hook-written state directory (`scripts/lib/state-gitignore.mjs:5-11`). A verdict written here is invisible to the main tree — the exact 2026-08-07 incident. Verdicts and phase tasks are therefore written to the **main checkout's** `.great_cto/verdicts/`, resolved through `--git-common-dir`, not to the worktree's. |
| `node_modules` | symlink to the main checkout, with a lockfile check | Below. |

**node_modules.** A fresh worktree has none, and the gate already knows it:
`scripts/ci-local.sh:116-119` records that the CLI build had to move earlier in
the file because "a fresh worktree failed", and `scripts/ci-local.sh:528` invokes
`node_modules/.bin/allure` relative to the current directory. Today the symlink
is created by an operator chain script — `gate-any.sh`, which is **not in this
repository** and lives in a scratchpad that is purged daily. That is the finding:
the one step that makes a worktree usable is unversioned, so it is absent for
anyone but its author.

The `setup` script (§2) therefore owns it, and it is not an unconditional
symlink. A shared `node_modules` is correct only while the dependency closure is
the same, so `setup` compares the worktree's lockfile hash against the main
checkout's: equal → symlink (about a second); different → a real install in the
worktree (minutes, once). A symlink across a lockfile change is a worktree
testing someone else's dependencies, which is a green run that means nothing.

### 2. `setup` / `run` / `archive` go in a new committed file

**`.great_cto/workspace.toml`**, committed, TOML, three string arrays:

```toml
[scripts]
setup   = ["node --version", "bash scripts/workspace-setup.sh"]   # proposed helper
run     = ["node packages/board/server.mjs --no-open"]
archive = []
```

Rejected: **`capabilities:` in PROJECT.md.** Its vocabulary is deliberately
**closed** — eight keys plus `second_opinion`, and
`docs/reference/project-capabilities.md` states why: "an open-ended map becomes a
place to write anything, and then nothing can be resolved against it." `setup`
is a command, not a capability; a capability names *what tool we have*, and
resolving one to a shell command is a different contract. PROJECT.md is also
gitignored in this repository (`.gitignore:8`), so a lifecycle script declared
there would not travel to another clone.

Rejected: **`shared/workspace.toml`.** `shared/orchestrator.toml` and
`shared/pipeline.toml` are the plugin's own contracts, shipped to every project.
A per-project file cannot live there.

Rejected: **a new root-level file.** It adds a top-level name to every repository
great_cto touches, for one file. `.great_cto/` is the directory every agent
already reads.

**Making it committed.** In a consumer project nothing extra is needed:
`scripts/lib/state-gitignore.mjs:27-40` ignores named state patterns, not the
directory, and deliberately leaves project records tracked. This repository
ignores the whole directory, so its own `.gitignore` needs the standard
two-line idiom — `.great_cto/*` (not the trailing-slash form, which stops git
descending) followed by `!.great_cto/workspace.toml`.

**`archive` is the dangerous one, so it is a predicate before it is a script.**
A worktree is removed only when **both** probes answer, and answer yes:

| Probe | Command | Pass |
|---|---|---|
| Merged | `git merge-base --is-ancestor <worktree HEAD> <integration ref>` | exit 0 |
| Clean | `git status --porcelain` in the worktree | **no output at all** |

Four rules on top, each bought by something above:

- **Untracked files count as dirty.** The owner's general cleanup rule discounts
  `??` lines; here it must not. An agent's deliverable arrives as untracked files
  — a new test file nobody staged is the 2026-08-07 incident in its normal
  costume. `scripts/lib/worktree-state.mjs:42-43` already counts every porcelain
  line, and archive uses that reading.
- **A probe that cannot answer is a refusal, never a pass.** If git fails, exits
  non-zero for an unexpected reason, or the integration ref cannot be resolved,
  do not remove. An error read as "clean" is how a silent delete happens.
- **Remove the worktree; keep the branch.** After `git worktree remove` the
  branch is the only pointer to the work. Deleting it too is a separate operator
  action.
- **Only worktrees great_cto created.** Provenance is recorded at claim time; an
  adopted worktree (§4) is never archived by us.

### 3. One port per workspace

Base **3141** stays the main checkout's board (`packages/board/server.mjs:4`).
Workspaces get **3142–3241**, assigned deterministically from the task id so the
same task returns to the same port across restarts, then probed upward on
collision.

The claim is recorded in `~/.great_cto/ports.json`, machine-global beside the
project registry, written with the same write-then-rename discipline
(`scripts/lib/project-registry.mjs:87-92`) and for the same reason: a crash
mid-write must not leave a truncated file that reads as "nothing is allocated".
A claim whose pid is gone and whose port nobody holds is reclaimable; a port
something is listening on is not, whatever the file says — `lsof` decides, as
`scripts/lib/board-restart.sh:16-22` already argues ("whoever holds the port is
the board the browser is talking to, whatever its command line says").

Two deliberate choices:

- **No fifth port variable.** `BOARD_PORT`, `PORT`, `GREAT_CTO_PORT`
  (`packages/board/mcp-server.mjs:37`) and `GREAT_CTO_BOARD_PORT`
  (`scripts/hooks/session-pipeline-resume.mjs:121`) already name this one thing.
  The workspace exports **`GREAT_CTO_WORKSPACE_PORT`** for the project's own dev
  servers — the `CONDUCTOR_PORT` analogue, which is what `run` needs and what no
  existing variable means — and sets `BOARD_PORT` from the same allocation,
  because `server.mjs` honours it already.
- **A workspace board refuses on EADDRINUSE; it does not defer.**
  `packages/board/server.mjs:188` answers a taken port with "board already
  running" and exit 0. That politeness caused the nine-day staleness bug
  (`scripts/lib/board-restart.sh:3-9`); in a workspace it is worse than stale —
  it silently attaches the operator to another workspace's board and the
  verdicts they read are not the ones they are looking at.

One consequence to carry: `scripts/lib/handoff-state.mjs:49-52` lists the ports
`/save` reports a running dev server on. 3142–3241 is not in it, so until that
set learns the workspace range, `/save` will report "no servers" for a workspace
that has one — a failed read presented as an empty answer, which is the class of
bug this repository has a rule about.

### 4. Detect a worktree; never nest another

The probe exists: `--git-dir` ≠ `--git-common-dir`
(`scripts/lib/handoff-state.mjs:164-166`). Reuse it rather than write a second
one. When it is true, or any of the signals below fire, great_cto **adopts** the
current worktree and creates nothing:

| Host | Signal |
|---|---|
| any linked worktree | `--git-dir` ≠ `--git-common-dir` |
| Conductor | `CONDUCTOR_PORT` / `CONDUCTOR_*` in the environment; a `.conductor/` directory at the common root, **and only inside a linked worktree** (a repository can commit `.conductor/`, and the main checkout must not be adopted because of it) |
| Claude Code desktop / this plugin | an ancestor path containing `/.claude/worktrees/` — the test `scripts/lib/project-registry.mjs:42` already performs |
| Codex worktrees | linked-worktree probe; no separate signal is needed |

Adoption means: use this tree, this branch, allocate a port, run `setup` if the
project asks, record provenance `adopted` — and **never** run `archive` on it.
Whoever created the workspace removes it. Nesting a worktree inside a worktree is
possible in git and produces exactly the ambiguity this ADR exists to remove:
two tools believing they own one directory.

An adopted workspace whose branch is not `task/<task-id>` is fine. The branch
name is our convention for workspaces we create, not a requirement we impose on
a host that got there first.

### 5. Rollout: opt-in, then default

`workspace: per-task` in `.great_cto/PROJECT.md`. Absent or `shared` keeps
today's behaviour exactly. The default flips only after the opt-in has run
through a release cycle on this repository, and flipping it is its own decision
with its own entry.

| Phase | Change |
|---|---|
| 1 | `scripts/lib/workspace.mjs` (proposed) — claim/adopt/archive predicates and port allocation, pure functions over injected `exec`, in the shape `scripts/lib/worktree-state.mjs` uses |
| 1 | `scripts/lib/worktree-state.mjs:29` — export the resolver the new module and the hooks share, instead of two readings of the same path |
| 1 | `scripts/lib/handoff-state.mjs:164-166` — export the linked-worktree probe; `:49-52` add the workspace port range |
| 2 | `scripts/lib/project-registry.mjs:38-44` — a per-task workspace is still not a board project, but the reason becomes `workspace` rather than `agent worktree`, so the board can show it as a lane of its parent |
| 2 | verdict and phase-task writes resolve `.great_cto/` through `--git-common-dir`; closes the 2026-08-07 incident at its source rather than reporting it afterwards |
| 2 | `scripts/hooks/subagent-stop-completion.mjs:503-508` — keep reporting unlanded worktrees; it stays a report, not a block |
| 3 | `agents/senior-dev.md:166-180` and `agents-full/senior-dev.md:282-291` — replace the hand-written host-hook instructions and the silent shared-tree fallback with the five claim states |
| 3 | `commands/start.md:725-742` — pre-flight checks the workspace model, not the operator's settings file |
| 3 | `packages/board/server.mjs:188` — refuse on EADDRINUSE under a workspace port; `scripts/lib/board-restart.sh` learns the port is a parameter, not 3141 |

Implementation notes. Agents reach all of this through `scripts/workspace.mjs`
(`claim`, `archive`). `scripts/lib/board-restart.sh` already took the port as a
parameter, so phase 3 changed nothing there. `scripts/log-verdict.sh` already
resolved through `--git-common-dir`; `scripts/phase-task.sh` was the writer left.
Dependency linking runs for every claim, not from `workspace.toml`, so a project
gets it without writing a helper; a symlink is excluded through `info/exclude`,
or the archive rule "no output at all" would refuse it forever. A workspace a
host created under its own branch name is recorded in the git common directory,
so the board's merge-readiness card still finds its branch.

`scripts/hooks/shared-tree-guard.mjs` is **not** touched and not relaxed. A
workspace makes the shared tree rarer; it does not make resetting it safe, and
the main checkout is still shared with every session that has not claimed a task.

### 6. What is expensive to undo, and what gates it (ADR-009)

Per CLAUDE.md, position is not the only axis — cost of undo is the other.

| Operation | Why expensive | Gate |
|---|---|---|
| `archive` removing a worktree | Destroys evidence: uncommitted and untracked agent output is in no index and no history | **Both predicates pass or refuse.** A probe that cannot answer refuses. Untracked counts as dirty. Only worktrees we created. This is the "destroys evidence" row of the CLAUDE.md table and needs no human when the predicates hold — and must never proceed when they do not. |
| Branch deletion after archive | The branch is the last pointer to merged-but-unpushed work | **Not performed.** Separate operator action, outside this design. |
| Flipping the default to `per-task` | Changes where every agent on every project writes | **Its own decision record.** Opt-in first (§5). |
| `setup` / `run` from `.great_cto/workspace.toml` | Arbitrary commands from a repository file, run on claim | **Reviewed like code, because it is code.** Committed, diffable, in PR review. Never fetched, never from an untrusted path, never run for an adopted workspace unless the project opted in. |
| `~/.great_cto/ports.json` | Machine-global, read by every project | Additive; a corrupt file is **refused, not overwritten** — the `refused` state `scripts/lib/project-registry.mjs:66-71` already defines. |

Cheap to undo, and deliberately ungated: creating a worktree, allocating a port,
adopting an existing workspace, the opt-in flag itself.

## Alternatives considered

**A. Status quo plus coordination rules.** One tree, announce before editing,
guard the destructive commands. In force today.

**B. Conductor as a required dependency.** Let the app own workspaces; great_cto
reads `CONDUCTOR_PORT` and `.conductor/settings.toml`.

**C. Worktree per session.** Isolate the session, not the task.

**D. One task, one worktree (chosen).**

Scored against this project's own criteria, weights summing to 1.0, 1–5 where 5
is best:

| Criterion | W | A status quo | B Conductor | C per session | D per task |
|---|---|---|---|---|---|
| Prevents the three loss classes | 0.30 | 2 | 5 | 4 | 5 |
| Works under Codex and plain CLI | 0.20 | 5 | 1 | 5 | 5 |
| Maps to the unit work is tracked in | 0.15 | 1 | 4 | 2 | 5 |
| Cost to adopt (code touched, operator steps) | 0.15 | 5 | 3 | 4 | 3 |
| Reversibility of the design itself | 0.10 | 5 | 2 | 4 | 4 |
| Interop with a host that got there first | 0.10 | 3 | 2 | 3 | 5 |
| **Weighted** | | **3.05** | **3.15** | **3.70** | **4.55** |

Why each loses:

- **A** is measured and insufficient. The guard refuses four commands and tells
  the caller to build a worktree by hand; the sweep and upload classes have no
  guard at all, and `agents/senior-dev.md:170` turns the isolation off whenever
  the host hooks are missing.
- **B** scores well on isolation and fails the one criterion that is not
  negotiable: great_cto runs under Codex and as a plain CLI on machines with no
  Mac app. A required GUI dependency for the plugin's concurrency model is not
  available where the plugin runs. Conductor stays an **interop target** (§4),
  which is where its value actually is.
- **C** isolates the wrong noun. Sessions are not what Beads tracks, not what
  `scripts/lib/check-lane-overlap.mjs` splits, and not what a PR integrates; one
  session working three tasks gets one branch and the sweep class returns inside
  it. It is also the status quo's failure in miniature: a long session's worktree
  accumulates several tasks' work and "is this landed?" becomes unanswerable
  again.

## Risks

Pre-mortem. P and I are 1–3; mitigation named or the risk is accepted.

| # | Failure | P×I | Mitigation |
|---|---|---|---|
| 1 | Disk fills with worktrees nobody archived — the machine has twice filled to zero from copies that had done their job | 3×3=9 | `archive` on task close; `scripts/hooks/subagent-stop-completion.mjs:503-508` already reports unlanded worktrees; a refusal to archive must say *which* predicate failed, or it reads as a bug and gets ignored |
| 2 | A shared `node_modules` across a lockfile change makes a green run meaningless | 2×3=6 | Lockfile hash compared in `setup` (§1); on mismatch, a real install |
| 3 | Verdicts still land in the worktree's `.great_cto/` and the main tree reads "none recorded" | 2×3=6 | Phase 2 resolves through `--git-common-dir`. Until then the existing report is the only net, and it is a report |
| 4 | Port exhaustion or a stale claim hands two workspaces one port | 2×2=4 | 100 ports; `lsof` decides over the file; a board that refuses instead of deferring (§3) makes the collision visible rather than silent |
| 5 | `/save` reports "no servers" for a workspace that has one | 3×1=3 | `scripts/lib/handoff-state.mjs:49-52` learns the range in phase 1 |
| 6 | Nested worktrees — great_cto creates one inside a Conductor workspace | 1×3=3 | §4 adoption, on a probe that already exists |
| 7 | A `workspace.toml` lands in a PR with a hostile `setup` command | 1×3=3 | It is committed code and reviewed as code; not fetched, not generated |

Accepted without mitigation: an agent runs as the same OS user as the operator,
so nothing here is a sandbox. A worktree bounds *accidents*, exactly as ADR-046's
seals bound accidental forgery and not a determined one. Stated so no one reads
isolation as containment.

## Consequences

- The shared tree stops being where delegated work happens, and the guard that
  protects it stops being the only thing standing between two sessions.
- "Is this task's work landed?" becomes answerable by two git commands against a
  named branch, instead of by inspecting a shared tree for whose changes they are.
- A worktree's own `.great_cto/` remains a trap until phase 2. The 2026-08-07
  incident is reported today and prevented only after that.
- Projects that do nothing keep today's behaviour; `workspace: per-task` is the
  whole opt-in.
- Conductor, Claude Code desktop worktrees and Codex worktrees become hosts we
  adopt rather than tools we compete with — and an adopted workspace is one we
  never delete.
- Three things this does **not** do: it does not sandbox an agent, it does not
  make the main checkout safe to reset, and it does not delete branches.
