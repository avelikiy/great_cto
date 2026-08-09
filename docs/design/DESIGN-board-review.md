---
surface: web
feature: admin-board interface review
target: packages/board/public/index.html
status: draft
author: design-advisor v2.0
date: 2026-08-09
---

# Board interface review — prioritised design plan

**Verdict:** the board is well-built and its dark-emerald system is coherent, but it
optimises for the *populated, wide, mouse, dark* case and degrades in exactly the four
situations the CTO actually meets — a **fresh/empty project**, a **failed read**, a
**keyboard**, and a **narrow laptop**. The single highest-value fix is finishing the
degradation work that is already half-wired: the `X-Board-Degraded` mechanism exists but
only `/api/tasks` consumes it, so "no data" and "could not read the data" still render
identically on every other panel — the exact recurring bug. Second is the inbox itself:
the largest thing on the landing screen is a *greeting*, and the decisions the reader came
for sit below the fold. Everything below is ordered by reader-value-per-cost.

All recommendations fit the zero-dependency constraint — no new vendored asset, no
framework, no build step. Every change is CSS + inline JS inside the existing single file.

---

## 1. Prioritised list

Cost key: **XS** ≈ minutes / token-only · **S** ≈ one function or token block · **M** ≈
one panel reworked · **L** ≈ cross-panel. Zero-dep column is "yes" for every item — noted
per the task, and true because nothing here adds a dependency.

| # | Change | Reader gains | Cost | Zero-dep |
|---|--------|-------------|------|----------|
| **P0-1** | **Wire degradation into every panel: empty ≠ error ≠ stale** | Never again reads a broken `tasks.md` (or logs/metrics/memory) as "all clear" | **M** | yes |
| **P0-2** | **Fix the focus ring (fails in light mode) + make the nav keyboard-reachable** | A keyboard user can see where they are and reach every tab | **S+M** | yes |
| **P1-1** | **Invert inbox hierarchy: lead with decisions, demote the greeting** | The thing they came for is the first thing on screen | **M** | yes |
| **P1-2** | **Design a real first-run / empty inbox** (the screen every new user sees first) | First impression reads "ready", not "broken" | **S** | yes |
| **P1-3** | **Repair dark-mode tokens (agent drawer renders transparent)** | The default theme stops visibly breaking on the fleet drawer | **S** | yes |
| **P2-1** | **Collapse 10 destinations → 3 primary + an "Activity" group + a Settings menu** | The daily three are unmissable; config stops competing with decisions | **M** | yes |
| **P2-2** | **Make the pipeline track scannable** (dots, not 9× "no runs yet · idle") | "Moving or stuck?" answerable in one glance | **M** | yes |
| **P2-3** | **Label the cost bars; reframe the "14,222×" vanity figure** | Cost panel becomes readable and believable | **S** | yes |
| **P3-1** | **Responsive: collapse the sidebar + search below ~900px** | Board is usable in a split-screen laptop half | **M** | yes |
| **P3-2** | **One global reduced-motion rule** (currently only 2 of ~8 animations gated) | Vestibular-sensitive users get a still board | **XS** | yes |
| **P3-3** | **Polish: crumb label, orphan CSS brace, "Metrics/Board" naming** | Small correctness/trust wins | **XS** | yes |

---

### P0-1 — Empty ≠ error ≠ stale, on every panel

**What's there.** The mechanism is already built and its rationale is documented in-code
(the "broken tasks.md looked like an empty backlog for a week" comment near
`renderDegradedBanner`). The server emits `X-Board-Degraded` on `/api/tasks` **and**
`/api/logs`; `/api/logs` also returns a `degraded` field in its body. The client's `api()`
wrapper already stashes the header into `BOARD_DEGRADED[path]`.

**The gap.** Only `/api/tasks` is ever read back out — `renderInbox` and `renderDashboard`
call `renderDegradedBanner('degraded-read', degradedFor('/api/tasks'), …)`. Nothing calls
`degradedFor('/api/logs')`, and the `/api/logs` body `degraded` field is dropped on the
floor. `/api/inbox`, `/api/metrics`, `/api/memory`, `/api/sessions`, `/api/heartbeat` have
no degradation surface at all. Concretely today:

