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
- [ ] Tests: reader by offset; replay after a gap; rotation resets; a client that
      reconnects receives the events it missed and nothing twice.

## 3 — Codex in the same feed (great_cto-5i4i)

**Files:** the controlled Codex host (`packages/cli/src/codex-host.ts` and its
helpers), `scripts/lib/codex-exec.mjs`, tests.

- Role start and finish become `agent-start` / `agent-stop` with
  `agent: codex-<role>`; tool calls the host already parses become `tool` events.
  The allowed field set does not change; only the `agent` value does.
- [ ] Tests: a recorded Codex JSONL stream produces the expected events and none
      of its content.

## 4 — ADR-022: per-turn diffs (great_cto-mx9y)

A decision document only: a git ref per agent turn (the checkpoint idea), built on
`scripts/lib/receipt.mjs`, with retention, and how the board would show a turn's
diff without holding content in `events.jsonl`.

## 5 — Approvals from the board (great_cto-dyfn)

After 1 and 2 ship. A short ADR first, then code, on ADR-021's conditions: a
one-time token issued per pending request, Origin and Host both checked, and a
timeout that denies rather than approves. Every approval is recorded as an event.

## Verification before calling each item done

- Full `bash scripts/ci-local.sh` green on Node 22, read from the inner exit code.
- Every new rule has a test written red first and at least one mutation killed.
- Items 1 and 2 are also checked against a running board, not only in tests.
