---
surface: web
platform: browser-extension
target: Chrome MV3 + Firefox MV3
slug: board-companion-extension
agent: design-advisor
version: 1.2
date: 2026-05-15
---

# DESIGN — great_cto Board Companion Extension

Pre-implementation design contract for the MV3 browser extension that polls
the local board and surfaces inbox/cost signals via toolbar badge, popup,
options page, and (opt-in) native OS notifications.

> Surface classification: `web` per applies_to. **§6.5 added anyway** —
> browser-extensions carry platform-integration concerns (manifest
> permissions, notifications API, storage, service worker lifecycle, CSP,
> host_permissions) that pure web pages do not. Treating this as `web-only`
> would silently invent those decisions; making §6.5 explicit forces them
> through review. See §6.5 preamble.

---

## 1. Design system pick

- **Decision:** **Custom CSS with shadcn-style token primitives**, no framework runtime. Single `tokens.css` (semantic vars) + plain HTML/CSS/TS per surface. No React, no Tailwind, no shadcn install.
- **Context:** Extension constraint is a single TypeScript bundle per surface with no remote code and minimum permissions. Popup is 360×480, ~6 components. A framework runtime (React 45kB+) is dead weight; shadcn brings React+Radix as a transitive cost. The brief explicitly says "TypeScript (compile-only; no framework runtime)." MV3 reviewers (Chrome Web Store, AMO) reward leaner bundles and stricter CSP — easier to pass with vanilla DOM.
- **Alternatives considered:**
  - **shadcn/ui** — rejected: pulls React+Radix runtime into every surface; ~50kB gz overhead per popup boot. The popup must render in <100ms after click; React hydration on every open is a regression.
  - **Tailwind utility CSS** — rejected: utility classes inline against a tokens.css approach the board already uses; doubling the system fragments brand. Tailwind's preflight is also heavier than 6 components warrant.
  - **Lit / Web Components** — rejected: ~6kB runtime is acceptable but adds shadow-DOM a11y complexity (focus delegation across roots) for no shared-state benefit. We don't have a component-reuse problem at this scale.
- **Consequences:**
  - Cheap: tiny bundle, instant popup paint, easy MV3 CSP compliance (`script-src 'self'`), simple to port to Firefox.
  - Locked-in: if the extension grows beyond ~15 components (e.g. adds project-switcher, task-detail drawer), we will refactor to Lit or import a thin framework. Migration cost: ~1 day per surface — acceptable because token names match the board.
  - Reuse: token names (`--color-bg`, `--color-accent`, etc.) mirror the board's single-file UI so dark-mode parity is automatic if/when the board adopts dark mode.

> Confidence: high · invented: nothing — choice is constrained by brief (TypeScript compile-only, no framework runtime, MV3 CSP).

---

## 2. Component inventory

Representative set only — implementation will discover ~2× more (helper rows, dividers, the various badge variants per state). Naming the top-level primitives; senior-dev will create the long tail.

| Component | Source | Props (key ones) | States | Notes |
|---|---|---|---|---|
| `Button` | custom (vanilla) | `variant` (primary/ghost/icon), `disabled`, `aria-label` | default, hover, focus, active, disabled, loading | reuse across popup + options |
| `InboxRow` | custom | `kind` (gate/p0/blocked/stale/cost), `label`, `count`, `href` | default, hover, focus, pressed | popup list item; click opens board deep-link in new tab |
| `BadgeDot` | custom | `tone` (idle/info/amber/danger), `count` | n/a (presentational) | toolbar icon overlay — drawn server-side via `chrome.action.setBadgeText/BackgroundColor` |
| `EmptyState` | custom | `message`, `iconKind` | default, loading | popup shown when inbox empty or first poll pending |
| `FormField` | custom | `label`, `helpText`, `error`, `required` | default, focus, error, disabled | options page (board URL, poll interval, threshold inputs) |
| `Toggle` (checkbox) | custom (native `<input type=checkbox>` restyled) | `checked`, `disabled`, `aria-describedby` | unchecked, checked, focus, disabled | options page (enable native notifications, per-signal opt-in) |
| `Toast/Banner` (inline status) | custom | `tone`, `dismissible` | default, dismissed | options page — "Saved", "Cannot reach board", "Permission required" |

