---
surface: web
feature: board-redesign-2026-09
target: packages/board/public/index.html (whole file); packages/board/lib/routes.mjs (read-only — no API changes required)
status: draft
author: design-advisor v2.0
date: 2026-09-06
beads: great_cto-8m6n
---

# DESIGN — great_cto board, ground-up redesign

The operator console for an AI engineering pipeline: **70 agents**, **44 commands**,
**40 skills**, **2 harnesses**, one person, one screen, all day. Counts verified by
`ls` on 2026-09-06 — not quoted from the brief.

This is a **plan-altitude contract**. It contains no `.html`, no `.css`, no `.js`
implementation. Every number in it is either measured from the repo or computed
here and shown with its computation.

---

## 0. Dials

```
DESIGN_VARIANCE:  2/10 — an instrument one operator reads every day. Variance costs
                  fluency, and fluency is the entire product. 1 would forbid the two
                  deliberate asymmetries this design needs (the Inbox decision rail,
                  the posture strip); 3 would start buying novelty with recall.
MOTION_INTENSITY: 2/10 — state changes arrive over SSE, unrequested by the reader.
                  Motion is therefore reserved for things the OPERATOR caused
                  (drawer, disclosure, focus) and forbidden for things the MACHINE
                  caused (a row appearing, a number ticking). 1 would drop the drawer
                  transition, which is the one place motion carries spatial meaning.
VISUAL_DENSITY:   8/10 — 70 agents, 20 evidence rows and a gate queue on one pointer
                  surface. 9 would need type below the 11px floor of the scale in §8,
                  which §8 forbids; 7 would push the fleet roster past one screen and
                  reintroduce the scrolling this redesign exists to remove.
```

Two designs with these dials should look like siblings. This one and the existing
board *do* — deliberately (§1).

---

## 0.5 Reference research — which of the three states happened

Three different things happened and they get three different sentences.

| Source | State | What that means here |
|---|---|---|
| **Refero live corpus** (`refero_search_styles`, `refero_search_screens`, `refero_search_flows`, `refero_get_screen`) | **unreachable from this agent context** | `claude mcp list` reports `plugin:refero:refero: https://api.refero.design/mcp (HTTP) - ✔ Connected` at session level, but the four tools are **not present in this subagent's function table**, so they could not be called. A direct probe — `POST https://api.refero.design/mcp` with `tools/list` — returned **HTTP 401 `{"error":"Unauthorized"}`**. Both attempts are recorded rather than described. |
| **Refero bundled craft corpus** (ships with the skill, no account) | **consulted** | `references/anti-ai-slop.md` read in full. Tells #1 (indigo/violet), #2 (cards everywhere), #3 (dark by default), #5 (emoji as icons), #6 (left accent stripe), #7 (reference averaging), #8 (token role drift) are applied as binding constraints below and each is cited where it bites. |
| **The named products** (Pinecone + adjacents) | **consulted live, via public documentation** | Pinecone, Grafana, Sentry, Vercel fetched and read on 2026-09-06. Linear partially — 2 of 3 doc URLs returned 404, so Linear's contribution is marked low-confidence and kept to one narrow item. |

**What this is not.** No screenshot of any of these consoles was seen. The lock below
is IA, state vocabulary and column composition read from vendor documentation — which
is exactly the layer this design needed and the layer least likely to be hallucinated,
because every entry is a quotable label string. No visual/pixel claim is made from
these sources, and none is needed: the visual system is already fixed (§1).

---

## 0.6 Reference lock

What was studied, what was taken, and from which named screen. Anything not in this
table did not come from research and is marked as such where it appears.

### L1 — Grafana, alert rule *state and health* (`/alerting/fundamentals/alert-rules/state-and-health/`)

**The single most load-bearing lock in this document.**

| Taken | Verbatim from the source | Applied at |
|---|---|---|
| `NoData` and `Error` are **first-class alert states**, not failure modes of the other states | states are `Normal`, `Pending`, `Alerting`, `Recovering`, `No Data`, `Error` | §4 absence vocabulary; every status component in §6 |
| Missing data has a **configured** rendering, decided per rule, never left to a blank | "Configure no data and error handling" with four options: `Set No Data state` (default), `Set Alerting state`, `Set Normal state`, `Keep last state` | §6.3 — the board picks `Set No Data state` as its universal default and **forbids** the equivalent of `Set Normal state` |
| **`Keep last state`** — a last-known value is a legitimate answer when fresh data is absent | ibid. | §6.9 — the "last known value + timestamp" rule for cost figures, in place of a skeleton |
| **`grafana_state_reason`** — an annotation explaining *why* the state differs from the evaluation | ibid. | §6.1 — every absence glyph carries its specific `why`, never a category name. Already enforced by `design-contract.test.mjs` |

### L2 — Grafana, standard options (`/panels-visualizations/configure-standard-options/`)

| Taken | Verbatim | Applied at |
|---|---|---|
| The **"No value"** standard option, and its default | "Enter what Grafana should display if the field value is empty or null. **The default value is a hyphen (-)**." | §4 — independent, shipped confirmation of `aesthetic-instrument` rule 6, "a dash is not a nought". Two systems reached the same glyph separately; this design keeps it. |

### L3 — Pinecone console (`docs.pinecone.io`, `/guides/production/monitoring`, `/guides/manage-data/manage-indexes`, `/guides/projects/*`) — **the owner's named reference**

| Taken | Verbatim from the source | Applied at |
|---|---|---|
| **Resource-class left nav, facet tabs on arrival.** Nav item is the *class*; the views inside it are tabs | left nav `Database > Indexes`; tabs `Indexes` / `Backups`; a `Metrics` tab on the resource | §5 navigation model — `Fleet` is the class, `Agents / Harnesses / Spend` are its tabs. This is the structural spine of the redesign. |
| **Three-level hierarchy, switcher at the top** | "A Pinecone project belongs to an organization and contains a number of indexes and users"; project list at `/organizations/-/projects` | §5 — Organization→Project→Index maps to Portfolio→Project→Agent. The existing `.proj-switch` keeps its position and job. |
| **Lifecycle status vocabulary that names the in-between** | index status `Ready`, `Initializing`, `Terminating` | §6.2 — `Initializing` is the precedent for a state that is neither success nor failure and must not render as either. Our analogue is `running`. |
| **Capacity as a fraction of a ceiling, not an absolute** | `pinecone_db_index_fullness`, `index_memory_fullness`, `index_storage_fullness` | §6.7 — the budget bar renders spend as *fullness against cap*, not as a dollar total. `judgeAgentBudget` already computes the ceiling. |
| **Row-level overflow menu, not a row of buttons** | "ellipsis (…) menu > Add tags"; "three dots to the right of the index name" | §6.4 — the agent row's retire/pin/open actions live behind one `…`, which is what keeps 70 rows scannable |

### L4 — Sentry Issues (`docs.sentry.io/product/issues/`)

| Taken | Verbatim | Applied at |
|---|---|---|
| **A "not yet judged" state that is neither open nor closed** | `For Review` (`is:unresolved is:for_review`) — "new issues or regressions that haven't been reviewed yet" | §6.2 — this is the shipped precedent for the house rule. Our `unjudged` posture and `unclassified` gate borrow its *position in the vocabulary*, not its name. |
| **A state derived from a forecast, named as such** | `Escalating` — "previously archived issues that have exceeded their forecasted event volume" | §6.7 — budget `projected` is rendered as its own state, never merged into `over` |
| **A state for "came back"** | `Regressed` — "resolved issues that have come up again" | §6.2 — an agent that returns to `failing` after a green window is `regressed`, not merely `failing` |
| **Saved queries as the way a long list stays usable** | "You can save your issue queries and access them later by clicking the 'Saved Searches' button in the header" | §5 — the four saved views that make 70 agents tractable |
| **Severity as a coloured square *plus* a word** | "a colored square showing the severity level (error, info, fatal, warning, debug, or sample)" | §7 — colour never alone; matches `aesthetic-instrument` rule 11 |

### L5 — Vercel deployments (`vercel.com/docs/deployments`)

| Taken | Verbatim | Applied at |
|---|---|---|
| **A collapsed "Summary" that expands into detail on the same page** | "expanding the **Deployment Summary** section on a **Deployment Details** page" | §3.3 — the agent row expands in place; the profile is not a separate route for the common case |
| **Overview shows the *latest* one, in full, above the list** | "On your **Project Overview** page, you can see the latest production deployment, including the generated URL and commit details" | §3.4 — Harnesses leads with the most recent second-opinion run in full, then the tail |
| **Irreversible actions are verbs on a resource, not nav destinations** | `Redeploy` / `Inspect` / `Promote to Production` / `Rollback` live in the Deployments section, not the sidebar | §5 — `Share` stops being one of eight tabs and becomes an action on a project. This alone removes a top-level item. |

### L6 — Linear (`linear.app/docs/account-preferences`) — **low confidence, narrow use**

2 of 3 fetched URLs 404'd. One item taken, and only because it is corroborated by the
board's own existing code: keyboard submit is a **preference**, not a constant —
"Convert comment on… — Choose whether `Cmd`/`Ctrl`+`Enter` or `Enter` will be used to
submit comments". Applied at §7 only as: **the gate approve key is never bare `Enter`**.
No Linear command-palette or density claim is made, because it could not be verified.

### L7 — Refero bundled craft corpus, `anti-ai-slop.md`

Binding constraints, each cited where it bites:

| Tell | Ruling for this surface |
|---|---|
| **#1 indigo/violet** | `--status-gate` is `#a78bfa` / `#7c3aed` — *is* the violet the guide warns about. **Kept, with a reason that survives the test:** it is not a brand accent here, it is one hue bound to one meaning (a gate), it predates this redesign, and it is measured (6.69 dark / 5.70 light as ink on `--bg-card`). The tell is violet *as the default brand colour*; the brand colour here is `--accent` green. **No new violet may be introduced for anything that is not a gate.** |
| **#2 cards everywhere** | Applied as a hard rule in §6.0. The fleet roster is **rows with rules between them, not 70 cards.** A container earns a card only if it is itself clickable or expandable. |
| **#3 dark by default** | **Does not apply — a system already governs** (§1). Dark here is not an unbriefed default; it is a measured, shipped, theme-aware system with a light theme of equal standing (39 token overrides), and `skills/aesthetic-instrument` rule 0 argues its retention for *this* surface on functional grounds. |
| **#5 emoji as icons** | **Existing violation, in scope to fix.** `index.html` uses `☀️`/`🌙` as the theme-toggle glyph (line ~16, `toggleBoardTheme`). §6.11 replaces it with an inline SVG. |
| **#6 left accent stripe** | `.nav-item.active::before` is a left rail. **Permitted** — it means *selection*, which is exactly the one word the guide requires. No other left stripe may be added. |
| **#7 reference averaging** | Guarded explicitly: Grafana's state model is taken **whole and sharp** (six states, configured, with a reason annotation) rather than softened into "show a dash sometimes". |
| **#8 token role drift** | Guarded in §8: `--accent` is a border/rail/glow and fills only a badge count and a swatch. This redesign **does not** promote it to a section background or a card fill. `--status-gate` stays bound to gates. |

