# RFC: great_cto for non-developers — a cockpit for your AI team

**Status:** Direction accepted by the owner on 2026-11-10 (see "Owner's decisions" at the end). Phase 0 in progress. Nothing was built, installed or committed.
**Date:** 2026-11-10
**Scope:** audience, onboarding, packaging, positioning. Touches `packages/board`, `packages/cli`, release scripts, README, site.
**Related:** `RFC-board-desktop-app.md` (an earlier RFC, not on the main branch yet) recommended against a `.dmg` *for developers*.
Its last paragraph says a `.dmg` becomes the right answer only if the client is not a developer.
This RFC takes that case. It does not replace the earlier RFC.

## Summary

1. A `.dmg` removes Node, the terminal and the board start-up. It does **not** remove the two
   things a non-developer stalls on: a coding agent that is installed and signed in, and the
   path from "the agents wrote code" to "something is live".
2. The board is a dashboard today, not a cockpit: it cannot start work. Launching agents from
   the board was removed on purpose (`packages/board/lib/routes.mjs:740`). A cockpit needs
   that control back, under a gate.
3. Recommended order: **decide the audience and test it by hand → make the board a cockpit
   and ship it through the existing npm channel → only then wrap it in a signed `.dmg`.**
   The first two phases also help developers and add no release channel.
4. How the app may use the user's Claude subscription is a licensing question I could only
   partly verify. It must be answered before any public promise to non-developers (section 2).

## 1. The user and the journey

### Who

| Persona | Has on day zero | Does not have |
|---|---|---|
| **Founder with an idea** | a Mac, a browser, maybe a Claude or ChatGPT subscription | terminal habits, Node, git, a repository, a hosting account |
| **Product owner / operator** in a small company | the same, plus a product a contractor built | access to or understanding of the repository |
| **Technical-adjacent founder** (wrote some code years ago) | may have git and a GitHub account | patience for a five-step CLI install |

Today the product says it is "for one builder — a solo founder or CTO" who already has a
coding agent (`docs/DETAILS.md`, Limitations; `README.md` "Limitations"). The third persona is
the closest to that; the first two are a new audience.

### The journey today

Sources: `README.md` (Quick start), `docs/QUICKSTART-AI.md`, `packages/cli/src/main.ts`
(`runInit`, steps 1–5), `packages/cli/postinstall.mjs`, `packages/cli/src/run.ts`.

| # | Step today | Needs | A desktop app can |
|---|---|---|---|
| 1 | Install Claude Code or Codex and sign in | installer, account, paid plan or API key | **guide only** (detect, link, re-check). Cannot remove it: every agent is a Claude Code or Codex session |
| 2 | Install Node ≥ 18.17 (`packages/cli/package.json` `engines`) | terminal or installer | **remove** (bundle a Node runtime) |
| 3 | Have a project folder; `init` refuses the home directory (`main.ts:866`) | Finder, or git | **hide** (a "New project" / "Open folder" dialog) |
| 4 | Have git. The worker creates worktrees with it (`packages/cli/src/worker.ts:114`), gates compare trees | Xcode Command Line Tools on macOS | **guide only** (macOS offers the install dialog itself); bundling git is possible but heavy — not proposed |
| 5 | `npx great-cto init` — detects stack, installs and enables the plugin, writes `.great_cto/PROJECT.md` | terminal | **hide**, but see step 6 |
| 6 | Plugin activation. Under ADR-045 `init`, native plugin refresh and companion install **refuse** (`README.md` "Verified distribution boundary", `docs/reference/verified-updates.md`); Codex init returns an error (`main.ts:849`) | a verified activation route that does not exist yet | **neither remove nor hide**: the app needs the same admitted activation. This blocks every audience |
| 7 | Companion tools: Beads (`bd`) and superpowers (`main.ts:1101`) | terminal / Homebrew | **hide**: the board already reads `.great_cto/tasks.md` when `bd` is absent (`packages/board/lib/beads.mjs:786`) |
| 8 | Restart Claude Code, type `/start "…"` in it, or `great-cto run "…"` | terminal or the Claude Code prompt | **hide only if the app can start work itself** — it cannot today (section 2) |
| 9 | The board starts (`postinstall.mjs` `ensureBoard`), opens at `localhost:3141` | nothing | **remove** (the app is the window) |
| 10 | Keep the board running: `great-cto board install-daemon` (ADR-007, `packages/cli/src/board-daemon.ts`) | terminal | **remove** (login item) |
| 11 | Answer gates: what is built, the design, the deploy (`README.md` "When it stops you") | reading an architecture document | **hide part**: default `approval-level: ship-only`; plain-language gate cards (design change) |
| 12 | Ship: `devops` deploys preview/staging; a live URL needs hosting, a database, a domain | accounts at a host, DNS, a card | **guide only**. This is the largest gap for a non-developer and packaging does not touch it |
| 13 | Pay for tokens: one feature about $3.40, a whole product median $171 (`README.md` "Numbers, measured", historical) | subscription limits or API billing | **show** (cost, budget). Cannot remove |