**Honesty:** 7 components named; expect ~15 by ship (e.g. `LastPolledStamp`, `ThresholdInput`, `ProjectPicker`, divider rules, skeleton variants, "open board" footer link). Long tail is implementation detail.

> Confidence: high · invented: nothing — every component traces to a brief surface (popup list, options form, badge).

---

## 3. Wireframe-as-text

### 3.1 Popup — `popup.html` (360×480, fixed)

```
Route: chrome-extension://<id>/popup.html
─────────────────────────────────────────────
[Header (h=44px):
  · logo-dot 16px (BadgeDot tone matches toolbar)
  · project name "great_cto"  ▾  (ProjectPicker — if >1 project)
  · IconButton (gear) → opens options page in new tab
]
[Status strip (h=24px):
  · "Updated 12s ago" muted small  · poll spinner (only during fetch)
]
[Body (scrollable, max h=380px):
  · SectionLabel "Needs attention" (sr-only if list empty)
  · InboxRow × N  (gate:plan pending · gate:ship pending · p0 incidents · blocked verdicts · stale tasks · cost alert)
  · EmptyState  (only when N=0:  "Inbox clear · last poll 12s ago")
]
[Footer (h=36px):
  · TextLink "Open board ↗" → board /inbox in new tab
]
─────────────────────────────────────────────
Focus order: ProjectPicker → SettingsIcon → InboxRow 1..N → "Open board" link
Live-region: Status strip is aria-live="polite" — announces "Inbox updated, 2 items" after each poll only if list contents changed
```

**Interaction states per region (popup):**

```
Region: ProjectPicker (button + dropdown)
  default:   bg transparent, border 1px var(--color-border-subtle)
  hover:     bg var(--color-surface-hover)
  focus:     2px outline-offset 1px outline var(--color-accent)
  active:    aria-expanded="true", bg var(--color-surface-active)
  disabled:  opacity 0.5, no pointer-events (only when 1 project registered)
  loading:   skeleton 80px wide × 16px tall (first paint before projects load)

Region: SettingsIcon (icon button)
  default:   color var(--color-text-muted)
  hover:     color var(--color-text)
  focus:     2px outline-offset 1px outline var(--color-accent)
  active:    color var(--color-accent)  (while opening options tab)
  disabled:  n/a
  loading:   n/a

Region: InboxRow
  default:   bg var(--color-surface), border-left 3px var(--color-border-subtle)
  hover:     bg var(--color-surface-hover), border-left 3px var(--tone-color)  (tone-color = amber/danger/info per kind)
  focus:     bg var(--color-surface-hover), 2px outline-offset -2px outline var(--color-accent)
  active:    bg var(--color-surface-active) while click-through pending  (state attribute: data-pressed="true")
  disabled:  n/a (rows are always actionable — if no link, hide the row)
  loading:   skeleton 100% × 32px, shimmer per §6

Region: "Open board ↗" (text link)
  default:   color var(--color-accent), underline on hover only
  hover:     underline, color var(--color-accent-strong)
  focus:     2px outline-offset 2px outline var(--color-accent)
  active:    color var(--color-accent-strong)
  disabled:  n/a
  loading:   n/a
```

**State attribute for current selection:** `ProjectPicker` open row uses `aria-selected="true"`. `InboxRow` does not have a "current" concept (popup is stateless list).

### 3.2 Options page — `options.html` (responsive, system theme)