---

## 1. Design system pick — the question asked first

**Does a system already govern this surface? Yes.** Therefore: **match it. Lift exact
values. Do not survey directions, do not offer alternates.**

The governing system is `skills/aesthetic-instrument/SKILL.md`, which is itself
*measured out of* `packages/board/public/index.html` rather than designed for it — so
matching it and matching the file are the same act.

**Decision: keep the entire existing in-file token system. Replace nothing. Add four
tokens and one glyph (§8).** Justification, per the brief's explicit ask:

| Token family | Verdict | Why |
|---|---|---|
| `--text` / `--text2` / `--text3` | **keep** | Three ink steps in both themes, and the file documents the measurement that fixed a real hierarchy inversion in light (`#55625b` read *louder* than `--text2`). That knowledge is in the values. Replacing them discards it. |
| `--bg-page/card/muted/elevated/strong` | **keep** | Five surface steps ~5% apart; depth is a step, never a shadow (`aesthetic-instrument` rule 1). This is what lets a dense screen have hierarchy without 70 drop shadows. |
| `--border` / `--border-strong` | **keep** | Alpha-based, so they survive both themes without a second definition. |
| `--status-done/blocked/gate/progress/review/backlog/todo` | **keep** | One hue per meaning (rule 11). |
| `--mono` / `--sans` | **keep** | Rule 4's meaning split — Geist Mono is *machine truth* (anything you would copy), Geist is voice. Measured 115 mono : 9 display. This redesign has *more* copyable strings (agent slugs, postures, versions, gate names), so the split gets more load, not less. |
| `--fs-eyebrow … --fs-num-xl` (12 steps) | **keep** | Rule 7: no raw sizes. `--fs-eyebrow: 11px` is the floor and VISUAL_DENSITY 8 sits on it deliberately. |
| `--focus-ring` | **keep the values, fix the geometry** | §7.1 — the values are correct and the *placement* is broken. Measured below. |
| `--p0/p1/p2/p3-bg/-fg` | **keep, and reuse for posture** | Already contrast-measured in both themes. Reusing them for tool posture avoids inventing a fifth colour family. |

**No new dependency.** Zero runtime deps, no CDN, no build step — enforced by
`packages/board/no-cdn.test.mjs`, which scans every served `.html` and `sw.js` for
`googleapis`, `gstatic`, `jsdelivr`, `unpkg`, `cdnjs`. Everything below is hand-written
CSS and vanilla DOM. **This is not a constraint I am working around; it is why the
design is rows-and-rules rather than a component library.**

**ui-ux-pro-max citations.** `number-tabular` (§6 Typography & Color) — tabular figures
for data columns, prices and timers. `color-not-only` (§1 Accessibility) — never colour
alone. `virtualize-lists` (§3 Performance) — 50+ items; **explicitly declined at 70 rows,
see §4 Out of scope**, because the only zero-dep virtualizer is one we would write and
it would break the keyboard path in §7.

---

## 2. Screen inventory

Every screen, named, with its job in one sentence. **Ten screens behind four nav items.**

| # | Screen | Route | Job (one sentence) |
|---|---|---|---|
| 1 | **Inbox** | `#/inbox` | Everything that cannot proceed without this person — gates, blocked tasks, alerts — ordered by cost of *not* deciding. |
| 2 | **Work** | `#/work` | What the machine is doing right now, and what it finished, as a board. |
| 3 | **Fleet › Agents** | `#/fleet/agents` | Which of the 70 agents needs attention, and what each one is allowed to do. |
| 4 | **Agent detail** | `#/fleet/agents/<slug>` | One agent's grant, spend, run history and failure modes, in enough detail to retire it or raise its budget. |
| 5 | **Fleet › Harnesses** | `#/fleet/harnesses` | Which harnesses exist here, which one gives the second opinion, and what that second opinion actually did. |
| 6 | **Fleet › Spend** | `#/fleet/spend` | Where the money went, per agent and per project, against caps. |
| 7 | **Evidence › Docs** | `#/evidence/docs` | Read the ARCH/ADR/DESIGN/PLAN record. |
| 8 | **Evidence › Logs** | `#/evidence/logs` | Read raw session and agent transcripts. |
| 9 | **Evidence › Verdicts** | `#/evidence/verdicts` | The append-only DONE/BLOCKED audit trail, filterable by agent. |
| 10 | **Project settings** | `#/settings` | Budgets, second-opinion provider, sharing, theme — the things that write to `PROJECT.md`. |

Plus two **non-screens** (overlays, no route of their own): the **project switcher**
(existing `.proj-switch`) and the **mobile nav drawer**.

**Where the old eight went.** Nothing is deleted; three stop being top-level.

| Old tab | New home | Why |
|---|---|---|
| `inbox` | Screen 1, unchanged in job | Still the default. |
| `kanban` | Screen 2 (`Work`) | Renamed: "kanban" names the *widget*, "Work" names the *question*. |
| `dashboard` | Merged into Screen 2 as the **header band** | A dashboard nobody acts on is a screen that costs a click and returns a feeling. Its live figures belong above the board they describe. |
| `budgets` | Screen 6, a tab under Fleet | A budget is a property of an agent (L3). |
| `docs` | Screen 7 | — |
| `logs` | Screen 8 | — |
| `notifications` | Merged into Screen 1 | A notification is an inbox item that already fired. Its history is a filter on Inbox, not a destination. |
| `share` | **Action, not destination** (L5) | Promote/share is a verb on a project. Lives in Screen 10 + a `…` action. Removes one top-level item outright. |

---

## 3. Text wireframes — the five most important screens

Rendered at **1440px** (the design width) and **375px**. `·` = the `unloaded` glyph,
`—` = `none`, `n/a` = `uncomputable`, `!` = `unreadable`, `?` = `unjudged` (§4).

### 3.1 Inbox — desktop 1440

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▸ great_cto ▾   main · clean                                        [⌘K]  [◐ theme]  [⚙]                    │  56px topbar
├──────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┤
│              │  INBOX                                             3 waiting · 1 expensive                   │
│ ▎INBOX    3  │  ─────────────────────────────────────────────────────────────────────────────────────────  │
│  WORK    12  │  [ Waiting 3 ]  [ Fired 8 ]  [ All ]              filter: ▾ any agent    ▾ last 7 days       │
│  FLEET    !  │                                                                                              │
│  EVIDENCE    │  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│              │  ┃ ███ gate:ship ▲                                             great_cto-4f21 · 2h ago  ┃  │  ← EXPENSIVE
│  ── views ── │  ┃ escapes-the-machine · costs-money                                                     ┃  │    solid bed
│  Needs me    │  ┃ Publish v3.27.0 to npm and deploy the worker.                                         ┃  │    §6.2
│  Expensive   │  ┃ guards: devops, infra-provisioner                                                     ┃  │
│  Idle 30d    │  ┃                                        [ Reject… ]   [ Approve — type name to enable ]┃  │
│  All 70      │  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│              │  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│              │  │ ▢ gate:arch                                                 great_cto-8m6n · 20m ago │  │  ← routine
│              │  │ routine — the repair is to redo the architecture stage                               │  │    outline
│              │  │ Board redesign contract.                                                             │  │
│              │  │                                                       [ Reject… ]      [ Approve ]   │  │
│              │  └──────────────────────────────────────────────────────────────────────────────────────┘  │
│              │  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│              │  │ ⌗ gate:preflight  ?                                          great_cto-9a03 · 5m ago │  │  ← UNCLASSIFIED
│              │  │ unclassified — this gate is not in gate-reversibility.mjs. Unjudged, not harmless.    │  │    dashed
│              │  │                                                    [ Reject… ]  [ Approve — type … ] │  │    treated as
│              │  └──────────────────────────────────────────────────────────────────────────────────────┘  │    EXPENSIVE
│              │                                                                                              │
│ ─────────────│  ── fired ─────────────────────────────────────────────────────────────────────────────────  │
│ ◐ dark       │  ✓ 14:02  senior-dev DONE — 3 files, 2 tests            ✓ 13:55  qa-engineer DONE — 62 pass │
│ v3.26.1      │                                                                                              │
└──────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘
   240px                                              1200px
```

**Ordering rule (the whole point of this screen).** Sorted by
`reversibilityOf(gate).state`: `expensive` first, then `unclassified`, then `routine`,
each group by age descending. **`unclassified` sorts with the expensive group, not the
routine one** — because "nobody judged this" is not evidence of cheapness. This is
`agent-posture.mjs`'s own instruction ("treat as unjudged, not as harmless") applied at
the pixel.

### 3.2 Inbox — mobile 375

```
┌───────────────────────────────────┐
│ ☰  great_cto ▾            ⌘  ⚙   │ 56px, safe-area top
├───────────────────────────────────┤
│ INBOX          3 waiting · 1 exp. │
│ [Waiting 3][Fired 8][All]  ▾filter│ horizontal scroll, no wrap
├───────────────────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ ███ gate:ship ▲               ┃ │
│ ┃ escapes-the-machine           ┃ │ categories WRAP,
│ ┃ costs-money                   ┃ │ never truncate — §5
│ ┃ great_cto-4f21 · 2h           ┃ │
│ ┃ Publish v3.27.0 to npm and    ┃ │
│ ┃ deploy the worker.            ┃ │
│ ┃ ┌───────────────────────────┐ ┃ │
│ ┃ │      Reject…              │ ┃ │ 44px min, full-width,
│ ┃ ├───────────────────────────┤ ┃ │ STACKED — never side by
│ ┃ │  Approve — type name      │ ┃ │ side at this width
│ ┃ └───────────────────────────┘ ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│ ┌───────────────────────────────┐ │
│ │ ▢ gate:arch                   │ │
│ │ routine — redo the arch stage │ │
│ │ great_cto-8m6n · 20m          │ │
│ │ ┌───────────┐ ┌─────────────┐ │ │ routine MAY sit side
│ │ │  Reject…  │ │   Approve   │ │ │ by side: both ≥44px
│ │ └───────────┘ └─────────────┘ │ │ at 343px content width
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

