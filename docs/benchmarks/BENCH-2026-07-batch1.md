# BENCH — 2026-07 batch 1 (public benchmark, in progress)

**Date:** 2026-07-10 · **Status:** **7 of 10 products completed**; 3 interrupted
mid-build and collected as-is (marked in the table, not comparable) · Plan:
[PLAN-2026-07-10-public-benchmark.md](../plans/PLAN-2026-07-10-public-benchmark.md)

**Headline across the 7 completed runs:** median score **70 (B)**, range 58–86.
Five of seven ship a fully green suite (157–368 tests); four reach a live preview
URL. Median API-equivalent cost **$171** per product, $0 out-of-pocket (built on
a Claude subscription). The dominant cost is *calendar* time, not money: runs
that finished inside one session window took **1h46m–3h25m**, while those that
collided with the subscription's 5-hour limit show 11–24h spans that are mostly
outage, not work.

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
| 1 | Dispatch & scheduling | A1 crud | 11h 46m² | 225 / 1 fail³ | 66 (C) | APPROVED P0:0 (TCPA fixed in-run) | preview live (SSO-walled) | $145.20 · $0 out-of-pocket | none² |
| 4 | Customer booking | A2 booking | 15h 25m² | 368 / 0 fail | 58 (C) | APPROVED P0:0 P1:0, 1×P2 follow-up | preview live (SSO-walled) | $319.30 · $0 out-of-pocket | none² |
| 7 | Profitability dashboard | A4 dashboard | **1h 46m** | **157 / 0 fail** | **86 (A)** | APPROVED P0:0 P1:0 | preview live (SSO-walled) | $182.64 · $0 out-of-pocket | none |
| 6 | Lead CRM | A1 crud | **1h 46m** | 130 / 2 fail | **80 (B)** | — | none | $102.36 · $0 out-of-pocket | none |
| 5 | Class scheduling | A2 booking | 24h 09m² | **316 / 0 fail** | 70 (B) | — | none | $178.81 · $0 out-of-pocket | none² |
| 2 | Client portal | A3 portal | 22h 49m² | **196 / 0 fail** | 63 (C) | — | **preview live (public, 200)** | $149.81 · $0 out-of-pocket | none²⁴ |
| — | **Interrupted — not comparable** ↓ | | | | | | | | |
| 8 | Subscription billing | A5 billing | 2h 13m⁵ | 54 / 0 (partial) | 70 (B)⁵ | — | none | $214.16 | **stopped mid-build** |
| 9 | Coaching platform | A6 content | 22h 30m⁵ | not run (exit 143) | 76 (B)⁵ | — | none | $191.98 | **stopped mid-build** |
| 10 | Quoting | A1 crud | —⁵ | 366 / 187 fail | 53 (D)⁵ | — | none | $324.29 | **stopped mid-build** |

¹ One **incident**: the first headless launch was killed by a 600s background-task
wait ceiling ~1h22m in; the run was resumed with `--continue` and completed. The
wall-clock figure includes the ~40min interruption gap. Fixed in the launcher for
all subsequent runs (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`).

² Wave-1 **incident** (dispatch + booking): all three wave-1 runs launched in
parallel and hit the Claude subscription **session limit** mid-run (resets at
midnight); dispatch and booking were resumed next morning with `--continue` and
completed. Their wall-clock figures are *calendar spans including the ~8h overnight
outage* — active pipeline time is a fraction of that. Dashboard finished before the
limit hit. Booking additionally needed a second resume to run its final QA +
security stages, which the interrupted run had lost track of.

³ Dispatch's 1 failing test is a flaky integration case the pipeline itself had
already logged in its QA backlog; its integration tests require a local Docker
Postgres (left provisioned by the run, started at collection time).

⁴ Portal is the only product whose preview URL is reachable **without** the SSO
wall (HTTP 200 to anonymous visitors). Its first collection reported 140 failing
tests: the suite provisions its schema on a fresh ephemeral Postgres, and the
first run raced that provisioning. Docker was unavailable on the collection host,
so the suite was run against two throwaway host Postgres clusters bound to the
ports its compose file expects; on a warm schema it is 196/0.

⁵ **Interrupted runs — do not read these as product scores.** Subscription
session limits stopped these three repeatedly; they were resumed several times
and finally **terminated by the operator mid-build**, not by any pipeline
failure. What the numbers actually mean: *subs* had 54 tests written of a planned
suite (its own last commit claims 352 passing at a later stage than the tree we
collected); *coaching* exited 143 (SIGTERM — the kill) with its suite never run;
*quoting*'s 187 failures are a half-wired build, not a verdict on the product.
Their `score` is what the collector computes from a partial tree and is **not
comparable** to the seven completed runs. Cost is real spend and is reported.
Finishing them properly means re-running the remaining pipeline stages to
completion — see *Reproduce*.

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

### Wave-1 row details (all frozen at `bench-2026-07`)

- **№7 Dashboard (86/A, 1h 46m)** — the clean run: architect → pm → build → QA →
  security in one sitting, before the session limit hit. Real bug found and fixed
  end-to-end mid-run (CSV importer dropped retainer hours, which silently broke the
  over-allocation alert). Vercel preview + Neon/Resend provisioning runbook.
- **№1 Dispatch (66/C)** — security review surfaced a TCPA exposure (SMS to
  customers without recorded consent); the pipeline added a consent checkbox at
  job creation, wired it through to the en-route send gate, and re-reviewed —
  APPROVE went through only after the fix. 6 non-blocking findings left in Beads.
- **№4 Booking (58/C)** — the stress case: interrupted by the session limit
  twice, mid-implementation, with completed work sitting in unmerged worktree
  branches. The resume merged the branches, finished the remaining tasks, patched
  6 CVEs (nodemailer bump), deployed — but *lost track of QA and security*, which
  had to be explicitly requested in a second resume (QA: 368 tests, ~87% coverage,
  P0/P1/P2 all zero). Honest lesson: interruption recovery preserves code but not
  pipeline-stage state.

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

## Wave-1 lessons (applied to wave 2)

| Lesson | Consequence |
|--------|-------------|
| 3 parallel runs exhaust the subscription session limit before finishing | wave 2 runs in two batches of 3 with an auto-launcher gating on free slots |
| Resume-after-interrupt preserves code but loses pipeline-stage state (booking skipped QA/security) | resume prompts now name the completed stages and the remaining ones explicitly |
| Wall-clock on interrupted runs measures the outage, not the pipeline | calendar span kept (honest), active-time noted in footnotes |

## Reproduce

```bash
mkdir -p ~/bench/<slug> && cd ~/bench/<slug> && git init
npx great-cto@2.85.3 init && rm .great_cto/PROJECT.md   # reset the init stub
scripts/bench-run.sh ~/bench/<slug> docs/benchmarks/briefs/<slug>.md
# …after the run exits:
node scripts/bench-collect.mjs ~/bench/<slug> --slug <slug> --out ~/bench/results.jsonl
git -C ~/bench/<slug> tag -a bench-2026-07 -m freeze
```
