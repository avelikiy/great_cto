---
surface: web
feature: board-declutter
status: approved by the owner on 2026-11-10 (mockup version 10: Home and Cost, desktop and phone); not implemented
date: 2026-11-10
audited-version: 3.76.1
design: https://claude.ai/artifact/5RGTJp7zZkfn3RwQSTgSQG
---

# UX audit of the board, November 2026

**Request.** "Run a UI/UX analysis of the admin: what should be improved so that a user really
finds it clear and convenient to use. Right now it is overloaded with information."

**Verdict.** The board is overloaded because every screen answers "what do we have on record"
and no screen answers "what should I do now". The same fact is counted in four places with four
different results, each screen carries its own caveats, and internal mechanism names are shown as
if they were user concepts. The visual layer (colors, type, contrast, both themes) is in good
shape and is not the problem.

**Nothing in this document is implemented.** The owner approved the mockup linked above on
2026-11-10. The approval covers what the mockup shows: Home, Cost and the navigation, on desktop
and phone. Settings, task detail, first run and Knowledge (F6, F7, F9, F14, F15) are described
here in words only and need their own mockup before they are coded. Items marked
"design change: no" can go through normal review.

## 1. Method

- Walked every screen and tab of the live board (`localhost:3141`, project `great_cto`,
  version 3.76.1) at 1440×900 and 375×812, light and dark theme: Work (list, filters, task detail
  with Overview / Execution / Evidence), Decisions (with Project status opened), Knowledge,
  Insights (Outcomes, Consumption, Ledger & budgets), Settings (Executors, Runtime, Capabilities,
  General).
- First run: a separate copy of the board on another port, started in an empty git directory,
  stopped right after the check.
- Counted what is visible above the fold with a DOM script: interactive elements, numbers,
  badge-like elements, words, and page length in screens.
- Contrast was computed from rendered colors for every visible text node; focus and accessible
  names were read from the DOM.
- Reference research: the Refero service was not available in this session (no active
  subscription), so no live references were pulled. The proposal leans on well-known patterns
  named in section 6, and that section says so.
- The board was restarted on 3.77.0 by another session during the audit. Findings describe
  3.76.1 and were not re-checked on 3.77.0.

Screenshots are in [`ux-audit-2026-11/`](ux-audit-2026-11/). They show only the `great_cto`
project. Settings › General was not captured: it lists every registered project and its local
path (see F15).

## 2. Who uses the board and for what

| User | Situation | Needs |
|---|---|---|
| Owner / CTO running several projects | Opens the board a few times a day, often from a phone | The four jobs below, in seconds |
| Outside user of the open-source tool | Sees the board for the first time, with an empty or small project | To understand what the board is and what to do first |

| Job | Clicks today | What the user gets today | Proposed |
|---|---|---|---|
| J1. What needs my decision now | 1 (Decisions) | "nothing waiting" above a list of 18 items; badge says 51, then 8 | 0 — Home opens on the list |
| J2. What are the agents doing, is something stuck | 2 (Decisions › Project status, or Insights › Ledger) | Two answers that disagree: "Running 0" and "6 running now" | 0 — one tile; 1 for the list |
| J3. What did it cost | 2 (Insights › Ledger & budgets) | The default Insights tab shows zeros and "Unavailable"; two totals 30× apart on two tabs | 0 for the total, 1 for the breakdown |
| J4. What shipped | 2 (Work › Completed) | A flat list of 890 rows | 0 for the count, 1 for the list |

## 3. Overload, measured

Above the fold at 1440×900, main area plus chrome.

| Screen | Interactive elements | Numbers | Words | Page length | Notes |
|---|---|---|---|---|---|
| Work (landing) | 30 | 17 | 276 | 16.6 screens | 240 rows in a scroll box inside the page |
| Decisions | 96 | 135 | 470 | 2.1 screens | 77 / 91 / 257 with Project status opened |
| Knowledge | 20 | 8 | 116 | 29.5 screens | 318 documents in one list |
| Insights › Outcomes | 14 | 10 | 157 | 1.0 | every value is 0 or "Unavailable" |
| Insights › Consumption | 16 | 46 | 235 | 3.2 | 9 blocks |
| Insights › Ledger & budgets | 25 | 45 | 228 | 1.6 | 10 badges |
| Settings › Executors | 30 | 70 | 272 | 1.2 (10.5 on a phone) | 11 badges, a red one in every row |
| Settings › Runtime | 17 | 39 | 258 | 1.3 | |
| Settings › Capabilities | 18 | 111 | 244 | 32.3 screens | 303 rows with SHA-256 hashes |
| Settings › General | 23 | 10 | 167 | 5.8 screens | the actual settings |
| Task detail | 18 | 15 | 132 | 1.0 | three tabs, all "Unknown" for a legacy task |
| **Proposed Home** | **13** | **9** | **about 150** | **1.0** | |
| **Proposed Cost** | **9** | **16** | **about 130** | **1.0** | |

