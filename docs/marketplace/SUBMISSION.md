# Claude Code Plugin Marketplace — submission package

> Ready to copy-paste when Anthropic opens the marketplace. Last updated: v1.0.137. All claims here verified against current state.

## One-line description (≤ 280 chars)

```
Engineering process layer for Claude Code. 11 specialist subagents (3 AI specialists + Web Store reviewer + 7 core), 14 archetypes auto-detected, archetype-aware compliance gates. Two decisions per feature; everything else automatic. MIT, no telemetry.
```

## Long description (max 2000 chars per typical marketplace fields)

```
great_cto turns Claude Code into a full SDLC team. You describe what to build; specialist subagents handle architecture, threat modelling, prompt engineering, evals, implementation, code review, QA, security, and deploy. You make two decisions per feature: approve the architecture, approve the ship.

Auto-detects 14 project archetypes from your repo (web-service, mobile-app, ai-system, agent-product, devtools, browser-extension, game, data-platform, infra, library, commerce, web3, iot-embedded, regulated). Each archetype routes through its own QA strategy, deploy method, gates, and compliance defaults. Tier-model security: archetype is the floor; signals during implementation upgrade it (Stripe dep → PCI gate, auth touch → deep tier).

11 agents:
• architect (architecture + ADRs)
• senior-dev (TDD impl, Beads task tracking)
• qa-engineer (QA reports, archetype-aware gates)
• security-officer (pre-impl + post-impl modes)
• devops (canary deploy with rollback)
• l3-support (postmortems, P0 triage)
• project-auditor (debt audit + AI cost-cap)
• ai-prompt-architect (sha256-pinned system prompts, jailbreak corpus)
• ai-eval-engineer (eval pipeline, drift detection)
• ai-security-reviewer (OWASP LLM Top 10 specialist)
• web-store-reviewer (Chrome/Firefox/Edge Web Store preflight)

18 mandatory artefact templates (ARCH-ai, ARCH-game, ARCH-browser-extension, ARCH-defi-protocol, THREAT-MODEL-AI, EVAL, ADR-LLM, ADR-PROMPT, plus 8 compliance frameworks: DORA, NIS2, GxP/21CFR11, TISAX, ISO27001, SOX, PCI-DSS-SAQ-A, PCI-DSS-SAQ-D).

27 compliance keys, 13 domain packs, 16 slash commands. Cross-project pattern memory via /crystallize: a root-cause that took 4 hours the first time takes 30 seconds the next.

MIT license, no telemetry, no SaaS lock-in. File-based config in .great_cto/ — inspect and edit anything. 60-80% LLM cost reduction via tier-routed model selection.
```

## Categories (pick the marketplace ones that fit)

**Primary**: `process-automation`, `multi-agent`, `compliance`, `sdlc`

**Secondary** (if marketplace allows multiple): `ai-development`, `code-review`, `security`, `devops`, `cto-tooling`

## Pricing model

**Free, MIT licensed.** No commercial tier. No paid features. No usage tracking.

## Requirements

- Claude Code (latest)
- Node 18.17+
- Optional: [Superpowers](https://github.com/obra/superpowers) (skill provider — TDD, plan-writing, code-review)
- Optional: [Beads](https://github.com/steveyegge/beads) (git-native task tracker)

Both optional deps are listed in `plugin.json` `dependencies:`. Plugin works without them but loses corresponding workflow steps.

## Install command

```bash
npx great-cto init
```

Auto-detects archetype, bootstraps `.great_cto/PROJECT.md`, registers plugin in Claude Code settings.

## Screenshots needed (to prepare)

Located in `docs/screenshots/` (already in repo):
- `01-start.png` — `/start "..."` with archetype detection + cost estimate
- `02-review.png` — `/review` 12-angle output
- `03-inbox.png` — `/inbox` showing gates + AI health signals
- `demo.gif` — 90-second pipeline loop end-to-end
- `logo.svg` — vector logo

To record additional for marketplace if format requires:
- `04-archetypes.png` — auto-detection of 14 archetypes
- `05-templates.png` — `cp` template into project, halt+remediation message
- `06-promote.png` — `/promote` poc → production transition

## Demo video

Source: `site/assets/demo.tape` (VHS script). Render with:
```bash
vhs site/assets/demo.tape -o demo.gif      # 90 sec, GIF
vhs site/assets/demo.tape --output demo.mp4 # marketplace may want MP4
```

## Marketing copy snippets

**Headline**: "Engineering process layer for Claude Code"
**Subhead**: "11 specialist agents. 14 archetypes auto-detected. Two decisions per feature."

**Differentiation**:
- vs raw Claude Code: process structure + archetype-aware gates + compliance enforcement
- vs Cursor/Aider/Cline: not an AI assistant — orchestrates Claude Code through gates
- vs obra/superpowers: agents (not just methodology skills)
- vs davila7/templates: opinionated pipeline (not à-la-carte catalog)
- vs ksimback/tech-debt-skill: full SDLC (not single-purpose)

## Submission checklist (when Anthropic opens marketplace)

- [ ] Verify marketplace.json schema matches Anthropic's published spec
- [ ] Strip any URLs or descriptions that became stale since this doc was written
- [ ] Re-render demo.gif against latest CLI output
- [ ] Run smoke test: `npx great-cto init` in 3 fixture projects, screenshot output
- [ ] Verify all 11 agent files have `description:` frontmatter that matches behaviour
- [ ] License explicitly MIT in marketplace listing
- [ ] Privacy: no telemetry collection mentioned (true; verify against `scripts/check-update.sh` is the only network call)
- [ ] Submit via marketplace dashboard with this doc as the source for fields

## Realistic expectations

When marketplace opens, expect:
- Initial review: 1–7 days depending on Anthropic backlog
- First-week installs: 50–500 if listed organically
- Discoverability boost from comparison to plugins users already trust (cline-rules, superpowers)
- Honest stats: 4 stars on github currently → marketplace surfaces will multiply ~10× over first month if categorisation is right

Plan the launch posts (`HN-show.md` from v1.0.130 era — re-verify still accurate then publish) to coincide with marketplace listing approval, not before. Single announcement = compounding traffic.

## What NOT to oversell

- Don't claim "automatic CTO replacement" — claim "process layer above the AI"
- Don't claim deterministic output — claim "structured pipeline with explicit gates"
- Don't claim production-ready for every archetype — claim "14 archetypes covered, depth varies (AI most thorough)"
- Don't claim 0-config — claim "auto-detection + 1 init command"

## Source state at v1.0.137 (verified)

- 11 agents (`agents/*.md`)
- 18 templates (`skills/great_cto/templates/*.md`)
- 14 archetypes (in `skills/great_cto/ARCHETYPES.md`)
- 13 packs (`skills/great_cto/packs/*.md`)
- 16 commands (`commands/*.md`)
- 27 compliance keys (Parameter Values in ARCHETYPES.md)
- License: MIT (`LICENSE` at repo root, `packages/cli/LICENSE` for npm package)
- Telemetry: none (only `scripts/check-update.sh` hits npm registry once per session for version check)
