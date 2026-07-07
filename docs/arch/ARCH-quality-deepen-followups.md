# ARCH — QUALITY-DEEPEN follow-ups (#3-#6)

**Date:** 2026-07-03

> Beads: great_cto-482l · Status: scoping · Reader: whoever picks up the next quality wave.
> Builds on QUALITY-DEEPEN #1+#2 (PR #118), #3 (PR #119), #5 (PR #120). Numbering per
> `docs/strategy/QUALITY-DEEPEN.md` § Axes.

## Problem

The shipped waves gave us **floor (89)** + **ceiling (100)** + **domain (100 on 6 fleet archetypes)**
+ unified verdict + trend record + deploy gate. But the axes doc lists **6 axes**, only #1/#2/#3/#5
are landed. Deferred work is fragmented across code comments, gated CI cron, and Beads-a9tp close notes.
This doc consolidates the follow-ups, cuts what got absorbed, and orders what remains.

## What #4 turned out to be — and its status

**#4 = Actor-fidelity** (row 4 in QUALITY-DEEPEN.md, missed in commit numbering because the wave
landed as Beads-**a9tp** before axis-numbered PRs started). Substantially **done**:

- `tests/eval/runner.mjs` ships ReAct inspect-loop actor (`--actor-tools`, `--actor-turns`), lifted
  security-officer holdout rate 0.50→0.64 (a9tp close-note).
- A/B result: **variance is inherent LLM non-determinism, not fixable by actor structure** — mitigated
  via `--samples` + variance-aware gate + `eval-drift.mjs` noise-gate.
- Remaining: enable the scheduled drift cron (see F4 below).

## Follow-up backlog

| ID | Axis | What | Why | Files | Effort | Priority |
|----|------|------|-----|-------|--------|----------|
| **F3a** | #3 | Extend `archetype-contracts.mjs` to 8 more real archetypes | Today: 6 web families. Tool ships 14. Gate is a no-op on `ai-system`, `agent-product`, `commerce`, `web3`, `iot-embedded`, `data-platform`, `browser-extension`, `mobile-app`. | `scripts/lib/archetype-contracts.mjs`, `tests/lib/archetype-contracts.test.mjs` | **M** | **P1** |
| **F3b** | #3 | Fix known archetype-rename drift in `product-score.mjs` tests (great_cto-7nxj: expected `cli-tool`, got `cli`) | 2 failing tests on main. Blocks green CI baseline for further quality work. | `tests/lib/product-score.test.mjs` | S | P1 |
| **F3c** | #3 | Sharpen contract regex fragility (`/hold/i` matches "household", `/aggregat/i` misses `groupBy`) | Present patterns give false-positives. On richer test suites this quietly inflates domain coverage. | `scripts/lib/archetype-contracts.mjs` | S | P2 |
| **F4** | #4 | Enable scheduled eval-drift cron | `.github/workflows/scheduled-evals-drift.yml` cron is commented out pending noise-gate confidence. Baseline is now in place; measure stddev over 3 runs; if ≤ 0.1, un-comment. | `.github/workflows/scheduled-evals-drift.yml`, one-page runbook | S | P2 |
| **F5a** | #5 | Wire `--baseline` into unified `quality.mjs --gate` (parity with `product-eval.mjs`) | `product-eval.mjs` supports regression gate; `quality.mjs` only supports absolute `--min`. A regression in overall score sneaks past. | `scripts/lib/quality.mjs`, `tests/lib/quality.test.mjs` | S | P1 |
| **F5b** | #5 | `quality.mjs --trend` — read `metrics-history.jsonl`, print sparkline + delta | Record works (--record), read doesn't. `metrics-trend.mjs check` is generic; a quality-scoped view surfaces regressions at a glance. | `scripts/lib/quality.mjs`, reuses `metrics-trend.mjs` | S | P2 |
| **F6a** | #6 | Browser a11y check via headless Playwright — **only if product declares a preview command** | `axe-core` in a Playwright page → violations count → signal to `product-eval`. Playwright already devDep (^1.60.0). Zero new runtime cost when off; opt-in via `--browser` flag. | `scripts/lib/product-browser.mjs` (new), wired into `product-eval.mjs` optional | **M** | P2 |
| **F6b** | #6 | Web Vitals (LCP/CLS/INP) via same Playwright harness | Same harness as F6a. Skip Lighthouse (heavy, flaky in CI, needs Chrome). Emit 3 numbers → 1 signal. | `scripts/lib/product-browser.mjs` (extends F6a) | S | P3 |
| **F6c** | #6 | Visual-regression / screenshot-diff | **CUT** — infra-heavy (needs golden storage, per-viewport baselines, flake tolerance), out of scope for a zero-dep local-first tool. Value < cost. | — | L | **CUT** |

