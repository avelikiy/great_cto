# PLAN — The board is safe to leave open, and it shows every agent live

**Status:** in progress · **Date:** 2026-09-14 · **Owner:** senior-dev
**Applies to:** `packages/board/`, `scripts/lib/agent-events.mjs`, the Codex host, `docs/adr/`
**Related:** [ADR-021 — a live stream of agent events](../adr/ADR-021-live-agent-events.md) ·
[ADR-009 — gates follow reversibility](../adr/ADR-009-gates-follow-reversibility.md)

**Sources (ideas only, no code copied):** a study of four open-source control
surfaces that run Claude Code and Codex side by side — `pingdotgg/t3code` (MIT),
`slopus/happy` (MIT), `getpaseo/paseo` (Apache-2.0) and
`Untrivial-ai/agent-orchestrator` (Apache-2.0).

## Measured before deciding

| Fact | Where |
|---|---|
| The board refuses a cross-origin state change, but "same origin" means *Origin equals this request's own Host* | `packages/board/lib/util.mjs` `originAllowed()` |
| Nothing checks the Host header itself | no match for a Host allowlist in `packages/board/` |
| So a page on a DNS-rebinding domain pointed at 127.0.0.1 sends a matching Origin and Host, reads every GET, and passes the CSRF guard for POST — gate approvals included | `server.mjs` CSRF guard → `originAllowed()` |
| The bind address defaults to loopback, which does not help: the requests come from the user's own browser | `lib/config.mjs` `HOST` |
| A tunnelled operator console relies on that same Host trust | `originAllowed()` comment, `packages/cli/src/main.ts` `consoleBind` |
| The agent strip is pushed as a full snapshot every change; SSE frames carry no `id`, so a reconnect cannot resume | `lib/watchers.mjs` `watchAgentEvents`, `lib/sse.mjs` |
| Codex runs write no agent events; only Claude Code hooks do | `scripts/lib/codex-exec.mjs`, the controlled host |
| Board gate approvals are guarded by the origin check only; no per-request token, no timeout | `lib/routes.mjs` `/api/gates/*` |

**Goal:** a board left open in a browser cannot be driven by another page, it
resumes a live stream without losing events, and Claude and Codex appear in one
feed — before it is trusted to approve anything.

## Order, and why

1 and 2 come before 5. An approval button on a board that any rebinding page can
reach, and that may miss events on a reconnect, would turn a read-only view into a
remote control with a hole in it. 3 and 4 are independent of 5.

---

## 1 — Host allowlist (great_cto-xq9h, P1)

**Files:** `packages/board/lib/util.mjs`, `packages/board/server.mjs`,
`packages/board/lib/config.mjs`, new `packages/board/host-allowlist.test.mjs`,
`docs/PRIVACY.md` or the board guide, CHANGELOG.

- `hostAllowed(hostHeader, { port, bindHost, extra })`: `localhost:PORT`,
  `127.0.0.1:PORT`, `[::1]:PORT`; the configured bind host when it is a concrete
  name or address (not `0.0.0.0` / `::`); and every entry of
  `GREAT_CTO_ALLOWED_HOSTS` (comma-separated, for a tunnel or hosted console).
  A missing Host is refused.
- `server.mjs` refuses a disallowed Host with 403 for **every** request, before
  routing — GET, SSE and static files included, not only state changes.
- `originAllowed()` no longer derives "self" from the request's Host; the Origin
  must be one of the allowed hosts.
- Fail closed, and say so: bound to `0.0.0.0` with no `GREAT_CTO_ALLOWED_HOSTS`,
  only loopback hosts are accepted, and startup prints which variable to set. A
  tunnelled console that worked before stops until its domain is listed — named in
  the release notes.
- [x] Tests red first, on the real server over `http.request` (fetch cannot set
      Host): rebinding Host refused for GET, SSE and a gate POST with a matching
      Origin; loopback accepted; a listed host accepted for GET and same-origin POST.
      Against today's server 4 of 6 failed, as they should.
