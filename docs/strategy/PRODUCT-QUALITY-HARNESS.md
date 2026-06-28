# Product-quality harness — a defensible score for what we ship

> Status: active · Created 2026-06-28 · Closes the "verifiability" gap (#7 of the quality assessment)

great_cto positions as an **AI Product Builder**, but its biggest weakness isn't what
it builds — it's that it can't *prove* the builds are good. The self-improvement loops
that should measure quality were placebo (fixed this session); there is no measured
quality number across the products, only one proof-run. This harness produces a
**real, automated 0–100 quality score** for a generated product — so the number on
the landing page is earned, not asserted.

## Rubric (weights = the quality assessment dimensions)

| Dimension | Weight | Signal (inspected automatically) |
|-----------|-------:|----------------------------------|
| Functional completeness | 20 | data model + API routes + UI all present |
| Correctness / tests | 20 | unit tests present + **e2e golden-path** specs present |
| Security | 15 | no hardcoded secrets · auth present · `.env.example` (no inline creds) |
| Design / a11y | 15 | design system in use · role/label/aria usage (not raw divs) |
| Observability | 10 | error capture (Sentry) · structured logging · `/healthz` |
| Deploy-readiness | 10 | deploy config (vercel/wrangler/Docker) · CI present |
| Verifiability | 10 | e2e specs **and** a recorded quality artifact exist |

`scoreProduct(signals)` is pure (each signal 0..1, weighted → 0–100); the CLI inspects
a product directory to derive the signals. Same rubric great_cto graded itself on.

## Phases

1. **Scorer engine** (this PR) — `scripts/lib/product-score.mjs`: rubric-as-data + pure
   `scoreProduct()` + `inspect(dir)` heuristics + CLI. Unit-tested; run on a real local
   codebase to prove the mechanics + emit a real number.
2. **Fleet runner** — `--fleet <dir>` scores many product dirs → per-archetype + overall.
3. **Pipeline integration** — the build pipeline emits `docs/quality/SCORE-{slug}.md` at
   S6/S7, and the score becomes a deploy gate input (regressions block).
4. **Real benchmark** — generate 1–2 products per archetype (A1–A6) and score them →
   the empirical per-archetype number that replaces today's expert estimate (≈70).

## Empirical result (P4, first data point)

A general-purpose agent generated a real, minimal **A1 CRUD vertical-SaaS** product
(Task tracker — model + API + UI + auth + observability + unit & e2e tests + Docker +
`.env.example`; `npm test` 13/13). The harness scored it:

| Pass | Score | Note |
|------|-------|------|
| first run | **69/100 (C)** | exposed a real heuristic blind spot — a vanilla-HTML UI wasn't credited |
| after fixing the UI/design heuristic | **84/100 (B)** | completeness 20/20, tests 20/20, security 15/15, observability 10/10 |

So a *clean* A1 build scores ~84. The 69→84 jump (fixing a true under-detection) is
itself proof the harness works and self-corrects. The ~70 expert estimate stands for
the *fleet* average — harder archetypes (marketplace escrow, content DRM) and
average-quality builds pull below this best-case A1 number. Artifact:
`docs/quality/SCORE-gen-crud-app.md`.

## Why heuristics, honestly

Static inspection can't fully judge correctness or UX — it judges *presence and shape*
of the things quality products have. It's a floor, not a ceiling: a high score means
"the product has the right machinery"; a low score is a true red flag. Real correctness
still comes from the e2e run (which the harness checks for + can execute).