Optional API keys that appear on the way: `ANTHROPIC_API_KEY` for the low-confidence archetype
check in `init` (`main.ts:938`, skipped without a key), an OpenRouter key for the judge
(`routes.mjs:1191`, optional). Neither is required.

**What this means.** Of thirteen steps a `.dmg` removes three (2, 9, 10), hides five
(3, 5, 7, 8, 11) if new product work is done, and can only guide four (1, 4, 12, 13). Step 6 is
a blocker that packaging does not solve.

### The target journey

1. Download **one file**, drag to Applications, open.
2. First-run checklist, each line detected, not asked: *Claude signed in* · *project folder
   chosen* · *git available*. Each red line has one button that opens the right installer or
   sign-in and re-checks itself.
3. One box: **"What do you want built?"** → the team starts.
4. The cockpit shows who is working, what is in flight, what waits for the user, and what it
   cost so far.
5. A notification: "The team needs your decision." One screen, plain language, Approve / Send back.
6. "Shipped": a preview link first; a real domain is a guided, human-gated step.

## 2. The hard dependency: agents run in Claude Code or Codex

What the code does today:

- `great-cto run` starts an **interactive** `claude` with the terminal attached
  (`packages/cli/src/run.ts:171`, `stdio: 'inherit'`). A desktop app has no terminal to give it.
- The task worker starts a **headless** agent: `claude -p <prompt> --permission-mode acceptEdits
  --model <m>` in an isolated git worktree (`packages/cli/src/worker.ts:151`). This is the only
  place the product drives Claude without a person at a prompt.
- The Codex route runs through a controller script (`run.ts:219`, `scripts/codex-pipeline.mjs`).
- **The board starts nothing.** `routes.mjs:740`: "board-triggered agent launch removed — the
  board no longer spawns coding agents" (commit `d3a001c8`). The board can create a task
  (`POST /api/tasks`, `routes.mjs:1349`), move its status, and approve or reject a gate
  (`routes.mjs:743`).

### Options

| | A. Companion to the Claude desktop app | B. Own app drives the user's installed `claude` headless | C. Own app embeds the Agent SDK, user brings an API key |
|---|---|---|---|
| What the user installs | Claude desktop app (it has a Code tab and a plugin browser) + our plugin from that browser + our app or board | our app + Claude Code (guided) | our app only |
| Sign-in | in Claude's own window, with the user's Claude account | `claude` login, guided by us | paste an API key from the Anthropic console; needs console account and billing |
| Who starts work | the user, in the Code tab (`/start`) | **the cockpit** ("What do you want built?") | the cockpit |
| Cost to the user | their Claude plan limits | their Claude plan limits or their API key | pay per token; no flat plan |
| Licensing | cleanest: the user uses Anthropic's own product; we are a plugin | **unverified** — see below | allowed route per the SDK documentation |
| Engineering | small: guide + first-run checklist | medium: start/stop/resume from the board over headless `claude`, gates through the existing API | large: the pipeline is built on slash commands, hooks and plugin agents; the SDK loads plugins by local path, but the whole flow must be proven under it |
| Cockpit metaphor | weak: two windows, work starts in the other one | **strong** | strong |
| Works with Codex | no | yes, same pattern (`codex exec`) | no (Anthropic only) |

### What I verified, and what I could not

| Claim | Status |
|---|---|
| The Agent SDK documentation says: third-party developers may not offer claude.ai login or rate limits in their products, including agents built on the SDK, unless previously approved; use API-key authentication. | **Verified** on 2026-11-10 at `code.claude.com/docs/en/agent-sdk/overview` |
| The same page forbids presenting a product as "Claude Code"; "Powered by Claude" is allowed. | **Verified**, same page |
| The Claude desktop app has a Code tab and installs plugins from its UI without a terminal ("Add plugins"). | **Verified** at `code.claude.com/docs/en/desktop` (first 100k characters of the page) |
| Option B — a third-party app that spawns the user's own, separately installed and signed-in `claude` CLI — is covered by, or outside, the restriction above. | **Unverified.** `great-cto run` and the worker already do this for developers. Selling it to non-developers as "sign in with Claude" is closer to what the note forbids. Needs a written answer from Anthropic |
| The Claude desktop app puts a `claude` binary on `PATH`, or gives plugin hooks a Node runtime. | **Unverified** — the page does not say. If it does neither, option A still needs Node for our hooks and board, and option B needs a separate CLI install |
| The full `/start` pipeline (gates, hooks, specialist dispatch) runs correctly under `claude -p`. | **Unverified.** The worker runs single prompts that way; an earlier measurement in this project found `claude -p --agent` skips skill preloads. Needs a spike |
| great_cto can be added in the desktop plugin browser from its git marketplace (`.claude-plugin/marketplace.json`). | **Unverified.** It would also be an activation outside the ADR-045 admitted route |
| OpenAI's terms for driving `codex` from another app. | **Unverified**, not checked |

