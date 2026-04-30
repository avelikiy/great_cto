# Design Prompt — GreatCTO Light-Theme Redesign

> Reference: https://multica.ai/
> Apply to: `landing site` (greatcto.systems) + `board admin UI` (`packages/board/public/`)
> Output: redesigned `index.html` (board) + `share.html` (public report) + landing site files

---

## 0. Mission

Redesign GreatCTO's two surfaces — the **board admin UI** and the **landing page / public reports** — in a **light theme** with a **cinematic illustrated background**, inspired by multica.ai's Studio Ghibli-style aesthetic (mountains, sky, soft pink clouds).

Current state: dark theme (Linear-style #0F0F0F). Target: white theme with warm illustrated background visible at the edges of UI panels. The UI should feel like a productivity tool floating in a beautiful landscape, not pasted onto a flat gradient.

---

## 1. Visual System

### 1.1 Background

**Hero / landing**:
- Full-bleed illustrated landscape (Ghibli-style: mountain silhouettes, soft pink-orange clouds at sunset/dawn, deep blue sky)
- Subtle parallax on scroll (CSS `transform: translateY()` tied to scroll position, or static if skill-budget tight)
- Source: prefer SVG/CSS-illustrated for crisp rendering at any size; fallback to a hand-curated Unsplash photo from the "mountains pastel sky" search, treated with `filter: saturate(1.1) brightness(1.05)` and a subtle white gradient overlay at the bottom (`linear-gradient(to bottom, transparent, rgba(255,255,255,.4))`) to soften where text meets

**Admin UI (board)**:
- Same landscape, but **dimmed to 25% opacity** behind the layout
- UI panels (sidebar, content area, cards) sit on `rgba(255,255,255,0.92)` with `backdrop-filter: blur(20px)` so the landscape bleeds through softly at the panel edges
- Body background: **the same image** (do not switch to flat color) — this creates continuity between landing → app

### 1.2 Color tokens (light theme)

```css
/* Surfaces */
--bg-page:     transparent;      /* shows through to background image */
--bg-panel:    rgba(255,255,255,0.92);
--bg-card:     #ffffff;
--bg-muted:    #f7f8fa;          /* hover states, sub-cards */
--bg-strong:   #ecedf0;          /* dividers, chip backgrounds */

/* Borders */
--border:        rgba(15,17,21,0.08);
--border-strong: rgba(15,17,21,0.14);

/* Text */
--text:    #0f1115;              /* primary */
--text2:   #5b6573;              /* secondary */
--text3:   #828b97;              /* tertiary / metadata */
--text-on-image: #ffffff;        /* hero text on landscape */

/* Brand + accents */
--accent:    #2540d4;            /* deep cobalt blue, like Multica's button blue */
--accent-2:  #6b81ff;            /* soft hover */

/* Status colors (Multica-aligned) */
--status-backlog: #94a3b8;       /* slate */
--status-todo:    #64748b;       /* slate-dark */
--status-progress: #f59e0b;      /* amber */
--status-review:   #16a34a;      /* green */
--status-done:     #2563eb;      /* blue (NOT green — Multica done is blue) */
--status-blocked:  #dc2626;
--status-gate:     #7c3aed;

/* Priority chips (filled, soft backgrounds) */
--p0-bg: #fee2e2; --p0-fg: #b91c1c;   /* Urgent — red */
--p1-bg: #ffedd5; --p1-fg: #c2410c;   /* High   — orange */
--p2-bg: #fef3c7; --p2-fg: #92400e;   /* Medium — amber */
--p3-bg: #f1f5f9; --p3-fg: #475569;   /* Low    — slate */
```

### 1.3 Typography

**Pairing** (load both from Google Fonts):
- **Headline serif**: `Fraunces` (700, italic supported) — close to Multica's serif, modern with character. Alternatives: GT Sectra, Playfair Display.
- **UI sans**: `Inter` (400/500/600) — keep current, it's the right call.
- **Mono**: `JetBrains Mono` (400/500) — for IDs, timestamps, code.

**Scale**:
- Hero: `clamp(48px, 7vw, 96px)`, `Fraunces 700`, italic supported on a single accent word, line-height 1.05, letter-spacing -0.02em
- H1 (page): 28px, Inter 600
- H2 (section): 18px, Inter 600
- Body: 14px, Inter 400, line-height 1.55
- Meta: 12px, Inter 500
- Mono labels: 11px, JetBrains Mono 500, all-lowercase, letter-spacing 0.02em

### 1.4 Geometry

- Border radius: cards 8px, panels 12px, pills 999px, buttons 8px
- Shadows (only where necessary, very soft):
  - card hover: `0 1px 2px rgba(15,17,21,0.06), 0 8px 24px rgba(15,17,21,0.08)`
  - dropdown / picker: `0 12px 32px rgba(15,17,21,0.12)`
  - never use harsh dark shadows on light theme
- Grid: `gap: 8px` for tight rows, `gap: 12px` for sections, `gap: 24px` for page sections

---

## 2. Landing Page (`greatcto.systems`)

### 2.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  ✱ greatcto                       [GitHub]  [Sign in]   │   ← top nav, transparent over hero
├─────────────────────────────────────────────────────────┤
│                                                         │
│            [hero illustration: mountains/sky]           │
│                                                         │
│        Your next 10 engineers won't be people.          │   ← serif italic, white text
│                                                         │
│     17 specialist agents replace your CTO function:     │
│     architect, security, QA, devops, ops, and 12 more.  │
│                                                         │
│            [Get started]   [How it works]               │   ← white pill + ghost
│                                                         │
│       Works with:  Claude Code · Cursor · Aider          │
│                                                         │
│     [        floating dashboard screenshot         ]    │   ← drop-shadow into landscape
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Sections below hero (white bg, landscape ends here)

1. **"How it works"** — 3-column: `/start` → agents work → ship. Big numbers (1, 2, 3) in serif italic
2. **"Six metrics that matter"** — 6-card grid showing actual screenshot of Metrics tab embedded
3. **"Built for solo founders → 50-eng teams"** — testimonial-style quotes block on white with subtle border
4. **"What's inside"** — table: 17 agents listed with one-liner descriptions, hover reveals tools each agent uses
5. **CTA footer** — "Start in 30 seconds", terminal-style code block: `npx great-cto`

### 2.3 Hero CTAs

Primary: white pill, deep-blue text, soft inner shadow (mimics Multica's "Start free trial")
Secondary: dark navy pill, white text

### 2.4 Logo

`✱ greatcto` — use the asterisk-flower glyph (U+2731 or custom SVG), the same blue as accent. Multica uses the same approach with their `*` mark.

---

## 3. Admin UI (Board)

### 3.1 Layout shift

Current: top tabs, no sidebar. Target: **sidebar + breadcrumb topbar**, identical to Multica's layout.

```
┌──────────────┬────────────────────────────────────────────┐
│ ✱ project ▼  │ ✱ project / Board                          │
│              │ [Board] [Filter] [Display]   N tasks  [+]  │
│ ▢ Inbox      ├────────────────────────────────────────────┤
│ ▢ Tasks      │                                            │
│ ▢ Metrics    │   [ Kanban / Metrics / Share content ]     │
│ ▢ Reports    │                                            │
│ ▢ Agents     │                                            │
│ ─────        │                                            │
│ ⚙ Settings   │                                            │
└──────────────┴────────────────────────────────────────────┘
       240px              flexible
```

- Sidebar: 240px, white panel, `rgba(255,255,255,0.92)` over landscape
- Project switcher at top (`✱ project ▼` clickable, opens dropdown with all projects + archetype tags) — preserve current logic, restyle
- Nav items: 32px tall, icon + label, hover `--bg-muted`, active `--bg-strong` + accent left border (3px)
- Topbar: 48px, breadcrumb left, action buttons right
- "+ New Issue" button: black pill (like Multica), white text, only enabled when `bd` is reachable

### 3.2 Kanban columns

```
┌─ ○ Backlog 4 ··· + ─┐  ┌─ ○ Todo 5 ··· + ─┐  ┌─ ⚠ In Progress 3 ─┐  ┌─ ✓ In Review 2 ─┐  ┌─ ● Done 6 ─┐
│ │ MUL-17           │  │ │ MUL-12          │  │░│ MUL-9           │  │░│ MUL-7         │  │░│ MUL-1     │
│ │ Title here…      │  │ │ Title…          │  │█│ Title…          │  │█│ Title…        │  │█│ Title…    │
│ │ Description…     │  │ │ Description…    │  │█│ Description…    │  │█│ Description…  │  │█│ Desc…     │
│ │ ▲▲ Low           │  │ │ ▲▲ High         │  │█│ 👤 ▲▲▲ Urgent  │  │█│ 👤 ▲▲ High   │  │█│ ▲▲▲ Urg.  │
│ └──────────────────┘  │ └─────────────────┘  └─└─────────────────┘  └─└───────────────┘  └─└───────────┘
```

- Column header: status dot + label + count, optional `···` overflow menu and `+` button
- Cards: white, 8px radius, 16px padding, hover lift shadow
- Card body:
  - Top: ID in mono `MUL-17`, color = column status (muted)
  - Middle: title (Inter 600 14px), description (Inter 400 13px text2, max 2 lines)
  - Bottom: avatar(s) + priority chip
- Priority chip: pill with `▲` bars icon (1-4 bars), tinted background per priority — matches Multica

### 3.3 Metrics tab

Convert from current 6-card stat grid to:
- **Top hero stat row**: 3 large stat cards (Done · LLM Spend · Cost Savings) — white panels with gradient accent border-top (status color)
- **Secondary row**: 4 smaller (Avg time, QA pass rate, Security OK, In progress)
- **Agent utilization**: keep horizontal bars, but bars are now blue (`--accent`) on light gray rail
- **Activity feed**: white rows with subtle dividers, status dot color from `--status-*`, mono agent name on left, message in body, time on right

### 3.4 Share tab

- White card on landscape
- Toggle: same blue when on, gray-300 when off
- URL block: white panel with `1px solid border`, copy button is **black pill** (Multica-style), open arrow `↗` button is ghost
- Note text (the toggle-off explanation): now gray-600 on white, no longer the dim tertiary

### 3.5 Side panel

- Slide-in from right, **480px wide**, white panel with soft shadow `-12px 0 32px rgba(15,17,21,0.08)`
- Header: ID badge + close (✕)
- Properties grid: same 110/1fr two-column, but borders are now `--border` (subtle gray)
- Status pills: filled with status color background at 10% opacity, foreground at 100%

---

## 4. Public Report (`share.html`)

### 4.1 Layout

```
[ landscape background ]
┌─────────────────────────────────────────┐
│ ✱ greatcto · Engineering Report         │
│                                         │
│ ┃                                       │
│ ┃  project name                         │   ← serif italic, hero size
│ ┃  April 2026 · Generated by 17 agents  │
│ ┃                                       │
│ ─────────────────────────────────────   │
│                                         │
│ ┌──────┬──────┬──────┐                 │
│ │  4   │ $47  │ 12×  │  ← hero stats   │
│ │ Done │  LLM │ Save │                 │
│ └──────┴──────┴──────┘                 │
│                                         │
│ ┌────┬────┬────┐  ← secondary stats   │
│ │78m │94% │  3 │                       │
│ └────┴────┴────┘                       │
│                                         │
│ Recently shipped                        │
│ ✓ Implement OAuth2 …                   │
│ ✓ Database connection pool …           │
│ ✓ Security audit …                     │
│                                         │
│ ─────────────────────────────────────   │
│ Created by GreatCTO · greatcto.systems  │
└─────────────────────────────────────────┘
```

- Container: 720px max-width, centered, `rgba(255,255,255,0.94)` panel with 16px radius and soft shadow on landscape
- Hero stats: 3-card row with **larger numbers** (40px serif), label in 13px Inter
- Secondary stats: 3-card row, smaller (28px mono numbers)
- "Recently shipped": list with green check icon, title, optional sub-note
- Footer: small, centered, "Created by GreatCTO" with greatcto.systems link

### 4.2 Paused page

- Same landscape background
- Centered card: pause icon (custom SVG), "Report paused", "The owner has temporarily disabled this link."
- Footer attribution preserved

---

## 5. Background image — concrete options

Pick ONE of these (in priority order):

### Option A — SVG-illustrated (preferred, ~12 KB)
Hand-build with `<linearGradient>` sky + `<polygon>` mountain silhouettes + `<ellipse>` clouds with blur filter. Reproducible, scales perfectly. See `share.html` template — embed as `<svg>` inside a `<div class="bg">`.

### Option B — Generated illustration
Use a tool like Midjourney/Imagen to generate one ghibli-style mountain landscape, save as `public/bg-landscape.webp` (~80 KB at 2400px wide). License: must be safe-for-commercial.

### Option C — Curated photo
Unsplash search: `studio ghibli mountains`, `pastel sunset peaks`. Required: license = Unsplash free, photographer credited in `LICENSES.md`. Apply white-fade gradient at bottom for legibility.

---

## 6. Implementation checklist

In order, deliver as ONE PR:

1. **Add Fraunces** to font preconnect in both `index.html` and `share.html`
2. **Replace CSS variable block** in both files with the light-theme tokens from §1.2
3. **Restructure `index.html` to sidebar layout** — move tabs into sidebar, add breadcrumb topbar
4. **Add `.bg` element** to body with chosen background asset
5. **Restyle Kanban columns** with Multica's color system (Done = blue, Review = green, Progress = amber)
6. **Restyle priority chips** as filled pills with `▲` bar icon (use SVG inline)
7. **Restyle Metrics tab** with 3+4 hero/secondary split
8. **Restyle Share tab + share.html** — white panel on landscape
9. **Add landing page** at root of repo (or separate `landing/` folder) with hero + 5 sections
10. **Verify** by taking screenshots of: landing, Board (with mock 8 tasks per project), Metrics, Share, public report, paused page

---

## 7. Constraints

- **Accessibility**: all text on landscape backgrounds must pass WCAG AA — use white drop-shadow `0 1px 2px rgba(0,0,0,0.3)` on hero text, keep panel content on opaque-white surfaces
- **Performance**: total CSS budget < 14 KB gzipped per page; background image WebP < 100 KB; no JS frameworks (preserve vanilla)
- **Compatibility**: works in evergreen Chrome / Safari / Firefox; no dependence on `backdrop-filter` for primary content (use as enhancement only)
- **Brand**: every public surface must include "Created by GreatCTO" attribution
- **No emoji** in functional UI; emoji OK in marketing copy, none in admin UI labels

---

## 8. Out of scope (do NOT change)

- Server logic in `packages/board/server.mjs` — data API stays identical
- `bd` integration, share Worker, R2 storage
- Project switcher logic — only restyle, do not change behavior
- Metrics calculation in `getMetrics()`

---

## 9. Deliverables

1. `packages/board/public/index.html` — fully restyled, light theme, sidebar layout
2. `packages/board/public/share.html` — fully restyled, light theme
3. `packages/board/public/bg-landscape.{svg,webp}` — chosen background asset
4. `landing/index.html` (NEW) + `landing/styles.css` — public landing page
5. Screenshots (PNG, 1440×900) committed to `docs/design/screenshots/`:
   - `landing-hero.png`
   - `landing-full.png`
   - `board-kanban.png`
   - `board-metrics.png`
   - `board-share.png`
   - `report-public.png`
   - `report-paused.png`
6. `docs/design/CHANGELOG-redesign.md` — list of every visual change with before/after rationale
