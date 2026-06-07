# PLAN — Rethink CLI + admin board around the autopilot model

Status: proposed · Created 2026-06-07

## Why

The product pivoted to **AI autopilots for business** (19 verticals · durable runs · human-gate
inbox · the licensed human signs the irreversible action). But the operator surfaces still reflect
the old dev-tool framing:

- **CLI** — autopilot operations (`start / inbox / approve / reject / show / runs`) live only in a
  standalone `scripts/autopilot.mjs`, **not** as slash commands. The slash palette is SDLC-first
  (`/start`, `/review`, `/release`, …) plus 17 per-vertical `*-review` compliance commands. There's
  no first-class "operate the autopilot" command.
- **Admin board** — the default board is dev-centric (kanban · agents · cost · incidents · memory).
  The **autopilot console** (the compliance work-queue) is a bolt-on separate page (`/autopilot.html`),
  not part of the board's information architecture.

## Mental model — two modes, one product

GreatCTO now has **two surfaces**, and both the CLI and the board should make them explicit:

| Mode | Who | What | CLI | Board |
|---|---|---|---|---|
| **Build** | the CTO / engineer | the gated pipeline that *builds & ships* an autopilot (architect → reviewers → QA → security → deploy) | `/start`, `/review`, `/release`, `/<vertical>-review` | kanban · agents · gates · cost |
| **Operate** | the licensed human (coder, BSA officer, broker, CPA, QPPV…) | the runtime that *runs* an autopilot: AI does the volume → a case lands in the inbox → the human signs → the irreversible action fires | **`/autopilot …`** (new) · `/flow` | **Autopilot console** (the work-queue) |

## Part A — CLI changes

### A1. Promote autopilot ops to a first-class slash command
Add `/autopilot` (alias `/run`) wrapping `scripts/autopilot.mjs`:
- `/autopilot start <vertical> [--live] [--tenant X]`
- `/autopilot inbox [--tenant X]` — the cases awaiting a signature
- `/autopilot show <runId>`
- `/autopilot approve <runId> --by "<name>"` / `/autopilot reject <runId> --by …`
- `/autopilot runs [--status …] [--tenant X]`

Today these require `node scripts/autopilot.mjs …`. Promoting them makes "operate the autopilot" a
peer of "build the autopilot."

### A2. Reframe `/flow` + relate to `/autopilot`
`/flow <vertical>` already shows the flow (steps · gates · connectors). Add a one-line footer:
"▶ run it: `/autopilot start <vertical>`". `/flow` = inspect; `/autopilot` = operate.

### A3. Group the palette in `/help`
`/help` currently lists commands flat. Re-group into **Build · Operate · Compliance reviewers ·
Admin/ops**, so an operator immediately sees the autopilot commands.

### A4. The per-vertical `*-review` commands stay — relabel as **build-time**
The 19 `*-review` commands (coding-audit, aml-review, customs-review, …) are the **pre-implementation
compliance reviewers** (build-time gate), not run-time. `/help` groups them under "Compliance
reviewers (build-time)" to remove the ambiguity with the run-time gate inbox.

### A5. Housekeeping
- Fix the malformed command file `commands/s-classify.md` → `samd-classify.md` (stale rename artifact).
- Ensure every shipped vertical has its `*-review` command registered (already true for all 19).

## Part B — Admin board changes (view + functionality)

### B1. Elevate the Autopilot console to a first-class mode
Reframe the board with a **top-level mode switch: Operate ⇄ Build**.
- **Operate** (default for operators) = the Autopilot console: the inbox/work-queue.
- **Build** = the existing dev board (kanban · agents · dashboard · cost · logs · memory).

The console moves from a bolt-on page into the board's IA (a primary tab), sharing the nav, auth,
push, and theme.

### B2. Autopilot console — the compliance work-queue (functionality)
The console is the licensed human's CRM. Add, beyond today's start/inbox/approve:
1. **Filters** — by vertical, status, **tenant** (the multi-tenant switcher), and "assigned to my role"
   (a BSA officer sees AML cases; a coder sees rcm).
2. **Case detail** — the full step trace with each connector's result (live/stub badge), the exact
   regulated decision to sign, the accountable owner, and the irreversible action that will fire.
3. **Sign flow** — Approve / Reject with the signer's name + note; multi-gate shows "1 of 2
   signatures" progress.
4. **Audit trail** — per-run immutable history (who · what · when), exportable.
5. **SLA / turnaround** — time-in-queue per case + a turnaround clock (prior-auth/PV have legal
   deadlines); highlight cases nearing an SLA breach.
6. **Search** + bulk triage on low-risk cases.
7. **Push** — the "🔔 Notify me" subscribe (shipped v2.47) surfaced in the console header.

### B3. Visual reframe
- Operator lands on **their queue**, not the dev kanban.
- Per-vertical iconography (🩺 🛂 💊 …) + the named signer role on each card.
- Live/stub connector badges and the irreversible-step flag carried from the flow pages.

### B4. Keep Build mode intact
The dev pipeline board is unchanged — it's just one of the two modes now, not the whole product.

## Phasing

1. **CLI** (small, ship first): add `/autopilot` slash command (wraps the script), `/flow` footer,
   `/help` regrouping, fix `s-classify.md`.
2. **Board IA**: add the Operate ⇄ Build mode switch; move the console into a primary tab.
3. **Console functionality**: filters (vertical/tenant/role), case-detail trace, SLA timers, audit
   export, search.
4. **Polish**: per-vertical iconography, signer-role labels, live/stub badges.

## Acceptance

- An operator can run the full loop from slash commands only: `/autopilot start aml` → `/autopilot
  inbox` → `/autopilot approve <id> --by "BSA Officer"`.
- The board opens in Operate mode showing the work-queue; one click switches to Build.
- The console filters by vertical + tenant + role; a case shows its full trace + SLA timer.
- `/help` clearly separates Build · Operate · Compliance reviewers.
- No regression to the existing dev board or the 19 verticals.

## Out of scope (separate tracks)
- Live adapters for customs/audit/pharma writes.
- Real auth / RBAC per signer role (this plan assumes the role labels; enforcement is later).
- Billing/metering per run.