Total in scope: **8 items** (F6c cut). Rough effort: **S×5 + M×2 + docs**.

## Non-goals (explicit)

- ❌ **Not** a browser test harness for the shipping tool itself. Only for the products it *generates*.
- ❌ **Not** replacing `metrics-trend.mjs` — F5b is a thin quality-scoped view over it.
- ❌ **Not** rewriting `product-eval.mjs` semantics — F6a/b add signals, don't shift weights.
- ❌ **Not** adding Lighthouse. Chrome dep + CI flake + Playwright already covers Web Vitals.
- ❌ **Not** solving inherent LLM variance (settled by a9tp — variance-aware gate is the answer).
- ❌ **Not** visual regression (F6c).
- ❌ **Not** contract coverage for `library` / `cli-tool` / `infra` — no user-facing domain invariants; the generic rubric is honest enough.

## Browser a11y/perf — honest cost/value read (F6a/b)

The initial framing said "Playwright" would violate zero-dep/local-first. Reality check:

- **Playwright is already `devDependencies`** (`package.json` ^1.60.0) — used for repo's own tests.
- **`axe-core`** is ~500KB, no browser download of its own.
- **Runtime cost = 0** when `--browser` flag not passed. Feature is opt-in and off by default.
- **Failure mode = graceful skip** if the product has no `dev` / `preview` / `start` script or if
  the URL doesn't respond within 15s — signal marked `na`, no score penalty (same as tsconfig-less
  product today).

**Recommendation:** ship F6a (a11y) as the minimal credible browser check. Defer F6b to a
follow-up once F6a is proven stable in fleet runs. Cut F6c. The whole thing is ~180 LOC in a new
`scripts/lib/product-browser.mjs` — a11y-only.

## Recommended implementation order

Two independent streams; F3b is the unblocker for both.

```
F3b (fix drift)  ──►  F3a (contracts x8)   ──►  F3c (regex hardening)
                                                       │
                                                       ▼
                                             F5a (baseline gate)  ──►  F5b (trend view)
                                                       │
                                                       ▼
                                                     F6a (a11y)   ──►  F6b (web vitals)   ──►  F4 (drift cron)
```

- **F3b first, always.** CI baseline must be green before we add tests.
- **F3a and F5a can run in parallel** (different files, no shared state).
- **F4 is safe to do anytime after 3 clean drift-runs measure stddev**. Independent of everything else.

### Decomposition Matrix (3+ streams)

| Stream | Write-zone (files/dirs) | Depends on | Why parallel-safe |
|--------|-------------------------|------------|-------------------|
| A: fix drift | `tests/lib/product-score.test.mjs` only | — | test-file only |
| B: contracts | `scripts/lib/archetype-contracts.mjs` + its `.test.mjs` | A (green baseline) | own module |
| C: quality gate | `scripts/lib/quality.mjs` + its `.test.mjs` | A | own module, no overlap with B |
| D: browser check | `scripts/lib/product-browser.mjs` (new) + hook line in `product-eval.mjs` | A | new file; single hook in `product-eval.mjs` is a small merge |
| E: drift cron | `.github/workflows/scheduled-evals-drift.yml` (uncomment cron line) | measure stddev × 3 runs | orthogonal |

## Requirements checklist (contract to QA)

- [ ] REQ-1 (F3b): `node --test tests/lib/product-score.test.mjs` — 15/15 pass.
- [ ] REQ-2 (F3a): `CONTRACTS` in `archetype-contracts.mjs` covers 14 archetypes; each has ≥2 invariants + a rubric-documented rationale.
- [ ] REQ-3 (F5a): `quality.mjs --gate --baseline prev.json` exits 1 on overall regression > 2 points (matches product-eval semantics).
- [ ] REQ-4 (F5b): `quality.mjs --trend` prints last-N overall scores and Δ vs baseline; exit 0 always (read-only).
- [ ] REQ-5 (F6a): opt-in `--browser`; graceful `na` when no preview script; a11y signal integrated into `product-eval` scoring.

## Risks

- **F3a regex sprawl** — 14 archetypes × 2-3 invariants = 30-40 patterns. Mitigation: table-driven; tests must include one true-positive + one true-negative per invariant.
- **F6a CI flake** — Playwright + browser download in CI adds minutes. Mitigation: don't run in unit-test job; run only on `quality --browser` invocation (opt-in).
- **F4 false-positive alerts** — if 3-run stddev sits at 0.09-0.11, cron will alternately gate and not. Mitigation: bump `--max-noise` cap to 0.12 with rationale doc, or require 2 consecutive drift signals before alerting.

## Would cut entirely with one-line rationale

- **F6c visual-regression** — infra debt (golden storage, viewport matrix, flake tolerance) exceeds value for a local-first tool.
- (Everything else earns its slot — see F3-F6 rows.)