| Panel | Empty state | Read-failed state | Same bug? |
|-------|-------------|-------------------|-----------|
| Inbox | all-clear card (correctly suppressed when `/api/tasks` degraded) | banner (tasks only) | partly fixed |
| Sessions | "No transcripts for this project yet." | "Could not read sessions." | **fixed — use as template** |
| Logs | "No session logs and no agent activity yet." | full-failure handled; **partial `degraded` ignored** | partial |
| Metrics | renders zeros / "—" | silently keeps last data or "Loading…" | **yes** |
| Memory | "No memory files yet." | (no distinct state) | **yes** |
| Fleet | "No data yet" | "No data yet" (identical) | **yes** |

**The design (three states, one contract).** Every list/collection panel must branch on
three inputs, not one. Sessions already does two of the three correctly; make its pattern
the house style and add the third:

- **Empty** — read succeeded, nothing there: quiet, `.empty`, with a next action.
  *"No transcripts yet. Run `/save` after a session."*
- **Degraded/error** — read failed or partially failed: loud, `.degraded-banner`
  (`role="alert"`, amber, left-rule — already styled and contrast-clean at 10.4:1), naming
  *which* read failed and its reason. Never a tidy empty state.
- **Stale** — data is real but old (SSE dropped, last sync > N min): a subtle inline
  "last synced 6m ago" on the affected panel, and the footer `live-dot` flips to
  `.error`. The footer already has the hook (`live-dot.error`); it is never triggered.

Implementation is a shared `emptyState(kind, {msg, action})` helper plus one
`renderDegradedBanner(id, degradedFor('/api/<x>'), headline)` call per panel's render
function. No new component — it reuses `.empty` and `.degraded-banner`. This is the item
to do first; it is the board's stated recurring bug and it is half-done already.

> Cite: ui-ux-pro-max `ux-guidelines.csv#79 Empty States` (Medium) — "Show helpful message
> and action, not blank empty screens." The board's failure mode is the inverse: a *blank*
> that masquerades as a *successful empty*.

---

### P0-2 — Focus ring + keyboard reach

Two cheap fixes to the one affordance a keyboard user cannot work around.

**(a) The focus ring is a dark-mode ring used unchanged on light surfaces, where it fails.**
Every custom `:focus-visible` rule uses `outline: 2px solid var(--accent)` = `#00d97e`.
Measured:

| Ring on surface | Contrast | Verdict (UI min 3.0) |
|-----------------|----------|----------------------|
| `#00d97e` on dark page `#0a0e0c` | **10.38** | pass |
| `#00d97e` on light card `#ffffff` | **1.87** | **FAIL** |
| `#00d97e` on light page `#eef2f0` | **1.66** | **FAIL** |

Fix: introduce a themed `--focus-ring` token — dark keeps `#00d97e`; light uses the
already-contrast-checked `--accent-2`/`accent-text` `#0a7d4d` (5.18:1 on white). One token,
referenced by every `:focus-visible` rule. See §8.

**(b) The primary navigation is not keyboard-reachable.** The eight sidebar items are
`<div onclick>` with no `tabindex`, no `role`, no `aria-selected`. Tab never lands on them;
they have no focus ring because they cannot be focused. The only keyboard route is the
undiscoverable `g`-prefixed hotkey map — which covers `i k d m s a` (inbox, kanban,
dashboard, memory, share, agents) and **omits logs, sessions, notifications, and docs**.

Fix: make the sidebar a real `role="tablist"` of focusable `role="tab"` controls
(`tabindex`, `aria-selected`, Enter/Space + arrow-key roving), each drawing the fixed focus
ring from (a). Same treatment for the clickable cards, `pl-stage`, and the project switcher.
This also lets the (now correct) focus ring actually appear.

> Cite: ui-ux-pro-max `ux-guidelines.csv#28 Focus States` (**High**) — "Keyboard users need
> visible focus indicators … do not remove focus outline without replacement." The board
> hasn't removed it; it has made most interactive elements unfocusable, which is worse.

---

### P1-1 — Invert the inbox hierarchy

The landing panel today, top to bottom: a **~40px H1 greeting**, four stat pills (all `0`
on a quiet day), the "Pick up where you left off" resume card, the pipeline track, then —
below the fold — **Pending decisions**. For a reader who opens the board for under a minute
to answer "what needs me?", the largest, first, most prominent element is a salutation with
zero decision content, and the four pills triple-count numbers already shown in the sidebar
(`Inbox 0`) and in each section head (`Pending decisions 0`).

