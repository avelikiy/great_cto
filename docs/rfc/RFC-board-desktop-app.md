# RFC: Board as a desktop app (.dmg) — or not

**Status:** Draft, awaiting owner decision
**Date:** 2026-11-10
**Scope:** `packages/board`, `packages/cli` (`board install-daemon`)

## Question

Should the local board (`packages/board/server.mjs`, default `127.0.0.1:3141`) move from
"a page in a browser tab" to a macOS app shipped as a `.dmg`?

## What the board needs from the host

| Need | Where | Works from a browser today? |
|---|---|---|
| Read `~/.great_cto/*` and registered project dirs | server (`lib/*.mjs`) | yes — the server does it, not the page |
| Spawn `git`, `bd`, `claude` | server | yes — same |
| Live updates (SSE / polling) | `index.html` ↔ `routes.mjs` | yes |
| Notifications | `lib/alerts.mjs` (email + Web Push), `push-adapter.mjs` (zero-dep VAPID), `public/sw.js` | yes — Web Push via service worker |
| Own window + Dock icon | `public/manifest.webmanifest` (`display: standalone`), "Install app" button (`install-app-btn`) | yes — PWA install, shipped and tested (`install-app.test.mjs`) |
| Survive reboot / crash | ADR-007: `great-cto board install-daemon` writes a launchd agent (`co.greatcto.board`, `KeepAlive`) | yes — opt-in |
| Several projects | `~/.great_cto/projects.json`, one server | yes |

Everything that needs the OS lives in the Node server. The page needs nothing a
browser does not already give it. A native shell would wrap a page that already has
an app mode.

## Options

| | (a) Web as is | (b) PWA + launchd daemon (already shipped) | (b′) Thin native shell (WKWebView/Tauri, attaches to server) | (c) Full Electron/Tauri app with server bundled |
|---|---|---|---|---|
| Own window, Dock icon | no | **yes** | yes | yes |
| Auto-start | manual / `/board` | **yes** (`install-daemon`) | yes (login item) | yes |
| Notifications | email | **Web Push** | native | native |
| Menu-bar status | no | no | yes | yes |
| Build / signing | none | none | Developer ID ($99/yr), notarization, Gatekeeper | same + bundled Node |
| Auto-update | npm/plugin | npm/plugin (page served by the server — always current) | second channel (Sparkle/Tauri updater) — a network ping, needs an ADR under PRIVACY.md | same, plus server/app version skew |
| New release channel (ADR-009) | — | — | **yes**, next to npm + Claude plugin + Codex | **yes** |
| Zero-dep `server.mjs` | kept | kept | kept (shell outside) | at risk (bundling, native modules) |
| Disk | 0 | 0 | ~10–20 MB (WKWebView/Tauri) | 150–300 MB (Electron) per copy |
| E2E (`tests/e2e/*.e2e.test.mjs`, 12 files, Playwright against the server) | covered | covered — same page, same server | page covered, shell not (needs XCUITest or manual) | page partly, packaging not |
| Useful to other users of a public OSS tool | yes | yes, any OS | macOS only | per-OS builds |
| Effort | 0 | **~0.5 day** (install + daemon + a check in E2E) | 4–6 days + ongoing release work | 8–12 days + ongoing |

## Recommendation

**(b). Do not build a `.dmg`.** The things a `.dmg` would give (window, Dock icon,
notifications, auto-start) already ship as PWA + Web Push + `board install-daemon`.
The only gap is a menu-bar status item. A menu-bar item does not justify a fourth
signed release channel, Apple signing, an updater that pings the network, and a
macOS-only artifact in a cross-platform tool.

Revisit (b′) only if a concrete need appears that a browser cannot meet (for example,
a global hotkey or a menu-bar gate counter the owner uses daily). That would need its
own ADR (ADR-009: new distribution channel) and, because it changes how the board
looks, an approved Claude Design mockup first.

## Smallest first step (no code change)

1. `great-cto board install-daemon` — board starts at login, restarts on crash.
2. Open `http://localhost:3141` in Chrome → "Install app" → Dock icon, own window.
3. Allow notifications in the installed app → Web Push for gates and P0s.

Optional follow-up (code, needs owner go-ahead): an E2E check that the manifest and
service worker load and the install button logic holds under Playwright, so the PWA
path stays covered by the release gate.

## Follow-up question: "npm, then the admin, is two installs — ship one .dmg instead?"

There is no separate admin install today. The npm package bundles the board
(`packages/cli/package.json` `files: ["board/", …]`, `prepack: bundle-board.mjs`), and
`postinstall.mjs` → `ensureBoard()` starts it detached on `:3141`. What the client
actually meets:

| Step | Today | Removed by a .dmg? |
|---|---|---|
| Install Claude Code (or Codex) and sign in | required | **no** — the agents are Claude Code / Codex sessions |
| Have Node ≥ 20 for `npx` | required | yes, if Node is bundled (+ ~40–90 MB, own security updates) |
| `npx great-cto init` (plugin + PROJECT.md) | **refuses activation under ADR-045** until the signed route is wired | no — the .dmg would need the same verified activation |
| Board starts | automatic (postinstall) | — |
| Board survives reboot | only after `board install-daemon` (opt-in) | yes (login item) |
| Own window / Dock icon | one click, "Install app" | yes |

So a .dmg removes Node and two small manual steps, not the plugin install. It does
not remove the biggest blocker (activation refused under ADR-045) and it adds a fourth
signed channel. Cheaper route to "one command":

1. `init` asks once "keep the board always on?" → runs `install-daemon` (default yes on
   a TTY, never in CI).
2. `init` ends by opening the board with the install-app hint on screen.
3. Finish the ADR-045 signed activation route so `init` works again.

A .dmg becomes the right answer only if the target client is not a developer (no
terminal, no Node). That is a product decision about the audience, not a packaging one;
if taken, it needs an ADR (ADR-009 channel, PRIVACY.md for the updater) and a Claude
Design mockup for anything that looks different.

### Status of the one-command route (2026-11-10)

| Item | Status | Evidence |
|---|---|---|
| `init` asks once about the always-on service | implemented, not reachable yet | `packages/cli/src/board-onboarding.ts`, `offerBoardAfterInit` in `main.ts`, `tests/board-onboarding.test.mjs` (10 pass); CLI suite 495 pass, 1 skipped |
| `init` brings the board up, prints the install-app hint, opens it on a TTY | implemented, not reachable yet | same |
| Signed plugin activation (ADR-045) | **blocked on the owner** | `installer.ts` `install()` throws unconditionally; `init --yes` in an isolated HOME exits 1 at step 3 |

The new step runs after step 5, and step 3 refuses, so no user reaches it until
activation is restored. What ADR-045 still needs before `install()` may return:

1. An enrolled release key (`great-cto distribution configure …`) — an operator action.
2. A decision on companion plugins (`installAllCompanions`: superpowers + beads): the ADR
   does not admit automatically installed companions. Either ship them inside the signed
   archive or make them a documented manual step.
3. A decision on the two `git clone` calls for skill repositories in `init`: "no clone …
   may precede admission". Drop them from `init` or pin and verify them.
4. Managed Claude registration from a verified immutable snapshot with compare-and-swap
   and recovery — a Large change that starts with an architecture review (`gate:arch`).

## Notes found while checking

- Per-task workspace boards take ports 3142–3241 (`scripts/lib/handoff-state.mjs`).
  Any other local service that listens inside that range is skipped by the allocator
  (it checks listeners), so this is not a conflict, only a narrower pool.
