# ADR draft: a per-launch token for the board API

- Status: **draft** — gets a number and moves to `docs/adr/` when the owner accepts this text
- Date: 2026-11-11
- Follows: [ADR-048](../adr/ADR-048-board-local-api-guards.md) ("Considered and deferred: a
  per-install token")
- Decided direction: [RFC-mac-app-auth.md](RFC-mac-app-auth.md), owner's decision 2 of 2026-11-11
  ("ship with the `.dmg`, own ADR, warn-then-enforce")
- Related: ADR-024 (gate tokens), `ADR-DRAFT-desktop-app-channel.md`, accounts RFC (C′)

## Context

ADR-048 stops web pages: CORS names only the board's origins, cross-site `/api/*` is refused,
a bind beyond loopback needs `--behind-auth`. What it leaves open, by its own statement:

- any local process, **of any OS user**, can read and write `/api/*` on `127.0.0.1`;
- a sandboxed app with network access can do the same.

It deferred a token for three reasons. The macOS app changes the first one:

| ADR-048 objection | With the app |
|---|---|
| The page has no out-of-band way to receive a token; handing it on `GET /` hands it to every process | The app starts the board and owns its window: it can put the credential into the window's own cookie store. A browser gets it through a one-time ticket opened by the app or the CLI |
| A same-user process can read the token file | Still true and stated. The token targets other users and sandboxed apps, and is the base for remote control |
| Every client and ~90 test files change; an installed CLI can be older than the board | Still true → warn-then-enforce, one shared client helper, a test helper |

A sibling private macOS app (`<private-project>`) has run this pattern for months: a daemon on
`127.0.0.1` with a bearer token written per start to a `0600` file read by the app, the CLI and
the MCP server, and a one-time ticket in the URL fragment that only the loopback listener
trades for a browser credential.

## Decision (proposed)

1. **Mint per launch.** At start the board creates 32 random bytes (`node:crypto`) and writes
   `<GREAT_CTO_HOME or ~/.great_cto>/run/board-api.json` = `{ url, token, pid, startedAt }`:
   directory `0700`, file `0600`, written to a temp file, fsynced, renamed. Removed on clean
   exit. A restart rotates the token. `run/` is never read into model context (memory readers,
   learner, transcripts) and a scan test enforces that.
2. **What needs it.** Every `/api/*` route and the event stream. Not: `GET /` and static
   assets (alert-email links keep opening the page), and `GET /api/health`. ADR-024 gate
   tokens stay as they are, on top.
3. **How it is presented.**
   - Tools (CLI, MCP server, hooks, scripts): `Authorization: Bearer <token>`, read from the
     file by one shared helper. Compared in constant time.
   - The app's window: the Swift shell reads the file and sets the cookie in the window's
     non-persistent `WKWebsiteDataStore` before loading the page. No ticket, no URL.
   - A normal browser: `great-cto board` (and the app's "Open in browser") asks the board for a
     **ticket** — single use, 120 s, memory only, issued only to a Bearer caller — and opens
     `http://127.0.0.1:<port>/#ticket=<t>`. The page posts it to `POST /auth/ticket`, which
     answers only on loopback, sets the cookie and the page removes the fragment with
     `history.replaceState`.
   - Cookie: `gcto_board_<port>=<token>; HttpOnly; SameSite=Strict; Path=/` (no `Secure`:
     plain HTTP on loopback). Session cookie: gone when the browser closes, invalid after a
     board restart.
4. **Modes**, `GREAT_CTO_BOARD_AUTH=off|warn|enforce`:
   - `warn`: missing or wrong credential → answered as today, plus one log line per client
     kind and a header `X-Great-CTO-Auth: missing`. Default of the npm board for **one minor
     release**.
   - `enforce`: `401` with a JSON body naming the fix (`update great-cto`, or `open the board
     from the app or with great-cto board`). **The app always starts the board in `enforce`.**
     Default of the npm board from the release after `warn`.
   - `off`: today's behaviour; documented as the rollback switch.
5. **A failed read of the token file is an error, not "no token".** A client that cannot read
   `board-api.json` says so (`board token unreadable: <reason>`); it never falls back to an
   unauthenticated call that would be refused later with a misleading message.
6. **Browser without the cookie** sees one page: "This board is open only from the app or from
   `great-cto board`", with the command and a copy button. This is a visible change: **its
   Claude Design mockup must be approved before code.**

## Clients that change

Found by `git grep` on 2026-11-11 (outside docs and tests):

| Client | Change |
|---|---|
| `hooks/gates-pane.tsx` | read the token through the shared helper |
| `packages/cli/src/main.ts` (`board` and status calls) | helper; `board` opens the ticket URL |
| `packages/cli/src/mcp.ts` (MCP server) | helper |
| `scripts/hooks/session-pipeline-resume.mjs` | helper; on failure report, do not guess |
| `scripts/ralph-loop.sh` | `curl -H "Authorization: Bearer $(…)"` via a tiny reader script |
| board page (`index.html`) | ticket exchange; on `401`, show the page from decision 6 |
| Swift shell (new) | set the cookie in its data store |
| ~22 board test files that fetch the API | one test helper that adds the header |

## Alternatives considered

- **Per-install token** (ADR-048's wording): survives restarts, so a leaked value lives longer.
  Rejected for per-launch.
- **Token in the Keychain**: Node cannot read it without a helper, and a same-user process is
  not stopped by it either.
- **Unix domain socket instead of TCP**: strong file-permission isolation, but browsers and
  `WKWebView` cannot speak to it; would need a second listener. Revisit for tools only.
- **Token in `sessionStorage` with a header from page JS**: works with EventSource only through
  a polyfill and is readable by any script on the page. Rejected for the cookie.
- **Leave it to remote control**: rejected by the owner on 2026-11-11.

## Consequences

- Another OS user or a sandboxed app can no longer read or drive the board.
- Same-user processes still can (by reading the file). Stated, unchanged.
- Cookies do not isolate ports: a server of another OS user on a different `127.0.0.1` port
  that the user's browser visits would receive the cookie. The port in the cookie name avoids
  collisions, not this. Residual risk, low; the app's window is not affected (own data store).
- An installed CLI older than the board breaks under `enforce`; the `warn` release and the
  `401` message cover the transition.
- No network behaviour changes: no `docs/PRIVACY.md` change is needed.

## Verification

- Unit: constant-time compare; ticket single use, expiry, loopback-only exchange; modes.
- Running server, `enforce`: `/api/*` and the event stream without credential → `401`; with
  Bearer → `200`; with cookie → `200`; `GET /` → `200`; another user's process (test runs the
  client under a different uid where the platform allows, else a file-permission test) cannot
  read the file.
- File: `0600`, directory `0700`, atomic write, removed on clean exit, rotated on restart.
- Failed read: a client with an unreadable file reports it and makes no request.
- Board Playwright E2E in `enforce` through the ticket flow; desktop and mobile.
- Every client in the table above exercised in the local gate (MCP server, gates pane, hooks).
- App: clean-account checklist entry "board opens in the window without any prompt".

## Rollback

`GREAT_CTO_BOARD_AUTH=off`, or a release that sets it as the default. No data migration.

## Preconditions

1. Owner accepts this text.
2. Mockup of the decision-6 page approved in Claude Design (current next to proposed, desktop
   and mobile).
3. Lands before or together with the first `.dmg` release.