**The one asymmetry that matters:** on mobile the *expensive* gate's buttons stack
full-width and the *routine* gate's do not. Cheap and expensive must not have the same
motor cost, and at 375px stacking is the only lever left.

### 3.3 Fleet › Agents — desktop 1440

```
┌──────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐
│              │  FLEET                                                                                       │
│  INBOX    3  │  [ Agents 70 ]  [ Harnesses ]  [ Spend ]                          ← L3 facet tabs            │
│  WORK    12  │  ─────────────────────────────────────────────────────────────────────────────────────────  │
│ ▎FLEET    !  │                                                                                              │
│  EVIDENCE    │  view: ( Needs attention 9 ) ( Expensive grants 14 ) ( Idle 30d 22 ) ( All 70 ) ( Retired 3 )│
│              │  ─────────────────────────────────────────────────────────────────────────────────────────  │
│  ── views ── │  70 agents · 14 hold an expensive grant · 2 not classified · spend 30d $41.88               │
│ ▎Needs me  9 │                                                                                              │
│  Expensive14 │  AGENT                    POSTURE                MODEL     LAST RUN   RUNS   PASS    30d $  ⋯│
│  Idle 30d 22 │  ─────────────────────────────────────────────────────────────────────────────────────────  │
│  All 70      │  ▾ ARCH · 8                                                                                  │
│  Retired  3  │    architect              ▲code.destructive      opus-4.5   2h ago       12   92%    4.20  ⋯│
│              │    design-advisor         ·code.write            opus-5     now           3    ·       ·   ⋯│
│              │    prompt-engineer        ·code.read             haiku-4.5  31d ago       0    —     0.00  ⋯│
│              │  ▾ SECURITY · 6                                                                              │
│              │  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│              │  │  security-officer       ▲credential.read      opus-4.5   4h ago        8   75%    6.10 ⋯│  │
│              │  │  ⚠ scoped in name only: Bash(node:*) — a full shell                                    │  │
│              │  └───────────────────────────────────────────────────────────────────────────────────────┘  │
│              │    sec-scanner            ? NOT CLASSIFIED       ·          —             0    n/a     —   ⋯│
│              │  ▾ QA · 4      ▸ OPS · 9      ▸ DOMAIN · 31      ▸ PM · 5      ▸ MEMORY · 3      ▸ OTHER · 4│
└──────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘
                  ├────────────────────┤├──────────────────┤├────────┤├────────┤├────┤├────┤├──────┤├──┤
                        left, sans          left, mono        left     left      RIGHT RIGHT RIGHT   32
                        280px               200px             110px    110px     70px  70px  90px    px
                                                                                 ─── tabular, §6.5 ───
```

Read the alignment row: **`RUNS`, `PASS` and `30d $` headers are right-aligned because
their data is** (§6.5). `AGENT`, `POSTURE`, `MODEL`, `LAST RUN` are left because theirs
is. This is the part most often left out, so it is drawn.

**Group collapse.** All eight domain groups from `deriveDomain()` render, but only the
groups containing rows in the current view are **expanded**. In the default
`Needs attention` view that is typically 2–3 groups — which is how 70 agents fit one
screen without scrolling and without a virtualizer.

### 3.4 Fleet › Agents — mobile 375

```
┌───────────────────────────────────┐
│ ☰  great_cto ▾            ⌘  ⚙   │
├───────────────────────────────────┤
│ FLEET                             │
│ [Agents 70][Harnesses][Spend]     │ h-scroll
├───────────────────────────────────┤
│ ▾ view: Needs attention (9)       │ SELECT, not chips — 5
├───────────────────────────────────┤ saved views do not fit
│ 70 agents · 14 expensive          │
│ 2 not classified · 30d $41.88     │
├───────────────────────────────────┤
│ ARCH · 8                          │ group header, sticky
│┌─────────────────────────────────┐│
││ architect              opus-4.5 ││ ROW BECOMES A CARD here
││ ▲ code.destructive              ││ only — it is now tappable
││ 2h ago · 12 runs · 92%          ││ and expandable (§6.0
││                       30d $4.20 ││ exception)
│└─────────────────────────────────┘│
│┌─────────────────────────────────┐│
││ design-advisor          opus-5  ││
││ · code.write                    ││
││ now · 3 runs · ·                ││ `·` = read not landed
││                          30d ·  ││
│└─────────────────────────────────┘│
│ SECURITY · 6                      │
│┌─────────────────────────────────┐│
││ security-officer      opus-4.5  ││
││ ▲ credential.read               ││
││ ⚠ scoped in name only:          ││ wraps, never truncates
││   Bash(node:*) — a full shell   ││
││ 4h ago · 8 runs · 75%           ││
││                       30d $6.10 ││
│└─────────────────────────────────┘│
└───────────────────────────────────┘
```

**The table does not become a horizontally-scrolling table.** Eight columns at 375px
is a horizontal scroll, which ui-ux-pro-max `horizontal-scroll` (§5, HIGH) forbids
outright. It becomes a stacked card list, and the numeric columns collapse to one
right-aligned money line so the tabular alignment survives the reflow.

### 3.5 Agent detail — desktop 1440

Opened by clicking a row. **Renders in place as an expansion** (L5, Deployment Summary)
for the common case; `#/fleet/agents/<slug>` is the same content as a full page, for
deep-linking (ui-ux-pro-max `deep-linking`, §9 HIGH).

```
│  ┌─ security-officer ──────────────────────────────────────────────────────────  [✕] ┐  │
│  │  opus-4.5 (pinned)      last run 4h ago      8 runs 30d      75% pass      $6.10  │  │
│  │  ─────────────────────────────────────────────────────────────────────────────── │  │
│  │  GRANT                                                                            │  │
│  │  tools: Read, Grep, Bash(node:*), WebFetch                                        │  │
│  │                                                                                   │  │
│  │  ▲ credential.read       reach secrets on disk or in the environment               │  │
│  │                          unrevocable-disclosure — a secret that has been read      │  │
│  │                          cannot be un-read; only revocation ends it                │  │
│  │  ▲ code.destructive      delete files, rewrite history, or overwrite work that     │  │
│  │                          is not in the index                                       │  │
│  │                          destroys-evidence                                          │  │
│  │  ▲ communication.external.send   send data off this machine                        │  │
│  │                          escapes-the-machine                                        │  │
│  │  · code.read  · code.write  · network.fetch  · process.spawn      ← routine, hairline│  │
│  │                                                                                   │  │
│  │  ⚠ SCOPED IN NAME ONLY                                                            │  │
│  │    Bash(node:*) — node -e runs arbitrary JavaScript, including child_process.      │  │
│  │    This grant reads as a restriction and is not one.                              │  │
│  │  ─────────────────────────────────────────────────────────────────────────────── │  │
│  │  EVAL COVERAGE       ·  not measured — no eval has been run for this agent        │  │
│  │  BUDGET              $6.10 of $10.00  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  61%                   │  │
│  │  ─────────────────────────────────────────────────────────────────────────────── │  │
│  │  FAILURE MODES 30d                          RUNS                                  │  │
│  │  rate-limit        2   last 4h ago          14:02  DONE   $0.81  opus-4.5         │  │
│  │  timeout           1   last 3d ago          11:20  BLOCKED $1.44  opus-4.5        │  │
│  │  precondition      —   never seen           09:03  DONE   $0.02  opus-4.5         │  │
│  │                                             08:11  DONE   ~0     opus-4.5   ← §6.5│  │
│  │  ─────────────────────────────────────────────────────────────────────────────── │  │
│  │  [ Retire agent… ]                                          [ Raise budget ]      │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
```

Note `precondition — never seen`: a failure mode with zero occurrences renders `—`
(*measured, and the answer is none*), which is **not** the same glyph as
`eval coverage ·` (*not measured*). Those two lines are four rows apart on purpose —
they are the design's own proof that it distinguishes them.

### 3.6 Agent detail — mobile 375

Full-screen route (not an expansion — an expansion inside a card list at 375px buries
the reader). Same sections, stacked, in this order: **header → grant → scoped-in-name-only
→ budget → eval coverage → failure modes → runs → actions**. The `⚠ SCOPED IN NAME ONLY`
block is promoted above budget on mobile, because it is the one thing on the screen a
person might act on immediately and the fold is at ~600px.

### 3.7 Fleet › Harnesses — desktop 1440

**The screen the brief is most specific about. Note what is NOT here: a toggle.**

