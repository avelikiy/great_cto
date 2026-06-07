# PLAN: Autopilot pivot — vertical flows over packs/pipelines

**Goal:** reposition great_cto as **"AI autopilots for business."** Stop leading with technical
pipelines + packs; lead with each vertical's **flow** (intake → process → decide → deliver,
composed of agents + tools, with a human on the judgment calls). The packs / reviewers / gates /
scorecard we already built become the **under-the-hood trust layer**, not the headline.

**Audience:** CEO / CFO / VC first (founders + investors automating a business function); CTO second.

## Decisions locked

- **Phase-3 depth:** the autopilot *designs and builds* software for the flow, **with connector
  stubs** — not real EHR/clearinghouse/bank integrations yet. Connector = interface + stub adapter;
  the flow runs end-to-end in demo/sandbox mode; a real adapter is a drop-in later. (`status: 'stub'`.)
- **Surfaces:** full landing + README rebrand **and** a CLI `/start` onboarding rework. Both render
  from the same `flows/<vertical>.flow.json` so positioning is consistent everywhere.

## The spine — the Flow object (single source of truth)

`flows/<vertical>.flow.json` holds, per vertical: `autopilot`, `tagline`, `audience`,
`marketSizeUsd`, `problem`, `outcome`, `qualityScore` (measured), `steps[]` (each: `does` +
`agent`|`human` + `tools[]` + optional `gate`), `reviewer`, `manifest`, `startups[]`. Everything
outward (landing, README, /flow, /start) renders from it. The compliance reviewer + gates + score
are *referenced* (trust layer), never the headline.

## Phases

**Phase 1 (this PR) — Flow foundation.**
- `flows/*.flow.json` for all 6 verticals (rcm, legaltech, procurement, accounting, msp, tax).
- `scripts/lib/connectors.mjs` — connector catalog (all `stub`) + `stubCall` executor; `flow.mjs` —
  validate / stats / render to business language. Tests.
- `/flow <vertical> [--connectors]` command.
- `docs/positioning/vocabulary.md` — the technical→business translation table (single source for copy).

**Phase 2 — Landing + README rebrand (`great_cto-site` + README).**
- Hero: "AI autopilots for business." CEO/CFO/VC framing.
- One section per vertical rendered from the flow: what it is · market size · the flow · agents +
  tools · human checkpoints · measured quality · startups in the niche. Full rebrand.

**Phase 3 — CLI `/start` product onboarding.**
- Ask "what business function are you automating?" → detect the vertical (reuse keyword detection)
  → show the **flow** (not archetype/pack) → offer to scaffold the autopilot with stub connectors.

**Phase 4 (later) — Doing-agents + live connectors.**
- Per-vertical doing-agents (intake/process/deliver/monitor) beyond the compliance reviewer; swap
  stub connectors for real adapters one provider at a time.

## Acceptance
- `node scripts/lib/flow.mjs`-backed `/flow rcm` renders a business-language flow with steps, human
  checkpoints, tools, measured quality, and startups. All 6 flows validate.
- Landing + README + `/start` all render from `flows/*.flow.json` — no divergent copy.
- Zero new runtime deps; connectors are stubs with a documented go-live path.

## Do NOT
- ❌ Use "pack / pipeline / archetype / reviewer / gate" in outward copy (see vocabulary.md). ❌ Build
  real integrations in this epic. ❌ Duplicate vertical facts across surfaces — one flow file feeds all.