**The same thing, counted in different places** (all read within ten minutes, same project):

| Question | Where | Value |
|---|---|---|
| How many items need attention | Sidebar badge on Decisions | 51, later 8 |
| | Decisions header | "nothing waiting", "All clear" |
| | Decisions list "Waiting on work elsewhere" | 18 |
| | Work filter "Needs attention" | 8 |
| | Ledger "Stuck · in progress over the line" | 77 |
| How many agents are running | Work filter "Running" | 0 |
| | Ledger "Running now" | 6 |
| | Decisions "Active pipeline" | "running", with stages last active 122–2308 hours ago |
| What did 30 days cost | Ledger | $52 "spent · measured" |
| | Consumption | $1,505 "at API list price" |
| | Outcomes "Cost per accepted task" | "Unavailable" |
| How many tasks are tracked | Top bar | 1130 issues |
| | Work | 240 active, 890 completed |
| | Outcomes | 0 tracked tasks |

**Internal terms shown without explanation:** verdict, gate, harness, receipt, posture, judge,
"T1 · 1 gate · cheap judge", `code.destructive +3`, "mechanical+judge", "over the line",
"Host not linked", "Stage not recorded", "legacy work item", "second opinion", "executors",
"capabilities". The UI has no glossary and no inline help.

**Caveats shown as body text** (one or more on every screen): "Recorded activity is not proof of
current liveness or task acceptance", "Display only, not an execution plan or proof of
expertise", "Recorded completion, not an acceptance-rate estimate", "Unknown means evidence is
unavailable, not zero or success", and nine more of the same kind. They are correct, and they
bury the content they qualify.

## 4. Findings

Priority: P0 blocks a main job, P1 makes a job slow or confusing, P2 is polish or a narrow case.
Effort: S up to a day, M several days, L more than a week.