```
│  FLEET   [ Agents 70 ]  [ Harnesses ]  [ Spend ]                                        │
│  ─────────────────────────────────────────────────────────────────────────────────────  │
│                                                                                          │
│  ┌─ HOST ───────────────────────────────┐  ┌─ DETECTED ──────────────────────────────┐ │
│  │  ● Claude Code                        │  │  ○ OpenAI Codex                          │ │
│  │    host · v3.26.1                     │  │    absent                                │ │
│  │    runs the full pipeline:            │  │    codex is not on PATH                  │ │
│  │    70 agents · 44 commands · 40 skills│  │                                          │ │
│  │                                       │  │    ┌────────────────────────────────┐    │ │
│  │                                       │  │    │ npm i -g @openai/codex      [⧉]│    │ │
│  │                                       │  │    └────────────────────────────────┘    │ │
│  │                                       │  │    skills + MCP only — no pipeline stages│ │
│  └───────────────────────────────────────┘  └──────────────────────────────────────────┘ │
│                                                                                          │
│  SECOND OPINION — who reviews the reviewer                                               │
│  ─────────────────────────────────────────────────────────────────────────────────────  │
│  declared in PROJECT.md:  undeclared                                                     │
│  resolves here to:        undeclared — no capability declared, so no second opinion runs │
│                                                                                          │
│  ( ) Undeclared    — PROJECT.md says nothing. A future harness may be picked up.         │
│  ( ) None          — deliberately off. Recorded as a decision.                           │
│  ( ) Codex         ⚠ would resolve to `unavailable` here — codex is not on PATH          │
│  ( ) OpenRouter    ⚠ would resolve to `unavailable` here — no key configured             │
│                                                     [ Save to PROJECT.md ]               │
│  ─────────────────────────────────────────────────────────────────────────────────────  │
│  WHAT IT ACTUALLY DID                                     .great_cto/cross-review.log    │
│  runs 12 · reviewed 9 · skipped 3 · blocked 2                                            │
│                                                                                          │
│  WHEN              PROVIDER   MODEL        STATE         VERDICT   FINDINGS  P0    COST  │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  05 Sep 10:05      codex      —            unavailable   —         —         —     —     │ ← dimmed,
│  05 Sep 10:00      codex      gpt-5-codex  ok            BLOCK     2         1    0.0100 │   not counted
│  04 Sep 18:41      codex      gpt-5-codex  ok            PASS      0         0    0.0080 │
│  ──────────────────────────────────────────────────────────────────────────────────────  │
│  ! 2 lines in this log could not be parsed. Counted, not dropped.                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Four things this layout is doing on purpose:

1. **Codex is a status panel, not a switch.** There is no control to turn Codex on,
   because the board cannot install it. A toggle would be a two-state affordance
   describing a three-state fact and would imply a capability that does not exist. The
   `why` string from `detectCodex()` is already written for a human — it is rendered
   verbatim, with the remedy as a **copyable command**, not a button.
2. **Four radios, not one switch.** `undeclared` and `none` are separate options because
   `POST /api/harnesses/second-opinion` deliberately offers both (`null` to undeclare)
   and its own comment says they are different states. A switch cannot express four.
3. **The choice shows its consequence before the click.** Selecting `Codex` on a machine
   without one shows `⚠ would resolve to unavailable here` *inline, before Save* — the
   route already returns the resolved state after the write; this just moves the
   information one step earlier.
4. **A skipped run does not look like a normal one and does not enter the counts.**
   `runs 12 · reviewed 9 · skipped 3` are three separate figures, and `blocked 2` counts
   only rows where `state === 'ok'`. The `harnesses.test.mjs` comment names this exact
   defect: *"declared codex, but unavailable here looked exactly like a normal line."*

### 3.8 Fleet › Harnesses — mobile 375

```
┌───────────────────────────────────┐
│ FLEET  [Agents][Harnesses][Spend] │
├───────────────────────────────────┤
│ ● Claude Code    host · v3.26.1   │
│   70 agents · 44 cmds · 40 skills │
├───────────────────────────────────┤
│ ○ OpenAI Codex          absent    │
│   codex is not on PATH            │
│   ┌─────────────────────────────┐ │
│   │ npm i -g @openai/codex   [⧉]│ │ 44px, tap = copy
│   └─────────────────────────────┘ │
├───────────────────────────────────┤
│ SECOND OPINION                    │
│ declared:  undeclared             │
│ here:      undeclared             │
│ ┌───────────────────────────────┐ │
│ │ ( ) Undeclared                │ │ each row 44px min,
│ ├───────────────────────────────┤ │ label is the tap target
│ │ ( ) None                      │ │
│ ├───────────────────────────────┤ │
│ │ ( ) Codex                     │ │
│ │  ⚠ unavailable here           │ │
│ ├───────────────────────────────┤ │
│ │ ( ) OpenRouter                │ │
│ │  ⚠ unavailable here           │ │
│ └───────────────────────────────┘ │
│ [      Save to PROJECT.md       ] │ full width
├───────────────────────────────────┤
│ WHAT IT DID   12 runs · 9 reviewed│
│               3 skipped · 2 block │
│┌─────────────────────────────────┐│ evidence table →
││ 05 Sep 10:05  codex             ││ stacked rows, same
││ unavailable                     ││ dimming rule
│├─────────────────────────────────┤│
││ 05 Sep 10:00  codex gpt-5-codex ││
││ ok · BLOCK · 2 findings · 1 P0  ││
││                         $0.0100 ││ right-aligned, tabular
│└─────────────────────────────────┘│
│ ! 2 lines could not be parsed.    │
└───────────────────────────────────┘
```

---

## 4. Absence has a vocabulary — the seven states, and which occur here

The existing `ABSENCE` dict (`index.html` ~line 7069) has **three** kinds. The board
can produce **six**. Two of the missing ones are already returned by shipped code and
have no glyph today — that is a real defect this design names.

| State (per the house contract) | Occurs here? | Glyph | Treatment | Evidence it occurs |
|---|---|---|---|---|
| **true zero** | yes | `0` / `0.00` | **A figure, not an absence.** `--text`, tabular, right-aligned. Never `—`. | `runs_30d === 0`; `retireCandidates` counts exactly this |
| **rounded to zero** | yes | `~0` | `--text2`, tabular. Non-zero cost below display precision. | per-run `cost_usd` is routinely < $0.0001 |
| **not available** *(should exist, was not obtained)* | yes — **existing** `unloaded` | `·` | `--text3`, `title` + `aria-label` carry the specific reason | `absent('unloaded', 'the metrics payload carried no tasks section')` |
| **not applicable** *(cannot exist for this row)* | yes — **existing** `uncomputable` | `n/a` | `--text3`, mono | `absent('uncomputable', 'a measured multiplier needs verdict cost data…')` |
| **measured, and there is none** *(existing `none`)* | yes | `—` (em dash U+2014) | `--text3` | `absent('none', 'nothing was accepted in this window')` |
| **unreadable** *(present, could not be parsed)* | yes — **NO GLYPH TODAY** | `!` in a 1px box | `--p1-fg` on `--p1-bg`, mono | `routes.mjs:1629` `logState = 'unreadable'`; `codex-exec.mjs:60,97` `state:'unreadable'` |
| **unjudged** *(exists; nobody has classified it)* | yes — **NO GLYPH TODAY** | `?` | `--p1-fg`, mono, + the word `NOT CLASSIFIED` | `postureOf().unknownTools`; `reversibilityOf() → 'unclassified'` |
| **provisional / estimated / forecast** | yes | `≈` prefix | `--text2` | `fleet.mjs:155` — "Estimated cost — DEFAULT_TASK_MIN per verdict (no real timing data here)" |
| **suppressed** | **n/a** | — | — | The board is single-tenant, local, one operator. No confidentiality tier exists. |
| **too unreliable to publish** | **n/a** | — | — | No statistical reliability threshold is computed anywhere in this codebase. |

**Two additions to `ABSENCE`, and one correction of category.**

```
ABSENCE = {
  none:         '—',    // existing — measured; the answer is none
  uncomputable: 'n/a',  // existing — cannot exist for this row
  unloaded:     '·',    // existing — the read has not landed
  unreadable:   '!',    // NEW  — it was there and could not be parsed
  unjudged:     '?',    // NEW  — it exists and nobody has classified it
}
```

`design-contract.test.mjs` already asserts glyph uniqueness across this dict; `!` and
`?` are distinct from `—`, `n/a`, `·` and from each other, so the assertion holds and
should be extended to require the two new keys.

**The hard rule, stated once.** `estimated` is **not** an absence and does not go in
this dict — it is a real number wearing a qualifier. `fleet.mjs` currently returns an
estimated cost that renders identically to a measured one. Rendering `≈$4.20` where the
figure is derived from `DEFAULT_TASK_MIN` and `$4.20` where it came from
`verdict.cost_usd` is the whole fix, and it costs one prefix.

---

## 5. Navigation model — 70 agents and 2 harnesses in a menu a person can hold

**Four primary destinations.** Not eight, not ten.

```
INBOX      ← what needs me
WORK       ← what is happening
FLEET      ← what the machine is made of      → Agents · Harnesses · Spend
EVIDENCE   ← what it did                      → Docs · Logs · Verdicts
```

The rule that produces this list: **a top-level item answers a question the operator
actually asks.** "Kanban", "budgets" and "notifications" are widget names and file
names; they are not questions. Four items is under the ≤5 ceiling that
ui-ux-pro-max `bottom-nav-limit` sets for the mobile case, so the same model serves
both widths without a second information architecture.

**How the 70 fit.** Never as a list of 70. Four devices, in order of how much work each
does:

1. **The default view is a filter, not the roster.** `Fleet › Agents` opens on
   **`Needs attention`** — agents that are `failing`, hold an **unjudged** posture, are
   over budget, or have been idle 30d. Typically 9 rows. Sentry's `For Review` (L4) is
   the precedent: the default view of a large list is the subset that has not been
   judged, not the whole.
2. **Five saved views, and only five.** `Needs attention` · `Expensive grants` ·
   `Idle 30d` · `All 70` · `Retired`. Each shows its count in the chip, so the shape of
   the fleet is legible before anything is clicked. **Not user-creatable** — see §10.
3. **Eight domain groups, collapsed by default, from code that already exists.**
   `deriveDomain()` in `packages/board/lib/fleet.mjs` returns
   `arch · security · qa · ops · domain · pm · memory · other`. Groups with no rows in
   the current view render collapsed with their count, so `DOMAIN · 31` is one line
   until it is wanted. **Reuse this function; do not invent a second taxonomy** — the
   file documents a bug where a bad regex put 40 of 69 agents in one bucket, and a
   parallel taxonomy would reintroduce exactly that class of drift.
4. **`⌘K` jumps to an agent by slug — by extending the palette that already exists.**
   `index.html` ships a working command palette (`#cmdk`, ~L1032 CSS, ~L6431 key
   handler, `cmdkActions()` ~L7699) with three groups — `Go`, `Do`, `Gate` — built
   deliberately out of the board's own verbs (`switchTab`, `gateAction`,
   `openNewIssueModal`, `toggleBoardTheme`) so that choosing "Approve gate X" runs the
   same `gateAction` that names its consequences and waits for a confirm.
   **Do not build a second palette.** Add one group, `Agent`, whose `run` is
   `switchTab('fleet')` + focus the row; and remap the six `Go` entries onto the four
   destinations in §2. Typing `sec` → `security-officer`. This is the escape hatch that
   makes the other three devices safe to be opinionated.

**How the 2 harnesses fit.** They are not a nav item. Two things are not a list; they
are a screen. `Fleet › Harnesses` is one of three tabs under Fleet, because a harness
is *part of the machine* in exactly the way an agent is.

**Deep links.** Every screen has a route (§2). `#/fleet/agents/security-officer` opens
the fleet tab, expands the `SECURITY` group, and focuses the row — because a link that
lands on the right page but the wrong scroll position has not arrived
(ui-ux-pro-max `deep-linking`, §9 HIGH).

**Nav state carries an absence glyph.** `FLEET !` in the sidebar of §3.1 is not
decoration: it is the `unreadable`/`unjudged` marker propagating up, meaning *there is
something in Fleet that nobody has classified*. A count badge would render `2` and a
reader would take it for two new items. The glyph says something different, on purpose.

---

## 6. Component inventory

Every distinct component, with three-state rendering spelled out wherever it shows
status. **Existing** = already in `index.html`. **New** = to be written.