Rework (wireframe in §5): shrink the greeting to a single 13–14px line, delete the
four-pill strip (the counts live in the section heads), and float **Pending decisions** to
the top of the scroll. Resume + pipeline move below the decisions. No new component; this is
a re-order plus a type-size change.

> Cite: `ux-guidelines.csv#39 Heading Hierarchy` and `#74 Font Size Scale` — the biggest
> type should mark the most important content, not the greeting.

---

### P1-2 — A real first-run / empty inbox

This is the screen **every new user sees first**, and it is currently the worst-looking
screen on the board: giant greeting + four `0` pills + a resume card reading "Nothing in
progress / No recent verdicts / No decisions logged yet" + a pipeline strip repeating "no
runs yet · idle" nine times + the all-clear card. Five stacked emptinesses read as *broken*,
not *ready*.

Design: when the project has **no runs at all** (distinct from "all clear after work"),
collapse the empty resume and empty pipeline entirely and show one focused card — the
existing `.inbox-allclear` component, re-messaged for first-run: *"Nothing running yet.
Start a pipeline with a new issue, or invoke an agent."* + the existing `+ New issue`
action. "All clear after a busy day" and "nothing has ever happened here" are different
messages and should not share one layout.

---

### P1-3 — Dark-mode token repair

Four tokens are defined **only** under `[data-theme="light"]` and referenced with **no
fallback**, so in **dark mode — the default** — they resolve to invalid:

| Token | Used by | Dark-mode result |
|-------|---------|------------------|
| `--surface-drawer` | agent drill-in drawer background | **transparent — content behind bleeds through** |
| `--drawer-shadow` | agent drawer elevation | no shadow |
| `--rail-ok-bg` / `--rail-fail-bg` | verdict rails | no fill |

Separately, `--text1`, `--text-2`, `--bg2`, `--p1` are referenced with no fallback and are
defined nowhere (mis-hyphenated cousins of `--text`, `--text2`, `--p1-fg`). `--bg2` backs the
Notifications email inputs → they render with a transparent background. Fix: define the four
drawer/rail tokens in `:root` (dark values) and reconcile the four aliases. Token-only. See §8.

---

### P2-1 — Navigation: 10 → 3 + Activity + Settings

There are **ten** panels but no clean model: eight in the sidebar (Inbox, Tasks, Metrics,
Memory, Docs, Sessions, Logs, Notifications), **Share** floating in the topbar, and **Agents/
Fleet** with *no* nav entry at all (reachable only by `g a` or a metric-card click). Two of
the sidebar items — Notifications and (topbar) Share — are **set-once configuration**, yet
they sit at the same visual level as the daily decision surfaces.

For a CTO whose whole job here is *decide → see what happened → is it moving* the rail should
mirror that, not list ten peers:

```
PRIMARY (always visible, the daily loop)
  ● Inbox      — what needs me now        (decide)
  ● Tasks      — the board                 (work)
  ● Metrics    — moving? cost? + Agents    (watch)

ACTIVITY (one collapsible group — the "what happened / evidence" archive)
  Sessions · Logs · Memory · Docs

—— (topbar, right) ——
  ⚙ Settings ▾ →  Share · Notifications · Theme
```

- **Agents/Fleet** gets a real home as a Metrics sub-tab (it is already loaded by the same
  `/api/metrics` call in `switchTab`), ending its orphan status.
- **Share + Notifications** move into a topbar gear menu — config, not glanceable.
- The `g`-hotkey map is completed to cover every primary + Activity destination.

This takes the primary rail from eight competing items to three, with a demoted archive
group and config tucked away — matching the <1-minute scan. Cost is markup re-grouping +
`switchTab` label map; no rendering logic changes.

---

### P2-2 — Pipeline track legibility

The pipeline strip renders nine stages, each in small mono type repeating "no runs yet ·
idle", with names that wrap ("12-angle review" → two lines). It occupies a full-width band
to answer one binary question — *is the pipeline moving or stuck?* — and answers it slowly.