- [x] Mutations: the server check removed; the port ignored; `originAllowed`
      trusting Host again (caught by its own unit test, since the server check
      refuses the Host first).

**Breaks, on purpose:** a console reached through a tunnel or a LAN address
answered before; it now answers only after its name is listed in
`GREAT_CTO_ALLOWED_HOSTS`. The CLI help for `console --bind` says so. The next
release's notes must too.

## 2 — Resume the agent stream by cursor (great_cto-c0hb)

**Files:** `scripts/lib/agent-events.mjs`, `packages/board/lib/agent-activity.mjs`,
`packages/board/lib/watchers.mjs`, `packages/board/lib/routes.mjs`, `index.html`.

- Each pushed agent frame carries `id: <byte offset after the last event sent>`.
- The watcher sends only events after each client's offset, not a full snapshot.
- On reconnect the browser sends `Last-Event-ID`; the server replays events after
  that offset. The page's `EventSource` does this by itself.
- Rotation: an offset beyond the current file size means the file rotated — send a
  full snapshot and reset the cursor, never a partial read from the wrong file.
- [x] Tests: reader by offset; replay after a gap; rotation resets; a client that
      reconnects receives the events it missed and nothing twice.

**Landed.** The cursor is `<inode>-<byte offset>` past the last complete line
(`readEventsSince` in `scripts/lib/agent-events.mjs`). Snapshot, never a read from
the wrong place, when the cursor is not ours, the inode differs (even with a line
boundary exactly at the old offset), the file is shorter, or the offset no longer
sits after a newline. A gap of more than 500 events is a snapshot marked `gap`, and
the strip says events were skipped. The rotation cap now counts bytes.

Measured on the way: the page recreates its `EventSource` after an error, so the
browser never sends `Last-Event-ID` — the page keeps the cursor per project and
sends `?since=`; the server accepts both.

Checked: tests red first; eleven mutations caught (five in the reader — two survived
the first tests and got tests of their own — and six in route, watcher and page);
and on a running board, an event written while the page had no connection arrived
on reconnect through `since=`, with no duplicates.

Not caught: a file truncated and regrown so a newline lands exactly on the old
offset. Nothing in the plugin truncates the file; rotation renames it.

## 3 — Codex in the same feed (great_cto-5i4i)

**Files:** the controlled Codex host (`packages/cli/src/codex-host.ts` and its
helpers), `scripts/lib/codex-exec.mjs`, tests.

- Role start and finish become `agent-start` / `agent-stop` with
  `agent: codex-<role>`; tool calls the host already parses become `tool` events.
  The allowed field set does not change; only the `agent` value does.
- [x] Tests: a recorded Codex JSONL stream produces the expected events and none
      of its content.

**Landed.** `codexToolEvent` (in `scripts/lib/codex-exec.mjs`) maps a finished
`command_execution`, `file_change`, `mcp_tool_call` or `web_search` item to a
`tool` event — a declined command to `denied` — and never carries the command,
its output, MCP arguments or a query. `runCodexExec` hands each JSON line to
`onEvent` as it streams. The controller records `agent-start` / `agent-stop` for
each dispatched stage as `codex-<role>`, and for the verifier as
`codex-verifier`, with `session` = the run id; a stage that throws still records
its end, as not ok.

The item shapes come from Codex's own event definitions
(`codex-rs/exec/src/exec_events.rs`), not from a live run: the streams recorded in
this repository carry no tool items, and a live call spends the user's
subscription. Worth one observed run before calling the mapping proven.

Checked: tests red first; nine mutations caught (started items counted, non-zero
exit as ok, command text leaking, listener errors uncaught, no `onEvent`, stop only
on success, start before dispatch, silent verifier, no session).

**Found on the way, fixed first (great_cto-bkvj):** receipts counted the events log.
`init` does not gitignore `.great_cto/`, so one appended event changed a tree
receipt — a gate drifted by itself, and these controller writes would have tripped
its own "working tree changed during verification". `treeReceipt` now excludes the
log.

## 4 — [ADR-023](../adr/ADR-023-per-turn-diffs.md): per-turn diffs (great_cto-mx9y)

