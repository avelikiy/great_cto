# PLAN: UI split — builder board vs operator console

**Date:** 2026-06-11 · **Status:** PROPOSED (gate:plan)
**Reader:** the senior dev implementing this in ~1–2 days, phase by phase.

## Why

great_cto has two audiences that are two different products-in-waiting:

| | Builder (CTO / dev) | Operator (licensed signer) |
|---|---|---|
| Surface | dev board `/` (index.html) | console `/autopilot.html` |
| Job | build autopilots, run agents | work cases, sign gates |
| Access | full, local trust | invite token, role+tenant locked |
| Economics | npm channel, free/cheap | per-seat, compliance budget |
| Exposure | localhost only | must be hostable outside |

Decision (2026-06-11): **one engine, two isolated surfaces.** No repo/package split until
the triggers in P5 fire. Today the boundary is mostly client-side — an operator's invite
link technically lands on a server that also serves the entire dev board and its API.

**Measured facts** (inventory, 2026-06-11):
- Console calls ONLY `/api/autopilot/*` + `/api/push/subscribe|vapid-key` (+ SSE `/api/autopilot/stream`).
- Builder surface = everything else: `/api/tasks`, `/api/gates/*`, `/api/agents/*`, `/api/agent/*`,
  `/api/inbox|pipeline|cost|memory|doc|projects|share|resume|logs|metrics|decisions|notif-*|sse|heartbeat`.
- Console has a `Build` nav link back to `/` (autopilot.html:165) — visible to operators.
- `server.mjs` ~3700 lines, single request handler; `/api/autopilot/ingest` is the webhook
  entry for new cases (must live on the console surface).

## P1 — Server-side boundary (the guard) — ~half a day

**Goal:** an invite token opens the operator surface and nothing else; a console-mode server
physically does not serve the dev board.

1. **Surface mode.** `GREAT_CTO_SURFACE = builder | console | both` (env + `--surface` flag;
   default `both` — zero behavior change for existing local users).
   - `console`: serve ONLY `/autopilot.html` (+ its static assets), `/api/autopilot/*`,
     `/api/push/*`. Everything else → 404 `{error:"not on this surface"}`. `/` redirects
     to `/autopilot.html`.
   - `builder`: serve everything EXCEPT nothing (builder keeps console access — the CTO
     may open both; the asymmetry is deliberate).
2. **Invite-token guard (mode-independent).** Any request carrying an invite token
   (`?token=` / body.token) that resolves to a non-admin operator may hit ONLY
   `/api/autopilot/*` + `/api/push/*`. A guard right after the CSRF block in `server.mjs`;
   404 on everything else even in `both` mode.
3. **Tenant scoping audit.** Verify every autopilot endpoint derives `tenant` from
   `apAuth()` (server-resolved), never trusting a client-supplied tenant when a token is
   present. Fix any that don't.
4. **Tests** (`tests/board-surface.test.mjs`): console mode 404s `/api/tasks` + `/` serves
   console; invite token → 404 on `/api/tasks`, `/api/agent/run`, `/api/doc`, dev-board html;
   admin (no token) unaffected in `both`; ingest webhook works in console mode.

## P2 — Two entries — ~half a day

**Goal:** the operator never sees a builder pixel; the builder gets a one-command console.

1. **CLI:** `npx great-cto console [--port 8788] [--host 0.0.0.0]` → starts the server with
   `GREAT_CTO_SURFACE=console`. Default host stays 127.0.0.1; `--host` exists for
   tunnels/hosting. `npx great-cto board` unchanged (`both` locally).
2. **Console entry without a valid invite** (and not local admin): a clean "Ask your
   administrator for an invite link" screen instead of the console shell.
3. **De-brand for operators:** the `Build` nav link, any "great_cto" strings, agent jargon
   render ONLY for the admin role; with `brandName` set the title/header/favicon are the
   tenant's. Audit autopilot.html for builder vocabulary.
4. **Builder → console handoff:** dev board keeps an "Open operator console" affordance
   (copy invite link / open console). One direction only.
5. **Docs:** README "Two surfaces" section + invite-flow screenshot.

## P3 — Landing: two narratives — ~half a day (great_cto-site repo)

1. `/build` — for the CTO: npm install, dev board, agents, pipeline. Existing voice.
2. `/operate` — for the compliance lead: console screenshots, roles/invites, signing,
   audit trail, SLA. Zero dev jargon.
3. Homepage hero: two CTAs ("Build autopilots" / "Operate with confidence") routing to
   the two pages. Nav, og-images, sitemap, llms.txt updated.

## P4 — Cut server.mjs along the surface line — ~1 day, mechanical

**Goal:** the future package split becomes a file move, not a refactor.

1. Extract `packages/board/autopilot-api.mjs`: all `/api/autopilot/*` + push routes as
   `handleAutopilot(req, res, url, ctx) → boolean` (ctx: cwd, broadcast, stores). server.mjs
   delegates before its own routing. No behavior change — pure motion.
2. Same later (optional) for agent-runner routes. index/console statics already disjoint.
3. Full suite + board smoke after the move.

## P5 — Package split — NOT NOW; triggers

Split into `great-cto` (builder) + `great-cto-console` (operator, hosted) only when one fires:
- hosted multi-tenant console deploy exists (more than one external tenant);
- the console needs its own release cadence / SLA;
- a client requires "no dev tooling on our boxes".

## Order & rollout

P1 → P2 ship together as one minor release (the guard alone changes nothing for current
users; default `both`). P3 independent (site repo). P4 next free slot — prerequisite for P5.

## Risks

- **Don't break local flow:** default `both`, guard applies only to token-bearing requests.
- **Ingest webhook** must stay reachable on the console surface (it's how orders arrive) —
  signature-gated, CSRF-exempt as today.
- **SSE:** console uses `/api/autopilot/stream`, dev board uses `/api/sse` — already split;
  keep it that way in the guard table.
