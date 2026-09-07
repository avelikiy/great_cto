# DESIGN — story rewrite, September 2026

**Scope:** two surfaces — the `greatcto.systems` landing page and the README's first
screen. Plan altitude: this document changes no landing markup, no README, no board,
no code. A parallel product-owner contract owns *what* is said; this one owns *how it
looks and reads*.

**Source of truth for the visual system:** `packages/board/public/index.html`, the
`:root` and `[data-theme="light"]` token blocks and the `--fs-*` ramp beside them.
The board is the product; the site is its packaging. Where they disagree, the board
is right unless the difference is named as deliberate below.

**Gaps are marked "not measured".** A figure this document does not have, it does not
invent — that is the whole thesis of the product being marketed.

---

## 1. Visual vocabulary the site inherits from the board

### 1.1 Resolved colour, both themes (read from the board's token blocks)

| Role | Dark (`:root`) | Light (`[data-theme="light"]`) |
|---|---|---|
| page | `#0a0e0c` | `#eef2f0` |
| card | `#11161a` | `#ffffff` |
| muted | `#161c1f` | `#f0f3f1` |
| elevated | `#1a2025` | `#ffffff` |
| strong (hardest surface) | `#1e272c` | `#e2e8e4` |
| border | `rgba(255,255,255,.06)` | `rgba(0,0,0,.10)` |
| border-strong | `rgba(255,255,255,.12)` | `rgba(0,0,0,.18)` |
| ink 1 | `#ecf2ee` | `#0d1a14` |
| ink 2 | `#8a9a92` | `#56655e` |
| ink 3 | `#848f88` | `#5b6b64` |
| accent (bed / boundary) | `#00d97e` | `#009657` |
| accent as ink | `#00d97e` | `#097547` |
| focus ring | `#00d97e` | `#047857` |
| ok / done | `#00d97e` | `#0a7d4d` |
| in progress | `#f59e0b` | `#b45309` |
| blocked | `#ff5466` | `#c43030` |
| gate | `#a78bfa` | `#7c3aed` |
| absence (`!` unreadable, `?` unjudged) | fg `#fcd34d` on `rgba(255,170,60,.14)` | fg `#a64c08` on `rgba(180,83,9,.12)` |

Two rules the palette encodes, and the site inherits both:

- **The accent is two tokens, not one.** `--accent` is a bed and a boundary;
  `--accent-text` is ink. In the light theme they are different values because one
  green cannot clear both a 3:1 boundary floor and a 4.5:1 text floor.
- **Absence has its own pair.** It reuses the P1 amber verbatim rather than adding a
  fifth amber. Anything on the site that depicts board state must use the amber pair
  for "did not happen" and must never render it in the green.

### 1.2 Type

One ramp, twelve steps, shared verbatim by board and site:

`--fs-eyebrow 11 · caption 12 · small 13 · body 14 · base 15 · title-s 16 ·
title-m 19 · title-l 22 · num-s 24 · num-m 30 · num-l 36 · num-xl 52`

The site adds two steps an instrument panel has no use for: `--fs-display-s 64`,
`--fs-display-l 96`, and keeps `clamp()` for fluid display type. **Deliberate.** A
page read at every width needs fluid display type; a console read at one width does not.

**Weights:** hierarchy is size and ink, never bold. The board caps the display face at
500 (its vendored axis is 400–500). The site inherits the cap — no 600/700 anywhere,
including inside marketing headlines. 10px exists only as `--fs-eyebrow` at 11px for
mono uppercase with 0.08–0.1em tracking; 10px sans body text is banned by the board's
own comment and stays banned here.

**Faces:** board `--sans` is Geist; board `--display`/`--mono` are Geist Mono. The
board deliberately collapsed display into mono — "a board whose every figure is a
number you would paste has no second voice."

### 1.3 Spacing and borders

Not formalised as tokens in either file — **not measured**. What is observable and
must be preserved: borders are hairline alpha, never a solid grey; elevation in the
light theme is a 1px shadow plus a wide low-opacity green cast
(`0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,168,98,.08)`), and in the dark theme
elevation is surface-step, not shadow. **Action for implementation, not for this
document: extract a spacing ramp before the rewrite touches CSS**, or the site will
grow its 46th margin the same way it nearly grew its 46th font size.

### 1.4 What the current landing does differently

