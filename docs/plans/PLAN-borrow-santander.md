# PLAN: borrow from Santander AI Open Source

**Date:** 2026-06-25 · **Status:** ✅ COMPLETE — all 3 TAKEs shipped + tested
- TAKE 2 ralph → `16d6c89` · TAKE 1 mech-gov → `60029c5` + `aac3fb5` · TAKE 3 autoguardrails → `3ba5611`
- suite 450/450, validate.py PASS. (`llm_bridge` + mattpocock grill/writing-skills not taken — see Skip.)
**Source:** [github.com/SantanderAI](https://github.com/SantanderAI) (14 repos, Apache-2.0).
Studied: `mech-gov-framework`, `ralph` (+ `ralph-vault-skill`), `autoguardrails`, `llm_bridge`.

## Principle

Take only what strengthens **the moat (mechanical gates)** or closes a **roadmap** item.
Adapt natively into great_cto's idioms (markdown agents, `.great_cto/` workspace, Beads,
`scripts/`) rather than vendoring Python. Preserve Apache-2.0 attribution where code is adapted.

---

## TAKE 1 (strategic) — mechanical governance + metrics  ·  effort M

**Source:** `mech-gov-framework` — R1 (text-only) / R2 (mechanical: hard gates, candidate
freezing, argument-quality check, ambiguity gate, commit–reveal entropy) / R3 (adaptive) +
**governance metrics** + synthetic decision dataset.

**Why:** great_cto has gates (`gate:product`, `gate:ship`, `change_tier`) but they're ad-hoc and
**unmeasured**. mech-gov gives the vocabulary + the numbers to make "human-gate as a product"
real.

**What we take:**
1. **R1/R2/R3 regime tags** on every gate — is this gate text-only (a reviewer read it, R1) or
   mechanically enforced (CI / a script blocks, R2)? Label them in `gate-plan.mjs`.
2. **Governance metrics** (`scripts/lib/gov-metrics.mjs` + `/gov-metrics`): gate-trigger rate,
   block rate, override/waiver rate, false-block rate (blocked then approved unchanged),
   time-in-gate, R1-vs-R2 ratio. Reads `.great_cto/gates.log` + verdicts.
3. **Ambiguity gate** + **argument-quality check** as concrete reviewer mechanisms — a reviewer
   must refuse to pass a finding whose argument doesn't name attacker/input/impact (already
   seeded into `security-officer` this session; generalize via `_shared/`).
4. **Commit–reveal** for the LLM-judge — the judge commits a hash of its verdict before seeing
   peer verdicts (anti-anchoring / anti-gaming). Optional, `judge-validate.mjs`.

**Where:** `scripts/lib/gov-metrics.mjs`, `scripts/lib/gate-plan.mjs`, `commands/gov-metrics.md`,
`agents/_shared/argument-quality.md`.

## TAKE 2 (roadmap) — ralph unattended runner  ·  effort S  ·  ⟵ DOING FIRST

**Source:** `ralph` — dependency-free loop that runs an AI coding CLI with a **fresh session each
iteration**; continuity lives in the workspace. `stop.md` signal, live-reload config, log rotation,
tool rotation on token exhaustion.

**Why:** roadmap has "Headless task-runner — queue product builds, run on a VPS, unattended."
Ralph IS that. great_cto's `PROJECT.md` / `HANDOFF.md` / `lessons.md` already provide the
workspace-continuity the loop needs.

**What we take:** a great_cto-native `scripts/ralph-loop.sh` — fresh `claude -p` (or codex/gemini)
each iteration, fed a great_cto loop-prompt that says "read `.great_cto/HANDOFF.md` + PROJECT.md,
make incremental progress, update HANDOFF". `STOP.md` / `.great_cto/stop` exit signal, log
rotation under `.great_cto/loop-logs/`, model-capability knob. Apache-2.0 attribution to ralph.

**Where:** `scripts/ralph-loop.sh`, `commands/loop.md` (thin wrapper), README roadmap → shipped.

## TAKE 3 (ai-system/agent-product) — ASR guardrail loop  ·  effort M

**Source:** `autoguardrails` — autoresearch loop searching a single `policy.md` to minimize
**attack-success-rate (ASR)** with a **benign-pass floor**; fixed eval suite, append-only results.

**Why:** great_cto has `ai-security-reviewer` + `ai-eval-engineer` + EVAL golden sets but no closed
**prompt-injection hardening loop with an ASR metric**.

**What we take:** `scripts/eval/asr-loop.mjs` + `tests/eval/security/asr-suite.jsonl` +
`policy.md` surface; acceptance rule = keep candidate only if ASR drops and benign-pass falls
≤ 2pp. Wire into `ai-eval-engineer` for the agent-product archetype.

**Where:** `scripts/eval/asr-loop.mjs`, `tests/eval/security/`, `agents/ai-eval-engineer.md`.

---

## Sequence

1. **TAKE 2 (ralph)** — S, self-contained, closes a roadmap item. *(first)*
2. **TAKE 1 (mech-gov)** — M, strategic; gov-metrics + regime tags.
3. **TAKE 3 (autoguardrails)** — M; ASR loop for agent-product.

## Skip

`llm_bridge` (great_cto has its own router); `gen-fraud-graph`, `auto-bayesian`,
`causal-perception`, `mutatis-mutandis`, `linear-adapter-trainer`, `genetic-algorithm`,
`sota-stressed-datasets` — ML research, not pipeline-relevant (keep as fintech-fairness pack refs).

From `mattpocock/skills`: take the **grill** interrogation technique (into `brainstorming` +
architect) and compare **writing-great-skills**; the rest duplicates the orchestrated pipeline.
