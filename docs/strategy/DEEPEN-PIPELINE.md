# Deepen the pipeline — close the four broken loops

> Status: active · Created 2026-06-27 · Source: multi-agent depth-gap audit (7 finders → synthesis → adversarial critique), every claim re-verified against source before this doc was written.

## Thesis

great_cto is **broad** — 59 agents, 39 commands, 34 skills, 30 references, 19 packs, 6 build
pipelines. It is **shallow** at the four places depth compounds: four named loops that the
product advertises, that all self-assert, and that **none of which mechanically work**.

Depth ≠ more agents/skills (most of the 59/34 are already shelfware). Depth = making these
four loops **falsifiable end-to-end**, in dependency order, adding **zero** new agents/skills/
stages until one vertical slice produces a real PROMOTE and a real REJECT.

## The four broken loops (verified)

| Loop | What it claims | What actually happens | Evidence (verified) |
|------|----------------|-----------------------|---------------------|
| **Learning** (eval → promote) | prompt change is measured on a held-out set, promoted only if no regression | measures sampling noise, not the prompt | `tests/eval/runner.mjs:211` actor = hardcoded generic system prompt, never loads `agents/<X>.md` → baseline ≡ candidate; `:441` `writeFileSync(RESULTS_PATH,'')` wipes history every run; `:112` parses only `> Pack:` while 10 EVALs use `> Agent:`; n=1 (`:282`); judge `maxTokens:120` (`:242`); `scripts/eval-gate.mjs:60` epsilon **default 0** |
| **Recall** (crystallize → architect) | a crystallized pattern resurfaces as an architecture constraint | pattern is never matched — key-dead | crystallize writes frontmatter `target_agents` / `applicable_archetypes:[]` / `mttr_reduction_estimate` (`commands/crystallize.md:206-210`); architect greps `applies_to:` / `stack_fingerprint:` / `symptom:` / `detection_order:` / `mttr_reduction:` (`agents/architect.md:379-386`) — **zero overlap** |
| **Cost** (cost-guard + board $) | spend is tracked and capped | spend is guessed and self-reported | `scripts/hooks/cost-guard.mjs:34` `ROUGH_COST_USD` hardcoded table, `:164` fallback `{lo:1,hi:5}`; `scripts/log-verdict.sh:37` trusts a typed `cost_usd` CLI arg; `response.usage` captured nowhere |
| **Completion / Acceptance** | three-state completion + acceptance evidence enforced | declared, never enforced | `shared/orchestrator.toml:28,35` `three_state_completion`/`acceptance_evidence_required = true`; **no SubagentStop hook exists** to enforce it; impl-brief only checks acceptance items *exist*, not that they are *satisfied* |

**So-what:** the product's headline value props (`learn → crystallize → recall`, the cost
dashboard, `/prompt-evolve`) are currently placebo. Every PROMOTE/REJECT is a coin-flip.

## Sharpest reframe

> Don't widen a pipeline that leaks at every existing seam. Build **one** working vertical
> slice for `security-officer` (already has 2 EVAL files): prompt edit → agent-bound,
> prompt-threaded, multi-sample eval with persisted history → variance-aware gate
> (epsilon ≥ stddev) → a crystallized pattern that actually resurfaces in architect recall.
> Prove a real PROMOTE **and** a real REJECT on that one agent, then replicate.

Hard prerequisite chain: **persist history → bind actor to agent + thread `--prompt-file` →
multi-sample + epsilon (one bug) → agent→EVAL coverage gate** (52 of 59 agents have no eval,
so a perfect runner still measures nothing for them).

## Roadmap

### Wave 1 — make the existing signal truthful (all S/M, strict dependency order)

| # | Artifact | Kind | Impact | Effort | Fixes |
|---|----------|------|--------|--------|-------|
| 1 | `tests/eval/runner.mjs` — stop wiping `results.jsonl`, append to `results-history.jsonl` (run-id + commit-sha) | utility | high | S | persistence (prereq) |
| 2 | `tests/eval/runner.mjs` — parse `> Agent:` AND `> Pack:`; load `agents/<X>.md` body as actor; `--agent`/`--filter`/`--prompt-file`; emit `agent` per row | utility | high | M | actor-binding |
| 3 | `tests/eval/runner.mjs` `--samples N` + `scripts/eval-gate.mjs` epsilon ≥ stddev | gate | high | M | n=1 + ε=0 (one bug) |
| 4 | `scripts/coverage-gate.mjs` — block agent add/edit without ≥1 holdout EVAL; wire into `plugin-ci.yml` | gate | high | S | eval coverage |
| 5 | `scripts/judge-validate.mjs` — validate judge vs labelled gold set; raise `maxTokens` if truncated | utility | high | M | judge calibration |
| 6 | `shared/gp-schema.mjs` + crystallize writer rewrite + conformance test | utility | high | M | recall (key-dead) |
| 7 | `scripts/lib/cost-meter.mjs` — capture `response.usage` → real `$`; log-verdict auto-fills; cost-guard reads measured | utility | high | M | cost fiction |
| ★ | **Prove the slice:** a real PROMOTE and a real REJECT for `security-officer` end-to-end | milestone | — | — | the whole loop |