### 6.0 The card rule (applies to every component below)

Refero anti-slop tell #2. **A container earns a border, a background and a radius only
if it is itself clickable or expandable.** Everything else is separated by a 1px
`--border` rule and 16px of space.

Consequence, stated so nobody re-decides it: the fleet roster at desktop is **rows with
rules**, not 70 cards. It becomes cards at ≤768px *only*, where each row gains a tap
target and therefore earns one. Gate items in Inbox **are** cards at every width,
because each is an interactive container with two actions.

### 6.1 `absent(kind, why)` — **existing, extend**

The primitive everything else composes. Renders the §4 glyph with the *specific* reason
in both `title` and `aria-label`. **A glyph with no accessible name reads as nothing to
a screen reader**, which is why the existing test asserts both. Extend the dict with
`unreadable` and `unjudged`; extend the test to require them.

Never pass a generic reason. `absent('unloaded', 'no data')` is a defect — the existing
test enforces `why.length > 10` at every call site.

### 6.2 `GateChip` — **new**. Three states, and cost-of-undo is visible.

Driven by `reversibilityOf(gate)` from `scripts/lib/gate-reversibility.mjs`, which
returns `{state: 'expensive'|'routine'|'unclassified', categories[], why}`.

| State | Bed | Border | Glyph | Text | Approve ritual |
|---|---|---|---|---|---|
| `routine` | transparent | 1px solid `--status-gate` | `▢` | `gate:arch` + `routine — the repair is to redo the architecture stage` | **Medium tier** — one confirm naming the consequence |
| `expensive` | **solid** `--status-gate` | none | `▲` | `gate:ship` + the category words: `escapes-the-machine · costs-money` | **High tier** — **type the gate name**; Approve disabled until it matches |
| `unclassified` | transparent | 1px **dashed** `--border-strong` | `?` | `gate:foo` + `unclassified — this gate is not in gate-reversibility.mjs. Unjudged, not harmless.` | **High tier** — same as expensive |

**Weight carries cost, not hue.** All three are the same violet family, so the operator
learns one colour = one meaning (`aesthetic-instrument` rule 11, ui-ux-pro-max
`color-not-only`). The difference a colourblind reader relies on is fill-vs-outline plus
the glyph plus the words — three redundant channels.

**The blast radius is stated, always.** The confirm text names: how many objects, under
which selection scope, and what leaves the machine. `approveConsequence(id)` already
does this and `gate-affordances.test.mjs` already asserts it says *verdict log*,
*pipeline* and *public report* — and only claims the public part when `shareState` is
actually on. **Keep that function; add the typed-name gate in front of it for
`expensive` and `unclassified`.**

**Why `unclassified` gets the expensive ritual.** Cost-of-undo is unknown, and an
unknown cost is not a low one. This is the single most important line in this section.

### 6.3 `StatusDot` — **new**. Universal three-state primitive.

Every status on this board resolves through one component, so a pending gate cannot
render like a passed one by accident anywhere.

| Class | Renders | Never |
|---|---|---|
| positive (`done`, `ok`, `available`, `PASS`) | filled dot `--status-done` + word | — |
| negative (`blocked`, `BLOCK`, `failing`) | filled dot `--status-blocked` + word | — |
| in-flight (`running`, `Initializing` per L3) | **hollow** dot, 1px `--status-progress`, + word | a filled dot — filled means *settled* |
| **unknown** (read not landed) | `absent('unloaded', why)` → `·` | a grey filled dot |
| **unmeasured** (never ran) | `absent('none', why)` → `—` | `0` |
| **unreadable** (present, unparseable) | `absent('unreadable', why)` → `!` | blank |
| **unjudged** (not classified) | `absent('unjudged', why)` → `?` | the positive rendering |

Grafana's model (L1) is what this is: `NoData` and `Error` are states beside `Normal`
and `Alerting`, not degenerate cases of them. The board's universal default is Grafana's
`Set No Data state`. **The equivalent of `Set Normal state` is forbidden** — no surface
may render an absence as a success.

### 6.4 `AgentRow` — **new**

Columns and alignment exactly as drawn in §3.3. Composition:
`slug` (sans, left) · `PostureStrip` · `model` (mono, left) · `last run` (mono, left,
relative) · `runs` (mono, **right, tabular**) · `pass %` (mono, **right, tabular**) ·
`30d $` (mono, **right, tabular, decimal-aligned**) · `…` overflow.

States: `default` · `hover` (bg → `--bg-muted`) · `focus` (§7.1) · `expanded` ·
`retired` (`--text3` ink, `retired` chip, sorts to its own view) ·
`idle` (last run > 30d — `last run` cell in `--text3`).

`…` overflow menu (L3), never a row of buttons: `Open detail` · `Copy slug` ·
`Retire…` · `Raise budget`.

### 6.5 `PostureStrip` — **new**. The one where expensive must LOOK expensive.

Driven by `postureOf(toolsLine)` → `{postures[], expensive[], unknownTools[],
fullShellVia[], scopedInNameOnly[]}`.

| Kind | Rendering | Measured |
|---|---|---|
| **expensive** (posture has a non-null ADR-009 category) | **solid** chip, bed `--p0-bg`, ink `--p0-fg`, leading `▲`, mono `--fs-eyebrow`. Category name shown in detail view. | `--p0-fg` on `--bg-card`: **9.59 dark / 6.47 light** (floor 4.5) |
| **routine** (category `null`) | **hairline** chip, transparent bed, 1px `--border`, ink `--text2`, leading `·` | inherits measured `--text2` pairs |
| **unjudged** (`unknownTools`) | `?` + the words `NOT CLASSIFIED`, ink `--p1-fg` | — |
| **scoped in name only** (`scopedInNameOnly`) | **A row-level strip, not a chip.** Full-width, `--p1-bg`, `⚠` + the lib's own `why`: *"node -e runs arbitrary JavaScript, including child_process"* | — |

**One bed for "expensive", not four.** There are four expensive categories in play
(`destroys-evidence`, `unrevocable-disclosure`, `escapes-the-machine`, `costs-money`).
They share one bed and are distinguished **by their words**. Four hues would be a
rainbow the operator has to memorise, and would violate one-hue-per-meaning: the meaning
is *expensive*, and there is one of those.

**`scopedInNameOnly` gets a strip, not a chip,** because it is the subtlest finding the
library produces and the most valuable: `Bash(node:*)` reads as a restriction and is a
full shell. A chip in a row of chips would be scanned past. This is the design decision
in this document I would defend hardest.

### 6.6 `SavedViewChips` — **new**

Five chips, each with a live count (§5). Selected chip: `--bg-strong` bed + left rail in
`--accent` (the `.nav-item.active::before` pattern, reused — the one permitted left
stripe). At ≤768px, collapses to a native `<select>`, because five chips with counts do
not fit 343px and a horizontally-scrolling filter bar hides its own options.

**A count of `0` in a chip renders `0`, not `—`.** `Needs attention 0` is the best
possible state of this board and must read as an achievement (§6.10, empty state B).

### 6.7 `BudgetBar` — **new**

Pinecone's *fullness* pattern (L3): spend as a fraction of a ceiling, not an absolute.
Driven by `judgeAgentBudget`.

| State | Bar | Figure |
|---|---|---|
| `within` | `--accent` fill | `$6.10 of $10.00 · 61%` |
| `projected` over (Sentry `Escalating`, L4) | `--accent` fill + `--status-progress` hatched extension past the cap line | `$9.20 of $10.00 · projected $12.40` |
| `over` | `--status-blocked` fill | `$11.40 of $10.00 · 114%` |
| **no cap declared** | **no bar at all** — `absent('uncomputable', 'no cap is declared for this agent in PROJECT.md')` | `$6.10 · n/a` |
| **spend not read** | empty track, `--border` | `absent('unloaded', …)` → `·` |

A full bar and a *missing* bar are the two renderings most easily confused, so an
absent cap draws **no track**. An empty track means *we know the cap and nothing has
been spent*; no track means *there is no cap*.

### 6.8 `HarnessPanel` / `SecondOpinionPicker` / `EvidenceTail` — **new**

Per §3.7. The three rules that make them correct, restated because they are the ones an
implementer would otherwise soften:

1. **No `<input type=checkbox>` and no switch anywhere on this screen for harness
   presence.** Presence is detected, not set.
2. **The picker is a `<fieldset>` + `<legend>` + four `<input type=radio>`.** Native
   radios: correct roles, arrow-key traversal and grouped announcement for free
   (ui-ux-pro-max `system-controls`, `field-grouping`).
3. **`skipped` rows are dimmed to `--text3`, carry the word `unavailable`, and are
   excluded from `blocked`.** A dimmed row is still selectable and still announced —
   this is a *read-only* treatment, not a disabled one (§6.12).

### 6.9 Loading — **a skeleton makes a promise, so most of this board does not use one**

Per surface:

| Surface | Treatment | Why |
|---|---|---|
| Cost, pass rate, budget, run counts | **`absent('unloaded', why)` → `·`** — no skeleton | Someone acts on these. A skeleton bar promises "a number is coming and it has this shape" before that is known. |
| Gate list, agent roster, evidence tail | **`·` in each cell of a real, empty table** | The table's own structure is the affordance; a shimmering fake row is a claim that rows exist. |
| Docs / Logs prose | **Skeleton lines are permitted** | Nobody acts on the shape of a paragraph. |
| Fleet summary after SSE reconnect | **Last known value + its timestamp**, `--text2`, prefixed `as of 14:02` | Grafana `Keep last state` (L1). Better than a spinner and honest about staleness. |

### 6.10 Empty states — **four, not one**

| # | When | Headline | Body | Action |
|---|---|---|---|---|
| **A** | **Day one** — no verdicts, no beads, no PROJECT.md. *The screen every new user sees first.* | `Nothing has run yet.` | `The board reads .great_cto/ in your project. Run a pipeline and this fills in.` | `Copy: npx great-cto init` |
| **B** | **Filter returned nothing** — `Needs attention 0` | `Nothing needs you.` | `70 agents, 0 failing, 0 unclassified, 0 over budget.` | `Show all 70` |
| **C** | **Request failed** — server unreachable / SSE dropped | `The board cannot reach its server.` | The actual error, verbatim. Plus: `Last read 14:02 — figures below are from then.` | `Retry` |
| **D** | **Capability absent** — no Codex, no cap declared, no PROJECT.md | The specific `why` from the detector | The remedy as **copyable text**, never a button the board cannot honour | copy `⧉` |

