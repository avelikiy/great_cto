# PLAN — the design contract says nothing about money, and the skill has a dead 259 KB

Four research passes over GitHub design systems, typography sources and skill
collections. The useful part is not what they found to copy — it is what none of
them had, and what an audit of our own skills found.

## What the research actually settled

**Almost nothing is adoptable as text.** Salesforce Lightning was archived on
2026-08-12 and its images are CC BY-**ND** (derivatives forbidden). Atlassian
publishes no guidance repo at all. Fluent 2 has **no data-table page whatsoever**
— its own List page links to a guide that does not exist. Agent/skill
collections with 24k–170k stars contain zero rules for dense or financial UI:
one widely-starred `ui-designer.md` is 174 lines with no mention of table,
currency, permission or audit.

Three things are worth taking, all licence-clean:

- **Carbon** (Apache-2.0, prose included): destructive actions tiered by **cost
  of recovery**, not by importance — trivially recreatable deletes immediately;
  irreversible *or affecting more than one object* gets a danger modal; very
  expensive or cascading requires typing the resource name. This is ADR-009
  lowered from the pipeline to the screen, which is a good sign: an unrelated
  system reached the same criterion.
- **GOV.UK** (MIT + OGL v3): line-height as an absolute 5px multiple rather than
  a constant ratio, derived from user testing; and "Not provided" instead of an
  empty cell.
- **SDMX / Statistics Canada** (ISO 17369, OGL-Canada): a closed vocabulary that
  distinguishes *true zero* from *rounded to zero*, and separates provisional,
  estimated, forecast, not-available, not-applicable, suppressed-for-
  confidentiality and too-unreliable-to-publish. **No corporate design system
  covers this.** It is our own governing principle — a thing that did not happen
  must not look like a thing that did — applied to numbers.

## What the audit of our own skills found

`skills/ui-ux-pro-max` is 1.8 MB. Three of its CSVs — `design.csv`,
`draft.csv`, `ui-reasoning.csv`, **259 KB together** — are named nowhere in
`scripts/core.py` and nowhere in `SKILL.md`. The engine never opens them.

That matters beyond disk: reviewing this repository I claimed a mobile rule was
covered *because I found it in `design.csv`*. It is not covered. Content in an
unread file is the same defect this repository keeps removing, one level down —
declared, and consumed by nothing.

Its `SKILL.md` also says, verbatim, `Stack: React Native (this project's only
tech stack)`, and scopes its best checklist as "not desktop-web". It was
vendored from a React-Native-only project and we apply it to web dashboards.

## Requirements

- **DESIGN-R1** — remove what the engine cannot read, and say in the skill that
  it was removed, so nobody re-adds it as "extra coverage".
- **DESIGN-R2** — correct the React-Native-only framing so the checklist is not
  silently out of scope for our main case.
- **DESIGN-R3** — a **numeric contract** the design doc must state: figure style
  per component (tabular vs proportional, lining, slashed zero) with the triggers
  that demand it; decimal alignment; precision by currency rather than a
  hardcoded 2; the negative-number convention chosen once and written down, never
  colour alone; and display precision versus stored precision.
- **DESIGN-R4** — a **not-a-number vocabulary**: every way a cell can fail to be
  a measured value, each rendered distinguishably. True zero separate from
  rounded-to-zero. Empty cells forbidden — absence is labelled.
- **DESIGN-R5** — destructive actions tiered by cost of recovery, with the
  confirmation ritual named per tier and the blast radius stated in the
  confirmation text.
- **DESIGN-R6** — the three mobile states nothing covers: offline (at start and
  mid-action), permission-denied (never asked / denied once / denied
  permanently, plus partial grants), and perceived list performance.
- **DESIGN-R7** — the contract is **checked, not merely written**.
  `artifact-lint.mjs` already requires `design system`, `component inventory`,
  `a11y`, `responsive` sections in a DESIGN doc. The new sections join that list,
  because prose nothing verifies is what we spent the day removing.
- **DESIGN-R8** — evals covering the new sections.
  `tests/eval/EVAL-design-advisor-contract.md` is 31 lines and contains zero
  mentions of currency, money, permission, stale, audit, tabular or negative.
  Without cases, R3–R6 are unmeasured.

## Not doing

- **Not vendoring a third design skill.** The agent already loads two. The one
  strong candidate (`refero-design`, MIT, installed globally) is written as CSS
  and misses exactly the localisation, text-scaling and WCAG 1.4.12 parts that
  matter for `commerce` and `regulated`.
- **Not copying `clagnut/TODS`.** Its figure rules are the best found anywhere
  and the repository has **no LICENSE file**, so it is all rights reserved.
  Derive the rules independently from the CSS specification instead.
- **Not adopting Salesforce Lightning** (archived, CC BY-ND) or Fluent prose
  (`NOASSERTION`).
- Not a per-archetype design pipeline. The archetype is an overlay.

## Evidence noted for later, not acted on here

The EU Accessibility Act's Annex I §IV(e)(ii) requires consumer banking
information not to exceed CEFR **B2** reading complexity. The draft EN 301 549
mapping table has a row for (e)(i) and **none for (e)(ii)**; the standard's text
contains no occurrence of "B2", "upper intermediate" or "plain language". The
nearest WCAG criterion, 3.1.5 Reading Level, is **AAA**, while the standard
requires AA. So a product can pass WCAG 2.2 AA, pass every automated scanner,
and still miss a mandatory requirement — a check reporting success over ground
it never inspected. Worth a readability budget in the a11y contract for EU
financial scope; out of scope for this change.

## Status

Planned, and grounded: every claim about our own files was verified by reading
them, after two claims in the same session turned out to be wrong when checked.