Design (wireframe in §5): a single horizontal **stage-dot rail**: one dot per stage, the
active stage filled + labelled, completed stages filled-dim, idle stages hollow, with a
**single** summary line beneath ("idle · last run 543h ago") instead of nine repetitions.
Stuck (>48h in a stage) turns that stage's dot amber. Reuses the `.col-dot`
filled/half/hollow pattern already in the kanban CSS.

---

### P2-3 — Cost panel: scale + honesty

The cost bar chart has no y-reference — bars carry no magnitude a reader can name. Add
min/last/max value labels along the axis (design-only; the data is present). Separately, the
hero **"14,222× cost savings vs FTE"** is a figure large enough to *cost* trust rather than
build it; recommend formatting it as an absolute "$ saved" or capping the multiplier's
display. This last point edges into product framing — flag to product-owner rather than
mandate; the axis labels are pure design and in scope.

> Cite: ui-ux-pro-max `charts.csv` — quantitative bars need a labelled reference or they are
> decoration.

---

### P3-1 — Responsive

The board assumes a wide viewport. The existing media queries touch only the metrics grid
(`900`), resume grid (`880`), new-issue row (`600`), and the chip filter bar (`480`). **No
rule collapses the 240px sidebar or the 280px topbar search.** In a split-screen laptop half
(~700px) the fixed sidebar + fixed search consume most of the width and the kanban columns
(264px each) overflow. The `720px` media block is even present but **empty**.

Design: at ≤900px collapse the sidebar to a 56px icon-rail (labels on hover/expand) or an
off-canvas drawer behind a hamburger; let the topbar search shrink to an icon that expands on
focus. Marked P3 because the user is described as "on a laptop" — real but not the daily pain.

---

### P3-2 — Reduced motion

`prefers-reduced-motion: reduce` is honoured for exactly two elements (the agent drawer and
its backdrop). Ungated: the `live-dot`/`agent-dot` pulse loops, toast slide, card hover-lift,
side-panel slide, and the `ni-pop` modal entrance. Add one global reduce rule that neutralises
`animation`/`transition` durations, keeping the two explicit ones. One CSS block. See §6.

---

### P3-3 — Polish

- Breadcrumb reads **"Board"** while the Metrics tab is active (`TAB_LABELS.dashboard =
  'Board'` but the nav label is "Metrics") — pick one name for that destination.
- An **orphan `}`** sits at ~line 359–360 of the `<style>` block (harmless, parser-ignored,
  but sloppy).
- "Metrics" / "dashboard" / "Board" name the same panel three ways across nav, id, and crumb.

---

## 2. Design system pick

**Reuse the existing dark-emerald system as-is.** Do not introduce a new token set,
framework, or vendored asset — the constraint is deliberate and the current system is
internally strong: a real token layer (`:root` + `[data-theme="light"]`), vendored Geist /
Geist Mono, a documented status/priority palette, and glass panels via `backdrop-filter`.
Body-text contrast is genuinely good (all muted greys measure 5.8–6.4:1 — see §6), so this is
**not** a "raise the contrast" job; it is a states + focus + hierarchy job.

The style maps to two ui-ux-pro-max rows: `styles.csv#7 Dark Mode (OLED)` — whose own
checklist flags **"visible focus"** and **"7:1+ text"** as requirements (the board meets the
text bar, misses focus) — and `styles.csv#3 Glassmorphism` for the blurred sidebar/columns,
whose warning is "ensure 4.5:1" (the board passes). The fixes below keep the style and close
the two gaps its own reference cards call out.

---

## 3. Component inventory — states handled badly

Only the states that are wrong or missing; existing components are otherwise sound.

| Component | Has | Missing / wrong |
|-----------|-----|-----------------|
| Sidebar nav item | hover, active, `.count` | **not focusable**, no `role="tab"`/`aria-selected`, no focus ring |
| `.degraded-banner` | correct styling, `role="alert"`, 10.4:1 | only mounted for `/api/tasks`; unused for logs/metrics/memory/fleet |
| `.empty` | one message | no distinction from error; no next-action on most instances |
| Inbox stat pills | four counts | redundant with sidebar + section heads; occupy the top slot |
| `.inbox-allclear` | "all clear" copy | no separate **first-run** message (never-run ≠ cleared) |
| Pipeline track | 9 stages, states | unscannable; 9× repeated "idle"; wrapping labels |
| Agent drawer | slide, reduced-motion gate | **transparent background in dark mode** (`--surface-drawer` undefined) |
| Fleet summary | "No data yet" | identical string for empty and read-failure |
| Cost chart | bars, dates | no value/scale labels |
| Notifications inputs | layout, steps | `--bg2` undefined → transparent field background |
| `:focus-visible` rings (6 places) | 2px emerald | fail contrast on light surfaces (1.66–1.87) |
| `live-dot.error` | styled | never triggered — no stale/disconnected signal |
| Docs panel (in progress) | placeholder | must adopt the three-state contract from day one |