**A and B must not share a treatment.** B is the best state of this board. It gets
`--accent` ink on its headline and no illustration; A and C get `--text2`. A design that
renders "you are done" the same as "we broke" has failed at its one job.

**C keeps the stale figures on screen, dimmed and dated.** Blanking them turns a known
value into an unknown one, which is the defect this whole document is about.

### 6.11 `ThemeToggle` — **existing, must be replaced**

Currently `☀️`/`🌙` — emoji as iconography, banned by both the committed-aesthetic list
and Refero tell #5, and font-dependent across platforms. Replace with two inline SVG
paths (sun / moon), `currentColor`, 16px, 1.5px stroke, matching the existing `.icon`
sizing. `aria-label` = `Switch to light theme` / `Switch to dark theme` — the label
states the *destination*, not the current state.

### 6.12 Permission and read-only — the fourth empty state

The board is single-operator and local, so there is no role system. Three cases still
exist and get three distinct treatments:

| Case | Treatment | Never |
|---|---|---|
| **Cross-origin POST refused** (`originAllowed(req)` → 403) | Control stays **operable**; the refusal is explained on activation | Pre-disabling it — a disabled control does not say why, is not read by screen readers, and leaves the tab order |
| **Value matters here but is not editable here** (e.g. `declared in PROJECT.md`, resolved state) | **read-only**: navigable, announced, **full `--text` contrast preserved** | `--text3` — dimming a read-only value makes it look broken |
| **Action the board cannot perform** (install Codex) | Copyable command, no button | A disabled button with a tooltip. The tooltip cannot be opened by the people who need it. |

**No `disabled` attribute is used anywhere in this design except one place**: the
Approve button on an `expensive`/`unclassified` gate, while the typed name does not
match. That one is legitimate because the enabling condition is **visible, adjacent and
under the user's control** — the text field is right there, and `aria-describedby` on
the button names the condition.

**Masking:** n/a — no secret values are rendered on this board. If that changes, the
mask is fixed-length, because a mask that preserves length leaks magnitude.

---

## 7. A11y contract

**Target: WCAG 2.2 AA.** Everything below is measured or specified, not assumed.

### 7.1 Focus — the measured defect, and the fix

The brief asks for the ring's contrast **against every surface it appears on**. Computed
here with `scripts/lib/contrast.mjs`, floor **3.0** (non-text indicator):

| Surface the ring lands on | Dark `#00d97e` | Light `#047857` |
|---|---|---|
| `--bg-page` | **10.38** ✅ | **4.86** ✅ |
| `--bg-card` | **9.73** ✅ | **5.48** ✅ |
| `--bg-muted` | **9.20** ✅ | **4.91** ✅ |
| `--bg-elevated` | **8.79** ✅ | **5.48** ✅ |
| `--bg-strong` | **8.12** ✅ | **4.41** ✅ |
| `--bg-solid` (`#0f1115`, both themes) | **10.10** ✅ | **3.45** ✅ (tight — do not darken this token) |
| **solid `--status-gate` chip** | **1.45** 🔴 | **1.04** 🔴 |
| **solid `--status-blocked` chip** | **1.67** 🔴 | **1.00** 🔴 |
| **solid `--accent` button** | **1.00** 🔴 | **1.44** 🔴 |

**The ring fails on every solid chip in both themes** — and this design puts solid beds
on exactly the controls that most need a visible focus: the expensive gate chip, the
expensive posture chip, the primary Approve button. On `--accent` in dark the ratio is
**1.00** — the ring and the button are the *same colour*. This is invisible, and it is
the one affordance a keyboard user cannot route around.

**The fix, and it is a geometry fix, not a colour fix.** Every focusable element takes a
**two-ring treatment**: an inner spacer ring painted in the *container's* colour, then
the focus ring outside it.

```
inner ring : 2px, the container surface token (--bg-card / --bg-page / --bg-muted)
outer ring : 2px, var(--focus-ring)
```

This guarantees the ring is always measured against a container surface — the rows
above, all of which pass, 8.12–10.38 dark and 4.41–5.48 light — and never against the
chip it surrounds. **Corollary rule, checkable:** *no solid chip may sit directly on
another solid chip*, or the inner ring has nothing safe to be painted in.

**Why the pattern already in the file is not sufficient.** `index.html:2631` uses
`outline: 2px solid var(--focus-ring); outline-offset: 1px;`. That is correct *today*
because every element it applies to sits on a plain surface. It fails the moment this
design lands, for two reasons: `outline-offset` leaves the gap **transparent**, so on a
solid chip the ring is separated from the chip by 1px of the chip's own colour and is
still read against it; and 1px of separation is below the width at which the eye
resolves two adjacent colours as distinct. The painted inner ring fixes both. **Migrate
`.agent-drawer-close` and every other `outline`-based focus rule to the two-ring
`box-shadow` form in the same step** — leaving two focus idioms in one file is how the
next redesign inherits this bug.

`:focus-visible`, never `:focus` — so pointer users do not see rings, and the ring is
never removed without a replacement.

### 7.2 Focus order

Strict DOM order = visual order. Per screen:

**Inbox:** skip-link → project switcher → `⌘K` → theme → settings → nav (4 items, one
tab stop, arrows to move — `role="tablist"`) → view chips → **first gate card** →
(within card: Reject → [typed-name field] → Approve) → next gate card → fired list.

Gates are in **cost order** (§3.1), so the keyboard reaches the expensive decision first.
That is deliberate: tab order is a priority statement.

**Fleet › Agents:** … → nav → facet tabs → view chips → **table**. The table is one tab
stop; `↑`/`↓` move between rows (`aria-activedescendant`), `→`/`←` collapse and expand
groups, `Enter` expands the row, `Esc` collapses. **70 agents are 1 tab stop, not 70** —
this is the reason §4-Out-of-scope declines virtualization, since a virtualizer that
unmounts rows breaks `aria-activedescendant`.

**Fleet › Harnesses:** … → facet tabs → copy-command button → **radio group (one tab
stop, arrows within — native behaviour)** → Save → evidence table.

### 7.3 Contrast, measured

| Pair | Dark | Light | Floor |
|---|---|---|---|
| `--text` on `--bg-card` | inherits shipped audit | inherits | 4.5 |
| `--text3` (absence glyphs) on `--bg-card` | **5.43** ✅ | **5.63** ✅ | 4.5 |
| `--status-gate` as ink on `--bg-card` | **6.69** ✅ | **5.70** ✅ | 4.5 |
| `--on-status` on solid `--status-gate` bed | **6.57** ✅ | **5.70** ✅ | 4.5 |
| `--p0-fg` on `--bg-card` (posture chip) | **9.59** ✅ | **6.47** ✅ | 4.5 |

**The absence glyphs clear AA as text** (5.43 / 5.63) — they are not decoration and are
not allowed to be dimmed below `--text3`. A `—` that fails contrast is an absence the
reader cannot detect, which is worse than a blank because it looks intentional.

### 7.4 Labels and `.sr-only`

Six mandated uses, and a rule for when *not* to add one.

1. **Every absence glyph** — `aria-label` = the specific `why`. Already enforced by
   `design-contract.test.mjs`. A bare `—` announces as nothing or as "em dash".
2. **`PostureStrip`** — visually a `▲` + short name; accessible name is the full
   sentence: `expensive: credential.read — reach secrets on disk or in the environment;
   unrevocable-disclosure`. The glyph is `aria-hidden`.
3. **`GateChip`** — accessible name includes the state word and the categories:
   `gate:ship, expensive, escapes-the-machine, costs-money`. **The fill is invisible to
   a screen reader; the word is the only channel that survives.**
4. **Column headers** — `<th scope="col">`; `aria-sort` on the sorted one
   (ui-ux-pro-max `sortable-table`).
5. **`.sr-only` table caption** per screen, e.g. *"70 agents, grouped by domain. 14 hold
   an expensive tool grant. 2 are not classified."* — the shape of the data before the
   data, which is the summary a sighted reader gets from the header band for free.
6. **Live regions:** `aria-live="polite"` on the Inbox waiting-count and the fleet
   summary band. **`polite`, never `assertive`** — updates arrive over SSE, unrequested;
   interrupting a reader for a machine-caused change is hostile. Toasts never steal
   focus (ui-ux-pro-max `toast-accessibility`).

**When not to add one:** a mono string that is *meant to be read literally and copied* —
an agent slug, a version, a gate name — takes no `aria-label`. Adding a prose label to
`gate:ship` replaces the copyable truth with a paraphrase. This is `aesthetic-instrument`
rule 4 ("would someone copy this?") applied to the accessibility layer.

### 7.5 Keyboard paths (complete)

| Key | Does | Where |
|---|---|---|
| `⌘K` / `Ctrl+K` | Command menu — **already shipped** (`#cmdk`); gains an `Agent` group | global |
| `Tab` / `Shift+Tab` | Move between regions | global |
| `←` `→` | Move within nav / facet tabs / radio group | tablist, radiogroup |
| `↑` `↓` | Move between table rows | agent table, evidence table |
| `→` `←` | Expand / collapse a domain group | agent table, on a group header |
| `Enter` | Activate; expand a row | global |
| `Space` | Activate a button; **never submits a gate** | global |
| `Esc` | Close drawer, collapse row, dismiss confirm | global |
| `/` | Focus the filter field | list screens |

**No bare `Enter` approves a gate** (L6 — submit-key is a preference, so it is not
load-bearing anywhere else). Approving requires focusing the Approve button, and for
`expensive`/`unclassified` also typing the name. Three deliberate acts for the
irreversible one, one for the cheap one.

**Skip link** — first tab stop, `Skip to main content`, visible on focus
(ui-ux-pro-max `skip-links`).

### 7.6 Text scaling

Every size in `--fs-*` is `px` today. **Keep px** — this is a fixed-density pointer
instrument (`aesthetic-instrument` rule 10) and browser zoom (which scales px) is the
mechanism that applies here, not `rem`-based font-size preference. **The contract is:
the layout must survive 200% browser zoom at 1440px with no horizontal scroll**, which
is WCAG 2.2 AA 1.4.4 and is met by the ≤768px reflow already specified — at 200% zoom a
1440px viewport reports 720 CSS px and takes the mobile layout.

**Hierarchy is never carried by size alone** — every level has a second signal: weight
(500/600), family (mono vs sans), tracking (`+0.10em` on 11px uppercase), or a rule
above it. At the density this design runs, the gap between `--fs-eyebrow` 11px and
`--fs-body` 14px is 1.27× — not enough to carry hierarchy alone, which is exactly why
the second signal is mandatory.

