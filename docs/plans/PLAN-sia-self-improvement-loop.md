# PLAN: SIA → great_CTO self-improvement loop

**Source:** [hexo-ai/sia](https://github.com/hexo-ai/sia) — Self-Improving AI (Meta→Target→Feedback evolutionary loop, MIT).
**Goal:** Borrow SIA's *closed evolutionary loop* concepts to upgrade great_CTO's existing
self-improvement subsystem (continuous-learner / crystallize / ai-prompt-architect /
ai-eval-engineer / decision-scorer) from an *open* learner into a *closed, gated, generational* loop.

> great_CTO already has the pieces. SIA contributes the **wiring**: generations,
> held-out eval gate, evolutionary memory, and sandboxed trial execution.

---

## 1. SIA → great_CTO mapping

| SIA concept | SIA file | great_CTO equivalent (today) | Gap to close |
|---|---|---|---|
| **Meta-Agent** (writes initial agent) | `build_meta_prompt` | `ai-prompt-architect` (ADR-PROMPT) | already strong — no change |
| **Target Agent** (runs, logs trajectory) | `target_agent.py` | any pipeline agent (architect/senior-dev/…) | trajectory logging is ad-hoc |
| **Feedback Agent** (reads logs+metrics → rewrites) | `FEEDBACK_AGENT_PROMPT` | `continuous-learner` + `crystallize` | **open loop** — learns, but never re-runs to *verify* the improvement |
| **Generations** `gen_1..N` | `run_generation` | — | **missing**: no versioned generational record per agent prompt |
| **Evaluation gate** `evaluate.py` → `results.json` | `run_evaluation` | `ai-eval-engineer` (EVAL-*.md), `gen-evals`, verdicts | evals exist but not used as a **promotion gate** for prompt changes |
| **held-out private split** | `data/private/` | golden sets in EVAL-* | no strict train/holdout separation → overfit risk on golden set |
| **Evolutionary memory** `context.md` + LLM-diff | `context_manager.py` | `lessons.md`, `decisions.md`, `agent-reviews/` | no per-agent generational diff narrative |
| **Sandboxed trial run** venv/docker | `_create_venv`, `_run_target_agent_sandboxed` | hooks run live | no isolated dry-run for candidate prompt before promotion |
| **Config dataclass + env override** | `config.py` | scattered config | low priority — already manageable |

---

## 2. What to take (prioritized)

### 🔥 P0 — Close the loop on prompt improvement
SIA's core insight: **a learned improvement is worthless until re-run and measured against a held-out set.**
Today `continuous-learner` → `crystallize` writes a better pattern/prompt, but nothing *re-evaluates* the
changed agent before it ships.

- Take: the **generation → evaluate → gate** cycle (`run_generation` + `run_evaluation`).
- Apply to: **agent-prompt-improvement pipeline** (`ai-prompt-architect` ↔ `ai-eval-engineer`).
- Result: a prompt revision is promoted only if it beats the previous generation on the golden set.

### 🔥 P0 — Evolutionary memory per agent
- Take: `context.md` pattern — LLM-generated diff narrative between generations
  (`ContextManager._generate_llm_summary`).
- Apply to: **`agent-reviews/` + `decisions.md`** — give each agent a generational changelog:
  *what changed in the prompt, why (from the lesson), and the eval delta.*
- Result: `/agent-review` shows a real evolution timeline, not just current verdicts.

### ⚙️ P1 — Held-out split for evals
- Take: `data/public` vs `data/private` discipline.
- Apply to: **`ai-eval-engineer` golden sets** — split into `tuning` set (visible to prompt-architect)
  and `holdout` set (only the gate sees it).
- Result: prevents prompt overfitting to the visible golden cases.

### ⚙️ P1 — Sandboxed candidate dry-run
- Take: venv-per-run + docker isolation with mem/cpu/timeout limits (`_run_target_agent_sandboxed`,
  `_create_venv`), plus size-guards (`_safe_read_file`, `MAX_*`, eval/shell timeouts).
- Apply to: **`mock-llm.py` / `test-pipeline.sh`** harness — run a candidate prompt against the
  golden set in isolation before it touches the live pipeline.
- Result: safe trial execution of LLM-generated/edited agent prompts.

### 🧩 P2 — Hardening borrows
- Size-guards & truncation limits → reuse in `memory-filter.mjs` / context assembly to resist
  prompt-injection / log-flooding.
- Backend abstraction (`util.run_agent` Claude/OpenHands) → reference for `llm-router` MCP multi-provider.

---

## 3. Target pipelines

1. **`prompt-evolution` (NEW, P0)** — closed loop:
   `continuous-learner` (lesson) → `ai-prompt-architect` (candidate ADR-PROMPT, gen N+1)
   → sandboxed run on tuning set → `ai-eval-engineer` gate on holdout
   → promote only on positive delta → `crystallize` to global-patterns.

2. **`agent-review` (UPGRADE, P0)** — add generational memory:
   per-agent `context.md`-style changelog with eval deltas; surfaced by `/agent-review`.

3. **`eval-harness` (UPGRADE, P1)** — tuning/holdout split + sandboxed dry-run in
   `gen-evals` / `test-pipeline.sh`.

---

## 4. Phased rollout

**Phase 0 — Spike (0.5d)**
- Run SIA `spaceship-titanic` once on Claude backend; capture how `context.md` + `results.json` look.

**Phase 1 — Eval gate + held-out split (P0/P1, 2–3d)**
- Split golden sets into `tuning/` + `holdout/` in `ai-eval-engineer` output schema.
- Add a promotion gate: candidate prompt must beat baseline on holdout to ship.

**Phase 2 — Closed prompt-evolution loop (P0, 3–4d)**
- Wire `continuous-learner` lesson → `ai-prompt-architect` candidate (gen N+1)
  → sandboxed run → gate → promote/reject. Reuse `decision-scorer` for delta scoring.

**Phase 3 — Evolutionary memory (P0, 2d)**
- Port `_generate_llm_summary` → per-agent generational changelog in `agent-reviews/`.
- Surface in `/agent-review`.

**Phase 4 — Sandbox hardening (P1, 2d)**
- venv/docker-isolated candidate dry-run in `test-pipeline.sh`; size-guards into `memory-filter.mjs`.

---

## 5. Do NOT take
- ❌ `permission_mode="bypassPermissions"` / `SANDBOX_MODE="none"` defaults — unsafe outside isolation.
- ❌ SIA as a framework — borrow concepts/snippets, not the carcass; great_CTO's agent model is richer.
- ⚠️ Never auto-promote a prompt to live without the holdout gate passing.

---

## 6. Acceptance
- A prompt revision cannot ship unless it beats the prior generation on a held-out eval set.
- `/agent-review` shows a generational changelog with eval deltas per agent.
- Candidate prompts run sandboxed before touching the live pipeline.