| Difference | Landing today | Board | Verdict |
|---|---|---|---|
| Theme count | light only: page `#fafafa`, ink `#111111` | two full themes, 39 light overrides | **Drift.** The product ships a dark-first console; the site shows only a light world. At minimum the site owes a `prefers-color-scheme` dark block. |
| Page ground | `#fafafa` (neutral) | `#eef2f0` (green-cast) | **Drift.** Same intent, two values; the site's ground is not the product's. |
| Ink ramp | `#111 / #414141 / #6e6e6e` neutral greys | `#0d1a14 / #56655e / #5b6b64` green-cast | **Drift.** |
| Accent | `#007a45` | `#009657` (light) / `#00d97e` (dark) | **Drift.** A third green nobody measured against the other two. |
| `--muted` | `#414141`, with a comment describing it as `#8a9a92` on a dark chip `#171d21` | n/a | **Drift, and worse: the comment is stale.** The file documents a dark page that no longer exists. A reader trusting the comment will make the wrong fix. |
| Body face | `--sans` resolves to **Geist Mono** — the whole page is mono | `--sans` is Geist; mono is reserved for machine truth | **Deliberate, but it costs the distinction.** A page entirely in mono cannot signal "this is a real number" by switching face. Keep mono as the voice only if the site marks quantities some other way. |
| Type ramp | identical 12 steps + 2 display steps + clamp | 12 steps, fixed | **Deliberate.** |
| Breakpoints | 880 / 720 / 600 / 480 | not measured | **Drift by accident** — four breakpoints is three more than a one-column page needs. |
| Analytics | GA4 loaded on the homepage | board: no telemetry, off by default | **Deliberate but discordant.** See §6. |

---

## 2. Landing section order

**First screen, before any scroll (desktop ≥ 880px and phone alike):**

1. Nav — wordmark, four links, one CTA.
2. Eyebrow — runtime and licence, one line.
3. `h1` — the claim.
4. Sub — one sentence saying what you get and what you must already have.
5. `npx great-cto init` as a copyable command, primary CTA beside it.
6. **One screenshot: `docs/screenshots/board.png` (Decisions), with its fixture label.**

Nothing else is above the fold. Everything currently there and not in this list is in §6.

**Why Decisions and not the other four.** The product's claim is *you keep three
decisions and leave the rest alone*. Decisions is the only screen that shows the claim
being honoured: every waiting gate as a row, both reviewers' verdicts, cost of undo,
and — critically — an `n/a` where a scan did not run. Ledger sells cost, which is the
second argument. Fleet and Harness answer questions a first-time reader has not asked
yet. Settings is furniture. One screenshot above the fold, and it is the one where the
honesty rule is visible without a caption explaining it.

**Section order below the fold, with each section's job and its prohibition:**

| # | Section | Its one job | Must NOT |
|---|---|---|---|
| 1 | Hero | State the claim and the precondition (you already run the agent) | Show a metric; show more than one screenshot; animate |
| 2 | The three checkpoints | Show *where* a human stands in the run | Re-argue safety; that is §4's job |
| 3 | Receipts | One traced run: duration and token cost, linked to the trace | Aggregate; extrapolate; show a chart |
| 4 | Why it is safe to leave alone | The rails: checkpoints, generated tests, a repo you own | Claim "trusted by"; claim an SLA |
| 5 | The board | The four screens, one question each, and the absence rule | Show all five screenshots; show a KPI wall |
| 6 | What it builds | The industry/product surface, as an index | Imply each of the 60 was built and shipped |
| 7 | Economics | Tokens per build, no seats | Compare against a competitor's price |
| 8 | FAQ | Absorb the objections the sections above provoked | Introduce a new claim |
| 9 | Install | The command, again, and Node's version floor | Ask for an email |

---

## 3. README first screen — text wireframe

For a developer deciding in 30 seconds. Everything below the line is deliberately
pushed under the fold.

