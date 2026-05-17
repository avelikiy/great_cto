# Phase — great_cto Board Companion (browser extension)

**Status:** Draft (2026-05-15)
**Author:** o.velikiy
**Surface:** `browser-extension` (Chrome MV3 + Firefox MV3 parity)

## Problem

The great_cto board lives at `http://localhost:3141` (or per-project port).
The solo CTO opens it 5-10 times a day, but the board is reactive — you have
to open it to see what's there. The signals that matter for "drop everything
and look" are:

1. A `gate:plan` or `gate:ship` task transitioned to pending status.
2. A P0 incident was filed (`priority:p0` label appeared).
3. A `senior-dev` agent emitted a BLOCKED verdict (stuck task).
4. The cost panel crossed a daily-spend threshold (configurable; default $5/day).

None of these have to wait for the human's next board visit. A lightweight
browser extension can poll the board's existing `/api/inbox` and `/api/metrics`
endpoints in the background and pop a toolbar badge / native notification.

## Goal

Make the board's most important signals push-not-pull, without leaving the
single-file board UI architecture or adding a SaaS layer. Extension is
**local-network only** — talks to the user's own `localhost:<port>` board.

## Non-goals

- Cloud sync / cross-device push (board is local; extension stays local)
- Editing tasks from the extension (read-only surface; click-through to board)
- Auth (board has no auth today; extension respects that)
- Mobile extension (Safari iOS extensions are out — desktop only)

## Surfaces in the extension

1. **Toolbar icon + badge** — colored dot + count when something needs attention
2. **Popup** (click toolbar icon) — list of pending items + one-line stats
3. **Options page** — board URL, poll interval, notification thresholds, opt-in to native OS notifications
4. **Background service worker** — polls `/api/inbox` + `/api/metrics` every N seconds
5. **Content script** — **NONE** (we don't inject into pages; extension is self-contained)

## Inputs available

Existing board endpoints — no server changes required:

- `GET /api/inbox?project=<slug>` — `{ pending_gates, p0_open, blocked, stale }`
- `GET /api/metrics?project=<slug>` — `{ cost.llm_usd, tasks.in_progress, ... }`
- `GET /api/projects` — list of registered projects (extension can poll one or all)

## Constraints

- **Manifest V3.** Chrome dropped V2; Firefox supports V3.
- **Minimum permissions.** No `host_permissions` beyond what the user
  configures (default: `http://localhost/*` and `http://127.0.0.1/*`).
- **No content scripts.** Reduces review friction for both Chrome Web Store
  and AMO.
- **No remote code.** Pure local logic; no fetch to anything but the user's
  board URL.
- **Privacy:** zero outbound traffic except to the configured board host.
  Document this in the listing.
- **Light + dark theme** — match system `prefers-color-scheme`. Popup is
  the only place where this matters (options page can be system-default).
- **Popup viewport:** 360×480 max (Chrome's hard cap is 800×600, but 360
  is the sweet spot for a notification surface).
- **Accessibility:** WCAG 2.2 AA. Solo CTO is the primary user; keyboard
  + screen-reader support is non-negotiable.

## Stack

- TypeScript (compile-only; no framework runtime)
- Single bundle per surface (popup, options, service worker)
- Vite for the build; outputs flat `dist/` with `manifest.json`
- Vitest for unit tests; Playwright for popup smoke

## What "done" looks like

A user installs the extension from the Chrome Web Store, opens the options
page, enters `http://localhost:3141`, picks a project from the auto-populated
list, sets thresholds, and closes the page. Within 30 seconds the toolbar
badge reflects current inbox state. When a `gate:plan` task lands, the badge
turns amber within the poll interval; clicking the icon opens the popup with
a one-line summary and a deep-link to the board's `/inbox` view.
