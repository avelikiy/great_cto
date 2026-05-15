# Site Credibility Plan — closing the positioning ↔ proof gap

> External review (May 2026) verdict: positioning 9/10, technical narrative 8.5/10,
> **credibility 6/10**, enterprise trust 5.5/10. Concept is strong, hard proof
> artifacts are thin. This plan closes that gap in 4 streams.

## Diagnosis

Site currently sells:

- Deterministic AI SDLC runtime
- Multi-agent governance layer
- Compliance-aware orchestration

But the reader cannot verify any of it because:

1. **No architecture diagram.** State machine + agent fan-out + gate flow are described in prose only.
2. **No memory architecture diagram.** L1–L4 layers exist in agent prompts, invisible on site.
3. **94% MTTR claim has no methodology page.** The link added in the prior session points to a file that does not exist.
4. **No execution trace.** Every claim ("12-angle review", "two human gates", "cross-project memory") is unverifiable.
5. **No public example repos.** Open source = trust anchor, but GitHub is currently a footer link.
6. **Homepage is one long scroll.** Manifesto + landing + docs + features blended. Reader gives up before reaching the credibility-building sections.

## Streams (by ROI)

### Stream A — Hard proof artifacts (1–2 weeks, highest leverage)

**A1. MTTR methodology page** — `docs/benchmarks/MTTR.md`
- Sample size, time window, repos covered, anonymized incident shapes
- Measurement protocol: time-to-detection × time-to-recall
- First-occurrence vs second-occurrence comparison
- Honest caveats (no controlled trial, observational)
- **Fixes a currently broken link on the live site.**

**A2. Architecture diagram page** — `/architecture` on greatcto.systems
- SVG state machine: init → archetype detect → brainstorm → arch → gate:plan → senior-dev pool (parallel) → 12-angle review fan-out → security audit → gate:ship → devops → l3-support feedback loop
- Each node clickable → links to the agent's prompt / source file on GitHub
- Cost-per-stage estimate beside each node
- Dark-theme SVG, emerald accent, mobile-responsive

**A3. Memory architecture diagram** — section on `/architecture` or its own page
- L1 project memory (`.great_cto/lessons.md`)
- L2 codebase patterns (in-repo telemetry)
- L3 user brain (`~/.great_cto/decisions.md`)
- L4 global patterns (telemetry rollup, gated WAU≥100)
- Retrieval flow: pattern hash → ranking → injection into agent context

**A4. `/proof` page** — one real end-to-end run, replay-style
- Pick one shipped feature (e.g. one of the pack pages we built)
- Show: original prompt → ARCH doc → gate:plan diff → senior-dev claim → review verdicts → security findings → gate:ship → deploy log → memory-write
- Real timestamps, real costs, real agent names
- Anonymize sensitive bits; otherwise raw

### Stream B — Site restructure (1 week, after A1–A2)

**B1. Compress hero**
- Manifesto → diagram → CTA. That's it.
- Move "Before/After", "How it works", "12 angles", "vs Cursor" to dedicated pages or progressive-reveal sections.

**B2. Layer the site into 4 surfaces**
- `/` — manifesto + diagram + CTA + install
- `/how` — diagrams + lifecycle + state machine (Stream A2/A3 lives here)
- `/proof` — execution traces + benchmarks (Stream A4 lives here)
- `/docs` — reference (archetypes, agents, gates, memory, compliance)

### Stream C — GitHub trust layer (2–3 days)

**C1. Public example repos**
- Spin up 2–3 reference repos demonstrating the pipeline end-to-end (e.g. `great-cto-example-fintech`, `great-cto-example-agent-product`)
- Real PRs with real agent-comment reviews
- README badges linking back to greatcto.systems

**C2. Public gate-decision log**
- Recent N gates (anonymized) as a live feed on the site
- JSON dump under `/proof/gates.json`, rendered as a timeline UI

### Stream D — Demo video (1 day)

**D1. Script + record**
- 60–90 s, single take preferred
- Path: `npx great-cto init` (empty repo) → archetype detect → first feature prompt → gates fire → agents review in parallel → human approves → merge
- Embed on hero (above-the-fold) and `/proof`

## Sequencing

```
Week 1
├─ A1 MTTR methodology       ░░  (0.5 d)
├─ A2 Architecture diagram   ███ (2 d)
├─ A3 Memory diagram         ██  (1 d)
└─ A4 Proof page             ███ (2 d)

Week 2
├─ B1 Compress hero          ██  (1 d)
├─ B2 4-layer split          ███ (2 d)
├─ C1 Example repos          ██  (1 d)
└─ C2 Gate log               ██  (1 d)

Week 3
└─ D Demo video              █   (1 d edit + record)
```

## What we explicitly do NOT do

- **No repositioning copy changes** until A1–A4 ship. Otherwise we widen the credibility gap.
- **No removal of "29/34 agents" or "94% MTTR" claims.** Back them with evidence instead.
- **No new archetypes / packs / agents** until this plan is done. Pure proof-first sprint.

## Success criteria

- External re-review (same reviewer): credibility ≥ 8/10, enterprise trust ≥ 7/10
- All hero claims have a one-click path to verifiable artifact
- Homepage time-to-first-diagram ≤ 1 viewport scroll
- Every agent name on the site links to its prompt on GitHub
