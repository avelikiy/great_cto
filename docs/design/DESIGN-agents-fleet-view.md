---
surface: web
feature: agents-fleet-view
target: packages/board/public/index.html (panel#panel-agents)
status: draft
author: design-advisor v1.1
date: 2026-05-15
---

# DESIGN — Agents fleet view (`/agents` tab redesign)

Text-only pre-implementation contract for the `/agents` redesign described in
`docs/architecture/PHASE-agents-fleet-view.md`. Targets the existing vanilla-JS
+ CSS board UI at `packages/board/public/index.html`. **No framework migration.**

---

## 1. Design system pick

- **Decision:** Continue using the board's **existing in-file token system**
  (`--bg`, `--text`, `--text2`, `--text3`, `--accent`, `--mono`, `--sans`,
  `--status-progress`, `--status-blocked`, `--status-review`) plus the existing
  primitive component classes (`.metric-card`, `.mp-card`, `.mp-row`, `.bar-row`,
  `.fchip`, `.agents-installed`). Add only two new local components: a
  `.agent-row` (faceted-list row) and a `.agent-profile` (drill-in detail
  layout). No external dependency.
- **Context:** PHASE doc explicitly forbids framework migration; the board ships
  as a single HTML file served by `server.mjs` (zero npm UI deps beyond stdlib +
  `better-sqlite3`). Cold start, SSE-driven refresh, and a one-file deploy
  surface all argue against pulling in shadcn/Radix/Tailwind. The existing token
  set already covers ~90% of what this redesign needs (semantic status colors
  exist, mono+sans split exists, dark surface palette exists).
- **Alternatives considered:**
  - *shadcn/ui (via CDN bundle)* — rejected: requires React runtime; would
    double cold-start time and add a build step where there is none today.
  - *Pico.css / classless framework* — rejected: would override the existing
    dark monochrome aesthetic with its own opinions; the board already has its
    own taste and we'd fight it.
  - *Fully bespoke new component layer* — rejected: 80% overlap with what
    `.mp-card` / `.metric-card` already do. Re-inventing them invites visual
    drift between `/agents` and the rest of the board.
- **Consequences:**
  - Cheap: anything that composes existing primitives ships in hours.
  - Locked in: long-term, if we ever do migrate to React/shadcn, every screen
    pays the migration cost together. That's a known board-wide debt, not new
    debt from this feature.
  - Swap cost (if forced later): roughly one engineer-week to convert the whole
    board, of which this feature would contribute a tiny slice.

> Confidence: high · invented: nothing — token set + component classes verified
> at `packages/board/public/index.html:28-55, 1279-1556`.

---

## 2. Component inventory

| Component | Source | Props (effective DOM attrs) | States | Notes |
|---|---|---|---|---|
| `Tab panel` | existing (`.panel#panel-agents`) | `id`, `data-active` | hidden, active | already wired via `switchTab()` |
| `Section label` | existing (`.mp-section-label`) | text | — | reuse for "Fleet" / "Retired" / "Activity" |
| `Metric tile` | existing (`.metric-card` + `.green/amber/red`) | left-border color, label, value, sublabel | default, alert (red border) | for top-of-page summary row (total agents · active 30d · retire-candidates · weekly LLM spend) |
| `Card` | existing (`.mp-card`) | header, body | default | wraps every block |
| `Faceted filter bar` | new — composes `.fchip` | facet group label, chip set | idle, selected, disabled (count=0) | groups: domain · activity · health · archetype |
| `Sort control` | new — native `<select>` styled like `.fchip` | options | idle, open | sort by: tasks_done · savings_x · last_run · success_rate · llm_usd |
| `Search input` | new — local `<input type="search">` | placeholder, value | idle, focus, with-results | filters by agent slug substring |
| `Agent row` (`.agent-row`) | **new** | slug, domain, runs, success%, last_run_ago, savings_x, status_badge | default, hover, focus, retired (dimmed), failing (red rail) | replaces the current `.agents-installed` flat grid; uses `.bar-row` rail for success% |
| `Status pill` | new — composes `.fchip` semantics | tone (active/idle/failing/retired/unused), label | five variants | semantic, not just color (see §4) |
| `Drill-in panel` (`.agent-profile`) | **new** — composes `.mp-card` × 4 | slug | open, loading, empty, error | rendered in-place below row OR as right-side drawer; see §3 decision |
| `Run timeline` | new — composes `.bar-row` rail per day | days[] with verdict counts | empty, normal, alert | 7-day sparkline of OK / FAIL / BLOCKED |
| `Failure mode list` | new — `<ul>` styled like recent-done | mode_regex_key, count, last_seen | — | grouped by regex over verdict `raw` text |
| `Action button` | new — single `.btn` style (already defined for other tabs) | `data-action`, `aria-label` | default, hover, focus, disabled, danger | actions: Retire · Restore · Open file |
| `Confirm dialog` | new — native `<dialog>` element | title, body, confirm-label | open, closed | for destructive Retire action; uses `showModal()` + ESC close |
| `Empty state` | existing (`.empty`) | text | — | reused for "no verdicts yet" |
| `SSE refresh indicator` | existing (already in header) | — | idle, refreshing | no new work |

**Rule applied:** every new component composes 1–2 existing primitives. The
two truly new layouts (`.agent-row`, `.agent-profile`) earn their keep because
the existing `.agents-installed` flat grid cannot express domain + health +
activity faceting without a structural rewrite.

> Confidence: high · invented: the two new class names; everything they compose
> is verified in the existing stylesheet.

---

## 3. Wireframe-as-text (§3.web)

### 3.1 Route: `/agents` (default state — fleet overview)

```
Route: /agents                        (tab #agents — switchTab('agents'))
Region tree:
─────────────────────────────────────────────────────────────────────
<header role="banner">  [global board header — unchanged]
<main id="panel-agents" role="tabpanel" aria-labelledby="tab-agents">

  <section aria-label="Fleet summary">
    [.mp-row of 4 .metric-card]
      • Installed agents      49
      • Active last 30d       12       (green left rail)
      • Retire candidates     27       (amber rail)  ← clickable, sets facet
      • LLM spend last 30d    $6.42    (mono number, savings sublabel)
  </section>

  <section aria-label="Fleet controls">
    [.mp-card containing]
      <input type="search" aria-label="Filter agents by slug" />
      <fieldset> domain: [all] [arch] [qa] [security] [ops] [domain] [review]
      <fieldset> activity: [all] [active] [idle ≥30d] [never run]
      <fieldset> health:   [all] [ok] [failing ≥3 in 7d] [blocked]
      <fieldset> archetype: [all] [mobile-app] [web-app] [commerce] …
      <select> sort: tasks_done ▾
      <button> Reset filters
  </section>

  <section aria-label="Agent fleet" aria-live="polite">
    [.mp-card containing list of .agent-row]
      ┌─ row ───────────────────────────────────────────────────────┐
      │ ●(status)  great_cto-architect      arch                    │
      │            42 runs · 95% ok · last 2h ago · 38× savings     │
      │ ▰▰▰▰▰▰▰▰▱▱  success rail              [Open ▸]              │
      └─────────────────────────────────────────────────────────────┘
      … one row per agent (49 max, virtualised only if needed; 49 fits)
  </section>

  <section aria-label="Legacy agents" hidden-if-empty>
    [.mp-card]
      "12 non-canonical verdict sources detected (legacy.log, etc.)"
      → link: "What's this?"  (explainer modal)
  </section>

</main>
─────────────────────────────────────────────────────────────────────
Focus order:
  skip-link → global tab-strip → search input → facet chips
  (group-by-group, ←/→ within a group, Tab between groups)
  → sort select → reset button → first .agent-row → … → last row
  → legacy-card link

Breakpoint behaviour:
  lg (1024, target): 4-tile summary row · facets wrap to ≤2 lines · rows full-width
  md (768):   summary collapses to 2×2 · facets wrap to 3+ lines · rows still full-width
  sm (640):   GRACEFUL DEGRADE — summary 1×4 stack, facets stack vertically,
              rows still readable but right-side meta wraps below name
  xs (<640):  n/a (PHASE doc: desktop-first, 1024 minimum) — render but no QA target
```

### 3.2 Route: `/agents/:slug` (drill-in)

**Open question §9 #1 decides:** in-place expansion vs right-side drawer vs
full-page push. Wireframe below assumes **right-side drawer** (preferred by
this doc — keeps fleet context visible, matches the existing `panel-logs`
two-pane pattern at `index.html:1860`).

```
Route: /agents/great_cto-architect       (URL hash: #agents/great_cto-architect)
Region tree (drawer overlays right 480px of fleet view):
─────────────────────────────────────────────────────────────────────
<aside role="dialog" aria-labelledby="agent-profile-title"
       aria-modal="false">             ← non-modal: fleet stays interactive

  <header>
    <h3 id="agent-profile-title">great_cto-architect</h3>
    <span class="status-pill ok">active</span>
    <button aria-label="Close profile">×</button>
  </header>

  [.mp-card] Summary
    • domain: arch · applies_to: [all] · model: opus
    • 42 runs total · 38 last 30d · last run: 2h ago
    • success rate: 95% (40/42 OK, 1 FAIL, 1 BLOCKED)
    • savings: 38× (LLM $1.40 vs human-equivalent $53.20)

  [.mp-card] Activity (last 7 days)
    7-day sparkline using .bar-row rail per day:
    Mon ▰▰▱▱▱  Tue ▰▰▰▱▱  Wed ▰▰▰▰▱  Thu ▰▱▱▱▱  Fri ▰▰▰▰▰
    Sat ▱▱▱▱▱  Sun ▰▰▱▱▱
    Legend: green=OK, amber=BLOCKED, red=FAIL

  [.mp-card] Recent runs (last 20, scrollable)
    timestamp · project · verdict · cost_usd · raw-line tooltip on hover
    [Open file ▸] → opens ~/.claude/agents/great_cto-architect.md externally

  [.mp-card] Failure modes (regex-clustered)
    "rate-limit … 429"            ×3  · last: yesterday
    "BLOCKED: no ARCH/PHASE"      ×1  · last: 4d ago
    (empty state: "no failures in 30d — quiet agent")

  [.mp-card] Actions
    [Retire agent ▸]   (opens <dialog> confirm)
    [Open prompt file] (system handler)

</aside>

Dismissal contract:
  • ESC → close drawer, focus returns to triggering .agent-row
  • Click outside drawer → close (does NOT navigate)
  • Click another .agent-row → swap content in-place, no close/reopen
Focus order inside drawer:
  close button → first action in Summary → sparkline (skipped, decorative) →
  recent-runs list (arrow-key navigable) → failure-mode list → Retire button
  → Open-file button → Tab wraps back to close
```

### 3.3 Route: `/agents?filter=retired`

Same shell as 3.1 with the `activity` facet pre-set to `retired`. Every row in
this state shows:
- dimmed text color (`--text3`)
- a `[Restore]` action button replacing the rail+meta
- a small text sublabel "retired YYYY-MM-DD"

Empty state: "no retired agents — fleet is at full strength (49)".

### 3.4 Empty state — fresh install, no verdicts yet

```
[.mp-card centered, max-width 480px]
  <h3>No verdicts logged yet.</h3>
  <p>The board reads ~/.great_cto/verdicts/*.log. Once your first agent
     runs and writes a verdict line, agents will appear here.</p>
  <p>Run <code>great_cto audit</code> to bootstrap.</p>
```

> Confidence: high · invented: the drawer pattern choice (flagged as Top-2
> question §9 #1), 7-day sparkline visual encoding, regex-cluster grouping of
> failure modes. Everything else is sourced from PHASE or existing UI.

---

## 4. A11y contract (§4.web)

### 4.1 WCAG level
**WCAG 2.2 AA.** PHASE doc names a blind contributor who filed an issue last
quarter — this is not theoretical. No exceptions.

### 4.2 Keyboard map

| Key | Context | Behaviour |
|---|---|---|
| `Tab` / `Shift+Tab` | global | move between landmarks per §3 focus order |
| `Arrow ←/→` | inside a `<fieldset>` of facet chips | move between chips in that group (radiogroup pattern, but multi-select) |
| `Space` | on a facet chip | toggle |
| `Enter` | on `.agent-row` | open drill-in drawer |
| `Esc` | drawer open | close drawer, return focus to row |
| `Esc` | confirm `<dialog>` open | cancel, return focus to Retire button |
| `Arrow ↑/↓` | inside recent-runs list | navigate runs |
| `/` (slash) | anywhere in `/agents` panel | focus search input (document this; show hint in placeholder) |

### 4.3 ARIA landmarks & semantics

- `<main id="panel-agents" role="tabpanel" aria-labelledby="tab-agents">`
- Each top-level grouping uses `<section aria-label="…">` (Summary, Controls,
  Fleet, Legacy).
- Facet chip groups are `<fieldset>` with `<legend class="visually-hidden">` —
  group name is announced once, then each chip is `<button role="checkbox"
  aria-checked="true|false">`. (Radio pattern is wrong: facets are
  multi-select.)
- Fleet list is `<ul role="list">` with each row as `<li><button
  class="agent-row">`.
- Status pill: text-bearing (`<span aria-label="active">●</span> active`); the
  dot is decorative, the word is the truth.
- Drawer: `role="dialog" aria-modal="false" aria-labelledby="…"` — modeless
  because the fleet must stay scannable.
- Confirm dialog: native `<dialog>` opened via `.showModal()` → focus trap +
  inert backdrop come for free.
- SSE refresh: when fleet data updates, `aria-live="polite"` on the fleet
  `<section>` announces "fleet updated" only if the visible counts changed —
  not on every tick.

### 4.4 Contrast minimums

| Element | Foreground | Background | Required | Source |
|---|---|---|---|---|
| body text | `--text` (#ecf2ee) | `--bg` (#0a0e0c) | 4.5:1 | existing tokens — verify |
| muted meta | `--text2` (#8a9a92) | `--bg` | 4.5:1 | tokens — likely passes, verify |
| disabled / retired | `--text3` (#4f5d57) | `--bg` | 3:1 (UI, not body copy) | UI element rule |
| status pill text | pill-fg | pill-bg | 4.5:1 | new — define on implementation |
| focus ring | `--accent` (#00d97e) | `--bg` | 3:1 (non-text) | passes |

**Status colors must NEVER be the only signal** — see §4.5.

### 4.5 §4.both — MUST FAIL list

Implementation MUST NOT:

- `outline: none` on any focusable element without a replacement focus ring of
  ≥2px and ≥3:1 contrast against `--bg`.
- Trap focus inside the drawer (the drawer is non-modal — Tab should escape
  back to the fleet list).
- Apply `aria-hidden="true"` to any element that contains a focusable child.
- Use color alone to signal status — every pill, row state, and rail must carry
  a text label OR an icon glyph. ("●" alone is not enough; pair with the word.)
- Animate the SSE refresh in a way that re-fires `aria-live` on every tick
  regardless of change (announcement spam).
- Hide the search input or facet bar at sm/xs — they must remain reachable even
  if visually collapsed under a disclosure.
- Make the Retire action a single click — must require confirm dialog, and the
  dialog must be cancelable via ESC.

> Confidence: high · invented: the `/` shortcut hint; everything else is
> standard WCAG 2.2 AA mapped to this UI.

---

## 5. Responsive contract (§5.web)

PHASE doc states "must work at 1024px width minimum" → `lg` is the design
target. Smaller breakpoints get graceful degradation, not first-class layouts.

| Component / Region | xs (<640) | sm (640) | md (768) | lg (1024) ✅ | xl (1280+) |
|---|---|---|---|---|---|
| Summary tiles row | n/a | 1×4 stack | 2×2 | 4×1 | 4×1 wider |
| Facet bar | n/a | vertical stack | wrap 3+ lines | wrap ≤2 lines | single line if fits |
| Search input | n/a | full-width | full-width | 320px fixed | 320px fixed |
| Agent row | n/a | meta wraps below name | meta wraps below name | inline meta | inline meta |
| Drill-in drawer | n/a | full-screen overlay | full-screen overlay | 480px right drawer | 520px right drawer |
| Fleet list | n/a | scroll | scroll | scroll | scroll (no virtualisation needed for 49 rows) |

- **Touch targets:** ≥44 CSS px on rows + chips + buttons even though desktop
  is primary — costs nothing and helps the contributor on a touchscreen laptop.
- **Container queries:** not required. Viewport-driven layout is sufficient for
  this panel since it always occupies the same shell width.

> Confidence: high · invented: drawer-becomes-overlay at sm/md (PHASE doesn't
> specify); rest is straightforward CSS grid.

---

## 6. Motion contract

- **`prefers-reduced-motion: reduce`:** instant transitions for drawer
  open/close (no slide), instant tab switch (already the board's behaviour),
  no rail-fill animation on success bars (render final state).
- **Max duration for interactive feedback:** 150ms (chip toggle, hover state,
  button press).
- **Where motion IS allowed:**
  - Drawer slide-in (200ms ease-out) — only when reduced-motion is unset.
  - Rail fill animation on initial render (300ms) — only when reduced-motion
    is unset.
  - SSE update flash: a 1-frame `background-color` pulse on changed rows
    (~80ms, ease-out). Reduced-motion: no flash, just re-render.
- **Where motion is BANNED:**
  - No looping animation on status pills (e.g. no pulsing "failing" dot).
  - No parallax, no auto-rotating anything.
  - No animation that delays content readability beyond 200ms.

> Confidence: high · invented: durations (heuristic — board has no documented
> motion system today, so we're seeding one).

---

## 6.5 Platform integration contract

**SKIPPED.** Surface is `web` only — §6.5 is mobile/hybrid territory per the
v1.1 spec. No notification channels, FSI, deep links into native OS, widgets,
or background-execution concerns apply.

(Single web concern worth mentioning even though §6.5 doesn't apply: the
`/agents/:slug` URL must be deep-linkable via hash so a board user can paste
"go look at this agent" in Slack. Treated in §3.2 as a routing detail.)

> Confidence: high · invented: nothing — section correctly skipped per spec.

---

## 7. Brand tokens (§7.web — CSS custom properties)

Reuse the board's existing token set at `index.html:28-55`. Additions required:

```css
/* Add to existing :root block — semantic tokens new in this feature */

/* status pills (compose existing palette, name them semantically) */
--agent-ok:        var(--status-review);    /* green — already defined */
--agent-idle:      var(--text2);            /* grey */
--agent-failing:   var(--status-blocked);   /* red — already defined */
--agent-retired:   var(--text3);            /* dim */
--agent-unused:    var(--text3);            /* dim — distinct label, same hue */

/* rail tints for the success-rate bar inside .agent-row */
--rail-ok-bg:      rgba(0, 217, 126, 0.12);
--rail-ok-fill:    var(--accent);
--rail-fail-bg:    rgba(248, 113, 113, 0.12);
--rail-fail-fill:  var(--status-blocked);

/* drawer surface — slightly elevated from .mp-card */
--surface-drawer:  #0f1411;     /* one step lighter than --bg */
--drawer-shadow:   0 16px 32px rgba(0,0,0,0.5);

/* spacing — none new; reuse existing --space-* if present, else literal px
   (board uses literal px today — DO NOT introduce a new spacing system) */

/* typography — none new; --mono for numbers, --sans for labels */
```

**Hard rule:** zero new font loads. Zero new color hues — every new token must
resolve to an existing primitive or a low-alpha tint of one. If a designer
wants a new hue, that's a board-wide decision, not a `/agents` decision.

> Confidence: high · invented: the five `--agent-*` semantic aliases; all
> resolve to existing primitives.

---

## 8. Out of scope

Explicitly NOT in this iteration:

- Editing agent prompts in-browser (PHASE non-goal; agents are file-based).
- Spawning agent runs from the UI (PHASE non-goal; `bd`/CLI territory).
- Agent marketplace / install-from-registry (PHASE non-goal).
- Inter-agent dependency graph visualization (deferred to a future view).
- Per-agent cost-by-project breakdown chart (data exists in `m.agents_cost`
  but charting it is a separate feature).
- Mobile layouts below 1024px (PHASE: desktop-first; sm/xs is graceful degrade
  only, no QA pass).
- Light mode (board is dark-only; out of scope).
- RTL / i18n (board is en-US only today).
- Real-time push of new verdicts via a dedicated WebSocket (SSE 5s tick is
  sufficient; PHASE constraint).

> Confidence: high · invented: nothing — every item sourced from PHASE
> non-goals or follows from the existing board's posture.

---

## 9. Open questions — capped at 10

### Top 2 to decide before senior-dev starts

1. **[BLOCKER]** Drill-in pattern: **right-side drawer** (this doc's pick) vs
   **in-place expanding row** vs **full-panel push (replace fleet view)**? —
   **owner: founder** — why blocker: every wireframe in §3.2, the focus
   contract in §4, the responsive matrix in §5, and the drawer-shadow token in
   §7 all assume drawer. Switching pattern means redoing 4 sections of this
   doc and ~40% of the senior-dev work.

2. **[BLOCKER]** "Retire" semantics: does **soft-retire** move the
   `~/.claude/agents/great_cto-<slug>.md` file to a `retired/` subdir
   (filesystem-level, irreversible-ish), or does it write a sidecar
   `.retired` marker (reversible, file stays in place)? — **owner: founder**
   — why blocker: the API surface (`POST /api/agents/:slug/retire`), the
   restore flow (§3.3), and the failure-mode story ("what if the file is
   gone and a verdict references it?") all hinge on this. Mentioned in
   PHASE inputs but not decided.

### Remaining open questions (≤8)

3. Faceting taxonomy: is `domain` (arch / qa / security / ops / domain /
   review) a hand-curated mapping or derived from agent frontmatter? —
   **owner: founder** — needs source-of-truth decision before facet chips can
   render. If derived, agents need a `domain:` frontmatter field added
   pipeline-wide.

4. Threshold for "retire candidate" — PHASE says "never run" but does that
   mean 0 runs ever, or 0 runs in 30d, or 0 runs in 90d? — **owner: founder**
   — affects the summary tile count and the default `activity=retire`
   filter.

5. Failure-mode regex set: who maintains the regex list that clusters
   verdict `raw` text into named failure modes? — **owner: senior-dev** —
   start with a baked-in list (rate-limit, BLOCKED-precondition, timeout,
   parse-fail); expose as a project-local override file later.

6. Legacy-agents card: keep the existing "12 non-canonical sources detected"
   summary, or remove it now that the fleet view is auditable? — **owner:
   founder** — keeping it adds noise; removing it loses a cleanup signal.

7. Per-row sparkline: render inline in the `.agent-row` (denser, harder to
   read) or only in the drill-in profile (cleaner, requires a click)? —
   **owner: designer-human / founder** — the row already carries a lot of
   info; sparkline may push us past the 44px touch target without
   wrapping ugly.

8. SSE refresh strategy when drawer is open: hold updates until drawer
   closes, or apply live (and risk content jumping under the user)? —
   **owner: senior-dev** — recommend hold-until-close for the drawer's data;
   continue live updates for the fleet list behind it.

9. URL deep-link format: `#agents/<slug>` (hash-based, no router) or new
   `?agent=<slug>` query string? — **owner: senior-dev** — hash is
   zero-cost and matches the board's no-router posture; query string is
   slightly more share-friendly.

10. Should the summary tile "LLM spend last 30d" link to the existing cost
    panel, or is the breakdown shown inline on this tab? — **owner:
    deferred-to-next-feature** — punt to cost-panel redesign.

> Confidence: med — confident #1 and #2 are real founder-blockers; less
> confident #3 isn't actually a third blocker (depending on founder's answer
> it could be).

---

## 10. Implementation hand-off

This doc constrains senior-dev as follows.

**HARD constraints** (deviation requires re-opening this doc):

- §2 component inventory — do not introduce a third new top-level class
  beyond `.agent-row` and `.agent-profile`. If you need a third, escalate.
- §4.5 MUST FAIL list — every item is a non-negotiable a11y floor. CI should
  fail the build if `outline: none` appears in new CSS without a replacement
  rule in the same selector.
- §4.2 keyboard map and §4.3 ARIA landmarks — the blind contributor will
  test this. Get it right.
- §5 responsive matrix — `lg` is the QA target; `sm`/`md` must render but
  are not pixel-perfect commitments.
- §7 zero-new-fonts, zero-new-hues rule — every new token resolves to an
  existing primitive or a low-alpha tint.

**SOFT recommendations** (deviation OK with a commit-message note):

- Exact ASCII wireframes in §3 — structural intent matters, exact pixel
  layout doesn't. If you find a better arrangement in the same region tree,
  use it.
- Motion durations in §6 — within ±50ms of the listed values is fine.
- The `/` keyboard shortcut in §4.2 — keep it if cheap, drop it if it
  conflicts with the board's existing shortcut map.

**Sequencing:**

- **Do NOT start UI work** until the Top-2 questions in §9 are answered. The
  drawer-vs-expand decision in particular changes the shape of `.agent-row`
  itself.
- Once Top-2 are answered, the remaining questions (§9 #3–#10) can be
  resolved as you implement.

**Reuse first:** every new class composes existing primitives. If you find
yourself writing CSS that overlaps `.mp-card` / `.metric-card` / `.bar-row` /
`.fchip`, stop and ask whether you're rebuilding something that already
exists.

> Confidence: high · invented: nothing — this is a summary of decisions
> already made in §§1-8.