---

## 8. Brand tokens

**Keep all existing tokens. Add four. Replace none.** New tokens follow the existing
naming and are declared in **both** `:root` and `[data-theme="light"]` — the light block
is 39 overrides and a token added to only one theme is the defect the file's own
comments document.

```
/* Absence — two states the board already produces and could not render. */
--absent-warn-fg      dark #fcd34d   light #a64c08    /* `!` unreadable, `?` unjudged */
--absent-warn-bg      dark rgba(255,170,60,.14)  light rgba(180,83,9,.12)

/* Posture — aliases onto the measured p0/p3 pairs. Aliases, not new colours:
   one hue for "expensive", distinguished by words (§6.5). */
--posture-expensive-bg   var(--p0-bg)     /*  9.59 dark / 6.47 light for its fg  */
--posture-expensive-fg   var(--p0-fg)
```

That is the whole addition. `--absent-warn-*` reuses the p1 values verbatim rather than
introducing a fifth amber, and the posture tokens are aliases so that a future change to
p0 cannot silently desynchronise them.

**Explicitly NOT added:** no new violet (tell #1 — `--status-gate` stays bound to gates
and gains no siblings); no new accent (`aesthetic-instrument` rule 2 — one accent, and
adding one is a decision, not a tweak); no shadow token (rule 1 — depth is a surface
step; the one existing shadow is on card hover and keeps its 6% accent glow); no radius
or spacing tokens (see §9 — real gap, deliberately not closed here).