| ID | P | Screen | Evidence | Why it hurts | Proposed change | Effort | Design change |
|---|---|---|---|---|---|---|---|
| F1 | P0 | Decisions, sidebar, Work, Ledger | Table above; [decisions-desktop.jpg](ux-audit-2026-11/decisions-desktop.jpg) | The owner cannot trust any "needs you" number, so every visit turns into reading lists | One Home screen with one definition of "needs you" (gates waiting, blocked tasks, sessions waiting for a reply). The sidebar badge shows the same number. Stale tasks are a separate, smaller count | M–L | Yes. The single counting function behind it is not |
| F2 | P0 | Work (landing) | [work-desktop.jpg](ux-audit-2026-11/work-desktop.jpg): 240 rows, default filter "All active", every row ends with "Host not linked · Stage not recorded", status shown as raw `Issue: deferred` | The first screen is a backlog dump. Two of three columns carry no information | Home opens first. On Work: default filter "Needs attention" when it is not empty, drop a column when all its values are empty, plain status words, page scroll instead of an inner scroll box | M | Yes |
| F3 | P0 | Decisions › Project status, Ledger | "Running 0" against "6 running now"; pipeline strip with "2308h ago"; a live log of raw tool names (`mcp__…browser_batch ✓`) from any session on the machine | J2 has no answer. The live log is noise for everyone except the person debugging hooks | One liveness source. Home shows "N running, M stale". Pipeline strip, tool log and turns move behind "Show activity log" | M | Yes, plus a data fix |
| F4 | P1 | Insights (three tabs) | [ledger-desktop.jpg](ux-audit-2026-11/ledger-desktop.jpg); default tab is all zeros; $52 and $1,505 on different tabs; budgets listed twice on one screen; Ledger also holds "Running now", a pipeline strip and a "Stuck" list | J3 takes two clicks and ends with two totals that look contradictory | One Cost screen: both totals side by side with a one-line explanation each, one "over cap" alert, one table with a Cap column. Outcomes is hidden until it has data. Consumption becomes "Token detail" | M | Yes |
| F5 | P1 | All | Section 3: terms and caveats | A first-time user cannot read the screen; a returning user learns to skip grey text, including the caveat that matters | One "About this data" link per screen that holds the caveats. Plain labels on first level, the internal term in the detail view. A short glossary page in Knowledge | S–M | Yes (where text sits) |
| F6 | P1 | Settings | [settings-executors-desktop.jpg](ux-audit-2026-11/settings-executors-desktop.jpg): Settings opens on a 73-agent table; a red `code.destructive +3` badge in every row; Capabilities is 32 screens of hashes; the real settings are the fourth tab; the top bar has a second Settings button | The user who wants to change a setting lands in a fleet inventory. A warning on every row is not a warning | Settings opens on General. Agents and Skills become "Agents" and "Skills" under a Tools group. The permission badge shows only when an agent differs from the baseline. Hash and byte columns move to the row detail | M | Yes |
| F7 | P1 | Task detail | [task-evidence-desktop.jpg](ux-audit-2026-11/task-evidence-desktop.jpg): title printed twice, three tabs, Evidence is five "Unknown" lines each with a disclaimer, next action is "Inspect the linked issue" | Three clicks to learn that nothing is recorded | One page. Sections appear only when they have a record; otherwise one line: "No run, check or review is linked to this task" | S–M | Yes |
| F8 | P1 | Mobile, all screens | [ledger-mobile.jpg](ux-audit-2026-11/ledger-mobile.jpg): two banners take 27% of the first screen; [decisions-mobile.jpg](ux-audit-2026-11/decisions-mobile.jpg): the status card scrolls sideways and no decision is visible; [work-mobile.jpg](ux-audit-2026-11/work-mobile.jpg): list in a 480px box, 38 screens long; 2–5 tap targets under 40px per screen | The phone is where "what needs me" is asked most often, and the first screen does not answer it | One-line dismissible banner, the list first, no sideways scroll, page scroll, 44px targets | M | Yes |
| F9 | P1 | First run | [empty-project.jpg](ux-audit-2026-11/empty-project.jpg): five filters with zeros and "No work records match this filter."; Decisions of the empty project shows "43 P0 in 4 other projects are waiting on you" and puts 43 on its badge | A new user gets no hint what the board is for or what to do. The cross-project count is confusing for the owner and wrong for the badge | Empty state with three steps and the "New task" form already open. Other projects' items are shown in the project chooser, not on this project's badge | S | Yes |
| F10 | P2 | Any, after a viewport change | [layout-shift-bug.jpg](ux-audit-2026-11/layout-shift-bug.jpg): the `.board` container (overflow hidden) was scrolled 464px to the left, the sidebar left the screen and an empty side panel showed. There is no way to scroll back. Seen once, after switching from phone to desktop width and tabbing | The page looks broken until reload | Keep the closed side panel out of the scrollable width, or reset `scrollLeft`. Add a regression test | S | No — it returns the page to the approved look |
| F11 | P2 | All | Contrast: 0 failures out of 286 text nodes, in both themes. 58 text elements under 12px on Decisions; 25 clickable `div`s that Tab skips; 14 `h1` in the document; no skip link; focus ring is visible | Keyboard and screen-reader users cannot reach or name part of the interface | Real buttons for clickable rows, one `h1` per view, a skip link, 12px minimum | S–M | Font size: yes. The rest: no |
| F12 | P2 | Top bar | "1130 ISSUES", theme toggle, a second Settings button, "+ New issue" next to a "New task · prepare launch command" disclosure in the page | Two ways to create work with different meanings; three controls nobody needs on every screen | One primary action, "New task". Counter removed. Theme stays in Settings | S | Yes |
| F13 | P2 | All | "Observed 2026-11-10T15:15:58.645Z", "2308h ago", "388h" | The user converts hours to days by hand | "updated 1 min ago", "96 days ago" | S | Borderline: same block, different text. Confirm with the owner |
| F14 | P2 | Knowledge | 318 documents, 29.5 screens in a side list | Finding a document means scrolling or knowing its name | Groups collapsed by default, search focused on open | S | Yes |
| F15 | P2 | Settings › General | Lists every registered project with its local path, and the alert e-mail address | A screenshot or screen share of Settings leaks private project names. The existing `docs/screenshots/settings.png` should be re-checked against this | Paths hidden behind "Show path"; a demo mode for screenshots | S | Yes |
| F16 | P2 | All | The "board is running vX — vY is installed" banner is full width and stays | It pushes every screen down for a message that needs one action a day at most | One line in the sidebar footer: "update ready" | S | Yes |

## 5. Proposal

Mockup, current next to proposed, desktop and phone:
https://claude.ai/artifact/5RGTJp7zZkfn3RwQSTgSQG

The proposal removes, merges and hides. It adds one screen (Home) and removes one (Decisions),
so the sidebar keeps five items.

**Navigation.** Home · Work · Cost · Knowledge · Settings. Agents, Skills and Runtime sit in a
Tools group inside Settings. Existing deep links keep working.

**Home (new landing screen).**

