# Product Brief — great_cto admin board: from project-viewer to fleet control surface

Analysis + prioritised improvement plan. Not a new product — a reprioritisation of an
existing internal tool. Evidence paths are relative to the repo root. Two audits (endpoint
project-scoping, UI empty-state handling) and a 4-persona / 3-model debate back the ranking.

---

## Recommendation

**BUILD — one merged work stream: make the data layer honest, and on top of it build the
one screen the board is missing (a cross-project "fleet" home).** These are not two bets.
The decisive reason: the board's job is to allocate one human's attention across ~22
autonomous projects, and today it does neither of the two things that job requires — it
can't show the fleet in one view, and it can't tell "nothing is happening" apart from "I
couldn't read." Fixing the second is the precondition for the first, and the audit shows
it's cheap (one chokepoint function), not a slog.

---

## Problem

- **Who** — one person acting as CTO over ~22 parallel projects (registry in
  `~/.great_cto/projects.json`), each built and run by AI agents through a gated pipeline.
  They open the board a few times a day, between other work, to answer four questions:
  *what needs me right now · did that stage actually happen · what is this money going on ·
  is this project moving or stuck.*
- **Cost of the pain today (two compounding failures):**
  1. **The board answers every question for ONE project at a time.** There is no
     cross-project view anywhere in the code — "fleet" in `lib/fleet.mjs` means
     *agents-within-one-project*, not projects. To survey the portfolio the CTO operates the
     switcher 22 times. Arithmetic: 22 projects × ~3 opens/day × a switch-and-scan each ≈
     **~66 manual context-switches a day just to learn where attention is owed** — and the
     scarce resource being spent is the one thing the whole system exists to conserve: the
     human's decision bandwidth. The real cost isn't the seconds; it's the **missed gate**.
     Human approval gates are the pipeline's throughput bottleneck: a gate waiting in project
     #17 is invisible until the CTO happens to switch there, so agents sit idle and a project
     silently stalls for hours behind a decision that takes one minute.
  2. **A read that failed looks identical to an absence of data.** The audit found only
     **2 of ~20 readers** distinguish "empty" from "couldn't read" (`getTasks` → `/api/tasks`
     and `/api/logs`). Everywhere else a failed read renders as a reassuring zero — the board
     is **most confident exactly when it knows least** ("all clear, nothing needs your
     decision" over an unreadable task file). The switcher-leak bug just fixed (16/18
     endpoints ignored the selected project) was the same disease at the routing layer: a
     project with real work showed 0 everywhere.
- **Why now** — the switcher fix exposed that the board is being *trusted* as a control
  surface while it can silently lie, and the number of projects (22) has passed the point
  where a per-project tool can be held in a human's working memory.
- **Success metric** — the CTO opens **one** screen first thing and, in one glance, sees
  every decision owed across all projects and every project that has gone quiet — and
  **never** sees a confident "all clear" that was actually a failed read. Behavioural proof:
  the portfolio screen becomes the default landing and individual-project views become
  drill-downs, not the starting point.

---

## The bet

**One work stream, foundation-first, in this order — but shipped as one honest surface:**

1. **Make `readVerdicts()` honest and project-scoped** (the chokepoint). It feeds
   metrics, cost, pipeline, inbox, resume, and agent stats — 6 surfaces — and today returns
   `[]` on any failure with no signal (`lib/verdicts.mjs:7`). Give it a degradation return
   and ensure every caller passes the project dir. This single fix simultaneously (a)
   un-blinds those 6 panels and (b) closes the two remaining scoping leaks the audit
   found — `/api/agents/:slug` (profile ignores `?project`, shows all-project stats;
   `lib/fleet.mjs:225`) and `/api/resume`'s decisions section (reads the global legacy log
   instead of the project's; `lib/share.mjs:30`).
2. **Build the Portfolio Home on top of it** — a cross-project screen that fans the
   existing per-project readers across the registry and rolls up. Every project row shows
   **`unread`**, never a fake zero. Trust is not a separate PR; the honest per-project status
   *is* the primitive the fleet view is built from.

**Smallest version that tests it:** a read-only page, one row per project, three columns —
*decisions-owed (gates/P0/blocked) · last-movement · spend* — plus an explicit `unread` state
per cell. No sorting, no drill-down, no charts. Ship it; watch whether the CTO stops using
the switcher. If they live on that page for a week, the product is found.

---

## Differentiated wedge

This is not a generic project dashboard, and the design should refuse to become one. The
board's single job is **attention allocation for one human supervising many autonomous
agents** — so its differentiator is *honesty as a first-class feature*: it must never spend
the human's attention on a false alarm, and never hide a real one behind a zero it couldn't
verify. A normal dashboard optimises for "show the numbers"; this one optimises for "tell me
what's owed, and tell me when you don't know." Aggregation without that honesty is worse than
no aggregation — it launders 22 unverified zeros into one confident number that *feels* like
signal.

