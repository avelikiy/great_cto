# ADR-023 — What each agent turn changed, kept as a git ref

**Status:** Accepted — implemented 2026-09-15, including the board view (the Turns panel under the pipeline track, `GET /api/turns` and `GET /api/turns/diff`). Step 1: snapshot library `scripts/lib/turn-snapshot.mjs` and the pre-push refusal of `refs/great-cto/`. Step 2: an `async` `scripts/hooks/turn-snapshot.mjs` on Stop and SubagentStop, a snapshot per controlled Codex stage, and retention (newest 50 turns per session; whole sessions idle 14 days removed)
**Date:** 2026-09-14
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —
**Related:** [ADR-021 — a live stream of agent events](ADR-021-live-agent-events.md) (the feed a
turn's diff would be opened from) · [ADR-009 — gates follow reversibility](ADR-009-gates-follow-reversibility.md)
(why the one path off the machine is named and guarded) ·
[ADR-019 — hook execution modes](ADR-019-hook-execution-modes.md) (the `async` hook a snapshot runs in) ·
[The board plan](../plans/PLAN-2026-09-14-board-live-and-safe.md) (item 4)

## Context

A receipt (`scripts/lib/receipt.mjs`) answers "is this the tree that was
reviewed?". It does not answer "what did *this* turn change?". When an agent
edits twelve files over nine turns, the board can show that the tree differs from
the approved one, not which turn introduced which change — and not what to roll
back to.

`pingdotgg/t3code` (MIT) keeps a hidden git ref per turn for exactly this. The idea
is taken here, not the code.

### Measured before deciding (2026-09-14)

| Question | Result |
|---|---|
| Can a turn be snapshotted without touching the user's index or working tree? | Yes: a temporary index (`GIT_INDEX_FILE`), `read-tree HEAD`, `add -A`, `write-tree`, `commit-tree`, `update-ref`. The real index hash and `git status` were identical before and after. |
| Does it catch new files? | Yes — `add -A` into the temporary index. `git stash create` does not. |
| Is one turn's diff exact? | Yes: `git diff turns/<n-1> turns/<n>` showed only that turn's edits. |
| Do gitignored files and the events log stay out? | Yes: `add -A` honours `.gitignore`; the events log is excluded by pathspec, as receipts exclude it (great_cto-bkvj). |
| Do the refs leave the machine? | Not on a default `git push`, `push --tags`, or `git clone`: neither the ref nor its object reached the remote. **`git push --mirror` would carry them.** |
| What does one cost? | On this repository (1,543 tracked files), five snapshots: p50 **312 ms**, max 344 ms; about 5 loose objects per turn. |
| Can they be removed? | Deleting the refs and running gc removed the objects. |

## Decision

1. **One commit per agent turn, under `refs/great-cto/turns/<session>/<n>`.** Its
   parent is the previous turn's ref, or HEAD for the first. Built through a
   temporary index, so nothing the user staged, and nothing in their working tree,
   is touched. Not a branch: it does not appear in `git branch`, `git log
   --branches`, or a default push.

2. **Taken at a turn's end, never per tool call.** At 300 ms a snapshot is fifteen
   times the per-hook budget ADR-021 set, so it cannot run on every PostToolUse.
   The boundaries are the Stop and SubagentStop hooks, and each stage in the
   controlled Codex host. The hook is registered `async: true`, the mode
   [ADR-019](ADR-019-hook-execution-modes.md) introduced and five PostToolUse hooks
   already use, so a turn never waits on it. A snapshot that fails records that it
   failed, and the turn is unaffected — and because an async hook cannot gate the
   turn, nothing may depend on a snapshot existing.

3. **Content stays in git, not in the events log.** A `turn` event carries the
   session, the turn number, the ref name and the changed-path count — no diff.
   The board renders a turn's diff on request by running `git diff` between two
   refs, locally, the way it already reads receipts.

4. **Bounded.** The newest 50 turns per session and 14 days, whichever keeps less;
   older refs are deleted and gc reclaims the objects. `GREAT_CTO_DISABLE_TURNS=1`
   turns snapshots off; deleting `refs/great-cto/` removes them all.

5. **The one path off the machine is guarded, not implied away.** A mirror push
   carries every ref. The pre-push hook refuses a push whose refspecs include
   `refs/great-cto/`, and says how to push without them. This is the
   escapes-the-machine case ADR-009 requires a decision for: uncommitted work in a
   snapshot must not reach a shared remote by accident.

## Not decided here

- **Restoring a turn.** Rolling the working tree back to a turn is destructive and
  needs its own gate; this ADR only records and shows.
- **Approvals from the board** — the plan's item 5, its own ADR.

## Alternatives considered

- **`git stash create`.** Creates a commit without touching the tree, but leaves
  out untracked files — most of what a new feature is.
- **A separate repository for snapshots (`.great_cto/turns.git`).** Closes the
  mirror-push path, but puts a git directory inside the project that receipts,
  backups and editors would have to learn to ignore, and duplicates objects.
  Reconsider if the pre-push guard proves insufficient.
- **Store each turn's diff in the events log.** Puts file content in a log whose
  rule is facts only (ADR-021), and grows it by the size of every change.
- **Snapshot per tool call.** Precise, and 300 ms per call — ruled out by the
  measurement.

## Consequences

- The board can say which turn changed a file, and show that turn's diff.
- Each turn adds a few loose objects to the project's `.git`, bounded by the
  retention above.
- A mirror push is refused until it excludes `refs/great-cto/`.
- A repository with a very large tracked tree pays more than 300 ms per snapshot;
  it is measured per project before it is enabled by default.

## Verification before calling it done

- Index and `git status` identical before and after a snapshot, in a test.
- A turn's diff equals the edits made in that turn, in a test with new, edited and
  ignored files and a growing events log.
- A default push and a clone carry no `refs/great-cto/`; a mirror push is refused
  by the pre-push hook — in a test against a bare remote.
- Retention deletes refs past the limit and gc reclaims them.
- Snapshot p95 measured on this repository and on one large project before the
  default is on.