---

## 4. Wireframe-as-text

### 4a. Inbox, reworked (P1-1 / P1-2) — desktop

```
┌ workspace ────────────────────────────────────────────────────────────┐
│  Good morning.  2 need your decision.        ← 13px, one line, muted    │
│                                                                          │
│  ● PENDING DECISIONS ······································· 2            │  ← lead here
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ gcto-12  gate:ship  Approve deploy of …   ⏳ 3h   [Approve][Reject]│  │
│  │ gcto-31  gate:arch  Data-model change …   ⏳ 20m  [Approve][Reject]│  │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ● P0 OPEN · 0    ● BLOCKED · 0    ● STALE >48h · 0   ← collapsed heads  │
│                                                                          │
│  ─ Pick up where you left off ─────────────────────── last 24h ─┐       │  ← demoted
│    In progress · Recent verdicts · Decisions                    │       │
│  ─ Active pipeline ─ idle · last run 543h ago ──────────────────┘       │  ← §4c
└──────────────────────────────────────────────────────────────────────────┘
```

First-run variant (never any runs): decisions/P0/blocked heads hidden; resume + pipeline
hidden; a single centred card:

```
        Nothing running yet.
        Start a pipeline with a new issue, or invoke an agent.
        [ + New issue ]   [ View tasks ]
```

Degraded variant (any read failed): amber `role="alert"` banner pinned above everything —
*"Some project data could not be read — counts below are incomplete. (tasks.md: EACCES)"* —
and the all-clear / first-run card is suppressed (`anyDegraded()` already gates this for the
inbox; extend the same gate to metrics + fleet).

### 4b. Sidebar, regrouped (P2-1)

```
greatcto  v2.73.1
● great_cto  greenfield ▾
────────────────────────
 ▣ Inbox                 2      ← PRIMARY
 ✓ Tasks               115
 ▤ Metrics                     (Agents = sub-tab here)
────────────────────────
 ACTIVITY            ▾          ← group header, collapsible
   Sessions
   Logs
   Memory                12
   Docs
────────────────────────
 live · synced just now        (turns amber on stale/disconnect)
```
Topbar right: `⌘K search   ⚙ Settings ▾ ( Share · Notifications · Theme )   + New issue`

### 4c. Pipeline track, compressed (P2-2)

```
Active pipeline · idle · last run 543h ago
◍──◍──◉──○──○──○──⦿──○──○
arch pm dev rev qa sec GATE devops l3
                    ▲ amber if >48h in stage;  ◉ = active/filled, ○ = idle-hollow
```
One summary line replaces nine "no runs yet · idle" repetitions; hover a dot for that
stage's detail.

---

## 5. A11y contract

**Target:** WCAG 2.1 AA. Text contrast already meets it; the gaps are focus visibility,
keyboard operability, and non-colour state signalling.

**Measured contrast (computed, both themes):**

| Pair | Ratio | AA |
|------|-------|----|
| DARK `--text` on `--bg-card` | 16.0 | ✅ |
| DARK `--text2` on `--bg-card` | 6.17 | ✅ |
| DARK `--text3` on `--bg-card` | 5.87 | ✅ |
| LIGHT `--text2` on white | 6.14 | ✅ |
| LIGHT `--text3` on white | 6.39 | ✅ |
| LIGHT `--accent-text` on white | 5.18 | ✅ |
| DARK degraded border `#f0b429` on page | 10.42 | ✅ |
| **DARK focus ring `#00d97e` on page** | 10.38 | ✅ |
| **LIGHT focus ring `#00d97e` on white** | **1.87** | ❌ **fix (P0-2)** |
| **LIGHT focus ring `#00d97e` on page** | **1.66** | ❌ **fix (P0-2)** |

