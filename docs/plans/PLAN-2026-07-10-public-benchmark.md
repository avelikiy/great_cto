# PLAN — Public benchmark: 10 catalog products through the pipeline

> Implements Phase 4 of `docs/strategy/PRODUCT-QUALITY-HARNESS.md` ("Real benchmark")
> at batch scale. Turns the n=1 proof (`greatcto.systems/proof`) into an n=10 public
> benchmark — the single highest-leverage commercial artifact identified in the
> competitive review (2026-07-10).

## Goal & success criteria

Ship a public benchmark page backed by 10 real, reproducible product builds:

- **10 products** from the 40-product catalog, covering **all 6 archetypes** (A1–A6).
- Per product: wall-clock time, LLM cost (USD), quality score (0–100 via
  `scripts/lib/product-score.mjs`), CI/test pass rate, live preview URL.
- **Honest reporting** — failures and SPEC-OBJECTION re-opens are published, not
  hidden. A benchmark that only shows wins reads as marketing; one that shows a
  failure mode reads as engineering.
- Done = `docs/benchmarks/BENCH-2026-07-batch1.md` + fleet score table + site page.

Explicitly NOT in scope: production deploys with custom domains (preview URLs
suffice — `infra-provisioner` is human-gated and costs real money), and prompt/agent
tuning between runs (that would invalidate comparability; tuning happens after).

## Product selection (10 of 40, weighted like the catalog)

| # | Product (catalog №) | Archetype | Why picked |
|---|---------------------|-----------|-----------|
| 1 | Dispatch & scheduling app (№1) | A1 CRUD | flagship home-services vertical |
| 2 | Client portal (№6) | A1 CRUD | professional-services flagship |
| 3 | ATS — applicant tracking (№29) | A1 CRUD | most-recognizable SaaS shape |
| 4 | Customer booking portal (№3) | A2 Booking | calendar+reminders core path |
| 5 | Class booking + membership (№21) | A2 Booking | payments in the loop |
| 6 | Lead CRM + nurture (№18) | A3 CRM | sequences/automation depth |
| 7 | Profitability dashboard (№8) | A4 Dashboard | ingest+viz, different data shape |
| 8 | Instant quoting / estimate builder (№2) | A5 Marketplace-lite | *expected-hard* case, on purpose |
| 9 | Subcontractor coordination portal (№35) | A5 Marketplace-lite | two-sided flows |
| 10 | Coaching content delivery (№22) | A6 Content | access-tier gating |

Rationale: 3×A1 (largest catalog bucket), 2×A2, 2×A5 (hardest — publishing a hard
case is the credibility move), 1 each A3/A4/A6.

## Execution protocol (per product)

1. **Fresh dir** — `mkdir ~/bench/<slug> && cd` (sandbox-cwd-policy: sub-agents write
   only inside cwd). `git init`. One product = one repo.
2. **Brief** — a pre-written 3–5 sentence product brief per product (fixed before the
   batch starts, committed to `docs/benchmarks/briefs/` — so runs are reproducible
   and nobody can accuse post-hoc brief-tuning).
3. **Run** — `/start "<brief>"` → pipeline S1–S7. **One human action: approve the CTO
   gate.** Everything else unattended. `GREAT_CTO_COST_CAP` set to **$25/product**
   (cost-guard hook) so a runaway build self-terminates instead of burning budget.
4. **Capture** — after S7 (or failure), collect from the product dir:
   - wall time: first verdict ts → last verdict ts (`.great_cto/verdicts/*.log`)
   - LLM cost: sum of `.great_cto/cost-history.log`
   - quality: `node scripts/lib/product-score.mjs <dir>` (0–100 + grade)
   - tests: `npm test` exit + count; e2e specs present/pass
   - deploy: Vercel/Cloudflare preview URL reachable (HTTP 200)
   - failure class if any: SPEC-OBJECTION / gate-block / cost-cap / crash
5. **Freeze** — tag the product repo `bench-2026-07`, record commit SHA in results.

## Waves & sequencing