---

## Debate digest

Panel: Visionary (Opus), Skeptic (Sonnet), User-advocate (Haiku), Pragmatist (Sonnet;
Kimi router unavailable in this env). Two rounds.

| | Position |
|---|---|
| **Strongest FOR (Portfolio)** | "Today he isn't a CTO of 22 projects — he's a project-switcher who visits 22 dashboards and hopes working memory stitches them into a portfolio. The job 'what needs me right now across the fleet' does not exist as a screen. One glance replaces 66 context-switches; the scarcest resource — one human's attention — finally gets *allocated*, not scavenged." |
| **Strongest AGAINST (naïve Portfolio)** | "A portfolio built on readers that can't tell empty from broken multiplies the lie by 22. Aggregation *launders* failure — a single '0' is suspicious, but 22 zeros rolled into one number feels like signal. You'd build a machine optimised to produce confident-looking wrong answers faster." |
| **The user (CTO)** | "I don't trust any summary view yet — the switcher just burned me. Fix honesty first: tell me 'couldn't read project-12' instead of silence. Then a portfolio, but only if it shows uncertainty ('2 blocked, 1 unknown'). And make it a decision *queue* that pushes me — right now it's a surveillance tool I avoid, so I check projects one-by-one." |
| **What flipped it** | The code audit. The trust fix looked like a 20-file slog (Skeptic's fear) but **collapses to one chokepoint** — `readVerdicts()` — making it hours, not days. That dissolved the "Trust vs Portfolio" framing: same brick, question is only order. All four converged: **Trust is the precondition, Portfolio is the destination, and they should merge into one work stream** (portfolio rows render `unread` from the first commit). The Visionary conceded sequencing; the Skeptic conceded Portfolio is the real job-to-be-done. |
| **Dissent still on the table** | Pragmatist: guard hard against gold-plating a screen opened 3×/day — no sorting/filtering/trend-charts in v1. User: the highest-value follow-on is *push* (don't make me poll), not more depth. Both are captured below as P4 / anti-scope, not v1. |

---

## Scope

**In (v1):**
- Honest `readVerdicts()` (degradation + project-scoping) and the two leak fixes it unlocks.
- `/api/projects` emits the already-computed `getRegistryDegradation()` — today a corrupt
  `projects.json` makes the switcher look *empty*, silently (`lib/projects.mjs:29`); the
  switcher itself can lie.
- Portfolio Home: read-only fleet table (decisions-owed · last-movement · spend · state),
  with an explicit `unread` per project. Becomes the default landing.

**Out (v1) — explicit anti-scope:**
- Sorting / filtering / drill-down / real-time refresh / trend charts on the portfolio.
- Deeper single-project observability (transcripts already exist in the Sessions tab; no
  evidence anyone is blocked by lack of depth — the two real defects were correctness and
  honesty, not depth).
- Agent-taxonomy frontmatter migration and other reader-internal refactors.

---

## Prioritised improvement plan

Ranked by value to the one user, not by ease. Cost is rough build-effort.

| P | Improvement | The CTO question it answers | Cost |
|---|---|---|---|
| **P0** | **Honest chokepoint** — `readVerdicts()` returns empty≠unread and honours project dir; fixes `/api/agents/:slug` + `/api/resume` scoping leaks in the same change; `/api/projects` emits registry degradation. | "Can I trust this? Did that stage *actually* happen, or did the board just fail to read?" — and un-blinds 6 panels + a lying switcher at once. | **~0.5–1 day** (mechanism already exists for tasks/logs; this is propagation through one function + 3 wirings) |
| **P1** | **Portfolio Home** — one cross-project screen: fleet-wide decisions-owed queue (all gates/P0/blockers, ranked by wait-time), stuck-project list (no movement in N days), total + per-project spend, per-project state. Built on P0's honest readers; rows show `unread`. Default landing. | "What needs me *right now* across everything? Which projects are stuck? Where's the money going, fleet-wide?" — the screen that today does not exist. | **~1–2 days** (thin loop over readers that already take `?project=`; registry already lists all) |
| **P2** | **Finish the trust surface** — wire the existing `X-Board-Degraded` mechanism into the 4 blind tabs (Dashboard, Cost, Memory, Agents), and handle total network failure (`fetch → null` sets no header today, so even the "honest" tabs show empty silently on a full outage). | "When a *specific tab* is blank, is that real or broken?" | **~0.5 day** |
| **P3** | **IA cut (8 → ~5 sidebar items)** — see Removals below. Do opportunistically while touching these files for P0–P2, not as its own project. | "Where do I go for X?" — less sprawl, more trust. | **~0.5 day** |
| **P4** | **Push the decision queue** — the portfolio "needs-me" items fire a notification when they land (email/VAPID infra already exists in `lib/notifications.mjs` / `/api/push/*`), so the CTO stops polling 22 projects. | "Tell me when something needs me — don't make me look." | **~1 day** (v1.1, after P1 proves the queue) |

---

## REMOVE / MERGE (a tab nobody opens is worse than a missing one)

| Surface | Verdict | Why |
|---|---|---|
| **Docs tab** | **REMOVE (or implement)** | Dead stub. Perpetual `loading…` (`index.html:2492`), no `loadDocs`, no `switchTab` branch, hardcoded count 0. It occupies a sidebar slot and quietly undermines trust in the rest of the UI. The `/api/doc` *backend* is used elsewhere (verdict artefact links) and stays — only the broken sidebar tab goes. |
| **Sessions + Logs** | **MERGE → one "Activity" tab** | Both are session history (Logs = summaries, Sessions = raw transcripts). "What did the agents do" is currently smeared across 4 surfaces (Logs, Sessions, Inbox's Resume card, Dashboard timeline). One tab with a summary↔transcript toggle covers both. |
| **Agents fleet** | **DEMOTE into Dashboard** | Orphaned — no sidebar entry, reachable only via the `g a` hotkey. Dashboard already shows agent-runs and agent-cost bars; make the full fleet a drill-in from there. (Its own authors note showing all 35 agents by default "is noise.") |
| Inbox · Kanban · Dashboard | **KEEP** | The only three surfaces with genuine daily value. Inbox is the core; Kanban is the workspace; Dashboard answers the money question. |
| Notifications · Share | **KEEP as config** | Set-and-forget panels, not daily views. Correct as-is. |

Net: sidebar shrinks from **8 → ~5** meaningful entries, and the new Portfolio Home sits
above all of them as the landing.

---

## What the board answers well today, and what it can't

| Answers well (single project) | Cannot answer at all |
|---|---|
| "What needs me *in this project*" — Inbox is a strong, honest hub (gates, P0, blocked, stale; degradation-aware greeting + banner). | "What needs me across **all** projects" — no cross-project view exists. |
| "Where's the money in *this project*" — Cost panel is genuinely good (total, projected month vs budget, daily burn on active-days, top-features-by-spend). | "What's the **total** fleet spend / which **project** is burning most" — no roll-up. |
| "Did *this* stage run" — pipeline track shows per-stage status/message/age. | "Did it run, or did we just fail to read?" — pipeline shows `idle` for both a genuinely-unstarted stage and an unreadable verdict log. |
| "What did agents do here" — Sessions/Logs/Resume. | "Which of my 22 projects has gone **quiet** and never pinged me" — no stuck-project detection across the fleet. |

---

## Risks & kill-criteria

| Risk | Kill / stop threshold [owner · source] |
|---|---|
| Portfolio doesn't change behaviour — CTO still opens individual projects first. | If after **1 week** the CTO's first-open is still a single-project view, not the portfolio → the screen missed the job; stop adding to it and re-interview what's missing. [owner: CTO · source: self-observation] |
| Gold-plating a 3×/day screen. | If **P1 slips past ~3 days**, scope has bloated → cut back to the flat read-only table, ship, iterate. [owner: CTO · source: build calendar] |
| Trust fix incomplete — a degraded read still renders as a confident zero. | If a fault-injection test (unreadable verdict log / dir) produces **any** confident "0 / all clear" after P0+P2 → not done; do not ship the portfolio on it. [owner: implementer · source: a degraded-state regression test, extending `degraded-ui.test.mjs`] |
| Merge seam — Portfolio built before readers are honest. | Gate: the portfolio row must be able to render `unread`; if it cannot, the reader underneath is still lying → block. [owner: reviewer · source: code review of P1] |

---

## Open questions for the architect / implementer (the HOW, left open)

1. **Aggregation location** — roll up server-side (a new `/api/fleet` that loops the
   registry) vs client-side (fan out N `?project=` calls, render as they land)? Client-side
   is cheaper and shows partial results honestly (each row resolves independently, `unread`
   until it does); server-side is one round-trip but blocks on the slowest project. Lean
   client-side for v1, but it's the architect's call.
2. **"Stuck" definition** — what threshold makes a project "quiet"? Last verdict / last task
   transition older than X hours? Needs a number, and it may differ by archetype.
3. **Cost roll-up window** — the portfolio spend column: rolling 30d, projected-month, or
   both? Per-project budget breach is the high-signal event.
4. **`readVerdicts()` degradation shape** — reuse the `readSafe`/`readDegradation` primitives
   already in `lib/util.mjs`, or a lighter per-call flag? Keep it consistent with the
   `X-Board-Degraded` contract the front end already understands.
5. **Push scope (P4)** — which portfolio events warrant a push (new gate? stuck-project
   crossing the threshold? budget breach?) without becoming noise the CTO mutes.

---

*Process note: this is an internal-tooling improvement brief, not a new-product build. It
deliberately does not open a `gate:product` / architect handoff — the work is a
reprioritisation of an existing surface, and the task that commissioned it scoped the output
to this document.*
