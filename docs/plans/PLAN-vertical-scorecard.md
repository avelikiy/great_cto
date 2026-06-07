# PLAN: Vertical quality scorecard (0–100)

**Goal:** measure how well each service-autopilot vertical (legaltech · rcm · procurement ·
accounting · msp · tax + the service-autopilot overlay) actually *works*, on a 0–100 scale —
by dogfooding the overlay's own doctrine: **accuracy-as-SLA on a golden set + adversarial**.
A vertical's claim to quality is *earned by a measured score*, never declared.

## The 7-dimension rubric (weights sum to 100)

| # | Dimension | Weight | Measures | Tier |
|---|---|---|---|---|
| 1 | Structural integrity | 10 | pack wired (agent+TM+command+plugin+test) | 0 (deterministic, free) |
| 2 | Detection recall | 30 | planted-violation case → reviewer BLOCKS with right finding | 1 (LLM) |
| 3 | Precision / low false-positive | 15 | benign case → reviewer does NOT block / no hallucinated findings | 1 (LLM) |
| 4 | Gate correctness | 15 | right human-gate emitted + advice/high-risk routed to it | 1 (LLM, deterministic check on output) |
| 5 | Citation / domain accuracy | 15 | named statutes/controls real + current, no hallucinated law | 1 (LLM judge) |
| 6 | Coverage completeness | 10 | no missing major regulatory regime | 1 (LLM judge / checklist) |
| 7 | EVAL-suite efficacy | 5 | the pack's own EVAL suite is present + non-trivial (proxy for mutation kill-rate) | 0 (deterministic, free) |

`score = Σ(weight × fraction)`. Bands: **≥ 85** ship-ready · 70–84 needs work · < 70 do-not-ship.

## Two execution tiers

- **Tier 0 (deterministic, $0, runs in CI):** dimensions 1 + 7. Hygiene, not proof of judgment.
- **Tier 1 (behavioural, LLM, ~$0.20–0.40 / vertical):** dimensions 2–6. The real signal. Needs
  `OPENROUTER_API_KEY`. The runner gives the reviewer **one** golden case at a time (not the full
  pipeline) — isolates the thing being scored and keeps cost low.

## Golden-set design (per vertical)

`tests/eval/verticals/<vertical>.json` — `{ vertical, reviewer, gate, cases: [...] }`. Three kinds:
- **planted** (≥ 6) — ARCH stub with a baked-in violation → expect `BLOCKED` + ≥1 keyword.
- **benign** (≥ 3) — clean ARCH in the same vertical → expect no block / no findings (catches over-firing).
- **adversarial** (≥ 3) — a case that argues the reviewer into passing (jailbreak the gate) → expect it holds.

A **holdout split** (`"split": "holdout"`) is gate-only — never used to tune a reviewer prompt
(SIA discipline, same as `tests/eval/runner.mjs`).

## Architecture (separation of concerns)

- **`scripts/lib/vertical-score.mjs`** — pure scoring engine: `(structuralFacts, caseResults,
  packFacts, judgeScores) → { score, breakdown }`. No I/O, no API — unit-testable with synthetic
  inputs (mirrors the governance/autopilot lib pattern).
- **`scripts/eval/vertical-scorecard.mjs`** — runner: gathers Tier-0 facts (free), and when an API
  key is present runs the golden set + the citation/coverage LLM judge, then feeds the engine.
  Without a key → Tier-0 partial + `behavioral: not-run`, honest.

## Phases

**Phase 1 (this PR):** scoring engine + tests · legaltech golden set (exemplar) · runner CLI
(Tier-0 live, Tier-1 API-gated, `--dry-run`) · honest partial reporting.

**Phase 2:** golden sets for rcm, procurement, accounting, msp, tax (+ a service-autopilot overlay
set). Holdout splits.

**Phase 3:** wire into `ai-eval-engineer` as a regression/promotion gate — a prompt/pack change that
drops a vertical's score below its baseline blocks, same mechanism as the AI-prompt holdout gate.

## Acceptance
- `node scripts/eval/vertical-scorecard.mjs legaltech` prints a 0–100 score + 7-line breakdown
  (Tier-0 live now; Tier-1 when `OPENROUTER_API_KEY` set).
- Pure engine has unit tests; band logic + weighting verified.
- Zero new runtime deps; reuses the OpenRouter call pattern from `openrouter-pack-overlays.mjs`.

## Do NOT
- ❌ Declare a vertical 85+ without a measured Tier-1 run. ❌ Show holdout cases to a reviewer-prompt
  tuner. ❌ A parallel eval system — reuse the EVAL-*.md + runner + ai-eval-engineer machinery.