```
┌────────────────────────────────────────────────────────────┐
│  [logo.svg, 280px, centred]                                │
│                                                            │
│  **One-line claim.** (what it does + what you must have)   │
│                                                            │
│  [npm version] [downloads] [MIT] [Claude Code · Codex]     │
│                                                            │
│  ```bash                                                   │
│  npx great-cto init                                        │
│  ```                                                       │
│                                                            │
│  Website · One real run · Live demo · Changelog            │
├────────────────────────────────────────────────────────────┤
│  2–3 sentences: it drives the agent you already run and    │
│  hands you a repo you own and a URL that works. It is not  │
│  a hosted app builder and needs an agent to orchestrate.   │
│                                                            │
│  Three checkpoints — what / how / whether it ships —       │
│  named in one line, not drawn.                             │
│                                                            │
│  [docs/screenshots/board.png — Decisions, alt text says    │
│   fixture project, caption says fixture project]           │
└──────────────── ~ fold on a 900px viewport ────────────────┘
```

**Pushed below the fold, deliberately:**

- The nine translation links. They are navigation for a reader who already stayed.
- The ASCII pipeline diagram. It is twenty lines and answers a question ("what runs
  between the checkpoints") that the reader has not asked at second 30.
- The `approval-level: ship-only` escape hatch. A configuration option before the
  first claim lands reads as a caveat.
- The "Numbers, measured" table. It is the strongest asset on the page and it is
  wasted above the fold, where the reader has no reason yet to care what $171 buys.
- The CI terminal GIF. A second moving image competing with the screenshot.
- Quick start, prerequisites, companion plugins.

**One screenshot above the fold, never two.** The GIF and the board image currently
stack; the second one costs the first one its weight.

---

## 4. The honesty constraint, made visual

The product's rule is *a thing that did not happen must never look like a thing that
did*. Marketing that violates it disproves the product. Concretely, on both surfaces:

1. **No invented metric.** Every number carries a link to the artefact that produced
   it (a trace, a benchmark file, an npm endpoint) or it does not appear. The
   benchmark's quality score is 70 and not a rounder number precisely because it was
   run; that is the tone for every figure on both surfaces.
2. **No chart with made-up numbers.** No sparkline, no burn-down, no upward-right
   line, decorative or otherwise. If a chart is worth drawing, it is worth drawing
   from a file in the repository, and the page links that file.
3. **No logos of users it does not have.** The stack strip (Next.js, Postgres,
   Stripe, …) is a statement about what the tool emits and must be captioned as such —
   a row of logos with no caption reads as a customer wall. **Not measured:** whether
   the current strip is read that way; a five-person read is the cheap check.
4. **A fixture screenshot says it is a fixture.** All five screenshots
   (`docs/screenshots/{board,ledger,fleet,harness,settings}.png`) are shot against a
   fixture project. Each needs the label in **three** places, because two of them
   are strippable: a visible caption under the image, the `alt` text, and — the
   durable one — inside the frame, so the label survives someone screenshotting the
   screenshot.
5. **The absence state must be visible in the hero image.** The Decisions screenshot
   should contain at least one `n/a` row. A hero shot with nothing but greens
   illustrates the opposite of the thesis.
6. **`46,819 npm downloads` is a live-fetched figure with a hardcoded fallback.** If
   the fetch fails, the page shows a stale number that looks current. Either label it
   with its as-of date or let it render as an absence. This is the site committing,
   in miniature, the exact defect the product exists to prevent.
7. **The stale `--muted` comment is the same defect in CSS.** A comment describing a
   dark page on a light page is a record of something that did not happen. Delete or
   correct it in the same change.

---

## 5. Accessibility and responsive contract

Stated as **checks that prove it**, not assertions. Every "proven by" line is a check
to be written; none of them exists yet.

### 5.1 Contrast floors, against the token pairs actually read

| Pair | Measured value on hand | Floor | Status |
|---|---|---|---|
| board dark `--text3 #848f88` on lightest dark surface | 4.53 | 4.5 | passes, at the ladder's limit |
| board dark `--focus-ring #00d97e` on `#0a0e0c` | 9.68 | 3.0 | passes |
| board light `--text3 #5b6b64` on `--bg-card` | 5.62 | 4.5 | passes |
| board light `--text3` on `--bg-strong` | 4.52 | 4.5 | passes, at the limit |
| board light `--text2 #56655e` on `--bg-card` | 6.14 | 4.5 | passes |
| board light `--accent-2 #097448` on approve tint | 4.55 | 4.5 | passes |
| board light `--focus-ring #047857` | 5.48 | 3.0 | passes |
| site `--text-3 #6e6e6e` on `--bg-page #fafafa` | **not measured** | 4.5 | unknown |
| site `--muted #414141` on `--surface-2 #efeee9` | **not measured** | 4.5 | unknown |
| site `--accent #007a45` on `--bg-page #fafafa` | **not measured** | 4.5 as ink / 3.0 as boundary | unknown |
| site focus ring | **no token exists** | 3.0 | **missing** |
| site dark theme | **does not exist** | — | **missing** |

**Proven by:** a contrast check that walks every declared token pair on *both*
surfaces and *both* themes, and fails the build on a miss. The board's own comment
records the trap: its audit read `:root` and nothing else, so 39 light-theme
overrides — half the surface area — went unmeasured for months. A site check that
reads only `:root` repeats that exactly.

### 5.2 Focus

Every interactive element shows a visible focus ring at ≥3:1 against its own
background, in both themes. The board treats the ring as a token separate from the
accent for this reason. **The site declares no focus-ring token at all.**
**Proven by:** a keyboard walk of the landing — tab from the skip link to the install
button, screenshot each stop — plus a check that no rule sets `outline: none` without
a replacement.

### 5.3 Phone

- One column below 720px. Nav collapses to wordmark plus the install CTA; the four
  section links move into the footer, not into a hamburger — four links do not earn a
  menu.
- The hero screenshot stays, scaled to full width, and **must remain legible at 375px
  or be swapped for a cropped detail of the same screen**. A 900px console shrunk to
  360px is an illustration of a screenshot, not a screenshot. **Not measured:**
  whether `board.png` survives the crop.
- Four breakpoints (880/720/600/480) collapse to two: 720 (one column) and 480
  (compress type to `--fs-body`, drop decorative padding).
- Fluid display type keeps `clamp()`, floor `--fs-title-l` (22px) so a headline never
  outgrows its phone.

**Proven by:** a Playwright pass at 375 / 768 / 1280 that asserts no horizontal
overflow on `document.body` and captures a screenshot per width for eyes.

### 5.4 Touch

Every tappable target ≥44×44 CSS px, including nav links, the copy-command button,
the industry cards' arrows, and the FAQ disclosure rows. The industry grid's 12px
inline chips are the likeliest failure. **Not measured.**
**Proven by:** a DOM assertion at 375px over every `a`, `button`, `select` and
`summary`, listing each element whose bounding box is under 44px in either axis.

### 5.5 Motion and structure

- `prefers-reduced-motion: reduce` already has a block; it must cover the hero pulse
  and any scroll-linked transform. **Proven by:** rendering with the media feature
  forced and asserting zero animations run.
- One `h1` per page; heading levels never skip. **Proven by:** an axe or html-validate
  pass in CI.

---

## 6. What to delete from the current landing

| Delete | The one reason |
|---|---|
| The npm-downloads hero stat (both instances) | A vanity number in the position the product reserves for a decision — and it is a hardcoded fallback that can render stale as current. |
| The `cta-micro` badge strip ("100% Claude Code · 100% OpenAI Codex · 100% Claude Fable 5.1 · 100% OpenAI Astra 6 · no signup · runs locally · open source · MIT · your code stays on your machine") | Nine claims in one line is nine claims nobody reads, and four unverifiable "100%"s undercut the six verifiable facts beside them. |
| The 60-card industries grid on the homepage | It is an index, not an argument; it is the page's densest block, it carries the a11y risk (12px chips, sub-44px targets), and `/build/` already exists to hold it. Link to it. |
| The stack-logo strip as currently presented | Uncaptioned logos read as customers. Keep the sentence, drop the chips. |
| The interactive build picker | It asks a first-time reader to configure something before they have decided anything, and its terminal output is generated, not run. |
| The duplicated "three checkpoints, or one" feature card | The same claim is made in three sections (`#how`, `#review`, the feature grid); repetition of a safety claim reads as insecurity about it. |
| The hero-headline A/B assignment script | It runs before first paint on every visit to test a sentence, and its result is not published anywhere — measurement the reader pays for and nobody reads. |
| GA4 | The page argues "no telemetry by default" while loading a third-party analytics tag; the argument loses. Cloudflare's cookieless analytics is already in place. |
| The stale `--muted` comment block in `styles.css` | It documents a dark page that no longer exists — a record of something that did not happen, inside the codebase whose thesis forbids exactly that. |
| The `assets/demo.gif` in the footer region | A second moving image, below every argument it could have supported. |