- **Wave 0 (shakeout, 1 product):** №3 ATS — the most standard shape. Purpose: debug
  the *capture* tooling (a `scripts/bench-collect.mjs` that emits one JSON row per
  product from the artifacts above), not the pipeline. Fix collector bugs here.
- **Wave 1 (3 products):** №1, №4, №7 — one per major archetype family. Checkpoint:
  if ≥2 of 3 fail before S6, stop and fix the pipeline first (the benchmark would
  measure noise, not capability).
- **Wave 2 (6 products):** the rest, 2–3 in parallel terminals max (verdict logs are
  per-project dirs, no interference; parallelism is bounded by human gate-approvals
  and laptop CPU, not by the tooling).

## Budget & time estimate

| Item | Estimate | Basis |
|------|----------|-------|
| LLM cost | **$60–200 total** | proof run = $3.40 for one *feature*; full product ≈ $6–20; ×10 + retries |
| Wall clock per product | 2–5 h unattended | proof feature = 1h26m; product = multiple features |
| Human time | ~15 min/product | brief prep + 1 gate approval + collect |
| Calendar | **~1 week** | waves are sequential; products within a wave parallel |
| Hosting | $0 | Vercel/CF preview tiers |

## Publication

1. `docs/benchmarks/BENCH-2026-07-batch1.md` — the full table (per-product rows +
   per-archetype averages via `product-score.mjs --fleet ~/bench`), methodology
   section, failure narratives, links to frozen repos (public or redacted).
2. Site: `site/benchmark.html` — headline numbers (median time, median cost, fleet
   score), the 10-row table, link to methodology. Replaces "one real run" as the
   proof anchor; README badge updates from n=1 to n=10.
3. Each product repo gets `docs/quality/SCORE-{slug}.md` (harness Phase 3 artifact).

## Risks

- **Pipeline breaks mid-batch** → wave-0/wave-1 checkpoints exist precisely to fail
  fast; fixes between *waves* are allowed (and disclosed), fixes between *products
  inside a wave* are not.
- **Score inflation suspicion** → scorer rubric + collector are open source in this
  repo; briefs are pre-committed; repos are frozen at a tag. Anyone can re-run.
- **Preview URLs rot** → capture a screenshot per product at collect time; page shows
  screenshot + URL, so the benchmark survives link death.
- **Actions billing-locked** → CI-green is verified locally (`scripts/ci-local.sh`
  equivalent inside each product); noted in methodology.

## Next steps

1. ~~Write the 10 briefs → `docs/benchmarks/briefs/`~~ ✅ (frozen 2026-07-10)
2. ~~Build `scripts/bench-collect.mjs`~~ ✅ (+ `scripts/bench-run.sh` launcher)
3. ~~Run wave 0 (ATS), fix collector~~ ✅ — **completed 2026-07-10**: 3h25m wall,
   269/0 tests, score 74/B, security APPROVED P0:0, preview live. One incident
   (harness bg-wait timeout, resumed). Results: `docs/benchmarks/BENCH-2026-07-batch1.md`.
4. Waves 1–2 via `scripts/bench-run.sh`, collect, extend the BENCH doc.
5. Site page + README badge update.

## Protocol amendments (from wave 0, apply to waves 1–2)

- **Launch via `scripts/bench-run.sh`** — encodes clean-env auth, the bg-wait
  ceiling fix, and the benchmark-mode preamble. Requires standalone-CLI OAuth
  (`claude /login` in a terminal, not the desktop app).
- **Human actions: 0, not 1** — runs use `approval-level: auto` (CTO pre-approval
  in the launch prompt). Disclosed in BENCH methodology.
- **Cost column = `token_equiv_usd`** from transcripts (list-price API equivalent);
  the wave-0 real number was **$171.61** vs the $6–20 estimate — cache reads
  dominate. Out-of-pocket on Max subscription ≈ $0, so the batch budget concern
  is void; the published number is the API-equivalent.
- **Interruption ≠ failure** — collector splits terminal `failure` from recovered
  `incidents[]`; both are published.