```
Route: chrome-extension://<id>/options.html
─────────────────────────────────────────────
[Header (h=56px): page title "Board Companion · Settings" · version badge]
[Main (max-width 640px, centered):
  · Section "Board connection"
    - FormField "Board URL"  (default http://localhost:3141)  · helpText "localhost or 127.0.0.1 only"
    - Button "Test connection"  · inline status (Banner: ok / error)
    - FormField "Project"  (select, populated from /api/projects)  · helpText "Pick one or 'All projects'"
  · Section "Polling"
    - FormField "Poll interval"  (number, sec)  · default 30  · min 10, max 300  · helpText "Lower = fresher, higher = less battery"
  · Section "Notifications"
    - Toggle "Show native OS notifications"  (default off — requires permission grant)
    - Per-signal Toggle group:  gate:plan · gate:ship · p0 incident · blocked verdict · stale task · cost threshold
    - FormField "Cost threshold ($/day)"  · default 5  · only enabled if "cost threshold" toggle on
  · Section "About"  (links: source repo, version, permissions explanation)
]
─────────────────────────────────────────────
Focus order: skip-link → board URL → test btn → project select → poll interval → notif toggle → per-signal toggles (top-to-bottom) → cost threshold → save
Save behavior: each field saves to chrome.storage.sync on blur or Enter (auto-save, no Save button); Banner "Saved" appears via aria-live="polite"
```

**Interaction states per region (options):**

```
Region: FormField (text/number input)
  default:   border 1px var(--color-border), bg var(--color-bg-input)
  hover:     border-color var(--color-border-strong)  (web — n/a if touch screen)
  focus:     border-color var(--color-accent), box-shadow 0 0 0 3px var(--color-accent-soft)
  active:    same as focus  (typing)
  disabled:  bg var(--color-surface-muted), opacity 0.6, no caret
  loading:   readonly + spinner suffix (only while "Test connection" runs)
  error:     border-color var(--color-danger), error message rendered below w/ aria-describedby

Region: Toggle (checkbox)
  default:   border 1px var(--color-border), bg var(--color-bg-input)
  hover:     border-color var(--color-border-strong)
  focus:     2px outline-offset 2px outline var(--color-accent)
  active:    bg var(--color-accent) (when checked)
  checked:   bg var(--color-accent), checkmark var(--color-accent-text)  (state attribute: native :checked)
  disabled:  opacity 0.5, no pointer-events

Region: Button "Test connection"
  default:   bg var(--color-accent), color var(--color-accent-text)
  hover:     bg var(--color-accent-strong)
  focus:     2px outline-offset 2px outline var(--color-accent)
  active:    bg var(--color-accent-stronger), transform translateY(1px)
  disabled:  opacity 0.5, cursor not-allowed
  loading:   text "Testing…" + inline spinner, pointer-events none, aria-busy="true"
```

### 3.3 Toolbar badge (no DOM — drawn via `chrome.action`)

```
Surface: toolbar icon (16px / 32px / 48px / 128px raster from /icons/)
States (set via chrome.action.setBadgeText + setBadgeBackgroundColor):

  idle / empty:
    badge text: ""    (no overlay)
    icon tint:  default (full color)
    title:      "Board Companion — inbox clear"

  info (gate pending, non-urgent):
    badge text: "<count>"
    badge bg:   var(--color-info)       — blue
    title:      "Board Companion — 2 items pending"

  amber (blocked, stale, cost approaching):
    badge text: "<count>"
    badge bg:   var(--color-warning)    — amber
    title:      "Board Companion — 1 blocked task, 1 stale"

  danger (p0 incident OR cost over threshold):
    badge text: "!"  OR  "<count>"
    badge bg:   var(--color-danger)     — red
    title:      "Board Companion — P0 incident open"

  error (cannot reach board):
    badge text: "?"
    badge bg:   var(--color-text-muted) — gray
    title:      "Board Companion — board unreachable (last ok 5m ago)"
```

States are mutually exclusive; highest severity wins (danger > amber > info > idle > error).

> Confidence: high · invented: nothing for popup/options; for badge — tone-to-state mapping is inferred from the brief's "colored dot when something needs attention" but the exact precedence (does `error` outrank `info`?) is a §9 question.

