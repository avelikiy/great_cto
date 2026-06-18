# Design intelligence

great_cto designs UI **before** it writes UI. Two vendored skills give the pipeline
real design intelligence, mounted on two existing agents — there is **no standalone
designer agent** (consistent with the gate-tiering principle: add capability via
skills, not via more agent personas). See
`docs/plans/PLAN-2026-06-18-gate-tiering-reviewer-consolidation.md`.

## Skills (vendored, MIT — see `NOTICE.md`)

| Skill | Path | Role |
|-------|------|------|
| `ui-ux-pro-max` | `skills/ui-ux-pro-max/` | Design-intelligence base: 50+ styles, 161 palettes, 99 UX guidelines; CSV knowledge for landing pages, dashboards, admin panels, and mobile apps (incl. **React Native**) across 10 stacks. Ships a design-system generator (`scripts/design_system.py`). |
| `anydesign` | `skills/anydesign/` | Reverse-engineer a visual reference (image / URL / Figma) into a `design.md` — token system + component inventory. Use only when a reference exists. |

The `ui-ux-pro-max` data lives in `skills/ui-ux-pro-max/data/*.csv`
(`landing.csv`, `app-interface.csv` = iOS/Android/RN rules, `styles.csv`,
`ux-guidelines.csv`, …). The generator runs on stdlib only (no pip install):

```bash
python3 skills/ui-ux-pro-max/scripts/design_system.py \
  --project-name "Acme" --format markdown "spa wellness landing page"
```

## Agents (two altitudes)

- **`design-advisor`** (`agents/design-advisor.md`) — *what to design*. Plan altitude.
  Mounts `ui-ux-pro-max` + `anydesign`. Picks the design system, enumerates components,
  writes wireframes-as-text, locks the a11y / responsive / motion / platform-integration
  contract → `docs/design/DESIGN-{slug}.md` (11-section contract). **Writes no
  implementation code.**
- **`senior-dev`** (`agents/senior-dev.md`) — *how to build it*. Mounts `ui-ux-pro-max`
  (RN a11y rules during build), `web-artifacts-builder` (React/Tailwind/shadcn),
  `theme-factory`. Reads the DESIGN doc first and builds to it; never re-decides design.

## Pipeline wiring

`compileFlow` (`packages/cli/src/flow.ts`) adds `design-advisor` to the agent set for
UI-bearing archetypes (`UI_BEARING_ARCHETYPES`: web-service, mobile-app, commerce,
marketplace, cms, enterprise-saas, edtech, game, browser-extension, healthcare,
fintech, insurance, gov-public, web3). Backend/infra/library/CLI archetypes skip it.

design-advisor runs at **change_tier T1+** — a T0 maintenance fix skips design entirely
(`scripts/lib/change-tier.mjs` + `effectiveGates`).

## Verification

- Automated: `node --test tests/design-skills-smoke.test.mjs` — skill integrity, data
  parses, RN rules present, both agents wired, flow includes/excludes design-advisor,
  and the generator runs live for a landing + an RN query.
- Manual full-loop acceptance (one live pipeline run): point design-advisor at a
  feature with a UI surface, confirm it emits a `docs/design/DESIGN-{slug}.md`, then
  confirm senior-dev implements to it without re-deciding design.
