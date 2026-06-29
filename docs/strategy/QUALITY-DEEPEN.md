# Deepen product/pipeline quality — from presence floor to executed ceiling

> Status: active · Created 2026-06-29 · Builds on the product-quality harness (89/100 floor)

`product-score.mjs` measures the **presence** of quality machinery (a floor: 89/100).
The honest gap: presence ≠ excellence — it never runs anything. Deepening quality means
moving to a **measured ceiling** (does it actually work + meet budgets) that **gates deploy**.

## Axes (by leverage)

| # | Axis | Floor → ceiling |
|---|------|-----------------|
| **1** | **Execute, not inspect** | run the product: `npm test` (pass-rate), typecheck, lint, dep-audit, secret-scan → a **measured** execution score. (browser axe/Lighthouse = follow-up) |
| **2** | **Quality as a blocking gate** | score < threshold or regression vs baseline → block deploy (S6/S7); not a report |
| **3** | Per-archetype quality contracts | domain tests: escrow-idempotency, entitlement-bypass, double-booking, aggregation-correctness |
| **4** | Actor-fidelity | tool-using eval actor → learning loop actually improves agents → quality compounds |
| **5** | Quality trend / regression corpus | per-product SCORE → `metrics-trend`; golden known-bad builds that must be caught |
| **6** | UX/visual depth | visual-regression + axe + Web Vitals on the generated app |

## This PR — #1 + #2

- `scripts/lib/product-eval.mjs` — **executes** checks in a product dir (`npm test`,
  typecheck, lint, `npm audit`, secret-scan) → pure `scoreExecution()` (weighted 0–100) +
  `runEval(dir)`. Complements the static `product-score` (floor) with a **measured** ceiling.
- **Gate mode** — `--gate --min N [--baseline f]`: exit non-zero on sub-threshold or regression.
- Run on the generated fleet (A1–A6) for **measured** numbers (tests actually executed).

Browser-based a11y/perf (axe, Lighthouse) and per-archetype contracts (#3) are follow-ups —
they need a running preview + Playwright. #1 here is the deterministic, Node-only core.

## Empirical (executed) result

Ran `product-eval` on the 6 generated fleet products — it executed `npm test` in each:

| | floor (presence) | **ceiling (executed)** |
|--|------------------|------------------------|
| Fleet | 89/100 | **100/100** — tests ran + passed (13/13 … 23/23), secrets clean |

Note: these minimal zero-dep products have no TS/lint/lockfile → typecheck/lint/audit
score n/a (full credit). A richer product exercises those dims for real. The point:
quality is now **measured by execution + gateable** (`--gate`, wired into devops Checkpoint B),
not just inspected. Floor (shape) + ceiling (works) together.

## #3 shipped — per-archetype contracts

`archetype-contracts.mjs` encodes domain invariants per archetype (CRUD: validation/auth;
booking: no-double-book/cancel-release; CRM: stage-transitions/referential; dashboard:
aggregation/window; marketplace: escrow-held/release-idempotent/buyer≠seller; content:
entitlement-gate/purchase-grants) and checks the product's tests cover them. Wired into
qa-engineer Step 0f. Fleet result: **all 6 products 100% contract coverage** — the
generated suites actually test the dangerous domain paths.