### Recommendation for the dependency

Build for **B with A as the fallback wording**, and keep C as the route that is certainly
allowed:

- The app never asks for Claude credentials and never shows a Claude sign-in of its own. It
  detects whether `claude` (or `codex`) is installed and signed in, and sends the user to
  Anthropic's own installer and sign-in.
- It starts work through the user's own CLI, headless, in a worktree — the pattern
  `worker.ts` already has.
- Before public launch to non-developers: get Anthropic's answer on B. If it is "no", ship C
  (API key stored in the macOS Keychain, never in `~/.great_cto` context files) and keep B as a
  developer-only setting.
- Branding: "Powered by Claude", never "Claude Code" in the app's name or visuals.

## 3. Packaging

### Shell options

| | Native Swift shell (WKWebView) + bundled Node + existing server | Tauri + bundled Node sidecar | Electron |
|---|---|---|---|
| Zero-dep `server.mjs` | kept unchanged; the shell spawns it and opens `127.0.0.1:<port>` | kept | kept, runs in Electron's Node |
| New toolchain on the build machine | none beyond Xcode | Rust (several GB) | npm packages, ~0.5 GB cache |
| Installed size (estimates, not measured) | ~100–130 MB, almost all of it Node; board itself is 2.3 MB | similar | 250–350 MB |
| Windows / Linux later | no — a second shell is needed | yes | yes |
| Auto-update library | Sparkle | Tauri updater | electron-updater |
| Menu-bar item, native notifications, login item | yes | yes | yes |
| Risk | macOS only | new language in the repo | size; Chromium security updates become ours |

**Recommendation:** Swift shell for the first macOS version — a few hundred lines, no new
toolchain, the server and page stay exactly what the E2E suite tests. Choose the
cross-platform shell (Tauri) only when a Windows user is actually waiting; until then Windows
and Linux keep the PWA path from the earlier RFC.

Open technical points, unverified: Web Push inside a plain WKWebView (the shell probably has to
bridge the existing alert stream to native notifications); the exact Node archive size.

### Signing

- Apple Developer Program ($99 per year), a **Developer ID Application** certificate, hardened
  runtime, notarization, stapling. Without them Gatekeeper blocks the app, and a non-developer
  will not get past that.
- The bundled Node binary must be signed inside the bundle with the right entitlements (JIT).
- The certificate is the owner's identity. The signing step runs on the owner's machine with
  the owner present, like the npm 2FA step today.

### Updates versus ADR-045

- ADR-045's model: one signed index, every deliverable signed with an enrolled Ed25519 key,
  admission before activation, no runtime fetches (`docs/reference/verified-updates.md`).
- The app **can reuse it**: the `.dmg` becomes one more blob in the release index with its own
  `.signature.json`. Today the format fixes "five final blobs" and "ten files", so this is an
  **amendment to ADR-045**, not a side door.
- Two signatures then protect the app: Apple's (the OS trusts it) and ours (the updater trusts
  it). They answer different questions and both stay.
- **First version: no auto-updater.** The CLI already has a documented, on-by-default update
  check — one `GET` to the npm registry, cached 24 h, opt-out by `GREAT_CTO_NO_UPDATE_CHECK=1`
  (`docs/PRIVACY.md` "Update check"). The app may show "version X is available — download",
  with the same request and the same opt-out. Any download-and-replace updater is a new network
  behaviour and needs its own ADR and a `docs/PRIVACY.md` change.

### A fourth release channel

Today a release chain goes: local gate (`scripts/ci-local.sh`, `scripts/cd-local.sh`) →
`scripts/build-release-artifacts.mjs` (npm tarball, plugin archive, inventory, SBOM, index) →
`sign-local-release-artifacts.mjs` → `publish-local-release.mjs` (npm) →
`publish-local-github-release.mjs` (GitHub assets). `cd-local.sh --publish` refuses.