---

## 4. A11y contract — web branch

### 4.1 WCAG level
- WCAG 2.2 AA across all three surfaces.
- Solo CTO is primary user — keyboard + screen reader must work day-1.

### 4.2 Keyboard map

- **Popup:**
  - Tab cycles: ProjectPicker → SettingsIcon → InboxRow[0..N] → "Open board" link → (wraps).
  - Enter / Space on InboxRow opens deep-link in new tab; popup closes.
  - Esc closes popup (browser default — do not preventDefault).
  - ProjectPicker: Down/Up arrow moves within open dropdown, Enter selects, Esc collapses.
- **Options:** standard form keyboard (Tab, Enter submits "Test connection", Space toggles checkboxes). No custom shortcuts.

### 4.3 ARIA landmarks

- Popup: `<header role="banner">` + `<main>` (list) + `<footer role="contentinfo">`. List itself uses `<ul role="list">` + `<li>` rather than `role="listbox"` — these are link rows, not options.
- Options: `<header>` + `<main>` with `<section aria-labelledby="...">` per group + `<footer>`.

### 4.4 Contrast minimums
- Body text 4.5:1, large text + UI 3:1.
- Badge text on badge bg ≥ 4.5:1 in every tone (verify: white on amber `#B45309` ✓, white on red `#B91C1C` ✓, white on blue `#1D4ED8` ✓, white on gray `#6B7280` ✓).
- Focus ring must be visible against both light + dark popup bg (use `outline: 2px solid var(--color-accent)` + `outline-offset` — accent must hit 3:1 on both surface colors).

### 4.5 MUST FAIL list (web)

- No `outline: none` without replacement focus indicator.
- No `aria-hidden="true"` on focusable elements (and the popup must not aria-hide the list during poll refresh — see §4.6).
- No color-only signal — every tone is paired with text ("P0 incident") or icon shape (! vs count).
- No focus trap inside the popup (popup is its own browsing context; user must be able to Tab out via browser chrome).
- No autofocus on options-page text inputs (steals focus from user landing on the page).
- Icons used as the sole label must carry `aria-label` (SettingsIcon).
- Badge text alone is not accessible — `chrome.action.setTitle()` carries the human-readable status for every state.

### 4.6 Focus management on dynamic content swap (REQUIRED — popup refreshes on poll tick)

The popup list refreshes every poll interval (default 30s) while open. Contract:

- **Default: focus does NOT move when the list re-renders.** If the user is on an InboxRow when the poll tick fires, focus stays on that DOM node (re-render uses key-based diffing on row id; keep node identity stable).
- **If the focused row disappears** (item resolved server-side and removed from inbox): focus falls back to the nearest stable ancestor — the `<ul>` list container, which is itself in the Tab order via `tabindex="-1"`. Announce the change once via the status strip aria-live region: "1 item resolved".
- **If a new row appears at the top of the list**: do NOT move focus. Announce "1 new item" via status strip aria-live="polite".
- **On popup open**: focus the ProjectPicker by default (NOT the first row — opening the popup is exploratory, not action-imminent). If the popup is opened from a native notification click (future), focus the linked row directly.
- **On click-through (row activation)**: popup closes (browser default for action popups); no focus restoration needed because browser returns focus to the toolbar icon automatically.

> Confidence: high · invented: nothing — patterns map directly to WAI-ARIA Authoring Practices for live regions and the brief's "popup polls every N seconds" requirement.

---

## 5. Responsive contract

**Popup is fixed 360×480 — no responsive matrix needed.** Chrome's action popup cannot exceed 800×600 and cannot be resized by the user, so the brief's "360 sweet spot" is hard-coded. We do NOT support mobile viewports for the popup (mobile is explicitly out of scope per the brief — Safari iOS extensions excluded).

**Options page is responsive** but the realistic viewport range is desktop-only (extensions open in a browser tab):