**Focus order:** project-switch → primary tabs (roving arrow-keys, Tab exits the group) →
Activity group → topbar search → Settings → New issue → panel content. On tab switch move
focus to the panel's heading (`tabindex="-1"` + `.focus()`) so keyboard/SR users land in the
new content rather than staying on the rail.

**Labels & roles:** sidebar becomes `role="tablist"`; each item `role="tab"` +
`aria-selected` + `aria-controls`; each panel `role="tabpanel"` + `aria-labelledby` (only
`panel-agents` has this today). Icon-only topbar buttons (theme, bell) already have
`aria-label` — keep. The degraded banner keeps `role="alert"`.

**Non-colour signals:** state must not rest on colour alone — the stale/disconnected footer
needs its text to change ("synced 6m ago"), not only the dot colour; priority chips already
pair colour with a `P0/P1` label (good).

**Keyboard paths (target):** `⌘K` search · `g` then `i/k/m/s/l/e/n/d` for every primary +
Activity tab (complete the map) · `j/k` card move, `Enter` open, `Esc` close · `?` help.

---

## 6. Responsive contract

| Breakpoint | Today | Target |
|-----------|-------|--------|
| >1200px | full layout | unchanged |
| 900–1200px | sidebar + search fixed; metrics grid reflows | sidebar → 56px icon-rail; kanban columns scroll-snap |
| 600–900px | **nothing collapses** (720px rule is empty) | sidebar off-canvas behind hamburger; search → icon-expand; single-column inbox |
| <600px | new-issue row stacks only | full off-canvas nav; cards full-width; drawers already go 100% (`≤1023px` rule exists) |

Safe-area / orientation: n/a (web, localhost desktop). The agent drawer already handles
narrow (`max-width:100%` at ≤1023px) — extend that instinct to the sidebar.

---

## 7. Motion contract

Keep the current durations (120–200ms, ease-out) — they are tasteful and consistent.
**Single change:** one global fallback so reduced-motion covers all ~8 animated behaviours,
not the current two:

```
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```
This retires the need for the two per-component `reduce` blocks (harmless to leave). Verify
the `live-dot`/`agent-dot` pulse loops stop (they currently run regardless).

---

## 6.5 Platform integration contract

**n/a** — web surface served from `127.0.0.1` by a zero-dependency Node server. No native
APIs, permissions, deep links, or RN substitutions. The one platform-adjacent surface (the
existing service worker `sw.js` + Web Push in Notifications) is product-owned and out of
this review's scope.

---

## 8. Brand tokens — the fixes

Additions/repairs only; the rest of the token system stays. Values are the contract;
senior-dev places them in `:root` (dark) and `[data-theme="light"]`.

| Token | Dark (`:root`) | Light (`[data-theme="light"]`) | Purpose / measured |
|-------|----------------|-------------------------------|--------------------|
| `--focus-ring` | `#00d97e` (10.38:1) | `#0a7d4d` (5.18:1) | replaces `var(--accent)` in every `:focus-visible`; both pass UI 3.0 |
| `--focus-ring-offset` | `2px` | `2px` | 2px solid + 2px offset, uniform |
| `--surface-drawer` | `#161c1f` (= `--bg-muted`) | `#ffffff` (already set) | **agent drawer bg — currently undefined in dark** |
| `--drawer-shadow` | `0 16px 32px rgba(0,0,0,.5)` | `0 16px 32px rgba(0,0,0,.18)` (already set) | drawer elevation in dark |
| `--rail-ok-bg` | `rgba(0,217,126,.12)` | (already set) | verdict rail fill in dark |
| `--rail-fail-bg` | `rgba(255,84,102,.12)` | (already set) | verdict rail fill in dark |

Alias reconciliation (referenced but undefined — replace usages with the real token):
`--text1` → `--text` · `--text-2` → `--text2` · `--text-3` → `--text3` · `--bg2` →
`--bg-muted` · `--p1` → `--p1-fg`.

---

## 9. Out of scope

- **Product/content decisions** — what metrics to show, whether "14,222×" should exist,
  which alert triggers to offer, panel taxonomy as a *product* question. (Product-owner
  agent, in parallel.) This review touches only how those render.