The app adds: build the shell, embed the **already admitted** npm tarball contents (no
rebuild), sign with Developer ID, notarize, build the `.dmg`, add it to the index, sign the
index, upload with the other assets. One more stage that needs the owner (Apple notarization
credentials), roughly 10–20 minutes per release, and one more thing that can leave a release
half-published. Under ADR-009 this is "escapes the machine": it needs the owner's decision
before any of it is built.

### What the Playwright E2E would and would not cover

There are 11 E2E files in `tests/e2e/`. They drive the page against a real server;
`installed-package.e2e.test.mjs` does it against the board installed from the npm tarball.

| Covered as is | Not covered |
|---|---|
| Every board view, control wiring, gates, journeys, a11y — the same page and server the app shows | The shell: window, menu bar, login item, native notifications |
| The packaged server, if the test is pointed at the Node and files inside the built `.app` (small addition) | Gatekeeper and notarization on a clean machine |
| First-run detection logic, if it lives in the server and the test fakes `PATH` | The `.dmg` drag-install, first launch quarantine prompt |
| | Starting a real agent (costs tokens; today's suite uses fixtures) |

The uncovered part needs a short manual checklist on a clean macOS user account before each
release, or XCUITest later. A static check is not enough: the owner's rule is that the admin is
exercised in a browser before every release.

### Effort

Days of focused work, including tests and the local gate; design approval time not included.

| Piece | Days |
|---|---|
| First-run checklist (server-side detection + view) | 2–3 |
| Start / stop / resume from the board over headless `claude`, with a gate (ADR) | 4–6 |
| Plain-language gate cards and the cockpit home on top of the approved Home mockup | 3–4 |
| Swift shell, bundled Node, login item, notification bridge | 3–4 |
| Signing, notarization, `.dmg`, release-chain stage, ADR-045 amendment | 3–4 |
| Clean-machine checklist, E2E against the bundled server | 1–2 |
| Verified auto-updater (later) | 4–6 |
| Agent SDK + API-key route (only if B is refused) | 8–12 |
| Windows / Linux shell (later) | 6–10 |

### Smallest shippable first version

**Not a `.dmg`.** Version one is the cockpit itself, delivered through npm, which already
exists: first-run checklist, "What do you want built?", start from the board, plain-language
decisions. A developer gets a better product the same day. The `.dmg` is then packaging around
something proven, about 7–10 days more.

If the owner wants a `.dmg` first regardless: shell + bundled Node + first-run checklist that
detects Claude Code and guides the install, no updater, no start-from-board. About 8–10 days.
It installs easily and then tells the user to go and type `/start` in another app. I do not
recommend it: the easy install leads to a product that still expects a developer.

## 4. Positioning: the cockpit for your AI team

### What the product says today

- README hero: "See the work. Trace the decisions." Body: "great_cto coordinates Claude Code
  workflows … through explicit stages, review and gates." (`README.md`)
- Marketplace description: "You already have the agent. This is everything around it."
  (`.claude-plugin/marketplace.json`)
- Board: title "great_cto board"; navigation Work · Decisions · History · Ledger · Fleet ·
  Harness · Usage · Skills (`packages/board/public/index.html:3506–3550`). The owner approved a
  declutter mockup on 2026-11-10 (Home · Work · Cost · Knowledge · Settings); it is not
  implemented yet and it has no first-run state.
- Tone: careful, evidence-first, written for an engineer ("unknown is not zero or pass").

All of that speaks to someone who already runs a coding agent. A non-developer does not know
what "gates", "harness" or "fleet" are.

### Proposed positioning

> **great_cto is the cockpit for your AI engineering team.** Say what you want built. A team
> of AI specialists plans it, builds it and checks each other's work. You make the decisions
> that matter — what gets built, and whether it ships — and you see what it costs.

**Audience:** founders and product owners who can describe a product but do not run a
terminal; solo builders stay the second audience and lose nothing.

**Key messages**

1. **A team, not a chatbot.** Product, architecture, build, review, QA, security, deploy —
   eight roles with clear responsibilities.
2. **You stay the decision-maker.** The team stops and asks; nothing ships without you.
3. **Nothing is taken on trust.** Each stage is checked by another agent; what was not checked
   is shown as not checked.
4. **You see the money.** Cost per task and budget are on the first screen.
5. **Yours and local.** Runs on your Mac, with your own Claude account; great_cto is free and
   open source and bills nothing.

Keep the honesty that the README has now. For this audience one sentence must be on the first
screen of the site: *you need a Claude subscription (or API key), and the team builds software
— putting it on a real domain is a guided step, not a button.*

### What the cockpit must show on first open

| Instrument | Content | Exists today |
|---|---|---|
| **Start** | one box: "What do you want built?" | no — the board cannot start work |
| **Team** | the eight core roles, each: idle / working on X / waiting for you | data yes (Fleet, agent activity); this presentation no |
| **In flight** | current task and stage, in plain words | yes (Work, pipeline view) |
| **Needs you** | decisions waiting, with one-screen plain-language cards | yes as gates; wording is technical |
| **Cost** | today, this task, budget left | yes (Usage / Ledger; approved Cost view) |
| **Readiness** (first run only) | Claude signed in · project chosen · git available | no |

Without **Start** and **Readiness** the word "cockpit" is not true; the screen would be a
status display.

### Naming options

| Name | For | Against |
|---|---|---|
| **Great CTO** (app), tagline "the cockpit for your AI team" | keeps the brand, the site and the npm name; "the CTO you do not have" is a real pitch to a founder | "CTO" is a technical word |
| great_cto Cockpit | says what it is | long; underscore in an app name |
| Crew / Flight Deck / Bridge | friendlier | new brand, new domain; names not checked for conflicts |

Recommendation: **Great CTO**, with "cockpit" in the tagline, not in the name. Trademark and
App-name conflicts were not checked.

### What must change, and what kind of change it is

| Change | Kind |
|---|---|
| README hero line, opening paragraph, a "No terminal" quick start above the CLI one | copy only |
| npm and marketplace descriptions, `manifest.webmanifest` name and description | copy only |
| `docs/DETAILS.md` and FAQ: audience, "what you still need" | copy only |
| Site hero, audience section, download button | **design change** — Claude Design mockup, current next to proposed, desktop and mobile |
| Board: first-run / readiness screen | **design change** (the declutter approval lists first-run as not yet designed) |
| Board: "What do you want built?" on Home, team strip | **design change**, on top of the approved Home mockup |
| Board: renaming Fleet → Team, Harness → Settings, plain-language gate cards | **design change** — visible wording in the admin |
| App window chrome, menu-bar item, icon | **design change** |

No mockup was made in this pass. The first-run screen looks different under options A, B and
C, so a mockup before the owner picks one would be approved for the wrong flow. It is the
first task after the decisions below.

## 5. Risks, and what I would not do

| Risk | Why it matters | Mitigation |
|---|---|---|
| Easy install, hard product | the user installs in a minute and then meets git, architecture gates and hosting | phases 0 and 1 before any `.dmg`; `ship-only` default; plain-language cards |
| Licensing of option B | a public product for non-developers built on other people's subscription login | written answer from Anthropic first; option C ready |
| ADR-045 activation still refuses | no audience can install today | finish the admitted activation route first; it is the precondition of everything here |
| Support load | non-developers ask for help where developers read logs | first-run self-checks, a "copy diagnostic report" button; decide support channel before launch |
| Fourth channel doubles release failure points | a half-published release (npm new, `.dmg` old) | `.dmg` embeds the admitted tarball; one index; chain stops on red |
| Cost surprise | "$171 for a product" is unexpected for a non-developer | budget asked on first run; spend caps already refuse instead of warn |
| Start-from-board spends money and edits a repository | this is why launch was removed | re-introduce only with an ADR: explicit confirmation, worktree isolation, budget, one task at a time |
| Brand confusion with Anthropic | the SDK page forbids "Claude Code" branding | "Powered by Claude" only |

**I would not:**

- ship a `.dmg` before the cockpit can start work;
- ask for, store or proxy Claude account credentials;
- bundle git or a coding agent binary into the app;
- add an auto-updater, telemetry or any install ping in the first version;
- build an Electron or Tauri sample now (disk is tight and the decision does not need it);
- promise "no code, live product" on the site — hosting and domain stay human-gated steps;
- rewrite the README's evidence-first claims into marketing; the cockpit pitch sits on top of them.

## Recommended path

| Phase | What the user gets | New channel | Days | Main risk |
|---|---|---|---|---|
| **0. Decide and test by hand** | nothing shipped. Owner picks audience; 3–5 non-developers are walked through today's install while we note where each one stops; question sent to Anthropic; first-run and cockpit mockups for approval | no | 2–3 | the test shows the stall is hosting, not install — then phase 2 is the wrong investment |
| **1. Cockpit in the board** (npm) | readiness checklist, "What do you want built?", start/stop from the board, plain-language decisions, approved Home | no | 9–13 | headless pipeline does not hold gates correctly; licensing answer |
| **2. Signed `.dmg`** | download, drag, open; no Node, no terminal; login item; notifications; "new version" notice | **yes** | 7–10 + Apple account | notarization, clean-machine issues, release chain length |
| **3. Later** | verified auto-update; API-key route; Windows/Linux | — | 4–6 / 8–12 / 6–10 | each needs its own decision |

Precondition for all phases: the ADR-045 admitted activation route works, so that `init` (or
its equivalent inside the app) can actually enable the plugin.

## ADR outline: desktop app as a distribution channel

Number: the next free one (047 is the latest in `docs/adr/`).

- **Context.** New audience without terminal or Node. Channels today: npm, Claude plugin,
  Codex plugin. ADR-009: a channel escapes the machine. ADR-045: nothing activates before
  admission. ADR-007: board always on.
- **Decision (proposed).** A macOS app (`.dmg`): native shell, bundled Node runtime, the board
  server and CLI taken byte-for-byte from the admitted npm tarball. Distributed as a GitHub
  release asset and from the site.
- **Trust.** Developer ID + notarization for the OS; the `.dmg` is a blob in the ADR-045 index
  with an Ed25519 sidecar. Amend ADR-045's fixed blob count. The app refuses to run a bundled
  runtime whose digest differs from the index it shipped with.
- **Updates.** Version 1: notify only, reusing the documented registry `GET`, same opt-out. No
  download-and-replace. A real updater is a separate ADR with a `docs/PRIVACY.md` change.
- **Privacy.** No telemetry, no install ping, no first-run network call except the update
  check. `docs/PRIVACY.md` gains an "App" section in the same change.
- **Agent host.** The app does not embed or authenticate a coding agent. It detects the user's
  own Claude Code / Codex, guides install and sign-in, and starts work through it. Alternative
  recorded: Agent SDK with the user's API key.
- **Authority.** Signing and notarization happen only with the owner present. The chain stops
  on any red stage; npm is not published if the `.dmg` stage failed, or the release is marked
  partial and says so.
- **Verification.** Playwright E2E against the server inside the built bundle; a clean-account
  checklist (Gatekeeper, first launch, login item, notification, uninstall) recorded per release.
- **Rollback.** Remove the asset and the site link; the previous `.dmg` stays downloadable;
  npm and plugin channels are unaffected. Uninstall = delete the app and the login item;
  `~/.great_cto` is user data and stays.
- **Alternatives.** PWA + daemon (earlier RFC); Electron; Tauri; Mac App Store (sandbox
  forbids spawning the user's CLI — not viable); Homebrew cask (still a terminal).
- **Open.** Anthropic's answer on option B; who owns the Apple account; support channel.
- **Separate ADR needed:** "The board may start work" — reverses the removal in `d3a001c8`,
  with confirmation, budget and isolation rules.

## Decisions only the owner can make

1. **Audience.** Commit to non-developers as a first-class audience, or keep them as "later"
   and do phase 1 for developers only.
2. **Agent host route.** B (drive the user's own CLI) pending Anthropic's answer, with C as
   fallback — or C from the start.
3. **Start-from-board.** Allow the board to launch agents again, under a new ADR.
4. **New channel.** Approve the `.dmg` channel ADR (ADR-009), including the ADR-045 amendment.
5. **Apple Developer account.** Whose identity signs the app; $99 per year.
6. **Updater and privacy.** Notify-only in version 1 (recommended) or a real updater with its
   own ADR.
7. **Name.** "Great CTO" with the cockpit tagline, or another.
8. **Order.** Cockpit first, then `.dmg` (recommended), or `.dmg` first.
9. **Mockups.** Go-ahead to prepare the first-run and cockpit-home mockups in Claude Design
   once 1–3 are answered.

## Owner's decisions (2026-11-10)

| # | Question | Decision | Consequence |
|---|---|---|---|
| 1 | Audience | Non-developers are a first-class audience | README, site and board copy follow section 4 |
| 2 | Agent host | Drive the user's own CLI; API key is the fallback. Conditional on Anthropic's answer | Question drafted in `docs/product/PHASE0-non-developer-validation.md`; the owner sends it |
| 3 | Start from the board | Allowed again, under a new ADR | Draft: [ADR-049](../adr/ADR-049-board-starts-work.md) |
| 4 | `.dmg` channel | ADR to be written, with the ADR-045 amendment | Draft: `ADR-DRAFT-desktop-app-channel.md` |
| 5 | Apple Developer account | The owner's personal account, provided later | Blocks signing only; phases 0 and 1 do not need it |
| 6 | Updates | A real updater, with its own ADR | Draft: `ADR-DRAFT-app-updater.md`. This replaces "notify only" in section 3: the updater moves from phase 3 into phase 2, which grows from 7–10 to about 11–16 days |
| 7 | Name | **Open.** The reply repeated the options without choosing | Mockups use "Great CTO" as a working name |
| 8 | Order | Cockpit first, then `.dmg` | Phase 1 before phase 2 |
| 9 | Mockups | Go-ahead | First run and cockpit Home: https://claude.ai/artifact/1aEcghVTBUJYnzwrXtAejq — **approved by the owner on 2026-11-10** as published in version 7 (six artboards). The approval covers these screens only; it does not authorize code before the ADR drafts are accepted |

The three ADR drafts sit in `docs/rfc/` as drafts. They get numbers and move to `docs/adr/`
when the owner accepts their text; until then none of them authorizes code.

### Mockups

| Mockup | Link | State |
|---|---|---|
| First run (readiness) and cockpit Home | https://claude.ai/artifact/1aEcghVTBUJYnzwrXtAejq | approved 2026-11-10, version 7 |
| Decision screen (plain-language brief, Approve / Send back) | https://claude.ai/artifact/1Rh5ciqwVNhcWfuQpfxHiV | approved 2026-11-10, version 5 |
| App window, menu-bar item, icon; site download page | — | not made |

Decided by the owner on 2026-11-10 with the decision mockup: a non-developer gets **two
stops** by default — what gets built, and whether it ships (`product-only` in the README
table). Today's default `gates-only` has three; changing the default for projects created
from the cockpit is a behaviour change that belongs in the "board may start work" ADR.
Regulated products keep their security, compliance and ship gates at every level.

## Headless check, attempt 1 (2026-11-10): did not reach the pipeline

Set-up: a throwaway Node CLI project outside the repository, `approval-level: product-only`,
one task given as `claude -p '/great-cto:start …' --permission-mode acceptEdits --model sonnet
--max-budget-usd 3 --output-format json`, run by the owner from a plain terminal (a project
hook forbids `claude -p` from inside an agent session). Claude Code 2.1.316.

Result: the run ended in about 10 seconds with
`Failed to authenticate: OAuth session expired and could not be refreshed`. Cost $0, one
turn, exit code 1. The question "does the pipeline hold its gates headless" is **still
unanswered**.

What the failed run did show, each observed on disk:

| Observation | Why it matters for the cockpit |
|---|---|
| The CLI's sign-in was expired on a machine where the Claude desktop app was signed in and working at the same moment | "Claude is installed" and even "the desktop app is signed in" do not prove the CLI can run. The readiness check has to probe the CLI itself. Whether the two sign-ins are separate by design, or this token had simply lapsed, is **not proven** |
| The JSON result says `"subtype": "success"` together with `"is_error": true`; only the exit code and `is_error` show the failure | Start must decide on `is_error` and the exit code, never on `subtype` |
| Before authentication was attempted, session hooks had already written about 45 KB of files into the project's `.great_cto/` | A failed start is not side-effect free in the user's folder |
| A task record for the run appeared in the real state home (`~/.great_cto/work-tasks/`), phase `waiting`, although `GREAT_CTO_HOME` pointed to another directory and nothing ran | (1) A start that failed at sign-in leaves a task that looks like it waits for the user. Start needs a failure state. (2) At least one writer ignores `GREAT_CTO_HOME`; which one was not traced |
| The shared project registry (`projects.json`) was byte-identical before and after | no leak there |

Added to the "board may start work" requirements: probe sign-in before Start is enabled; a
start that fails before the first model call is recorded as failed with the reason and
leaves no waiting task.

### Attempt 2 (2026-11-10): same result

The rerun ended the same way in 17 seconds: same authentication error, $0, exit code 1.
Right after it, `claude auth status` answered `"loggedIn": false, "authMethod": "none"`,
both in a clean environment and in the environment of a working Claude desktop app session
on the same machine.

This makes the first observation firmer: **on this machine the desktop app is signed in and
working while the CLI reports that it is not signed in.** For a non-developer this is the
whole of option B's first step: installing and signing in to the desktop app is not enough;
the CLI needs its own sign-in, and today that is done in a terminal. Still not established:
whether that is how the two products are meant to behave, or a state particular to this
machine. It goes into the question for Anthropic.

`claude auth status` is a free, read-only probe that returns JSON. It is the natural
implementation of the readiness check "Claude, signed in".

The gate question remains unanswered until the CLI is signed in.

### Attempt 3 (2026-11-10): the CLI ran headless; the pipeline was not entered

After a CLI login (`claude auth status`: `loggedIn: true`, `authMethod: claude.ai`,
subscription `max`) the same command completed: exit 0, 29 seconds, 4 turns, reported cost
$0.48, model `claude-sonnet-5-5`, no permission denials. The change was made and the
project's tests pass (3 of 3, as reported by the run; not re-run by me).

| Observation | Why it matters |
|---|---|
| Headless `claude -p` with a plugin slash command works under a subscription login, with no terminal attached | Option B is technically feasible. Whether it is permitted for this product is still the question for Anthropic |
| The task was treated as a small change and done inline: six shell calls, no specialist agents, no decision stop | Correct by the triage rules, but it means this run says nothing about gates. A pipeline-sized task is needed (step 2 script prepared) |
| The final message ends with a question to the user ("commit it?") and the process exits | Headless, nobody is there to answer. The cockpit has to turn a closing question into a "Needs you" item, or the run has to be told not to end on one |
| The task record in `~/.great_cto/work-tasks/` stays `waiting` after the run finished successfully, as it did after the two failed runs | The record does not distinguish "failed to start", "finished" and "waits for a decision". Home's "In flight" and "Needs you" cannot be built on it as is |
| A separate `claude -p` process, started by the session-end hook ("The session in this project just ended…"), was still running more than 90 seconds after the run returned | It spends tokens outside `--max-budget-usd` and outside the reported $0.48. A budget shown to a non-developer must include it, or the hook must not run for cockpit starts |
| All shell commands ran under `acceptEdits` with no denial on this machine | This machine's settings allow them. On a fresh machine they may be denied: **unverified** |
| The shared project registry was byte-identical before and after all three runs | the fixture did not appear on the running board through the registry |

### Step 2 (2026-11-10): a pipeline-sized task — the decision stop did not hold

Command: the same headless call, with a task that asked for a web app (server, page, API,
tests, README) and said "use the full pipeline". Project `approval-level: product-only`.
Result: exit 0, 57 seconds, 4 turns, reported cost $0.56, one model, three shell calls.

| Observation | Evidence |
|---|---|
| **The run built the feature before any human decision.** It wrote the product brief and the architecture note itself and implemented straight away | new files `src/server.js`, `src/greetings.js`, `src/page.js`, `test/server.test.js`, `docs/product/BRIEF-greeting-web.md`, `docs/architecture/ARCH-greeting-web.md` in one run |
| **The product decision exists only as a sentence.** | `BRIEF-greeting-web.md` line 7: "Gate:product: auto-recorded as proposed; no human was available in this headless run." No gate task was created: the project has neither a Beads store nor `.great_cto/tasks.md`, so the board has nothing to show under "Needs you" |
| **No specialist agent ran.** No reviewer, QA or security pass | the session used only the shell tool, three times; the run's own report says "I spawned no agents" |
| The run said so itself and did not claim the work was done | final message: "The pipeline was compressed… The product gate is only recorded as proposed" |
| It could not verify its own work: tests that start a server were cancelled because local port binding was refused | one permission denial; `npm test` reported 3 passed, 10 cancelled |
| The task record is `waiting`, like the three before it | `~/.great_cto/work-tasks/` |

**Answer to the open question:** `claude -p '/start …'` is **not** a route the board can use
to start work. With nobody to ask, the model does not stop at the decision; it notes the
decision as "proposed" and continues. This is one run with one model, so it is evidence, not
a measurement of how often it happens. For a control that spends a user's money and promises
"nothing is built until you answer", one counter-example is enough.

Consequence for phase 1: Start has to go through a controller that owns the stages and stops
the process at a decision by construction — the way `scripts/codex-pipeline.mjs` runs
controlled Codex tasks — with each stage a separate headless call that cannot reach the next
one. The stop then does not depend on the model choosing to stop. That is more work than
calling `/start` headless: the phase 1 estimate for "start/stop from the board" rises from
4–6 to about 8–12 days, and phase 1 as a whole from 9–13 to about 13–19 days. The existing
controller was read on 2026-11-11: it already routes roles to Claude Code and owns the gates;
the gaps and slices are in [PLAN-phase1-cockpit.md](PLAN-phase1-cockpit.md).

Total spent on the check: $0.48 + $0.56 reported by the two successful runs, plus the
session-end hook's own calls, which are not in those figures.

## ADR-049 accepted (2026-11-11)

The owner accepted "The board may start work" as
[ADR-049](../adr/ADR-049-board-starts-work.md). The channel and updater drafts stay drafts;
they are needed for phase 2.
