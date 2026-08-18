---
surface: web
feature: public-surface-review (GitHub README + greatcto.systems landing)
target: README.md · landing styles.css + industries generator (landing repo) · site/*.html
status: draft
author: design-advisor v2.0
date: 2026-07-29
---

# Design review — README + landing page

Review only. This is a contract for fixing two public surfaces; it contains no
implementation code. Measurements were taken from `README.md` (this repo), the
shipped `landing.html` + live `styles.css?v=2026062101`, and `site/*.html` in this
repo. Contrast ratios were computed against WCAG 2.2 with the sRGB relative-luminance
formula (0.2126R + 0.7152G + 0.0722B, 2.4 gamma). Where a value could not be measured
without rendering, it is marked **not measured**.

The one-line verdict: both surfaces are readable and both handle focus, reduced-motion
and heading order correctly. Three things are broken — the landing's 60 industry
keyword chips render at 2.62:1 (invisible), the agent count is printed as four
different numbers across the two surfaces, and the in-repo sub-pages link their nav to
a `/#archetypes` anchor the rebuilt homepage no longer has. Everything else is
hierarchy and polish.

---

## 0. Design system and component inventory

A review audits the system already shipped rather than proposing one, so both
are recorded here as found — and stated up front, because the token list below
is what every contrast number in §2a is computed against.

**Design system in play.** The landing has one, defined as CSS custom properties
in `styles.css` `:root` and used consistently: surfaces `--bg-page #0a0e0c`,
`--bg-card #11161a`, `--surface-2 #171d21`; text `--text #ecf2ee`,
`--text-2 #8a9a92`, `--text-3 #7d8f86`; accents `--accent #00d97e`,
`--p0 #ff5466`. The README has no design system of its own and inherits
GitHub's markdown renderer, which is why its findings are hierarchy and wording
rather than colour.

One gap, and it is the source of the only real accessibility failure: **`--muted`
is referenced by generated markup and never defined** in `:root`, so it silently
falls back to a light-theme literal on a dark page. A token that does not exist
resolves to something rather than failing — the same shape as every other defect
this repository keeps removing.

**Components reviewed.**

| Component | Surface | Verdict |
|---|---|---|
| Industry keyword chip (generated) | landing | **FAIL** — 2.62:1, undefined token |
| Hero + eyebrow + primary CTA | landing | pass |
| Archetype hub cards (`.ap-hubmeta`, `.ap-hubtag`) | landing | pass |
| Receipts panel + `--p0` kicker | landing | pass |
| Sub-page nav | `site/*.html` | **FAIL** — links a dead `/#archetypes` anchor |
| Badge row, agent-count claims | README + landing | **FAIL** — four different numbers |
| Heading order, landmarks, focus, reduced-motion | both | pass |

## 1. Information hierarchy, per surface

### 1a. README — order the eye hits it

The centered header block (lines 1–22) is, top to bottom: logo → bold tagline → **6
badges** → `npx great-cto init` fence → a **5-link** nav row → a **9-language** row →
`---`. The install command sits in the header, above the first `##` — that is correct
and the strongest thing about the layout.

What breaks:

- **The badge row carries a paragraph.** Five of the six badges are one token each
  (`npx great-cto`, `downloads`, `MIT`, `Claude Code Plugin`, `Codex`). The sixth
  (line 12) is `one_real_run-1h26m_·_$3.40_vs_~$42K_traditional` — a full sentence
  encoded as a shields.io badge. It wraps to its own row on a ~900px column and to two
  or three rows on a phone, and it repeats a claim the blockquote at line 40 already
  states in prose. The badge row reads as noise past badge 3.
- **Two secondary link rows compete with the primary action.** Directly under the
  install command sit a 5-item nav row (line 18) and a 9-item language row (line 20).
  On a phone these two rows wrap into 4–6 lines of small blue links, pushing the first
  explanatory heading (`## Build the product`) well down. **Screens-to-orientation is
  not measured** (needs a rendered GitHub phone view), but the header is roughly one
  desktop viewport of chrome before the first section, and materially more on a phone
  because the badge, nav and language rows each wrap.
- **The first prose paragraph is a 7-line block with a nested caveat.** Lines 28–34
  open with the pitch and then, mid-paragraph, fork into the irreversible-change gate
  exception. The reader meets the exception before they have the rule. RULE-A: this is
  one flowing argument, but it packs the headline claim and its edge case into the same
  breath.
- **`<details>` hides ~55% of the README.** Lines 166–404 (the comparison table, cost
  table, jurisdiction table, MCP, critics, archetypes) are collapsed behind one
  `<summary>` whose label is a 12-item middot-separated run-on (line 167). Progressive
  disclosure is the right call for a README this long; the summary label is not — it is
  a list pretending to be a sentence.

### 1b. Landing — order the eye hits it

The hero has a single focal path and it works: eyebrow → h1 (A/B variant) → one sub
paragraph → two CTAs → npm stat → trust micro-line. Below the hero the hierarchy
flattens.

- **One component does the whole page.** After the hero, six consecutive sections —
  *What's in every build*, *How it works*, *Why it's safe*, *The dashboard*, *The
  economics*, *Receipts* — are the same `.lp-grid` of `.lp-feat` cards (mono kicker +
  h3 + one paragraph), rendered ~24 times with no change in rhythm, weight, or media.
  Nothing tells the eye which section matters or where it is on the page. Monotony, not
  contrast, is the reason a reader stops scrolling here.
- **The "dashboard" section shows no dashboard.** `#board` (landing.html 329–338) is
  three text cards. The README embeds `board.png`, `metrics.png`, `memory.png`; the
  landing embeds none. `openDemoVideo()` and `assets/demo.webm` exist in the file but
  no element on the homepage calls the function — the demo appears **unwired**. A page
  selling a visual board that never shows the board loses its strongest proof.
- **One idea, stated a dozen times.** "Approve the spec / one CTO gate" appears in the
  hero, *The shift*, *What's in every build*, *How it works*, *Why it's safe*, the FAQ
  and the final CTA — 7+ restatements. "Your data never leaves" appears 6 times. The
  single message stops registering through repetition.
- **The densest block is the broken one.** The 15-industry grid (60 keyword chips) is
  the largest information mass on the page and sits directly under the hero — and its
  chips render at 2.62:1 (section 2). The product differentiation the grid exists to
  show is the content that is invisible.

---

## 2. Accessibility — measured, not guessed

WCAG target: **2.2 AA** (4.5:1 body text, 3:1 large text and UI components).

### 2a. Colour contrast (computed from the live CSS tokens)

Landing tokens (`styles.css` `:root`): `--bg-page #0a0e0c`, `--bg-card #11161a`,
`--surface-2 #171d21`, `--text #ecf2ee`, `--text-2 #8a9a92`, `--text-3 #7d8f86`,
`--accent #00d97e`, `--p0 #ff5466`.

| Element | Colours | Ratio | Size | Verdict |
|---|---|---|---|---|
| **Industry keyword chip** (generated) | `#5f5e5a` on `#171d21` | **2.62:1** | 12px | **FAIL — real** |
| Body `--text-2` on page | `#8a9a92` on `#0a0e0c` | 6.58:1 | 15–19px | pass |
| Body `--text-2` on card | `#8a9a92` on `#11161a` | 6.17:1 | 14.5px | pass |
| `--text-3` micro-lines / links | `#7d8f86` on `#0a0e0c` | 5.68:1 | 12px | pass |
| Eyebrow `--accent` (11px) | `#00d97e` on `#0a0e0c` | 10.38:1 | 11px | pass |
| `.ap-hubmeta` accent on card | `#00d97e` on `#11161a` | 9.73:1 | 12.8px | pass |
| Receipts red kicker `--p0` | `#ff5466` on `#11161a` | 5.82:1 | 11px | pass |
| `.ap-hubtag` (70% white) | `≈#aab0ae` on `#11161a` | 8.26:1 | 14.4px | pass |
| `--btn-primary` label | `#001a0d` on `#00d97e` | 9.73:1 | 13.5px | pass |
| `.cta-micro .sep` divider | `≈#2a2e2c` on `#0a0e0c` | 1.41:1 | — | decorative (1.4.3 exempt), borderline |

The single real contrast failure is the **industry keyword chip**, and the cause is
mechanical, not a colour choice. The generated markup uses
`background:var(--surface-2,#f1efe8);color:var(--muted,#5f5e5a)`. On the dark site
`--surface-2` resolves to `#171d21` (dark) but **`--muted` is never defined** in
`:root`, so the text falls to its hardcoded light-theme fallback `#5f5e5a` (dark grey).
Dark grey on dark = 2.62:1. The inline styles were authored for a light theme
(`#f1efe8` background, `#5f5e5a` muted) and pasted into a dark page. Swapping the text
to `var(--text-2)` yields **5.77:1** on the same chip background — one token change
clears AA. This is generated content (`<!-- INDUSTRIES-STRIP -->`, produced by
`autopilots/_inject-industries.mjs` from `_industries.json` in the landing repo), so
the fix belongs in that generator/template, not in hand-edited HTML.

README contrast: the only author-controlled colour is the shields.io badges (white on
solid fills, all fine) and the ASCII diagrams (theme-neutral emoji). **Nothing in the
README depends on a colour that vanishes in one of GitHub's two themes** — checked: the
`docs/screenshots/logo.svg` carries its own `#0a0e0c` background rect, so its emerald
mark and `#ecf2ee` wordmark stay visible on both light and dark GitHub.

### 2b. Heading order and landmarks

- **README:** all sections are `##` (h2); no `###` skips exist. There is no markdown
  `#` (h1) — GitHub supplies the repo title as the page h1, which is the convention.
  **Heading order is valid.**
- **Landing:** one `<h1 id="hero-h1">`; every section uses `<h2 class="h2">`; cards use
  `<h3>`. Order is h1 → h2 → h3 with no skips. **Valid.**
- **Landing landmark bug (real):** `role="main"` is attached to the hero `<section>`
  only (land.html 145). Every section after the hero — industries, features, board,
  pricing, receipts, FAQ — sits outside any main landmark, and there is no `<main>`
  element. The skip link (`#main`) lands on the hero correctly, but a screen-reader
  "jump to main" reaches only the hero. Fix: wrap all content sections in a single
  `<main id="main">` and drop `role="main"` from the hero.

### 2c. Link text out of context, labels, focus

- **Focus states: handled.** `styles.css` 80–87 gives every link/button/summary a
  2px `--accent` focus-visible outline + 2px offset + soft ring. A skip link exists and
  is styled (65–76). No change needed.
- **Form label: correct.** The flow-picker `<select id="pick-archetype">` has a real
  `<label for="pick-archetype">`.
- **The 15 "Build ↗" links are acceptable, narrowly.** Each industry card wraps the
  whole card in one `<a>`, so the accessible name is the full card text
  ("🔧 Home & field services … 4 products Build ↗"), not the bare "Build ↗". Not a
  1.4.1/2.4.4 failure. The leading emoji is announced (🔧 = "wrench"); tolerable.
- **Demo lightbox focus management is missing** — but the lightbox is unwired on the
  homepage, so this is latent. If it is ever wired to a button: it sets `role="dialog"`
  `aria-modal` and closes on Esc, but does **not** move focus into the dialog on open,
  trap focus, or restore focus on close (2.4.3). Note it for whoever wires it.
- **README link text is mostly self-describing** ("See the full trace →", "the 6
  pipelines", each language named). No bare "here"/"→"-only links found.

### 2d. Alt text and images

- **Landing:** almost no `<img>`. The logo is inline SVG with `aria-hidden` on the mark
  plus a text label — correct. Company names are text spans, not images. The only
  `<img>` is the video fallback (`alt="great_cto demo"`). Alt coverage is fine.
- **README:** `logo.svg alt="great_cto"`, board/metrics/memory screenshots have
  descriptive alt, star-history chart has alt. Fine. The `<sub>` captions under the
  metrics/memory thumbnails duplicate the alt — harmless.

---

## 3. Responsive and dark mode

### 3a. Landing under 380px

- **8px hero eyebrow.** At `≤480px` `styles.css` 1576–1581 sets
  `.hero-eyebrow { font-size: 8px }`. "AI Product Builder · MIT · runs on Claude Code ·
  34k installs" at 8px is below a usable size (contrast passes; legibility does not).
  Raise to ≥11px and let it wrap, or drop the tail items on the smallest breakpoint.
- **Nav collapses to logo + Install, with no menu.** At `≤880px`
  `.nav-right .nav-link { display:none }` (1434) removes Build, Pipelines, Industries,
  Blog and GitHub, and there is no hamburger replacement. On a phone the entire top nav
  is one "Install" button — the sub-pages are unreachable from the nav. Add a menu
  (disclosure or an anchor list in the footer is the minimum).
- **What holds up:** `.wrap` drops to 18px padding, `overflow-x:hidden` + `max-width:
  100vw` guard against horizontal scroll, buttons go full-width with a 44px min-height
  touch target at `≤480px` (1570), the industry grid is `auto-fit minmax(280px,1fr)`
  so it reflows to one column, and the terminal preview wraps (`white-space:pre-wrap`).
  No data tables exist on the landing, so there is no table-overflow problem here.

### 3b. README on a phone (GitHub's renderer)

- **Tables are the risk, and there are 11 of them.** The widest are the comparison
  table (4 columns: great_cto / Devin / Claude Code, line 195), the jurisdiction table
  (4 columns with long framework strings, 216–229) and the three-product table
  (4 columns, 111). GitHub wraps README tables in a horizontal scroll container on
  narrow screens rather than reflowing them, so they do not overflow the page — but the
  jurisdiction table's long cells force a lot of sideways scrolling on a phone.
  **Exact wrap behaviour not measured** (needs a rendered mobile GitHub view);
  the design guidance is to keep the high-value tables at ≤3 columns and move the
  12-row jurisdiction table behind its own `<details>`.
- **The ASCII pipeline diagrams (lines 50–60, 171–177) are the README's best asset on
  mobile** — they scale, they render identically in both themes, and they carry the
  core idea faster than the prose around them. Keep them; lead with them.

### 3c. Dark mode

- **Landing is dark-only by design** (hardcoded dark tokens; no `prefers-color-scheme`
  handling). That is a deliberate single-theme choice, not a bug. The only place it
  bites is the industry chip, where a light-theme fallback (`#5f5e5a`, `#f1efe8`) leaked
  into the dark page — section 2a.
- **README inherits GitHub's two themes and survives both** — verified in 2a. No
  author colour vanishes in either theme.

---

## 4. Consistency across the pages

The in-repo `site/*.html` pages and the externally-built homepage do **not** read as
one product. Named drift:

| Axis | Homepage (built elsewhere) | In-repo `site/*.html` | Consequence |
|---|---|---|---|
| **Nav items** | Build · Pipelines · Industries · Blog · GitHub · Install | 5 different sets: agents=How·Archetypes·Packs, packs=How·Archetypes·Companies, for/*=How·Archetypes·vs Cursor, companies=How·Archetypes·Packs | No stable nav; users can't build a mental map |
| **Nav target validity** | `#industries`, `#how`, `#install` all exist | sub-pages link `Archetypes → /#archetypes` | **Dead anchor** — the rebuilt homepage has **no** `id="archetypes"` (grep: 0 hits). Broken in-page link on every sub-page |
| **Font delivery** | self-hosted woff2, preloaded, no third party | Google Fonts CDN (`fonts.googleapis.com` + `fonts.gstatic.com`) | Sub-pages ship the visitor's IP+UA to Google on every load — contradicts the site's own "your data never leaves / no telemetry by default" promise |
| **CSS cache-bust** | `styles.css?v=2026062101` | `styles.css?v=2026050414` | Same deployed file, older query — cosmetic, but signals the pages are maintained on different clocks |
| **Product name** | "GreatCTO" + "greatcto" (logo) | mixed | README adds a third spelling: "great_cto" and "GreatCTO" used interchangeably (e.g. line 5 vs 137); npm package is "great-cto". Four spellings of one name |

The shared `styles.css` means the type scale, spacing rhythm (`section{padding:96px 0}`,
`.wrap max-width:1100px`), colour roles and button treatment (`.btn-primary` emerald,
`.btn-ghost` outline) are in fact consistent at runtime — the drift is in the **shell**
(nav, fonts, name), not the design tokens. That is good news: the tokens are one
system; only the page furniture disagrees.

**The count problem (cross-surface, measured).** The number of specialist agents is
printed as four different values, and none equals the true count:

| Where | Claim |
|---|---|
| `agents/*.md` on disk (truth) | **69** |
| README "By the numbers" table (L94) and comparison table (L201) | 67 |
| README `<details>` summary (L167) and Architecture (L381) | 68 |
| `site/agents.html` `<title>` + meta (×4) | 50 |
| `site/agents.html` hero + h2 | 61 |

A reader who checks two pages sees the product contradict itself on its headline
number. This is the highest-credibility-cost defect on either surface and it is a
find-and-replace against a single source of truth, not a redesign.

**Node version contradiction (verify).** README line 145 says "Node 18.17+";
`CLAUDE.md` line 60 says "Node.js ≥ 20". The repo `package.json` has no `engines` field
and a placeholder `version: 0.0.1` (bumped at release), so the authoritative minimum
**could not be confirmed from the repo**. Flag: unify README and CLAUDE.md against the
published package's real `engines.node`.

---

## 5. The design contract

Priority key: **CRITICAL** = an a11y failure or something that makes content
unreadable/wrong. **HIGH** = comprehension. **MEDIUM** = polish. Each item names the
surface, the defect, the target state, and a checkable acceptance criterion.

### CRITICAL

**C1 — Industry keyword chips fail contrast (2.62:1).**
- Surface: landing, generated industries strip.
- Wrong: `color:var(--muted,#5f5e5a)` resolves to `#5f5e5a` (undefined var → light-theme
  fallback) on `--surface-2 #171d21` = 2.62:1; the 60 chips are effectively invisible.
- Right: emit `color:var(--text-2)` (or define `--muted:#8a9a92` in `:root`) so chips
  read on the dark surface. Fix in the generator that emits `<!-- INDUSTRIES-STRIP -->`
  (`autopilots/_inject-industries.mjs`), not the built HTML.
- Accept: computed contrast of chip text on chip background **≥ 4.5:1** (target 5.77:1);
  all 60 chips legible in a dark-theme screenshot.

**C2 — Agent count disagrees across surfaces (50 / 61 / 67 / 68; truth 69).**
- Surface: README + `site/agents.html`.
- Wrong: five different numbers; none is 69.
- Right: one number sourced from `ls agents/*.md | wc -l`, propagated to every mention.
- Accept: `grep -noE "[0-9]+ (specialist )?agents"` on README.md and every `site/*.html`
  returns the **same** integer, equal to the on-disk count.

**C3 — Sub-page nav points at a dead `/#archetypes` anchor.**
- Surface: `site/agents.html`, `packs.html`, `companies.html`, `for/*.html`, `pack/*.html`.
- Wrong: "Archetypes" links to `/#archetypes`; the rebuilt homepage has no such id
  (grep: 0). The link scrolls nowhere.
- Right: point at a real section (`/#industries` or `/pipelines.html`) or restore an
  `id="archetypes"` section on the homepage. Unify the nav set across all pages.
- Accept: every nav href resolves to an element that exists on its target page; the nav
  item set is identical on all `site/*.html` pages and the homepage.

### HIGH

**H1 — Landing `role="main"` scopes only the hero.** Wrap all content sections in one
`<main id="main">`; remove `role="main"` from the hero `<section>`. Accept: exactly one
main landmark, and it contains every content section (axe: "landmark-unique" +
"region" clean).

**H2 — README badge row is noise past badge 3.** Cut to 4 badges (npm version ·
downloads · MIT · host = Claude Code + Codex); delete the sentence-length "Savings"
badge (the claim already lives in the blockquote at L40). Accept: ≤4 badges; no badge
label longer than 3 words.

**H3 — README header buries orientation under two link rows.** Move the 9-language row
into a `<details>Read in another language</details>`; keep only 3 primary links
(Website · One real run · Live demo) directly under install. Accept: on a rendered
GitHub phone view, the first `##` heading is reachable within one scroll of the install
command. (**Currently not measured** — this criterion is the measurement.)

**H4 — Landing repeats one idea ~12 times and shows the board zero times.** Cut the six
identical card-grids to four by merging *Why it's safe* into *What's in every build* and
folding *The economics* into *Receipts*; embed the real `board.png`/`metrics.png` in the
`#board` section (or wire the existing `demo.webm` lightbox with focus management).
Accept: at least one section between hero and footer contains a product screenshot or
the wired demo; "approve the spec" appears ≤4 times in body copy.

**H5 — Node version contradiction.** Unify README (18.17+) and CLAUDE.md (≥20) against
the published `engines.node`. Accept: one version string, matching `package.json`
`engines.node`, in both files.

### MEDIUM

**M1 — 8px hero eyebrow at ≤480px.** Raise to ≥11px; wrap instead of shrinking. Accept:
computed font-size ≥11px at 380px width.

**M2 — Mobile nav has no menu.** Add a disclosure menu (or, minimum, a full nav list in
the footer) so sub-pages are reachable on a phone. Accept: every top-nav destination is
reachable at 380px width without the desktop nav.

**M3 — Sub-pages load Google Fonts, contradicting the privacy promise.** Self-host
Geist/Geist Mono on `site/*.html` as the homepage already does (preload woff2, drop the
`fonts.googleapis.com`/`fonts.gstatic.com` links). Accept: no request to a Google
domain in the sub-pages' network trace.

**M4 — README `<details>` summary is a 12-item run-on.** Replace with a short label:
"Full documentation — architecture, cost, comparison, MCP, archetypes". Accept: summary
label ≤10 words.

**M5 — Product name has four spellings.** Pick one display name ("GreatCTO") and one
code identifier ("great-cto" = the npm/CLI name); use "great_cto" only where it is a
literal path/handle. Accept: README body prose uses one display spelling.

**M6 — npm-download odometer animates through reduced-motion.** The hero counter runs a
`requestAnimationFrame` loop that ticks the number up 0.3/sec; CSS
`prefers-reduced-motion` (handled everywhere else, `styles.css` 2267) cannot stop a JS
animation. Gate the loop on
`matchMedia('(prefers-reduced-motion: reduce)').matches` and paint the static real total
instead. Accept: with reduced-motion on, the hero number does not visibly tick.

**M7 — Stale JSON-LD `softwareVersion`.** `landing.html` hardcodes `2.77.1`; live is
2.90.0. Source it from the build or drop the field. Accept: version in JSON-LD matches
the published npm version (or is absent).

**M8 — `.cta-micro .sep` dividers at 1.41:1.** Decorative and 1.4.3-exempt, but they
carry the visual separation between trust claims. Lift to `--text-3` (5.68:1) so the
rhythm survives on a dim laptop screen. Accept: separator contrast ≥3:1.

---

### Wireframe A — README, first two screens (restructured)

```
┌───────────────────────────── SCREEN 1 (desktop + phone) ─────────────────────────────┐
│                          [ logo.svg — theme-safe, own bg ]                            │
│                                                                                       │
│              Describe a product. Approve the spec. Ship the software.                 │
│         (bold tagline — one line desktop, wraps to 3 on phone; no change)             │
│                                                                                       │
│   An AI Product Builder: a team of specialist agents plans, builds, reviews and       │
│   deploys. You make one decision — approve the spec. The rest runs to a live URL.     │
│                                                                                       │
│   ┌─────────────────────────────┐                                                     │
│   │ $ npx great-cto init        │   ← install stays above the first heading           │
│   └─────────────────────────────┘                                                     │
│                                                                                       │
│   [npm v] [downloads] [MIT] [Claude Code + Codex]      ← 4 badges, none a sentence     │
│                                                                                       │
│   Website · One real run → · Live demo          ← 3 primary links only                 │
│   › Read in another language (9)                ← languages behind a <details>         │
│   ──────────────────────────────────────────────────────────────────────────────────  │
├───────────────────────────────────── SCREEN 2 ───────────────────────────────────────┤
│   ## What it is                                                                        │
│   You describe the product. great_cto ships it — backend, frontend, tests, live URL.  │
│   One human gate (approve the spec). Irreversible changes open extra gates on purpose. │
│                                                                                       │
│        describe ─► spec synthesis ─► 👤 CTO gate ─► build→test→deploy ─► shipped        │
│        (the ASCII diagram, lifted up — it carries the idea faster than prose)          │
│                                                                                       │
│   > One real feature: idea → merged PR in 1h 26m for $3.40 LLM.                        │
│   > Traditional path: ~170h / ~$42K.  See the full trace →                            │
│                                                                                       │
│   ## Install   (already close behind — keep it here)                                   │
└───────────────────────────────────────────────────────────────────────────────────────┘
```
Moves: badges 6→4; nav 5→3; languages into `<details>`; the dense 7-line opener splits
into a 3-line "what it is" with the caveat as its own sentence; the pipeline diagram and
the receipt blockquote both rise above the fold-2. Nothing new is written — everything
here already exists in the README; it is reordered and trimmed.

### Wireframe B — landing hero + first section (restructured)

```
┌──────────────────────────────────── HERO (unchanged core) ────────────────────────────┐
│   ● AI Product Builder · MIT · runs on Claude Code · 34k installs   (≥11px on phone)   │
│                                                                                       │
│                     Describe a product. Ship the software.                            │
│                                                                                       │
│   An AI Product Builder — describe a software product and it runs the whole build.    │
│   One human gate: you approve the spec. Everything after → a repo and a live URL.      │
│                                                                                       │
│   [ Start building ↗ ]   [ How it works ↗ ]        34k downloads on npm                │
│   no signup · runs locally · open source · your data never leaves                     │
│                                                                                       │
│   ┌───────────────────────────────────────────────────────────────────────────────┐   │
│   │  [ board.png — the live build board ]   ← the product, shown in the hero       │   │
│   │  the one screenshot that proves "a CTO dashboard that runs itself"             │   │
│   └───────────────────────────────────────────────────────────────────────────────┘   │
├──────────────────────────── INDUSTRIES (chips fixed) ─────────────────────────────────┤
│   What do you want to build?   15 industries · 60 products · 6 pipelines               │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                  │
│   │ 🔧 Home & …   │ │ 💼 Prof svc  │ │ 🍽️ Restaurants│ │ 🛒 Retail     │  … (auto-fit)   │
│   │ HVAC, plumb…  │ │ Agencies…    │ │ Dine-in…     │ │ SMB store…   │                  │
│   │ [Dispatch]    │ │ [Proposal]   │ │ [Ordering]   │ │ [Storefront] │  ← chips now     │
│   │ [Quoting] …   │ │ [Portal] …   │ │ [Loyalty] …  │ │ [Pricing] …  │    5.77:1, legible│
│   │ 4 products →  │ │ 4 products → │ │ 4 products → │ │ 4 products → │                  │
│   └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```
Moves: add the `board.png` product shot to the hero (the landing's biggest missing
proof); fix the 60 chips so the grid's content becomes visible; keep the hero's existing
focal path. Downstream, break the six identical card-grids per H4 so the page has more
than one texture.

---

## Out of scope

- Rewriting the marketing copy's substance or the claims themselves (that is PM/founder
  territory — this contract only flags where two surfaces state different numbers).
- The landing repo's build tooling beyond naming the one generator that emits the failing
  chips.
- SEO, JSON-LD schema correctness beyond the stale version field (M7).
- Net-new visual identity — the emerald/near-black token system is sound and stays. This
  is repair, not a redesign.

## Open questions (recommended default in bold)

1. Is the true agent count 69 (on-disk `agents/*.md`), or do some files not ship?
   **Default: 69, verified by `ls agents/*.md | wc -l` at release; wire a check so the
   number can't drift again.**
2. Is the homepage's `_industries.json`/generator in a repo the implementer can edit?
   **Default: yes — fix C1 there; if not reachable this cycle, patch the built HTML and
   file the generator fix.**
3. Should the landing stay dark-only? **Default: yes — single theme is intentional and
   the tokens are consistent; only fix the leaked light-theme fallback.**
4. Keep or remove the npm-download odometer's cosmetic tick? **Default: keep the live
   figure, drop the fake per-second animation and gate on reduced-motion (M6).**
5. Wire the demo lightbox or delete it? **Default: wire it into `#board` with focus
   management (H4) — it is the product proof the landing is missing.**
6. Authoritative Node minimum? **Default: read `engines.node` from the published
   package; unify README + CLAUDE.md to it (H5).**

## Implementation hand-off (ordered; senior-dev)

1. **C2 / M5** — in `README.md`: set the agent count to the on-disk number in all four
   places (L94, L167, L201, L381); pick one display name in body prose. Same count fix
   in `site/agents.html` (title ×4, hero, h2).
2. **C1** — in the landing repo generator (`autopilots/_inject-industries.mjs` →
   `_industries.json` template): change chip text to `var(--text-2)` (or define
   `--muted` in `:root`); regenerate the strip. Verify all 60 chips ≥4.5:1.
3. **C3 / M2 / M3** — in `site/*.html`: unify the nav item set, repoint `Archetypes` to a
   live target, add a mobile menu, and self-host the fonts (drop Google Fonts links).
4. **H1** — in the landing template: wrap content sections in `<main id="main">`, remove
   `role="main"` from the hero.
5. **H2 / H3 / M4** — in `README.md`: trim badges to 4, cut the 5-link/9-language rows to
   3 primary links + a language `<details>`, shorten the `<details>` summary, and apply
   Wireframe A's reorder (split the opener, raise the diagram + receipt).
6. **H4 / Wireframe B** — in the landing template: embed `board.png` in the hero, merge
   the two redundant card-grids, cut "approve the spec" repetition to ≤4.
7. **M1 / M6 / M7 / M8** — landing polish: eyebrow ≥11px at ≤480px; gate the odometer on
   reduced-motion; source or drop the JSON-LD version; lift `.cta-micro .sep` to
   `--text-3`.
8. **H5** — reconcile the Node version across README + CLAUDE.md against `engines.node`.

Target files the implementer touches: `README.md`, `site/agents.html`,
`site/packs.html`, `site/companies.html`, `site/for/*.html`, `site/pack/*.html`,
`CLAUDE.md`, and — in the separate landing repo — `styles.css` `:root`, the industries
generator, and the homepage template. No file in this contract requires a new
dependency; the token system stays as-is.

## Numeric contract

This surface displays no figure a reader compares down a column or sums, so
tabular figure style is not required here. Where counts do appear they are
proportional and left-aligned with their labels.

The rule that does apply is absence: a count that could not be read renders as
"—" with its reason, never as `0`. A zero means measured-and-none.

## Destructive actions

None on this surface — nothing here deletes, overwrites or dispatches. Stated
rather than omitted, so a later reader can tell this was considered and found
empty rather than skipped.
