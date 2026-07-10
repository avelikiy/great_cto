# BENCH — 2026-07 batch 1 (public benchmark, in progress)

**Date:** 2026-07-10 · **Status:** wave 0 complete (1 of 10 products) · Plan:
[PLAN-2026-07-10-public-benchmark.md](../plans/PLAN-2026-07-10-public-benchmark.md)

10 products from the catalog, built end-to-end by the great_cto pipeline, measured
by open tooling. Briefs were [frozen before any run](briefs/README.md); each product
repo is tagged `bench-2026-07` at collection time; the collector
([`scripts/bench-collect.mjs`](../../scripts/bench-collect.mjs)) and launcher
([`scripts/bench-run.sh`](../../scripts/bench-run.sh)) are open source in this repo.
Anyone can re-run.

## Results

| # | Product | Archetype | Wall | Tests | Score | Security | Deploy | Cost (API-equiv) | Failure |
|---|---------|-----------|------|-------|-------|----------|--------|------------------|---------|
| 3 | ATS — applicant tracking | A1 crud | **3h 25m** | **269 / 0 fail** | **74 (B)** | APPROVED P0:0 P1:0 | preview live (SSO-walled) | **$171.61** · $0 out-of-pocket | none¹ |
| 1 | Dispatch & scheduling | A1 crud | — | — | — | — | — | — | wave 1 |
| 4 | Customer booking | A2 booking | — | — | — | — | — | — | wave 1 |
| 7 | Profitability dashboard | A4 dashboard | — | — | — | — | — | — | wave 1 |
| 2, 5, 6, 8, 9, 10 | (see briefs) | A1–A6 | — | — | — | — | — | — | wave 2 |

¹ One **incident**: the first headless launch was killed by a 600s background-task
wait ceiling ~1h22m in; the run was resumed with `--continue` and completed. The
wall-clock figure includes the ~40min interruption gap. Fixed in the launcher for
all subsequent runs (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`).

### ATS row detail (frozen at `bench-2026-07`, commit `3abcb34`)

- **Brief:** [briefs/ats.md](briefs/ats.md), fed verbatim; 13+1 work packages, all closed.
- **Quality signals beyond the score:** the brief's crown-jewel requirement
  (candidate must never see rubric scores/feedback) enforced at three layers —
  route separation, DTO validation, and a least-privilege `ats_public` DB role —
  proven by a negative test that QA and security re-ran independently. Two real
  bugs caught and fixed mid-build (outbox concurrency over-claim, test-parallelism
  flake). Agents surfaced a scope gap (unowned rejection endpoint → WP-14) instead
  of silently skipping it.
- **Cost breakdown (token-equivalent at list prices):** sonnet-5 $139.71 (1,820
  msgs, 298M cache-read tokens) · opus-4.8 $30.06 · haiku-4.5 $1.84.

## Methodology — read this before the numbers

1. **Human actions: 0** (plan said 1). Runs use `approval-level: auto` — the CTO
   pre-approves architecture and ship in the launch prompt. This is disclosed as a
   deviation: the benchmark measures the *fully unattended* pipeline.
2. **Cost is reported two ways.** `logged` is what agents recorded ($0 on a Claude
   subscription — token usage isn't billed per-call). `token_equiv_usd` is computed
   from session transcripts (per-model input/output/cache tokens × 2026-07 list
   prices) — *what the run would have cost on the API*. Out-of-pocket on a Max
   subscription: ~$0 marginal.
3. **Wall time** is first→last verdict timestamp and includes any interruption gaps.
4. **Tests** are the product's own `npm test` run at collection time on the frozen
   commit. **CI-green is verified locally** (GitHub Actions unavailable on this
   account) — noted per plan.
5. **Score** is `scripts/lib/product-score.mjs` — a structural floor (0–100), not a
   correctness proof; correctness evidence is the test run and the negative tests.
6. **Deploy** is a preview URL (Vercel free tier, behind Vercel's SSO wall — the
   302 is the wall, not the app). Production provisioning is intentionally out of
   scope (human-gated, costs real money).
7. **Failures vs incidents.** A `failure` is a terminal outcome (spec-objection,
   cost-cap, gate-block, crash). An `incident` is a mid-run interruption the run
   recovered from. Both are published.
8. **No tuning between runs.** Pipeline prompts/agents are frozen for the batch;
   tooling (launcher/collector) fixes between waves are allowed and disclosed —
   wave 0 exists precisely to shake those out.

## Wave-0 tooling lessons (fixed before wave 1)

| Lesson | Fix |
|--------|-----|
| Headless kills bg subagents after 600s | launcher sets `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` |
| Desktop-session env breaks detached auth (401) | launcher uses `env -i` + standalone CLI login |
| Agents log cost=$0 on subscription | collector prices token usage from transcripts |
| Collector grabbed a *planned* vanity URL from the runbook | verdicts-first + deployment-hash preference |
| Recovered interruption reported as failure | `incidents[]` vs terminal `failure` split |

## Reproduce

```bash
mkdir -p ~/bench/<slug> && cd ~/bench/<slug> && git init
npx great-cto@2.85.3 init && rm .great_cto/PROJECT.md   # reset the init stub
scripts/bench-run.sh ~/bench/<slug> docs/benchmarks/briefs/<slug>.md
# …after the run exits:
node scripts/bench-collect.mjs ~/bench/<slug> --slug <slug> --out ~/bench/results.jsonl
git -C ~/bench/<slug> tag -a bench-2026-07 -m freeze
```
