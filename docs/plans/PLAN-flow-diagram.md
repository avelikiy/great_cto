# PLAN: graphical flow diagram in the operator console's Flow tab

**Date:** 2026-06-13 · **Status:** IN PROGRESS
**Scope:** pure render layer — no server, runtime, or invariant change. Data already comes from
`GET /api/autopilot/flow` (`effective.steps[]` + `stats` + `owner`/`qualityScore`).

## Why

The Flow tab today renders the flow as a **numbered step list**. It's functional and safe, but it's
not a *graphical* visualization — there are no nodes-and-arrows, no visual distinction of the human
gate, no blast-radius colour. The user wants the block diagram. The free-form canvas constructor
stays out of scope by design ("настройка, не сборка").

## Data (already available, per `/api/autopilot/flow`)

`effective.steps[]` — each step is one of:
- **agent step**: `{ does, agent, reversible, blastRadius: 'low'|'medium'|'high', tools[], addedByOverride? }`
- **human gate**: `{ does, gate, human, addedByOverride? }`

Flows are **linear** (sequential), so the diagram is a single chain of N nodes with arrows.

## P1 — Vertical flowchart (HTML+CSS, responsive, a11y)

`renderFlowDiagram(eff)` renders a top-to-bottom chain into `#flow-steps`:
- **Agent node** — rounded card: 🤖 + the `does` text + agent name; a **left accent bar coloured by
  blast radius** (low = green, medium = amber, high = red); connector `tools` as small chips.
- **Human gate node** — visually distinct (shield motif 🛡️/🧑‍⚖️, dashed/accent border): the `does`,
  the signer (`human`) and the `gate` id. This is where the autopilot pauses for a signature.
- **Irreversible step** — red ring + `⚠ irreversible · <blast> blast` badge (it already only runs
  after its protecting gate — show that relationship visually).
- **Override-added node** — dashed outline + "added by your tenant" tag (matches the list).
- **Arrows** — a CSS connector (vertical line + ▼ arrowhead) between consecutive nodes.
- **Header** — keep the existing summary line (autonomous/human/connectors/owner/quality) + a small
  **legend** (blast colours, 🤖 agent / 🧑‍⚖️ gate, irreversible).

### View toggle
Add a **Diagram | List** toggle in the Flow tab header. Default **Diagram** (the graphical view the
user asked for); List keeps the existing dense rendering as a fallback. The parametric editor
(`renderFlowEditor`) is unchanged and works under both views.

## Out of scope
- Free-form drag-drop canvas constructor (deferred by design).
- Server / runtime / flow-overrides changes.
- Swimlane grouping by stage — optional follow-on; the linear chain + blast colour already conveys
  "where the autopilot works vs where a human signs".

## Verify
Browser (Playwright): render rcm (1 gate, 1 irreversible) and a 2-gate vertical (e.g. tax: preparer
+ taxpayer 8879, irreversible IRS e-file) — nodes, arrows, gate shields, blast colours, irreversible
badge all correct; toggle Diagram⇄List; default tenant unaffected; no console errors.

## File
`packages/board/public/autopilot.html` only.