### Wave 2 — give every self-assertion teeth + persist measurement

| Artifact | Kind | Impact | Effort |
|----------|------|--------|--------|
| `scripts/hooks/subagent-stop-completion.mjs` — three-state completion teeth (SubagentStop) | loop | high | M |
| `scripts/lib/acceptance-verify.mjs` — execute frozen acceptance criteria (`verify:` per item) | gate | high | M |
| `scripts/lib/metrics-trend.mjs` — persist gov-metrics + eval history, drift alert | utility | high | M |
| crystallize → eval-gate routing + KE→GP→commit-sha→eval-delta trace | loop | med | M |
| `agents/code-reviewer.md` — one stable reviewer, replaces 3 inline senior-dev forks | agent | med | S |
| Backfill EVAL coverage for the next ~10 highest-traffic agents | content | high | M |

### Wave 3 — only after the loop produces real signal

| Artifact | Kind | Impact | Effort |
|----------|------|--------|--------|
| `agents/e2e-test-engineer.md` + post-deploy smoke against the live URL | agent | high | L |
| `skills/observability-baseline` wired into app-scaffolder + infra-provisioner | skill | high | M |
| `skills/test-strategy/SKILL.md` added to qa-engineer `skills:` list | skill | high | M |
| `scripts/lib/gate-retro.mjs` — join PASS verdicts to subsequent incidents | loop | med | M |
| `.github/workflows/runtime-ci.yml` paths fix — run orphaned board/worker tests | gate | med | S |
| Scheduled eval-drift re-run (ONLY now — a fixed actor finally produces real dated signal) | utility | med | S |

## Empirical findings from running the loop live (OpenRouter)

Running the now-working loop produced real evidence — the point of building it:

- **Real REJECT proven**: a gutted security-officer candidate was blocked (33% < 67% holdout). The gate fires; cost is measured ($1.09 full agent vs $0.08 gutted); history persists.
- **Eval is noisy, and the noise is actor-side**: even with `--judge-votes 3` the judge is stable (its misses are stable label disagreements), but rates still swing ±~0.09–0.35. The variance is run-to-run actor non-determinism, not the judge.
- **`--actor-tools` raises fidelity, not stability**: a ReAct inspect-then-conclude actor (A/B, security-officer holdout, n=3) lifted mean rate 0.50→0.64 and got finding-gate to clear its 67% bar (50%→72%) — the baseline can finally pass — but did **not** reduce stddev. Recommended for agent (`> Agent:`) evals; left opt-in (the "diff under review" fixture fits agent evals, not archetype pack evals).
- **So-what for gating**: variance is inherent → rely on more `--samples` + the variance-aware `eval-gate` (Δ within the σ-band = noise), and `eval-drift`'s noise gate (refuses to alert above stddev 0.1). Don't chase zero variance; gate around it.

## Do NOT build (breadth traps)

- **~6 new agent roles** (test-architect, sre-engineer, technical-writer, dependency-upgrader,
  observability-engineer as a standalone role) — org-chart expansion on a 59-agent base; none
  closes a named loop. Fold their intent into existing agents/skills.
- **6-skill methodology dump** (api-design, data-migration, performance-budget,
  supply-chain-hygiene, feature-flag-rollout, prompt-engineering) — references with no agent
  loading them and no gate checking their output. A skill may only ship paired with the agent
  `skills:` list it joins AND the gate that verifies its artifact.
- **Product-side UI skills as "depth"** (golden-components registry, design-system-lint,
  seed-data generator, a11y-baseline, perf-budget-web) — they broaden what the factory
  *outputs*; not depth on how the factory *verifies itself*. Legitimate later product work.
- **Five new test stages at once** (integration/contract, mutation, a11y, perf-budget, e2e) —
  widening a pipeline whose acceptance/completion/cost gates are not even enforced yet.
- **Scheduled eval-drift / A-B BEFORE Wave 1** — re-running a placebo actor just produces
  dated placebos. Strictly downstream of persistence + actor-binding + multi-sample.
- **Tripling one capability** — a dependency-upgrader agent AND a supply-chain-hygiene skill
  AND a dependency-upgrade lane are one maintenance loop, not three line items.