| Removed from the first screen | Where it goes |
|---|---|
| Work list as the landing screen | Work; Home opens first |
| "Decisions" as a separate destination | Home, section "Needs you" |
| "nothing waiting", "All clear" | Replaced by one count |
| "Pick up where you left off", pipeline strip, tool log, turns | Behind "Show activity log" |
| Stale in-progress rows | One tile, linked to Work with the filter set |
| "1130 ISSUES", second Settings button, theme toggle | Settings |
| Project tags under the project name | Project chooser |
| Caveat sentences | "About this data" |
| Version banner | Sidebar footer |

**Cost (replaces Insights).**

| Removed | Where it goes |
|---|---|
| Three tabs | One screen |
| Outcomes tab | Hidden until it has data |
| Consumption tab | "Token detail" link |
| Running now, pipeline strip, Stuck list | Home and Work |
| Second budgets list | One table with a Cap column |
| "63 installed agents have not run" block | Collapsed last row |

One assumption in the mockup needs the owner's check: the line "On a subscription this is not a
charge" next to the list-price total.

**Not changed.** Colors, fonts, components, both themes, and the gate approval protocol
(tokens, confirmations, stale checks).

## 6. Reference patterns

No live reference research was possible (see section 1). The proposal uses patterns that are
common in tools with the same jobs:

| Pattern | Seen in | Used for |
|---|---|---|
| A triage inbox: one row, one reason, one action, oldest first | Linear Inbox, GitHub notifications | Home › Needs you |
| Status first, usage as a secondary card with a link | Vercel project overview | Home tiles |
| One headline number per card, "view more" for the breakdown | Stripe dashboard home | Cost |
| Runs as a plain list: state, name, age | GitHub Actions | Work, activity log |
| Empty state that states the next step | Linear, Vercel | First run |

If the owner wants reference screenshots next to the mockup, the Refero subscription has to be
renewed first.

## 7. Order of work

| Step | Content | Needs design approval |
|---|---|---|
| 0 | F10 layout bug, F11 names and keyboard access, one counting function for "needs you" and one liveness source (data side of F1, F3) | No |
| 1 | Home and navigation (F1, F2, F3, F12, F16) | Yes |
| 2 | Cost (F4) | Yes |
| 3 | Settings and Agents, task detail (F6, F7) | Yes |
| 4 | Phone layout and first run (F8, F9), then F5, F13–F15 | Yes |

Lessons from the September redesign still apply: `index.html` is edited directly, not by
subagents; run the script-block guard test after every cut; restart the server after a change to
`routes.mjs`.

## 8. Implementation log

**2026-11-10, steps 0 and 1 (branch `feat/board-declutter-home`).**

| Finding | What was done |
|---|---|
| F10 | `.board` is `overflow: clip`; the closed task panel is `visibility: hidden`, so it is out of the tab order |
| F1 | `homeNeedsYou()` is the one count; headline, sidebar badge and queue header read it. Other projects' items are in the line under the headline and in the badge tooltip, not in the badge number |
| F3 | `homeRunningNow()` is the one liveness source; the Ledger "Running now" tile reads it too |
| F1, F2, F3 | Home replaces Decisions and opens first. Queue shows the oldest items, the rest behind "Show N more"; gates are never folded. Stale work is one number on the Agents tile and opens from there |
| F12 | Top bar keeps one action, "New task". Theme switch and Settings are in Settings and the sidebar. "New issue" stays in the command palette |
| F16 | The version notice is one line in the sidebar footer; the full sentence is its tooltip and accessible name |
| F11 | Home rows are no longer buttons that contain buttons; one entry left the accessibility baseline |

Correction to the audit: the "98 turn buttons without an accessible name" count in F11 was a
measurement error. The buttons sit in a closed disclosure and carry their number as text. They
now also have a descriptive label.

Deviations from the mockup, each for a reason found in the code:

- A blocked row keeps its **Unblock** button where the mockup shows "Open". An earlier decision
  and its browser test require that a blocked row can be acted on from the list.
- The queue header reads "6 of 11", not "4 of 11": the mockup's own numbers did not add up
  (one row stands for three waiting sessions).
- The line under the headline still names other projects' open P0s and gates. An existing test
  forbids "nothing needs you" while another project has an open P0.
- The sidebar footer is two lines (connection, then version): the connection text can be long.
- The project icon stays in the project switcher: the collapsed sidebar needs it.
- Cost in the navigation opens the current Ledger screen until step 2.

## 9. Not covered

- 3.77.0, which was installed during the audit.
- Projects other than `great_cto`; a project with open gates (none was waiting, so the approve
  flow was not exercised).
- The kanban deep link, the ⌘K palette contents, the share report and e-mail templates.
- Screen readers were not run; the accessibility findings come from the DOM.
- No Beads tasks were created. The epic `great_cto-5tql` has all four children closed; findings
  can be added to it as children after the owner picks the scope.