| Region | <640px (narrow) | ≥640px (default) |
|---|---|---|
| Main column | full-width with 16px padding | max-width 640px, centered |
| FormField label | stacks above input | stacks above input (same; we do not switch to side-by-side because labels grow in i18n) |
| Per-signal Toggle group | one per row | one per row (no grid even at wide) |

No touch-target adjustments needed (extension is desktop-only). Container queries: not needed at this scale.

> Confidence: high · invented: nothing — fixed-popup is a platform constraint, not a design choice.

---

## 6. Motion contract

Reduced-motion (`prefers-reduced-motion: reduce`): all transitions degrade to instant (`transition: none`). Skeleton shimmer becomes a static muted block. Banner appears/disappears with no fade.

Max interactive-feedback duration: 150ms. Where motion is BANNED: any looping animation on the popup body (it's a notification surface, looping is anxiety-inducing); auto-collapsing rows.

Motion entries (property + direction + duration + easing):

```
popup open (browser-handled, but we control content fade):
  opacity 0 → 1                                            120ms ease-out
  + transform translateY(4px → 0)                          120ms ease-out

inbox row entry (new item appears via poll):
  opacity 0 → 1                                            150ms ease-out
  + transform translateY(-4px → 0)                         150ms ease-out
  (suppressed under prefers-reduced-motion)

inbox row exit (item resolved):
  opacity 1 → 0                                            100ms ease-in
  + height auto → 0                                        120ms ease-in
  (suppressed under prefers-reduced-motion → display:none immediately)

skeleton shimmer (loading state):
  background-position: -200px → 200px                      1200ms linear infinite
  (under reduced-motion: solid var(--color-surface-muted), no animation)

button press (active feedback):
  transform translateY(0 → 1px)                            80ms ease-out

banner enter (options page "Saved"):
  opacity 0 → 1                                            120ms ease-out
  + transform translateY(-2px → 0)                         120ms ease-out

banner exit (auto-dismiss after 2s):
  opacity 1 → 0                                            150ms ease-in

badge tone change (chrome.action — actually instant; we do not animate badge):
  n/a — chrome.action API does not support transitions; tone flips are atomic
```

No `transform` on toolbar badge (API limitation — not a design choice). No motion on the toolbar icon itself.

> Confidence: high · invented: nothing — durations follow §6 ≤200ms rule; direction (translateY) chosen to suggest "appearing from above" matching popup spawn point under toolbar.

---

## 6.5 Platform integration contract — **ADDED for browser-extension despite `surface: web`**

**Why this section exists for a `web` surface:** browser-extensions sit between a web page and a native app. Manifest permissions, the notifications API, storage quotas, service worker lifecycle, CSP, and host_permissions are all decisions that pure web pages don't have. v1.2 spec marks §6.5 as `mobile/hybrid only`; including it here is a **deliberate deviation** logged as v1.3 feedback (see report). If we skipped this, six MV3-specific decisions would be silently invented by senior-dev and only caught at Chrome Web Store / AMO review.

### Manifest permissions

| Permission | Required? | When prompted | Why |
|---|---|---|---|
| `storage` | yes | install (silent) | persist board URL, poll interval, notification opt-ins (`chrome.storage.sync`) |
| `notifications` | optional | first time user enables native notifs in options | OS-level toast for p0 / cost-threshold events |
| `alarms` | yes | install (silent) | service-worker keepalive — `chrome.alarms.create("poll", { periodInMinutes: <interval/60> })`; required because MV3 service workers cannot run a `setInterval` reliably |
| `host_permissions` | optional, user-driven | options page on first board URL save | `http://localhost/*` + `http://127.0.0.1/*` by default; user adds custom ports/hosts via options. Default install ships with NO host_permissions — extension is inert until user opts in |

**Not requested:** `tabs`, `activeTab`, `scripting`, `<all_urls>`, `webRequest` — explicitly avoided to keep the store-review surface minimal (matches brief's "minimum permissions" constraint).

### Notifications API consent

- Native notifications are **off by default**. Options page toggle requests `chrome.permissions.request({ permissions: ["notifications"] })` on the first toggle-on. If user denies, toggle reverts and Banner shows "Notification permission denied — enable in chrome://settings/content/notifications".
- Per-signal opt-in: even with notifications permission, each signal (gate:plan, gate:ship, p0, blocked, stale, cost) has its own toggle. Default: only `p0 incident` and `cost threshold` are on if user enables notifications at all (matches brief's "drop everything and look" signals).
- Notification payload: title = signal kind ("P0 incident filed"), body = first matching task title truncated to 80 chars, click = open board deep-link in new tab.
- Rate limit: max 1 native notification per signal per 5 minutes (de-dupe by signal kind + task id). Implemented in service worker.

### Service worker lifecycle / keepalive

- MV3 service workers idle out after ~30s of inactivity. We use `chrome.alarms` (not `setInterval`) to schedule polls — alarm wake-ups revive the worker.
- Poll handler is idempotent and stateless (reads from `chrome.storage` each tick).
- State changes (badge text, inbox cache) are written to `chrome.storage.local` so the popup can read fresh state on open even if the worker is currently idle.

### Storage quotas

- `chrome.storage.sync` for user preferences (5kB per item, 100kB total — way under).
- `chrome.storage.local` for inbox cache (5MB — way under; inbox is ≤30 items × ~200 bytes JSON each).
- No `IndexedDB`, no `localStorage` (CSP-allowed but not needed).

### CSP

- `manifest.json` content_security_policy: `"extension_pages": "script-src 'self'; object-src 'self'"` — strict default. No `unsafe-eval`, no remote scripts. Matches brief's "No remote code."
- Popup and options HTML reference only local CSS + JS bundles.

### `host_permissions` — runtime-granted

- Default install: empty `host_permissions` in manifest; declared as `optional_host_permissions: ["http://localhost/*", "http://127.0.0.1/*"]`.
- On options-page first board URL save, request the permission via `chrome.permissions.request`. If user denies, surface Banner "Cannot poll without host permission".
- If user enters a custom host (e.g. `http://192.168.1.10:3141`), request that specific origin pattern at save time.

### Firefox parity

- All `chrome.*` APIs above have `browser.*` equivalents under MV3. Use `webextension-polyfill` so single bundle works on both.
- Firefox MV3 is stricter on service-worker-style background scripts — use `background.scripts` array with `type: "module"` per WebExtensions MV3 spec.

> Confidence: med · invented: rate-limit (1 per signal per 5min) — that number is a defensible default but the founder may want it tighter for P0. Surfaced as a §9 reversible-config question.

---

## 7. Brand tokens — `tokens.css` (web custom properties)

Single tokens file imported by popup.html, options.html, and any future surface. Light + dark via `@media (prefers-color-scheme: dark)`. No raw hex outside this file.

```css
:root {
  /* Surface */
  --color-bg:              #FFFFFF;
  --color-surface:         #F9FAFB;
  --color-surface-hover:   #F3F4F6;
  --color-surface-active:  #E5E7EB;
  --color-surface-muted:   #F3F4F6;
  --color-bg-input:        #FFFFFF;

  /* Text */
  --color-text:            #111827;
  --color-text-muted:      #6B7280;

  /* Border */
  --color-border:          #E5E7EB;
  --color-border-subtle:   #F3F4F6;
  --color-border-strong:   #D1D5DB;

  /* Accent (brand blue) */
  --color-accent:          #2563EB;
  --color-accent-strong:   #1D4ED8;
  --color-accent-stronger: #1E40AF;
  --color-accent-soft:     rgba(37, 99, 235, 0.12);
  --color-accent-text:     #FFFFFF;

  /* Semantic */
  --color-info:            #2563EB;
  --color-warning:         #B45309;
  --color-danger:          #B91C1C;
  --color-success:         #047857;

  /* Typography */
  --font-sans:             system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono:             ui-monospace, "SF Mono", "Cascadia Code", monospace;
  --text-xs:               0.75rem;
  --text-sm:               0.875rem;
  --text-base:             1rem;
  --text-lg:               1.125rem;

  /* Spacing — 4px scale */
  --space-1:               0.25rem;
  --space-2:               0.5rem;
  --space-3:               0.75rem;
  --space-4:               1rem;
  --space-6:               1.5rem;
  --space-8:               2rem;

  /* Radius */
  --radius-sm:             4px;
  --radius-md:             6px;
  --radius-lg:             8px;

  /* Elevation (popup only — options page is flat) */
  --shadow-sm:             0 1px 2px rgba(0,0,0,0.05);
  --shadow-md:             0 4px 6px rgba(0,0,0,0.07);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:             #0F172A;
    --color-surface:        #1E293B;
    --color-surface-hover:  #273449;
    --color-surface-active: #334155;
    --color-surface-muted:  #1E293B;
    --color-bg-input:       #1E293B;
    --color-text:           #F1F5F9;
    --color-text-muted:     #94A3B8;
    --color-border:         #334155;
    --color-border-subtle:  #1E293B;
    --color-border-strong:  #475569;
    --color-accent:         #3B82F6;
    --color-accent-strong:  #2563EB;
    --color-accent-stronger:#1D4ED8;
    --color-accent-soft:    rgba(59, 130, 246, 0.20);
    --color-accent-text:    #FFFFFF;
    --color-info:           #3B82F6;
    --color-warning:        #F59E0B;
    --color-danger:         #EF4444;
    --color-success:        #10B981;
  }
}
```

Hex values are starting points (Tailwind slate/blue 500 family) — implementer may tune in 1-pixel hops to hit contrast minimums, but token names are locked.

> Confidence: high · invented: hex values themselves (defensible defaults from Tailwind palette). Token names are locked.

---

## 8. Out of scope (v1)

- Dark mode customization (we follow system only; no manual override).
- RTL layout (deferred — popup is English/Cyrillic-friendly LTR for v1).
- Locale strings beyond `en` (no i18n framework; strings live in TS constants).
- Multi-project simultaneous polling (extension polls ONE project at a time; "All projects" mode is a §9 reversible-code question).
- Tab-bar live previews / per-tab actions (no `tabs` permission).
- Content scripts / page injection.
- Edge-specific manifest tweaks (Edge uses Chromium MV3; assumed parity).
- Safari extensions (explicit brief non-goal).
- Mobile extensions.
- Sound / audio cues for native notifications (use OS default).
- Customizable badge colors (semantic mapping is the design — not a user preference).

> Confidence: high · invented: nothing — direct from brief non-goals + sensible v1 deferrals.

---

## 9. Open questions

### Top 2 to decide before senior-dev starts

**Honest count: 1 architectural blocker.** I cannot manufacture a second `architectural` question. Listing 1 in Top-2, and the rest below.

1. **[BLOCKER · architectural]** Single-project polling vs "All projects" aggregation — **owner: founder**
   - Implementer default if blocked: **single-project only in v1**; user picks one project in options. "All projects" is a v2.
   - Why: aggregating across N projects changes the data model (inbox rows need project labels, badge precedence has to merge across projects, ProjectPicker becomes a multi-select). It also reshapes the popup wireframe (rows need a project prefix). Starting single-project keeps v1 shippable.
   - Reversibility: architectural — adding aggregation later means re-keying the inbox cache, adding a project column to InboxRow, and changing how badge severity is computed. ~1-2 days of senior-dev work.
   - PR label if defaulted: `design-default-needs-founder-review`

### Remaining open questions

2. Badge precedence when both `cost-over-threshold` and `p0-open` are true — **owner: founder** — default: **danger wins always; cost shows in popup row only** — `reversible-config` — precedence is a single constant in service-worker code; flip in <1h.

3. Notification rate-limit (1 per signal per 5min) — **owner: founder** — default: **5 minutes per signal kind, de-duped by task id** — `reversible-config` — single constant; founder may want 1min for p0.

4. Default poll interval (30s) — **owner: founder** — default: **30 seconds** — `reversible-config` — single constant; battery impact is minimal at 30s but founder may want 15s for the demo. Min 10s, max 300s is the user-facing range.

5. "Test connection" button vs auto-test on URL blur — **owner: senior-dev** — default: **explicit button** — `reversible-code` — explicit button is less surprising and easier to debug ("why did it just hit my localhost?"); auto-test would be ~1h to refactor.

6. Project select shows "All projects" option even though v1 doesn't aggregate — **owner: founder** — default: **hide "All projects" in v1** — `reversible-config` — single boolean in options form.

7. Empty-state copy in popup — **owner: founder** — default: **"Inbox clear · last poll Ns ago"** — `reversible-code` — string constants; founder may want more personality.

8. Click-through opens new tab vs focuses existing board tab — **owner: senior-dev** — default: **focus existing if open (chrome.tabs.query by URL prefix), else new tab** — `reversible-code` — needs `tabs` permission, BUT we explicitly avoided that permission per brief. So fallback default: **always open new tab**. Founder review may relax permission policy.

9. Banner auto-dismiss timing on options page — **owner: senior-dev** — default: **2 seconds** — `reversible-config` — single constant.

10. Service-worker poll backoff when board unreachable — **owner: senior-dev** — default: **exponential backoff 30s → 60s → 120s → cap at 5min; reset on first success; badge shows "?" tone throughout** — `reversible-code` — ~1h to tune.

> Confidence (triage): high · invented: nothing — questions surfaced from brief gaps. Defaults are what a careful senior-dev would pick unattended; founder review post-merge will validate, not re-decide. Confidence on default for Q8 is med (the "tabs permission" trade-off may be reconsidered).

---

## 10. Implementation hand-off

**HARD constraints (do not deviate without raising a §9-style question):**
- §4 a11y MUST FAIL list — every item is non-negotiable.
- §4.6 focus management on poll-tick swap — popup MUST NOT pull focus during refresh.
- §5 popup is fixed 360×480 — do not introduce responsive popup behavior.
- §6.5 manifest permissions — request the minimum set listed; do NOT add `tabs`/`activeTab`/`<all_urls>` without founder sign-off.
- §6.5 CSP — `script-src 'self'` strict; no `unsafe-eval`.
- §6.5 host_permissions runtime-granted — do NOT bake hosts into manifest defaults.
- §8 out-of-scope — do not silently expand.

**SOFT recommendations (deviate freely, log in commit message):**
- §6 exact motion durations (120/150/200ms) — tune by feel during implementation.
- §7 hex values — adjust within 1-2 stops to hit contrast minimums.
- §3 exact wireframe ASCII (row heights, header heights) — match intent, not pixel-perfect.
- §2 component names — final names may differ; the inventory is illustrative.

**Commit-message protocol for soft deviations:** prefix with `design-soft-deviation:` and reference the section, e.g. `design-soft-deviation: §6 banner exit timing 200ms not 150ms — felt rushed at 150`.

**Escape-hatch (v1.2) — if senior-dev is ready and a Top-2 question is still open after 24h of waiting for founder:**
1. Pick the implementer default listed in §9 verbatim.
2. Open a follow-up issue tagged `design-default-needs-founder-review` containing: the question text, the default chosen, the reversibility tag, and a one-line summary of what reversal would cost.
3. Reference that issue in the PR description (e.g. "Resolves #N via implementer default — see #M for founder review.").
4. Ship. Do not block the pipeline indefinitely.

**Recommendation:** senior-dev SHOULD wait if founder is reachable in <24h (the Top-2 here is architectural — aggregation reshapes the data model). After 24h, take the default and surface the issue.

> Confidence: high · invented: nothing — escape-hatch wording follows v1.2 §10 template verbatim.