ADR-022 was already taken (GitHub release reconciliation). The decision is written,
with its mechanism measured first.

**Step 1 landed (2026-09-15).** `scripts/lib/turn-snapshot.mjs`: `snapshotTurn`
builds a commit under `refs/great-cto/turns/<session>/<n>` through a temporary
index, parented on the previous turn; `listTurns`, `turnDiff` and `pruneTurns`
read and bound them. The pre-push hook refuses any `refs/great-cto/` ref, so a
mirror push or explicit refspec cannot carry uncommitted work to a remote.

Checked: every library test fails against an empty stub; five mutations (real
index, logs not excluded, loose session name, parent always HEAD, prune across
sessions) each caught by the test aimed at it; the push-guard tests fail against
the old hook, and an ordinary branch push still passes.

**Step 2 landed (2026-09-15).** `scripts/hooks/turn-snapshot.mjs` runs as an
`async` hook on Stop and SubagentStop, so the turn never waits on the ~300 ms
snapshot; each controlled Codex stage takes one too. Retention runs in the same
call: the newest 50 turns per session, and whole sessions whose newest turn is older
than 14 days. Two hooks firing together for one session can no longer overwrite each
other's turn — the ref is created only if absent, and a lost race takes the next
number. The hook prints nothing and exits 0 whatever it is given.

Checked: tests red first (the library, the hook run as the host runs it, the
manifest, the Codex stage); six mutations caught by the test aimed at each —
overwriting ref update, inverted age check, pruning skipped, an exception escaping
the hook, the Stop entry not async, the Codex snapshot removed.

Not yet: showing a turn's diff on the board.

A decision document only: a git ref per agent turn (the checkpoint idea), built on
`scripts/lib/receipt.mjs`, with retention, and how the board would show a turn's
diff without holding content in `events.jsonl`.

## 5 — Approvals from the board (great_cto-dyfn) · [ADR-024](../adr/ADR-024-board-approvals.md)

Writing the decision found the gap is not only a future feature: the board already
approved pipeline gates with no token, no expiry and no check against the reviewed
state, and the typed-name ritual for expensive gates was enforced only in the page.

**Section 1 landed (gate approvals).** Each pending gate `/api/inbox` returns
carries a token (`packages/board/lib/gate-tokens.mjs`): single-use, 24 h, bound to
the project tree outside `.great_cto/` and `.beads/` as the board first showed it. The server
refuses — before writing anything — a missing, used or expired token, an expensive
or unclassified approval without the typed gate name, and an approval after the
project changed (409 with the paths). A rejection needs the token but is never
refused for drift. Every decision and refusal is an agent event. The page's dead
`runAgent` branch is gone.

Found while writing the tests, before code: an approval writes the pipeline's own
files under `.great_cto/`, which `init` does not gitignore, so a binding over the
whole tree would have let the first approval refuse every other open gate.
`treeReceipt` gained an `exclude` option; its default is unchanged. The first cut
excluded only `.great_cto/`; the full gate's `pipeline-e2e` test then showed a
beads-backed approval writing `.beads/interactions.jsonl` and making the next gate
stale, so `.beads/` is excluded too.

Checked: tests red first; ten mutations caught; on a running board over a
throwaway project, a routine approval landed, a wrong typed name was stopped before
any request, a direct POST without the name got `403 refused-confirm`, the right
name landed, and both tokens were consumed.

**Section 2 (live tool permissions) is still open**: it waits for a live
`PermissionRequest` hook to establish the decision output fields — the docs came
through a summariser with two inconsistent readings.

After 1 and 2 ship. A short ADR first, then code, on ADR-021's conditions: a
one-time token issued per pending request, Origin and Host both checked, and a
timeout that denies rather than approves. Every approval is recorded as an event.

## Verification before calling each item done

- Full `bash scripts/ci-local.sh` green on Node 22, read from the inner exit code.
- Every new rule has a test written red first and at least one mutation killed.
- Items 1 and 2 are also checked against a running board, not only in tests.
