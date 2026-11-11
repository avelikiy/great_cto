# ADR-048 — The board API answers its own page and local tools, and binds beyond loopback only behind authentication

**Status:** Accepted (owner, 2026-11-11; shipped in 3.78.0)
**Date:** 2026-11-10
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —
**Related:** [ADR-009 — gates follow reversibility](ADR-009-gates-follow-reversibility.md) ·
[ADR-024 — board approvals](ADR-024-board-approvals.md) ·
[RFC — accounts, SSO and hosting](../rfc/RFC-accounts-sso-and-hosting.md) (Phase 0)

## Context

The board has no login. What protects it is where it listens and which requests it
answers. Reading the server on 2026-11-10 (`c7e1b2fb`) showed three gaps.

### Measured before deciding

| Finding | Evidence |
|---|---|
| Every response carried `Access-Control-Allow-Origin: *`, and reads were not checked against the Origin | `packages/board/server.mjs`; a request to the running board with `Origin: https://example.org` returned `200` with `ACAO: *` |
| The header had no known consumer | present since the first board commit (`00bbe487`); the gates pane, the MCP server, the CLI and the hooks send no Origin; no page outside the board fetches it |
| `--host 0.0.0.0` started a board with no authentication, and logged "Operators authenticate via invite links" | `server.mjs`; the board has no invite code. `great-cto console --bind` reaches the same server and its help text made the same promise |
| `GREAT_CTO_HOST` means two things | the board read it as a bind address; `scripts/hooks/codex-adapter.mjs` sets it to `codex` for hook children. Two tests already pinned it to `127.0.0.1` to work around this |

The Host allowlist (great_cto-xq9h) does not cover the first gap: the request is
addressed to `localhost`, and only the page that sent it is foreign.

## Decision

1. **CORS names only the board's own origins.** `Access-Control-Allow-Origin` echoes
   the request's Origin when it is loopback on the board's port, the bind host, or an
   entry in `GREAT_CTO_ALLOWED_HOSTS`. Otherwise the header is absent. `Vary: Origin`
   is always set.
2. **A cross-site request to `/api/*` is refused with 403**, reads and the event stream
   included. Cross-site means a foreign `Origin` or `Referer`, or
   `Sec-Fetch-Site: cross-site`. A request with none of these is a local tool and is
   answered as before. The page itself (`/` and static files) stays reachable from a
   cross-site link, so links in alert emails keep working.
3. **A bind beyond loopback is refused** unless the operator states that
   authentication sits in front: `GREAT_CTO_BOARD_BEHIND_AUTH=1` or `--behind-auth`.
   The server exits with status 1 and a message that names the way out. The log line
   and the CLI help no longer mention invites.
4. **The bind address comes from `--host`, then `GREAT_CTO_BOARD_HOST`.** The legacy
   `GREAT_CTO_HOST` is honoured only when it holds an address.

## Considered and deferred: a per-install token on every API request

The RFC listed this as H2. Working it through changed the recommendation.

- Handing the token to the page on `GET /` gives it to every local process too. Against
  web pages it adds nothing to decisions 1–2.
- A process running as the same user can read the token file. A token does not stop it.
- The cases it does stop are another OS user on a shared machine and a sandboxed app
  with network access. For those, the token must be delivered out of band
  (`great-cto board` opens a one-time URL), and a browser without the cookie must see a
  "open the board from the CLI" page. That page is a visible change and needs an
  approved mockup; a cleared cookie locks the user out of an installed PWA.
- It touches every client: the MCP server, `packages/cli/src/mcp.ts`, the gates pane,
  the session-resume hook, the canary and smoke scripts, and about ninety test files
  that fetch the API directly. Hooks and the board ship in one plugin, but an installed
  CLI can be older than the board it talks to.

Deferred until there is a concrete need (a shared-machine user, or the remote-control
agent in the RFC, which calls the API in-process and does not need it either). If taken
up, it gets its own ADR, a mockup, and a warn-then-enforce rollout.

## Consequences

- A page on another origin can neither read the board nor make it do work.
- **Breaking for anyone who binds beyond loopback today**: the server now exits until
  `GREAT_CTO_BOARD_BEHIND_AUTH=1` is set. This goes in the release notes.
- **Breaking for a cross-origin consumer of the API, if one exists outside this
  repository** (a browser extension, a local dashboard on another port). None is known.
  Such a consumer needs its origin in `GREAT_CTO_ALLOWED_HOSTS`.
- A browser that sends neither `Origin`, `Referer` nor `Sec-Fetch-Site` on a cross-site
  GET would still be answered, without a CORS header. Current browsers send
  `Sec-Fetch-Site`.
- Other local processes can still read and write the API. That is unchanged and stated.

## Verification

`packages/board/local-api-guards.test.mjs`: the rules as unit tests; a running server
refuses a foreign Origin, another local port, a bare `Sec-Fetch-Site: cross-site` and a
cross-origin event stream, answers its own origin and a request with no Origin, and
still serves `/` from a cross-site link; a server started with `--host 0.0.0.0` exits 1.

## Follow-ups (not in this change)

- ~~`great-cto console` help calls it "the operator console (no dev board)".~~ Done
  2026-11-11: the help says what it starts. Removing the command is a separate decision.
- ~~Authenticate share pause and alert send at the relay.~~ ADR-049.
- ~~The share report embeds full records of the last 20 completed tasks.~~ Done
  2026-11-11: it embeds only the fields it displays.
- ~~Serve published reports from an origin that is not the brand domain.~~ ADR-049
  serves them sandboxed instead, which needs no second domain.
