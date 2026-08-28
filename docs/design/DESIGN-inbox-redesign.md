---
surface: web
feature: board Inbox redesign
target: packages/board/public/index.html (#panel-inbox markup + renderInbox / renderInboxList / renderResume / renderPipeline / refreshReceipt / refreshBudgetLine / refreshStandDowns); one companion decision in packages/board/lib/data-readers.mjs::getInbox
status: draft
author: design-advisor v2.0
date: 2026-08-28
---

# Board Inbox — redesign

**Verdict.** The Inbox promises *"here's what needs your decision"* and then shows a
month-old read-only status dashboard. Measured this morning at `localhost:3141`: **every
timestamp on the screen is 11–40 days old, and the one item that actually needs a decision
has had its Approve/Reject buttons stripped by a data bug.** The screen is overloaded
because it is doing two jobs at once — *"what needs me"* and *"how is the project"* — and it
is unclear what to act on because the single most important fact (nothing has moved in 11
days) is nowhere written, while six of seven visible blocks are read-only status the eye has
to wade through to find the one actionable row.

The fix is not more polish on the existing blocks — the file already shows a dozen careful
patches (non-zero-tile filtering, dedup of the resume/stale overlap, `also` tags, an
all-clear card). Those are treating symptoms of one disease: **the screen has no single
job.** This redesign gives it one — *"what needs me, and is the machine still moving?"* —
promotes staleness to the headline, collapses everything read-only behind one disclosure,
and unifies four fragmented sections into one ranked action queue whose affordances follow
what the item **is**, not which bucket it happened to fall into.

This supersedes and completes **P1-1 / P1-2** of `docs/design/DESIGN-board-review.md`
("invert inbox hierarchy: lead with decisions, demote the greeting" — never fully applied;
the greeting is still the largest thing on the screen).

Constraint honoured throughout: **zero new runtime dependencies, single-file CSS + inline
JS, no raw hex (tokens only).** Every component below already exists or is composed from
existing tokens.

---

## 0. What I actually observed (operator summary, verified against the running board)

I drove `GET /api/inbox`, `/api/resume`, `/api/pipeline`, `/api/receipt`, `/api/heartbeat`
and read the render functions. The operator's summary is **accurate**, with three
corrections that change the fix:

| Operator's claim | Verified? | Correction / nuance |
|---|---|---|
| Tiles read `1 P0 OPEN`, `5 STALE > 48H` | ✅ | `summary` = `{gates:0, p0:1, blocked:0, stale:5, needs_you:1}`. Only non-zero tiles render (2 shown). |
| One actionable item, `great_cto-eami`, blocked 29d, filed under "P0 open" **without Approve/Reject** | ✅ but root cause is deeper | It **is** classified as a gate in the data (`is_gate:true, labels:["gate"]`). It lost its buttons because it **auto-expired** (`notes: "gate open 262h > 72h policy"`), which set `raw_status:"blocked"`. `getInbox` computes `pending_gates = t.is_gate && raw_status !== 'blocked'` → the expiry **evicts it from the gate bucket**. It then matches the `p0` filter and lands in `p0_open`, which `renderInboxList` draws **without `showApprove`**. So the affordance is stripped by the *expiry→blocked→p0* path, not by "it's a P0 not a gate." |
| Stale list aged 30d, 22d, 22d, 22d, 11d | ✅ | `wwmc` 30d, `swfy`/`m239`/`6nnp` 22d, `rwzl` 11d. |
| Resume: 3 APPROVED same feature ≥11d; "3 in progress — all stale below"; 2 already-approved decisions | ✅ | All three verdicts are `feature: stale-after`, dated `2026-08-17` (11d). `wip_tasks` = the same 3 stale items the code already dedups into "listed below". `decisions` = 2 identical `gate:plan weekly-digest APPROVED` from June. |
| Pipeline: 10 stages, 260h–961h old, horizontal scroll | ✅ | `pm` PLAN_READY 961h/40d, `architect` "active" 527h/22d, newest 262h/11d. Three stages read **"active"** and their dots **pulse** — a live-motion signal on work that last moved 11–40 days ago. |
| "Seven blocks, all read-only except one" | ✅ | The markup also contains **four sections that auto-hide when empty** today: *Pending decisions* (0), *Blocked* (0), *Proceeded without you* (standdowns, 0), and the *all-clear* card. So the screen you see is a subset; the DOM is even busier. |

**The finding the screen never states:** the newest event anywhere on it — across gates,
pipeline, verdicts, WIP — is **11 days old**. A surface called *Inbox* is showing a
month-old backlog and calling it *"what needs your decision"* in the present tense.

---

## 1. Design system pick

**Decision: keep the existing dark-emerald token system unchanged. No new dependency, no new
style.** The `:root` block (lines 33–188) is coherent, contrast-audited, and already carries
every token this redesign needs. The problem was never the visual system; it was information
architecture.

**Pattern borrowed — the split inbox + "no-data is an alert state".** I studied five tools
for the one thing each puts first and how each says *"nothing needs you"*:

| Tool | The ONE thing it puts first | What it collapses / defers | How it says "nothing needs you" | What I take |
|---|---|---|---|---|
| **Superhuman — Split Inbox** | *Important* (only mail that needs a human) is a separate split above *Other* | Newsletters, team CCs, calendar noise drop below the split | "Inbox Zero" is celebrated as the goal state | **Split "decide" from "observe"** — the top of the screen is only what a human must act on. |
| **Linear — Inbox / Triage** | One prioritised list of notifications that need *your* response, one per row, each with the *reason* it's here | Board/project status lives in separate *Views*; you *snooze* to defer | "You're all caught up" empty state, keyboard-first | **Reason-per-row** and a single ranked list rather than four sections. |
| **GitHub — Notifications** | Grouped by *reason* (review requested / mentioned / assigned) — the reason is the leading chip | Repo activity you're not on the hook for | "All caught up!" | **Reason chip as the primary metadata**, not the priority word. |
| **Sentry — Issue stream** | Highest-impact *unresolved* issue; **last-seen / age is prominent**, regressions flagged | Resolved / ignored issues | "No issues match your filters" (distinct from "no issues") | **Age is a first-class column**, and *"stopped happening"* is itself a signal. |
| **Datadog — Monitors** | Monitors in *Alert*, grouped by status | *OK* monitors collapse | **`No Data` is its own alert state** — a monitor that stopped reporting is red, not green | **The load-bearing idea: a pipeline that stopped moving must read as an alert, not as calm.** |
| **Vercel — Project** | Latest deployment status + *"Deployed 3h ago by X"* — one status line, timestamped | Analytics behind tabs | A single ready/error state | **One timestamped liveness line as the headline.** |

**Why this fits a single-operator devtool.** There is exactly one reader, and their two
questions are *"is there anything only I can do?"* and *"is my autonomous pipeline still
alive?"* Superhuman/Linear answer the first by splitting decide-from-observe; Datadog/Vercel
answer the second by making staleness a first-class, timestamped state instead of the
absence of a signal. The current inbox does neither: it fuses both jobs into a data-dense
dashboard (ui-ux-pro-max `styles.csv` **#28 Data-Dense Dashboard** — *"maximum data
visibility"*, which is precisely the "overloaded" complaint) and it uses **Real-Time
Monitoring** cues (`styles.csv` #31 — pulsing "active" dots, live SSE) on data that is not
real-time, which actively lies about freshness.

Cited ui-ux-pro-max rules applied below: `ux-guidelines.csv` **#79 Empty States** (Medium —
"show a helpful message and an action, not blank space"), **#39 Heading Hierarchy** (Medium),
**#74 Font Size Scale** (Medium — the type ramp already exists; use it to carry hierarchy),
**#34 Success Feedback** (Medium).

---

## 2. Decide the screen's job (the core decision)

**The Inbox keeps one job: _"What needs me, and is the machine still moving?"_ Everything
that answers _"how is the project"_ moves below a single disclosure or to existing tabs.**

Split, explicitly:

| Stays in the Inbox (above the fold) | Moves out | Where it goes |
|---|---|---|
| **Liveness verdict** (fresh / stalled / degraded) — new, the headline | Stat-tile dashboard row | Its counts fold into the liveness line |
| **One ranked action queue** ("Needs you") | 3-column *"Pick up where you left off"* resume card | `▸ Project status` disclosure |
| Gate approve/reject/re-open, per row | Active pipeline rail (10 stages) | `▸ Project status` disclosure; its *stalled?* signal is promoted to the liveness verdict |
| Actionable receipt drift (reviewed files changed) — as a **queue row** | Budget advisory ("none measurable"), tool-failure watchdog, receipt "could not check" / "files added" | `▸ Project status` disclosure |
| All-clear / stalled / degraded empty states | Project archetype/compliance/phase | already moved to the sidebar (per an existing code comment) |

**The rule that decides visible-by-default vs. behind the disclosure** — one sentence the
implementer can apply without re-deciding:

> **A block appears above the fold only if it names something the operator can act on right
> now.** If the only verb it supports is "read", it lives inside `▸ Project status`. The
> disclosure's own summary line carries the one-glance verdict, so it never has to be opened
> to answer "is the machine alive?"

The "how is the project" half is not deleted — it is demoted. That half already has better
homes: the **Pipeline** tab owns the rail, the **Kanban/Activity** tabs own history. The
Inbox stops competing with them.

---

## 3. Component inventory (existing tokens; existing vs. new)

| # | Component | Status | Built from | States it must render |
|---|---|---|---|---|
| C1 | **Liveness banner** (headline, `h1` role) | **new** | reuses degraded-banner styling + type ramp `--fs-title-m`; amber = `--status-progress`, red = `--status-blocked`, green = `--accent` | `fresh` · `stalled(Nd)` · `degraded` (unreadable) — three distinct surfaces, see §4 states |
| C2 | **Unified action queue** ("Needs you") | **new (replaces 4 sections)** | reuses `.inbox-row`, `.id`, `.ttl`, `.meta`, `.age-col` | populated · empty(all-clear) · empty(stalled) · empty(filtered) · degraded · loading |
| C3 | **Reason chip** (per row: `gate` · `expired gate` · `P0` · `blocked` · `stale 30d` · `review drift` · `proceeded without you`) | **new** | reuses the mono eyebrow chip already used by `freshnessBadge` / stand-down `tierTag` (`--fs-eyebrow`, `1px solid --border`) | one per row; colour by severity token |
| C4 | **Gate decision cluster** (`Approve` / `Reject` / `Re-open`) | **existing, re-wired** | `.gate-btn`, `.gate-approve`, `.gate-reject` (ghost buttons — transparent, coloured text/border) | present whenever `is_gate` — **including expired gates** (the fix); `Re-open` shown only when `raw_status==='blocked'` |
| C5 | **`▸ Project status` disclosure** | **new wrapper** | native `<details>/<summary>`; summary carries the verdict line | collapsed(default) · expanded; summary states pipeline age + last-verdict age + budget state |
| C6 | Pipeline rail | **existing, moved + de-pulsed** | `.pipeline-track`, `.pl-stage` | inside C5; **active pulse gated on freshness** (§6) |
| C7 | Resume (WIP / verdicts / decisions) | **existing, moved** | `.resume-card`, `.resume-grid` | inside C5; unchanged internally |
| C8 | Budget / receipt / tool-failure advisories | **existing, moved** | `.budget-line`, `#inbox-receipt-foot`, `#tool-failure-rate` | inside C5 (except receipt `differs`, which becomes a C2 queue row) |
| C9 | All-clear / empty card | **existing, extended** | `.inbox-allclear`, `.ac-btn`, `.ac-primary` | gains a **freshness line** so "all clear" can't be read as "nothing running" |
| C10 | Nav badge `#nav-inbox-count` | **existing, unchanged** | — | already counts `needs_you` (distinct objects) |

Nothing above adds a class the file doesn't already have except the disclosure wrapper and
the reason chip, both composed from existing tokens.

---

## 4. Wireframe-as-text

### 4a. Today's data, redesigned (the stalled case — what the operator actually sees)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠ STALLED · nothing has moved in 11 days                    (h1, amber)  │
│ Newest activity: qa-engineer approved “stale-after”, 11 days ago.        │
│ 1 gate waiting on you (expired) · 5 tasks stale.            (counts here) │
└────────────────────────────────────────────────────────────────────────┘

NEEDS YOU · 6                                                (section eyebrow)
┌────────────────────────────────────────────────────────────────────────┐
│ [expired gate]  great_cto-eami                                           │
│   gate:plan — harness-close-the-loops implementation plan review         │
│   waiting 29d · auto-expired at 72h      [ Approve ] [ Reject ] [ Re-open ]│
├────────────────────────────────────────────────────────────────────────┤
│ [stale 30d]  great_cto-wwmc   pm: judge-provenance                  30d ▸│
│ [stale 22d]  great_cto-swfy   security-officer: execution-claims…  22d ▸│
│ [stale 22d]  great_cto-m239   security-officer: pipeline-gate-…    22d ▸│
│              ⌄ show 2 more stale (22d, 11d)                              │
└────────────────────────────────────────────────────────────────────────┘

▸ Project status — pipeline stalled 11d · last verdict 11d ago · 2 budgets unmeasured
   (collapsed; opens to pipeline rail, resume history, budget/receipt advisories)
```

- The **gate is first** and carries its full decision cluster — because it *is* a gate,
  regardless of the expiry that moved it to `p0`.
- Stale rows are **ranked oldest-first** (the code already sorts them this way) and carry a
  single **age** in the right column with a reason chip on the left. Three show; the rest
  fold under a disclosure — because five rows that differ only in age don't each earn a full
  card (the code's own comment measured this exact redundancy).
- The stat tiles, the resume card, the pipeline rail, and both advisory strips are **gone
  from above the fold**, folded into the one `▸ Project status` line whose summary already
  answers *"is it alive?"* → **no, stalled 11d.**

### 4b. All-clear, machine fresh (the state every new operator sees first, and the daily target)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ✓ ALL CLEAR · nothing needs you                              (h1, green) │
│ Last activity 18 min ago — the pipeline is moving.                       │
│                                        [ + New issue ]  [ View tasks ]   │
└────────────────────────────────────────────────────────────────────────┘
▸ Project status — 3 stages active · last verdict 18m ago
```

`"Last activity 18 min ago"` is the line that separates *all-clear-because-fresh* from
*all-clear-because-nothing-is-running*. The current all-clear card omits it and so cannot
tell those apart.

### 4c. Quiet but stalled (no decisions pending, yet the stall is the finding)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ◐ QUIET — BUT STALLED · nothing needs a decision, and nothing has        │
│   moved in 11 days                                          (h1, amber)  │
│ Last activity 11 days ago. If that's unexpected, the pipeline may be stuck.│
│                                   [ Why did it stop? ]  [ + New issue ]   │
└────────────────────────────────────────────────────────────────────────┘
```

This is the state the current screen **cannot express**: it would render the green all-clear
card while the project has been dead for a week. The stall is promoted to the headline even
when the action queue is empty.

### 4d. Empty because a project filter matched nothing

```
┌────────────────────────────────────────────────────────────────────────┐
│ ○ Nothing matches this project filter                                    │
│ Showing: project = <name>.        [ Clear filter ]  [ + New issue ]      │
└────────────────────────────────────────────────────────────────────────┘
```

Distinct wording from 4b — "no items for *this filter*" is not "no items". (`ux-guidelines`
#79.)

### 4e. Degraded — a read failed (must never look like all-clear)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠ COULD NOT READ · project data is unavailable — this is NOT “all clear” │
│ tasks.md could not be parsed (<why>). Counts below are incomplete.       │
└────────────────────────────────────────────────────────────────────────┘
```

The board already has `anyDegraded()` / `X-Board-Degraded`; this makes the degraded read the
**loud headline**, not a strip under a reassuring greeting. "Absence of findings is not a
finding of absence" (the file's own words).

### 4f. Loading (first frame, before `/api/inbox` returns)

```
NEEDS YOU
  Loading inbox…                                        (plain text, --text2)
```

**Not** skeleton rows. A skeleton promises "items exist and have this shape" — a promise the
Inbox is not entitled to make before the data arrives, on a screen where the reader is about
to act on those rows. Show explicit loading text; the moment data lands, render the real
state (including any empty state). See §7 numeric contract, *skeleton* clause.

---

## 5. A11y contract

**Target: WCAG 2.2 AA.**

### Focus indicator — verified against every surface it lands on

Token `--focus-ring: #00d97e`. Contrast measured against each surface the ring appears on in
this redesign (non-text indicator, AA floor **3:1**):

| Surface (token) | Hex | Ring contrast | Pass |
|---|---|---|---|
| Page (`--bg-page`) | `#0a0e0c` | **9.68:1** (per token comment) | ✅ |
| Queue row / disclosure (`--bg-card`) | `#11161a` | **≈9.6:1** | ✅ |
| Stalled banner surface (amber tint over page ≈ `rgba(245,158,11,0.12)`) | ≈`#1c1a12` | **≈8:1** | ✅ |
| P0/red banner tint (`--p0-bg` over page) | ≈`#241014` | **≈8.5:1** | ✅ |

The one hazard is the **solid green all-clear primary button** (`.ac-primary`, fill
`--accent`): a green ring on a green fill is ≈1:1 and invisible. **Mandate: every focusable
control uses `outline-offset ≥ 2px`, so the ring is drawn on the surrounding `--bg-card` /
`--bg-page` surface, never on the accent fill.** The file's existing focus rule
(`outline: 2px solid var(--focus-ring); outline-offset: 1–2px`) already does this on
`.pl-recover-btn`, `.cost-bar`, `.ab-btn`; the redesign requires it on **every** new control
too, and bumps `.ac-primary` / `.ac-btn` to `outline-offset: 2px` explicitly (they currently
have no `:focus-visible` rule at all).

### Keyboard reachability — the current High defect this redesign fixes

`.inbox-row` is today a `<div onclick=…>` with **no `tabindex`, no `role`, no key handler**
(the resume sub-items have `role="button" tabindex="0"`; the primary queue rows do not). **A
keyboard operator cannot open a single inbox item, nor reach the one item that needs a
decision.** Contract for C2:

- Each queue row is a `role="button" tabindex="0"` element (or a real `<button>`/`<a>`)
  activatable with **Enter and Space**.
- The gate cluster buttons (C4) are real `<button>`s, in tab order, reachable **before** the
  row's own open-detail action.
- Tab order top-to-bottom: liveness banner action (if any) → each queue row (its
  Approve/Reject/Re-open, then the row itself) → `▸ Project status` summary → disclosure
  contents (only when expanded).
- The disclosure is a native `<details>/<summary>` — keyboard-operable and screen-reader-
  announced for free (Enter/Space toggles, state announced).

### Labels, headings, announcements

- **Heading hierarchy** (`ux-guidelines` #39): liveness banner = `h1` (`--fs-title-l`
  weight-heavy), `NEEDS YOU` = `h2` (`--fs-title-m`), disclosure summary = `h2`. No skipped
  levels. Do not use size alone — every level pairs size with weight and, for the banner, an
  icon + colour (see §7 "never colour alone").
- Reason chips are decorative-adjacent but **must be real text**, not colour-coded shapes:
  the chip reads `expired gate`, `stale 30d`, etc., so a screen reader announces *why* the
  row is in the queue.
- The liveness banner is a **live region**: `role="status" aria-live="polite"` so an SSE
  update from fresh→stalled (or a read going degraded) is announced without stealing focus.
- Gate buttons carry `aria-label` naming the object: `Approve gate great_cto-eami` — not a
  bare "Approve" (there may be several).
- Counts use `aria-label` that spells the unit: `6 items need you`, not just `6`.

### Contrast of body text (spot-checked)

`--text2 #8a9a92` and `--text3 #8b958c` on `--bg-card #11161a` both measure **≈7:1** →
AA-comfortable for the reason-chip and meta text. No change needed.

---

## 6. Responsive contract

Surface is **web / desktop-first** (a local devtool). Existing breakpoints in the file are
scattered at 1023/900/880/768/720/640/600/480; the Inbox reflow uses these three bands:

| Band | Layout |
|---|---|
| **≥ 1024px** (comfortable) | Full layout as §4. Queue rows: `110px id / 1fr title / auto actions` (existing `.inbox-row` grid). Disclosure content in its multi-column form. |
| **768–1023px** (narrow laptop — the prior review's weak case) | Queue stays **single column** (it always is — it's a list). Gate cluster wraps **below** the title instead of to its right when the row is < 520px wide. `▸ Project status` opens to a **single-column** stack (`.resume-grid` already collapses to `1fr` at ≤880px). Pipeline rail keeps horizontal scroll but is inside the collapsed disclosure, so it is never the first horizontal-scroll the eye meets. |
| **< 768px** (tablet / split screen — rare but supported) | Row id moves onto the meta line (drop the fixed `110px` column → `overflow-wrap:anywhere` already present). Age chip moves inline with the reason chip. Banner text wraps freely; icon stays. |

**RN / device classes / safe-area / orientation:** **n/a** — this is a web surface, no
React Native target.

Nothing here reflows the *content set* by breakpoint — the same information shows at every
width, only the arrangement changes. The disclosure is collapsed at every width by default.

---

## 7. Numeric contract

Numbers on this screen and their treatment:

| Value | Example | Summable? | Figures | Alignment |
|---|---|---|---|---|
| Queue / section count | `NEEDS YOU · 6`, `stale 5` | yes (a total of objects) | **tabular** | inline in banner; right in count badge |
| Row age (magnitude, compared vertically) | `30d`, `22d`, `11d` | compared, not summed | **tabular** | **right-aligned** in the age column, so `30d` / `22d` / `11d` share a decimal edge |
| Single inline duration | `waiting 29d`, `last verdict 11d ago` | no | tabular (consistency) | inline |
| Absolute timestamp (tooltip / detail) | `Jul 30 07:31` | no — it's a point label, not a quantity | **non-tabular** | inline, **not** right-aligned |
| Task id | `great_cto-eami` | no — an identifier | **non-tabular**, mono | left |
| Currency (budgets / cost, inside disclosure) | `$25.00`, `$0.00` | yes | **tabular** | **right-aligned** |

**Column header takes the alignment of its data** (the part most often dropped): the age
column's header — if one is drawn — is **right-aligned** over the right-aligned ages. The id
column header is left-aligned over the left ids. No right-aligned number under a left-aligned
heading.

**Precision by currency, not a hardcoded two.** Budgets/costs render at the precision of
their currency (USD → 2, JPY → 0, TND → 3). The board is multi-project and archetypes vary,
so the formatter must read the currency, never assume `.00`. Today's costs are USD; the rule
stands regardless.

**Negative-number convention, chosen once:** a budget overage renders with a **leading minus
and a magnitude** (`-$3.00 over`), reinforced by `--status-blocked` colour — **never colour
alone** (a red `$3.00` is indistinguishable from a normal figure to a red-blind reader, and
red is already the queue's severity colour). No negatives appear on the current screen; the
convention is fixed now so the first one that appears is right.

**Display vs. stored precision.** Ages are stored in ms and displayed rounded (`262h → 11d`,
via `relTime`). The **exact timestamp stays in the row tooltip** (already true in the code).
No rounded values are summed on this screen, so a *"may not sum due to rounding"* note is
**n/a**.

**Absence has a vocabulary — an empty cell is never in it.** Mapping to what this screen can
produce:

| State | Rendering on this screen |
|---|---|
| **true zero** | The **all-clear card** (§4b): the queue was read and is genuinely empty. Green ✓. |
| **rounded to zero** | **n/a** — no continuous metric on this surface rounds to zero. |
| **not available** | The **degraded banner** (§4e): a read failed. Amber ⚠, *"could not read"*, explicitly ≠ all-clear. Also: a budget cap with no verdict carrying a cost → `"none measurable yet"` (never `$0`). |
| **not applicable** | A pipeline stage that has never run → `idle` / `—`, not `0`. A task with no timestamp → age `—` (the code already returns `null`, never `0` — "no data" and "just now" are kept apart). |
| **provisional / estimated / forecast** | **n/a** — nothing on this screen is a forecast. |
| **suppressed** | **n/a** — single operator, no permission tiers (see §permission below). |
| **too unreliable to publish** | The `"could not check the review receipt"` reading, the `budget unmeasured` line, and freshness `"could not read"` — measured/attempted but not trustworthy. Rendered in `--text3` (quiet note), **distinct** from both a clean pass and a true zero. |

The three that must never render alike — **true zero** (green all-clear), **not available**
(amber degraded), **not applicable** (grey `—`) — are three different surfaces here, not one
blank.

**Skeleton makes a promise.** The action queue is data the operator acts on, so before
`/api/inbox` returns, the redesign shows the **explicit loading text** of §4f, *not* skeleton
rows. The liveness banner shows the **last-known state with its timestamp** across an SSE
refresh (never a skeleton), so a momentary refetch never blanks the one line that says
whether the machine is alive.

---

## 7.1 Destructive actions (tier by cost of recovery — ADR-009 at screen level)

| Action | Tier | Ritual | Blast radius stated |
|---|---|---|---|
| **Reject** a gate | **Medium** — irreversible from the board (the pipeline stage is failed/returned) | Confirmation naming the consequence: *"Reject gate:plan for harness-close-the-loops? This returns the plan to `pm` and the pipeline will not proceed."* | one object, one feature's pipeline |
| **Approve** a gate | **Medium** — authorises the pipeline to proceed; hard to un-advance | Confirmation naming what proceeds: *"Approve gate:plan? `senior-dev` may then dispatch and spend against its budget."* | one object; downstream stages of one feature |
| **Re-open** an expired gate | **Low** — trivially reversible (re-runs `bd update … --status open`) | Act on click, no dialog. | one object |
| **Re-run** a stalled stage (from the disclosure's pipeline rail) | out of tier — **refused by design** | The board **copies the command** (`/agent <stage>`) rather than dispatching, because a re-run spends money and writes to the project and this surface has no gate for that. **Keep this** — it is exactly ADR-009's "plan-and-stop" answer. | n/a |
| **New issue** | not destructive | — | — |

The confirmation text always states the **blast radius** (which object, which pipeline). No
delete/bulk action exists on this screen, so the High tier (type-the-name) does not arise
here — noted so the implementer doesn't invent one.

## 7.2 Permission (the fourth empty state)

**n/a — and stated deliberately.** The board is a **single-operator local tool**; there are
no roles, so *hidden / disabled / read-only / masked* permission states do not apply to the
Inbox. Every control shown is one the sole operator may use. If multi-tenant roles are ever
added (out of scope, see §9), the gate cluster is the control that would need a
read-only/hidden treatment — flagged here so it isn't missed later.

---

## 8. Motion contract

The board updates live over SSE (`renderInbox(JSON.parse(e.data))`). Motion must never imply
liveness the data doesn't have.

| Motion | Spec | Reduced-motion (`prefers-reduced-motion: reduce`) |
|---|---|---|
| Queue row enter/leave (SSE add/remove) | opacity + 4px translateY, **140ms ease-out** | appear/disappear instantly, no transform |
| Row hover lift (existing `translateY(-1px)`) | keep, 120ms | **no transform** — box-shadow only |
| Liveness banner state change (fresh→stalled etc.) | cross-fade text 160ms; **no pulse, ever** | instant text swap |
| `▸ Project status` disclosure open/close | native `<details>` (browser default) or 160ms height ease | instant |
| **Pipeline active-dot pulse** (`pl-pulse 1.4s infinite`) | **gate it on freshness**: pulse only when that stage's `age_min` is under the staleness threshold. A stage 11–40 days old must **not** pulse — a pulsing dot is a liveness claim, and the whole redesign exists because the screen was making that claim falsely. | pulse disabled entirely (extend the existing reduced-motion blocks at lines 369 / 2343 to cover `pl-pulse`) |

Rule: **the only animated element that may imply "happening now" is one whose data is
actually recent.** Everything else is static.

---

## 6.5 Platform integration contract

**n/a** — web surface, no native APIs, permissions, deep links, or React-Native
substitutions. The only "platform" edges are the existing browser SSE stream and
`navigator.clipboard` (used by the preserved re-run copy). No change.

---

## 9. Brand tokens

**No new colour or type tokens.** The redesign is entirely a rearrangement over the existing
system. Reference table of the tokens each new component consumes (all already in `:root`):

| Component | Tokens used |
|---|---|
| C1 Liveness banner — stalled | `--status-progress` (amber text/accent), `--fs-title-l`/`--fs-title-m`, `--text2` for subline, amber tint background `rgba` over `--bg-page` |
| C1 — all-clear | `--accent` / `--accent-text`, `--fs-title-l` |
| C1 — degraded | `--status-blocked`, `--p0-bg` tint |
| C2 queue rows | `--bg-card`, `--border`, `--text`, `--text2`, `--fs-body`/`--fs-small` |
| C3 reason chip | `--fs-eyebrow`, `--mono`, `1px solid --border`; colour by severity: `gate`→`--status-gate`, `expired gate`→`--status-gate`, `P0`→`--p0-fg`, `blocked`→`--status-blocked`, `stale`→`--status-progress`, `review drift`→`--status-gate`, `proceeded without you`→`--dot-orange` |
| C4 gate buttons | `.gate-approve`→`--status-review`, `.gate-reject`→`--status-blocked` (existing ghost-button rules) |
| C5 disclosure | `--bg-card`, `--border`, `--text3` for the summary verdict |
| Focus ring (all) | `--focus-ring` with `outline-offset: 2px` |

**The one token proposal (optional, open question OQ-3):** a single new numeric constant
`--stale-days: 11` *is not needed* — the staleness threshold is policy, already `48h`
(`SKILL.md`) for the row-level "stale" and `72h` for gate auto-expiry. The **project-level**
"nothing has moved" threshold in C1 is a new judgement; default it to **the age of the newest
event across gates+pipeline+verdicts exceeding 48h** (reuse the existing line), so no new
token is introduced. If a distinct project-stall threshold is wanted, add it to `PROJECT.md`,
not to `:root`.

---

## 10. Out of scope

- **Changing `getInbox`'s bucket algorithm wholesale.** The redesign requires only that *an
  expired gate keeps its decision affordance* (§11 route A or B). The dedup/`also` machinery,
  the `needs_you` counting, and the four filters stay as they are.
- **The Pipeline, Kanban, Activity, and Agents tabs.** They receive the demoted content but
  their own layouts are unchanged.
- **New API endpoints.** Everything renders from the existing `/api/inbox`, `/api/pipeline`,
  `/api/resume`, `/api/receipt`, `/api/heartbeat`, `/api/stand-downs`.
- **Multi-operator roles / permissions** (see §7.2).
- **Mobile / RN** (§6, §6.5).
- **Wording of the gate/verdict machine records** — the reader-side prose is in scope; the
  producer format (`## Context` wire block) is not fixable from `index.html` and is already
  parsed out by `splitContextBlock`.

---

## 11. Open questions (each with a recommended default so nothing blocks)

| # | Question | Recommended default |
|---|---|---|
| OQ-1 | Fix the *expired-gate-loses-buttons* bug in the **render layer** or the **data layer**? | **Render layer (Route A):** in `renderInboxList`, drive the decision cluster off `t.is_gate`, not off `opts.showApprove`, so any row that *is* a gate carries Approve/Reject/Re-open wherever it lands. Cheaper, single-file, and correct even if bucketing changes later. (Route B — keep expired gates in `pending_gates` in `getInbox` — also valid but touches server logic and the `pending_gates` filter's `raw_status!=='blocked'` guard exists for a reason.) |
| OQ-2 | Where is the project-level "stalled" threshold? | Reuse the existing **48h** line: C1 reads "stalled" when the newest event across gates+pipeline+verdicts is older than 48h, and states the exact age (`11 days`). No new token. |
| OQ-3 | Should the stalled banner offer a "Why did it stop?" action, and where does it go? | **Yes** → deep-link into the Activity/pipeline view filtered to the most-recently-active stage (reuse `drillToVerdict`/`drillToStage`). It's a navigation, not a dispatch — safe. |
| OQ-4 | Does receipt `differs` become a **queue row** or stay a top strip? | **Queue row** with reason chip `review drift` and an `[Open diff]` action — it *is* actionable (re-review), so it belongs in "Needs you", not in a passive strip. |
| OQ-5 | Keep the stat-tile row at all, even collapsed? | **Remove it.** Its counts are restated in the liveness line and in the section eyebrow; a third statement is the redundancy the operator called "overloaded". |
| OQ-6 | Should "3 more stale" be a `<details>` disclosure or pagination? | **Disclosure** (`⌄ show N more`) — the list is short (≤10, server-capped) and never needs a page. |
| OQ-7 | All-clear when the queue is empty **and** fresh — still show `▸ Project status`? | **Yes, collapsed** — a fresh operator may want to confirm the pipeline is moving without hunting for a tab. Its summary line already says so. |
| OQ-8 | Do stale rows get a per-row action beyond "open"? | **Add `[Nudge]`** only if a cheap no-dispatch action exists (e.g., re-`bd update` touch); otherwise open-only. Default: **open-only** until such an action is confirmed to exist — do not invent a dispatch. |
| OQ-9 | Keep the time-of-day greeting ("Good morning") anywhere? | **Yes, demoted** to a small `--fs-caption` eyebrow above the banner, never the `h1`. It's warmth, not information. |
| OQ-10 | Nav badge — count gates+P0+blocked, or include stale? | **Unchanged** (`needs_you` = distinct non-stale objects). Stale is a queue row but not a "you must decide now" badge; keeping it out of the badge matches the current, correct `needs_you`. |

---

## 11. Implementation hand-off (ordered checklist for senior-dev)

**Target file:** `packages/board/public/index.html` (all of the below), plus **one** decision
in `packages/board/lib/data-readers.mjs` only if OQ-1 Route B is chosen (default is Route A —
no server change).

1. **Fix the affordance bug (OQ-1, Route A).** In `renderInboxList`, render the
   Approve/Reject cluster whenever the row's `t.is_gate` is true — not only when
   `opts.showApprove`. Add a `Re-open` button when `t.raw_status === 'blocked'`. Verify
   `great_cto-eami` now shows all three. *(This alone recovers the one actionable item.)*
2. **Build C1, the liveness banner.** Compute the newest event age across
   `pending_gates`+`p0_open`+`blocked`+`stale`+pipeline `ts`+resume verdict `ts`. Render one
   of: `all-clear+fresh` (§4b), `all-clear+stalled` (§4c), `stalled` (§4a), `filtered` (§4d),
   `degraded` (§4e), `loading` (§4f). `role="status" aria-live="polite"`. Replace the greeting
   `h1`; demote the greeting to a caption eyebrow (OQ-9).
3. **Unify the queue (C2).** Collapse the four sections (`inbox-gates`, `inbox-p0`,
   `inbox-blocked`, `inbox-stale`) and the stand-down section into **one** `Needs you` list.
   Sort: gates first, then oldest-first. Fold rows beyond the first three stale into a
   `⌄ show N more` disclosure.
4. **Add the reason chip (C3)** to every row from its home bucket + `also`
   (`expired gate` when `is_gate && raw_status==='blocked'`, else `gate`/`P0`/`blocked`/
   `stale Nd`/`proceeded without you`; `review drift` for the receipt row from step 7).
5. **Make rows keyboard-reachable.** `role="button" tabindex="0"`, Enter/Space handlers on
   every queue row; gate buttons are real `<button>`s ahead of the row in tab order.
   `aria-label`s per §5.
6. **Move read-only blocks into `▸ Project status` (C5).** Wrap the pipeline rail, the resume
   card, and the budget/receipt-foot/tool-failure advisories in one collapsed
   `<details>`; write its `<summary>` verdict line (pipeline age · last-verdict age · budget
   state). Delete the stat-tile row (OQ-5).
7. **Route receipt `differs` to a queue row** with chip `review drift` + `[Open diff]`
   (OQ-4); keep the other receipt readings (`unreadable`, `extended`) inside the disclosure.
8. **De-pulse the pipeline (motion).** Gate `.pl-stage.active` pulse on freshness; extend the
   `prefers-reduced-motion` blocks (lines ~369 / 2343) to disable `pl-pulse` and row
   transforms.
9. **Focus ring.** Add `:focus-visible { outline: 2px solid var(--focus-ring);
   outline-offset: 2px; }` to `.ac-btn`, `.ac-primary`, the new queue rows, the reason-chip
   actions, and the disclosure summary — so the ring never lands on the green fill.
10. **Wire the empty/degraded states (§4b–f)** into the existing `anyDegraded()` /
    all-clear logic so *true zero*, *not available*, and *not applicable* render as three
    distinct surfaces.
11. **Verify at `localhost:3141`** against the four states with real data: today's stalled
    case (4a), a synthetic fresh all-clear (4b), a project filter miss (4d), and a forced
    degraded read (4e). Confirm keyboard-only operation reaches and activates the
    `great_cto-eami` gate.

---

## What I would REMOVE (named, each with the reason it doesn't earn its place)

| Removed / demoted | From | Reason it doesn't earn above-the-fold |
|---|---|---|
| **The greeting as `h1`** ("Good morning. Here's what needs your decision.") | headline | It's the largest thing on screen and asserts a promise the page can't keep — right now there is nothing decidable, yet it claims a decision awaits. Demoted to a caption. (Completes prior P1-1.) |
| **The stat-tile row** (`1 P0 open`, `5 stale`) | above the fold | The counts are restated in the liveness line and each section eyebrow. The code already patches this block to hide zero-tiles — a patch for a block that shouldn't persist. Redundant. |
| **"Pick up where you left off" resume card** (3 cols) | above the fold | 60% of it *is* the stale list directly below it (measured in the code's own comment). It's history, not a decision. Moved into `▸ Project status`. |
| **The active pipeline rail** (10 stages, horizontal scroll) | above the fold | Read-only status whose "active" pulsing dots are 11–40 days old — a false liveness signal, and the horizontal scroll is the first the eye meets. Its one useful bit (*stalled?*) is promoted to C1; the rail moves into the disclosure. |
| **Budget advisory + tool-failure watchdog** ("none measurable yet") | above the fold | Neither is a decision. "FYI" belongs in the disclosure, not competing with the action queue. |
| **The four-way section split** (Pending decisions / Blocked / P0 / Stale) | structure | Fragmenting one queue into four headers forces the eye to scan four sections to find the one item that matters. Unified into one ranked list; the reason chip preserves which bucket each came from. |
| **The pulsing `.pl-stage.active` dot animation** on stale stages | motion | A pulse is a "happening now" claim; on 11–40-day-old stages it is the exact lie this redesign removes. Gated on freshness. |

Kept and strengthened, not removed: the **all-clear card** (gains a freshness line), the
**stand-down "proceeded without you"** signal (becomes a queue reason chip), the **degraded-
read** handling (promoted to headline), and the **copy-don't-dispatch re-run** (the correct
ADR-009 plan-and-stop).