**Token roles, restated so they cannot drift** (tell #8):

| Token | Role — and *only* this role |
|---|---|
| `--accent` | 1px border · 3px active-nav rail · 6% glow · badge-count fill · swatch. **Not a section background. Not a card fill.** |
| `--status-gate` | gates. Nothing else. |
| `--focus-ring` | the outer ring of the two-ring focus treatment. Never a border, never text. |
| `--mono` | anything a person would select and copy: slugs, models, versions, paths, money, timestamps, verdicts, postures, gate names, commands. |
| `--sans` | headings, nav, controls, prose. |

---

## 8.5 The numeric contract

**The mechanical criterion: a number that can be summed gets tabular figures and right
alignment; a number that cannot gets neither.** Both sides named.

| Tabular + right-aligned | Not tabular, left-aligned |
|---|---|
| cost (30d $, per-run $, budget cap/spent) | agent slug |
| run counts (`runs`, `runs_30d`) | model id (`opus-4.5`) |
| pass rate % | version (`v3.26.1`) |
| findings, P0 counts | gate name (`gate:ship`) |
| task/gate counts in nav badges | timestamps and relative times (`2h ago`) |
| budget percentages | verdict tokens (`DONE`, `BLOCK`) |
| token counts | bead ids (`great_cto-4f21`) |
| | posture names |

Model ids, versions, gate names, bead ids and timestamps are **identifiers, not
quantities** — you cannot add two of them, so they take neither treatment. They are
still `--mono`, because §8 assigns mono by *copyability*, not by numerality. Those are
two different questions and this table is where they visibly diverge.

**Column headers take the alignment of their data.** `RUNS`, `PASS`, `30d $` are
right-aligned headers; `AGENT`, `POSTURE`, `MODEL`, `LAST RUN` are left. Drawn in §3.3.

**Decimal alignment** on every column compared vertically: `30d $` and per-run cost
right-align on the decimal separator, not on the last glyph, so `$4.20` and `$11.40`
line up at the point.

**Precision by currency, not a hardcoded two.** The board is USD-only today
(`agent-budgets` in PROJECT.md are `$`). The rule for the implementer:
`Intl.NumberFormat(locale, {style:'currency', currency})` supplies the minor-unit count
— **do not hardcode 2**. JPY has none, TND has three. Display rule as shipped:

- totals and caps → currency minor units (USD: 2)
- per-run costs → 4 decimals, because `$0.0100` is a real and common value
- non-zero below the displayed precision → **`~0`**, never `0.0000`, never blank

**Negatives: minus sign plus a `▼` glyph, never colour alone.** Chosen once, here.
Not parentheses — this is not an accounting ledger and parentheses collide with the mono
inline-code idiom already on the page. Applies to cost deltas and pass-rate changes.
`aesthetic-instrument` rule 11 and ui-ux-pro-max `color-not-only`.

**Display vs stored precision.** Per-agent 30d cost is stored at full float precision
and displayed at 2dp in the roster. The Fleet › Spend total is **summed before
rounding**. Wherever rounded rows sit above a total, a footnote is required:

> Rows are rounded to the cent. The total is summed before rounding and may differ from
> the sum of the rows shown.

**Tabular figures are kept at every size on this board, including `--fs-num-xl` (52px).**
The large-display exception does not apply: these KPIs tick live over SSE, and
`aesthetic-instrument` rule 5 is explicit — a figure that changes width as it changes
value reads as motion the operator did not cause.

---

## 9. Responsive contract

Breakpoints, matching the existing `mobile-drawer.test.mjs` boundary so no test is
invalidated:

| Width | Layout |
|---|---|
| **≥1200px** | 240px sidebar + fluid content. Agent table at full 8 columns. Agent detail is an in-place expansion. |
| **768–1199px** | Sidebar collapses to a 56px icon rail (label in `title` + `aria-label`). Agent table drops `MODEL` and `RUNS`; `POSTURE`, `PASS` and `30d $` survive — **the expensive-grant signal never drops out at any width.** |
| **≤768px** | Sidebar becomes an off-canvas drawer (existing `@media (max-width: 768px)` block, existing focus-trap at `index.html:7777`). Nav becomes 4 bottom-anchored items. Table → stacked cards. Agent detail → full route. |

**What must never happen** (the existing test bought each of these with a real defect):
no horizontal scroll at 375px; the mobile block stays **after** every rule it overrides
(equal specificity, later wins); topbar actions must not overflow a `overflow:hidden`
container; 4-column stat grids reflow to 2, never lose a cell.

**Mobile-specific states** (the surface is used from a phone, so these are screens, not
error handling):

- **Offline at open** — the board is a localhost server; "offline" means the server is
  not running. Screen: empty state C with the last cached read and its timestamp, plus
  `Start the board: npx great-cto board` as copyable text.
- **Offline mid-action** — a gate approval POSTed while the server is gone. **Refuse,
  do not queue and do not act optimistically.** A gate is a human signature that appends
  a verdict and wakes a pipeline stage; an optimistic gate approval is a lie about an
  irreversible act. The button returns to its pre-click state and the error names the
  server.
- **SSE reconnect** — the fleet band keeps its last values, dimmed, prefixed `as of
  14:02` (Grafana `Keep last state`, L1). Never blanked.
- **Permissions** — n/a. The board requests no device permission: no notifications API,
  no camera, no location, no storage prompt. Stated so the implementer does not add one.
- **Perceived list performance** — first frame renders the **group headers with their
  counts** (8 rows), not skeleton agent rows. The counts are cheap and true; skeleton
  rows would promise agents whose shape is not yet known. Row height is **fixed at 44px**
  on mobile so the list does not shift as rows resolve. No pagination — 70 rows across 8
  collapsed groups fits.

**Touch targets:** ≥44px at ≤768px, including radio labels, view-select and the copy
buttons. The desktop 30–32px control height (`aesthetic-instrument` rule 10) is a pointer
density and **must not travel to the mobile block** — the existing rule at
`index.html:3046` (`button, [role=button], .nav-item, .toggle, summary { min-height: 44px }`)
already encodes this; keep it.

---

## 10. Motion contract

`MOTION_INTENSITY 2/10`. The governing rule is unusual and load-bearing:

> **Motion is permitted for state the operator caused, and forbidden for state the
> machine caused.**

A row appearing because an agent finished, a number ticking because SSE delivered, a
gate arriving in the queue — **none of these animate.** They swap. On a surface that
updates itself while being read, animated arrival is a demand for attention the reader
did not ask for, and it makes the page feel unstable rather than alive.

| Transition | Duration | Easing | Property |
|---|---|---|---|
| Nav drawer open (≤768px) | 200ms | `ease-out` | `transform: translateX` |
| Nav drawer close | 140ms | `ease-in` | `transform` — exit ~70% of enter (ui-ux-pro-max `exit-faster-than-enter`) |
| Row expand / group collapse | 160ms | `ease-out` | `grid-template-rows` on a `0fr→1fr` track |
| Hover / focus | 90ms | `linear` | `background-color`, `outline-color` |
| Confirm dialog | 120ms | `ease-out` | `opacity` + `scale(0.98→1)` |
| **SSE data arrival** | **0ms** | — | — |

Never animate `width`, `height`, `top` or `left` (ui-ux-pro-max `transform-performance`).
No stagger, no parallax, no scroll-driven anything.

**Reduced motion — not optional, and does not scale with the dial:**

```
@media (prefers-reduced-motion: reduce) {
  every transition and animation → duration 1ms, no transform
  the drawer opens and closes instantly, still trapping focus, still Esc-dismissible
}
```

The drawer's *function* — focus trap, `Esc`, the overlay — is unchanged under reduced
motion. Only the movement goes.

---

## 10.5 Platform integration contract

**n/a — this is a web surface only.** No native APIs, no device permissions, no deep-link
scheme beyond `#/` hash routes, no RN component substitutions. Stated rather than dropped
so nobody adds a notification permission prompt to a tool whose `docs/PRIVACY.md`
promises zero phoning home.

One platform note that *is* in scope: the service worker (`public/sw.js`) is subject to
the same `no-cdn` scan. Any asset this design introduces must be vendored under
`public/assets/`.

---

## 11. Out of scope — what this design deliberately does not cover, and why

| Not designed | Why |
|---|---|
| **List virtualization** | 70 rows across 8 collapsed groups. The only zero-dep virtualizer is one we would write, and unmounting rows breaks the `aria-activedescendant` keyboard path in §7.2. ui-ux-pro-max `virtualize-lists` triggers at 50+; **declined with reason**, which is different from overlooked. Revisit above ~300 agents. |
| **Spacing and radius tokens** | `aesthetic-instrument` names the real gap: 11 raw `gap` values, 11 raw radii, untokenised. Fixing it touches every rule in an 8,890-line file and would bury this redesign's diff. **Own finding, own change.** |
| **A framework, a build step, or a file split** | `no-cdn.test.mjs` and the zero-dep rule. Splitting 8,890 lines into modules is an architecture decision (`architect`), not a design one. |
| **`--serif`** | Resolves to Geist, is not a serif, and this design adds no use for it. Left alone. |
| **User-creatable saved views** | Five fixed views (§5) cover the questions the fleet actually raises. Arbitrary views need persistence, naming, sharing and a migration — a feature, not a screen. `⌘K` is the escape hatch. |
| **Charts** | Every figure here is a current value against a ceiling, and `BudgetBar` (§6.7) carries that. A time-series of agent cost is a real want and a separate surface with its own accessibility contract (`data-table` alternative, `screen-reader-summary`). |
| **The 44 commands and 40 skills as managed objects** | The brief names two management surfaces: agents and harnesses. Commands and skills appear as **counts** on the Claude Code host panel (§3.7) and nowhere else. Designing a third registry view without a stated job would be inventing scope. |
| **Multi-project / portfolio roll-up** | `lib/portfolio.mjs` exists and the switcher stays, but a cross-project fleet view is a different information architecture (a fourth level above Organization→Project→Agent) and would destabilise §5. |
| **Light-theme visual QA of the new components** | Every *token pair* used is measured here in both themes (§7.1, §7.3). Rendered-pixel verification is `tests/lib/rendered-contrast.test.mjs`'s job after implementation — the file's own comment records a 1.00:1 white-on-white bug that no token audit could see, so this must not be skipped. |

---

## 12. Open questions — each with a recommended default, so nothing blocks

| # | Question | **Recommended default (build this unless told otherwise)** |
|---|---|---|
| 1 | Does `Fired` in Inbox merge the old `notifications` history, or does it stay separate? | **Merge.** A fired notification is an inbox item that already resolved. One list, two filters. |
| 2 | Should `unclassified` gates really get the typed-name ritual (higher friction than some genuinely-expensive ones)? | **Yes.** Unknown cost is not low cost. The friction is also an incentive to add the gate to `gate-reversibility.mjs`, which is the actual fix. |
| 3 | `≈` prefix on estimated costs — everywhere, or only where estimate and measurement coexist? | **Everywhere `fleet.mjs` derives from `DEFAULT_TASK_MIN`.** Consistency beats economy; a reader must not have to remember which columns are honest. |
| 4 | Icon rail at 768–1199px, or keep the 240px sidebar to 768px? | **Icon rail.** 240px is 20% of a 1200px viewport, and the agent table needs the width more than the labels do. |
| 5 | `⌘K` already has `Go` / `Do` / `Gate`. Does the new `Agent` group also expose per-agent verbs (retire, raise budget)? | **No — `Agent` is navigation only in v1.** `Gate` executes because a gate is a decision with one obvious verb; an agent has several, and putting `Retire` one fuzzy-match away from `Approve` in the same list is a mis-click with a sidecar file behind it. |
| 6 | Does the fleet summary band (`70 agents · 14 expensive · 2 not classified`) appear on Inbox too? | **No.** Inbox answers "what needs me". A count of expensive grants is not a decision waiting. |
| 7 | Retired agents — hidden from `All 70`, or shown dimmed? | **Hidden**, with their own view and their count in the chip. `All 70` means the 70 live ones; `isRetired()` already sidecars them. |
| 8 | Two-ring focus treatment — `box-shadow` or `outline` + `outline-offset`? | **`box-shadow` with two rings.** `outline-offset` leaves the gap transparent, so on a solid chip the ring still lands partly on the chip. A painted inner ring guarantees the surface. |
| 9 | Should the mobile bottom nav show counts? | **Inbox only.** Four badges is noise; the one that means "a human is blocking" earns its badge. |
| 10 | Are the two new `ABSENCE` keys added to `design-contract.test.mjs`'s required set? | **Yes**, in the same commit that adds them. A vocabulary with an unenforced member drifts back to a blank. |

---

## 12.5 Destructive actions and the cost of recovery

Required by the artifact contract, and by ADR-009: a surface may not present an
action whose confirmation is cheaper than its recovery.

| Action | Where | Cost of recovery | Affordance required |
|---|---|---|---|
| **Approve `gate:ship`** | Decisions | **Not recoverable by this tool.** Publishes to a registry, pushes to a shared remote, spends money. `gate-reversibility.mjs` classes it `expensive` (escapes-the-machine, costs-money) | Second confirmation naming what escapes; never a single click; never the same chip as `gate:arch` |
| **Approve `gate:import`** | Decisions | Overwrites a client's data; classed `destroys-evidence` | Same, plus the row count it will overwrite |
| **Reject any gate** | Decisions | Recoverable — the stage runs again | Single click, no confirmation |
| **Set `second_opinion`** | Harness | Recoverable — one line in PROJECT.md, reversible by writing another | Single click; the reply states the previous value, so a silent replacement is visible |
| **Retire an agent** | Fleet | Recoverable — renames the file; `restore` undoes it | Single click, undo toast |
| **Set an agent budget** | Ledger | Recoverable, but a cap can halt dispatch | Single click; must show the previous cap |

**Two rules the components enforce:**

1. **An `unclassified` gate never gets the cheap affordance.** A gate this tool
   has not classified sorts to the top and takes the expensive treatment.
   Defaulting an unknown cost to "cheap" is the governing defect wearing a colour.
2. **No destructive action is ever the default focus.** Keyboard focus on a
   decision row lands on reject/defer, never on approve.

## 13. Implementation hand-off

Ordered checklist for **senior-dev**. Target files, in order. Every step is
independently testable; each ends green before the next begins.

**Target:** `packages/board/public/index.html` (sole implementation file)
**Also touched:** `packages/board/design-contract.test.mjs`,
`packages/board/mobile-drawer.test.mjs` (extend, do not weaken)
**Not touched:** `packages/board/lib/routes.mjs` — **no API change is required by this
design.** Every field it needs is already served.

| # | Step | File / anchor | Done when |
|---|---|---|---|
| 1 | Add `--absent-warn-fg/-bg` and the two `--posture-*` aliases to **both** `:root` and `[data-theme="light"]` | `index.html` `:root` ~L45, light ~L136 | `tests/lib/contrast.test.mjs` green in both themes |
| 2 | Extend `ABSENCE` with `unreadable: '!'` and `unjudged: '?'`; extend the required-keys assertion | `index.html` ~L7069; `design-contract.test.mjs` ~L28 | glyph-uniqueness test still passes with 5 keys |
| 3 | Replace the `☀️`/`🌙` emoji toggle with inline SVG + destination-stating `aria-label` | `index.html` L16, L1161 area | no emoji remains in a control; anti-slop tell #5 clear |
| 4 | Implement the **two-ring focus** treatment globally on `:focus-visible` (§7.1) | `index.html` focus rules | ring lands on a container surface for every solid chip; add an assertion that no `:focus` rule sets `outline: none` without a `box-shadow` replacement |
| 5 | Build `StatusDot` (§6.3) as the single status primitive; route every existing status render through it | `index.html` script section | one function; no other code path emits a status colour |
| 6 | Build `GateChip` (§6.2) on `reversibilityOf()`; add the typed-name gate in front of the existing `approveConsequence` confirm for `expensive` + `unclassified` | `index.html` `gateAction` | `gate-affordances.test.mjs` still green; **add** a test that `expensive` cannot be approved without a name match |
| 7 | Build `PostureStrip` (§6.5) on `postureOf()`, incl. the `scopedInNameOnly` row strip | `index.html` | `fleet-classify.test.mjs` unaffected; expensive and routine chips visually distinct without colour |
| 8 | Rebuild the nav to the 4-item model (§5); map the 8 old tabs per §2; keep `role="tablist"` + arrow keys and the existing focus trap at ~L7777 | `index.html` ~L3096 | every old `data-tab` value still resolves via `switchTab` (no dead deep links) |
| 9 | Build `Fleet › Agents` (§3.3) — 5 saved views, 8 groups from `deriveDomain()`, one tab stop + `aria-activedescendant` | `index.html` new panel | 70 agents = 1 tab stop; `↑↓` traverses; `→←` collapses groups |
| 10 | Build `AgentDetail` (§3.5) as in-place expansion + `#/fleet/agents/<slug>` route | `index.html` | deep link expands the group and focuses the row |
| 11 | Build `Fleet › Harnesses` (§3.7) — **radio group, no switch**; inline resolved-state preview; evidence tail with dimmed `skipped` rows and the `unreadable_lines` footer | `index.html` new panel | `harnesses.test.mjs` green; a `skipped` row is visually and semantically distinct and excluded from `blocked` |
| 12 | Build `BudgetBar` (§6.7) incl. the **no-track** rendering for an undeclared cap | `index.html` | absent cap draws no track; empty track means zero spent |
| 13 | Apply the numeric contract (§8.5) — tabular + right on the summable set, header alignment matching data, `~0`, `≈` for estimates, `Intl.NumberFormat` currency minor units, the rounding footnote | `index.html` all figure renders | no hardcoded `.toFixed(2)` on a currency remains |
| 14 | Implement the four empty states (§6.10), with A and B visually distinct | `index.html` | `Needs attention 0` reads as success, not as failure |
| 15 | Responsive pass (§9): icon rail 768–1199, cards ≤768, `POSTURE` column survives every width | `index.html` mobile block | `mobile-drawer.test.mjs` green; no horizontal scroll at 375px; mobile block still last |
| 16 | Motion pass (§10) incl. the `prefers-reduced-motion` block and **0ms for SSE-driven change** | `index.html` | no transition on a machine-caused update |
| 17 | Full suite | `packages/board/` | `no-cdn`, `design-contract`, `gate-affordances`, `mobile-drawer`, `harnesses`, `degraded-ui`, `stale-board`, `fleet-*` all green |
| 18 | Rendered-pixel contrast check in **both** themes | `tests/lib/rendered-contrast.test.mjs` | no pair below its floor — the white-on-white bug the file documents was invisible to token audit |

**Assumption stated at handover, as the stance requires:** no visual reference beyond
the repo itself was available (§0.5), and no direction was surveyed, because a system
already governs this surface — `skills/aesthetic-instrument/SKILL.md`, measured out of
this very file. Every visual value here is lifted from it or from `index.html`
unchanged. **No low-fi alternates are attached, and that is correct for the "a system
governs" row of the stance table** — alternates belong to the greenfield rows.

---

## Related

- [BRIEF-board-redesign-2026-09](../product/BRIEF-board-redesign-2026-09.md) — the
  product brief this contract implements: jobs-to-be-done, the four-tab
  information architecture, and the measurable success criteria.
- [project-capabilities](../reference/project-capabilities.md) — the three-state
  vocabulary the status components render.