- **The Docs panel's content and data wiring** — being built now by the owner. This review
  only asks that it adopt the three-state contract (§P0-1) from day one.
- **The separate operator-console runtime** (different repo; the `console-*` screenshots are
  not this board).
- **New components, charts libraries, icon sets, or fonts** — the constraint forbids them and
  none are needed.
- **Server/route changes** beyond noting which endpoints must expose degradation (P0-1's
  wiring is client-side; the `X-Board-Degraded` header already exists on tasks + logs).

---

## 10. Open questions (recommended defaults so nothing blocks)

1. **Collapse Activity into one destination, or keep four items under a group header?**
   → *Default:* keep four items under a collapsible "Activity" header (less disruptive; one
   render-path change, not four).
2. **Sidebar at ≤900px: icon-rail or off-canvas drawer?** → *Default:* icon-rail 900–1200,
   off-canvas <900 (progressive, no JS state machine for the common laptop case).
3. **"Stale" threshold for the footer dot + panel stamp?** → *Default:* > 90s since last SSE
   message flips `live-dot.error` and shows "synced Nm ago".
4. **Move Agents under Metrics as a sub-tab, or promote it to primary?** → *Default:* Metrics
   sub-tab — it is loaded by the same `/api/metrics` call and isn't a daily-decision surface.
5. **Reframe "14,222×"?** → *Default:* show absolute "$ saved" as the hero and the multiplier
   as secondary; but this is product's call — flag, don't force.
6. **Should the first-run empty state auto-detect "never-run" vs offer a walkthrough?** →
   *Default:* detect never-run (no verdicts + no tasks) and show the single start card; no
   walkthrough (over-engineered for one expert user).
7. **Keep the top `tab-btn` row as well as the sidebar?** → *Default:* retire the
   near-invisible `tab-btn` row; the sidebar tablist is the single nav.
8. **Icon-rail label affordance — hover tooltip or expand-on-hover?** → *Default:* CSS
   expand-on-hover of the whole rail (no JS, no tooltip component).

---

## 11. Implementation hand-off

Target file for every item: **`packages/board/public/index.html`** (single file — CSS in the
`<style>` block, JS in the trailing `<script>`). Ordered so each step is independently
shippable and reviewable.

1. **Tokens (§8)** — add `--focus-ring*`, the four dark drawer/rail tokens, reconcile the
   five aliases. *Verifies:* agent drawer opaque in dark; notif inputs have a background.
2. **Focus ring (P0-2a)** — point every `:focus-visible` at `--focus-ring` + offset; add a
   global `:focus-visible` fallback for native buttons.
3. **Nav semantics (P0-2b)** — sidebar → `role="tablist"`; items → focusable `role="tab"`
   with `aria-selected`, roving arrow-keys, Enter/Space; move focus to panel heading on
   switch; complete the `g`-hotkey map.
4. **Three-state contract (P0-1)** — add `emptyState(kind,…)` helper; call
   `renderDegradedBanner(id, degradedFor('/api/<x>'), …)` in `renderDashboard`, `refreshLogs`
   (consume the existing `/api/logs` degraded field), `loadMemory`, `renderFleetSummary`;
   wire `live-dot.error` on stale SSE. Use Sessions as the template.
5. **Inbox hierarchy + first-run (P1-1/P1-2)** — reorder markup (decisions first), shrink
   greeting to one line, drop the four-pill strip, re-message `.inbox-allclear` for never-run.
6. **Navigation regroup (P2-1)** — Activity group; Share + Notifications into a topbar
   Settings menu; Agents as a Metrics sub-tab.
7. **Pipeline track (P2-2)** — replace the 9-stage strip with the dot-rail + single summary.
8. **Cost labels (P2-3)** — axis min/last/max on the bar chart.
9. **Responsive (P3-1)** — fill the empty `720px` rule; add the ≤900px sidebar collapse +
   search shrink.
10. **Motion (P3-2)** — one global reduced-motion rule.
11. **Polish (P3-3)** — crumb label, remove the orphan `}`, unify the Metrics/Board name.

Do items 1–5 (the two P0s + the two inbox P1s + the token repair) first; they carry the most
reader value and are the smallest changes. 6–11 are independent and can land in any order.
