# PLAN: context compression (headroom-inspired)

**Source:** [chopratejas/headroom](https://github.com/chopratejas/headroom) — context-compression
layer for AI agents (Rust core + Python/TS libs + proxy + MCP, Apache-2.0).

**Goal:** cut the tokens great_cto agents read from tool-outputs, logs, RAG chunks, and
artifacts — **without losing answers** — and do it cheaply. Extends the existing token-economy
(`memory-filter.mjs`, `generate-summary.mjs`, `lib/guards.mjs`).

---

## 1. Decision — integrate (depend on headroom) vs rewrite (native mjs)

### Option A — Integrate headroom as a dependency (npm/PyPI `headroom-ai` + its MCP)

| ✅ Pros | ❌ Cons |
|---|---|
| Zero reimplementation — 6 algorithms + CCR + CacheAligner for free | **Heavy footprint** — Rust native binary, redis/sqlite for CCR, optional HF model (Kompress-base). Breaks great_cto's "local-first, plain-markdown, minimal-deps" promise |
| Rust core is fast + battle-tested (proptest, adversarial benches) | **Install friction** — `npx great-cto` must stay clean across win/mac/linux × node 18/20/22; a native module complicates that |
| Maintained upstream, active CI | **Another always-on MCP** process (we already run llm-router) → resource + complexity cost |
| Reversible CCR + retrieve is genuinely hard to build well | **Upstream coupling** — young v0.x project; breaking changes / abandonment risk; roadmap not ours |
| Sophisticated code AST + model compressors we won't easily match | **Overlap + double system** — partially duplicates memory-filter/generate-summary → two compression paths to reason about |
| | "same answers" is a marketing claim — must verify via our own holdout gate anyway |

### Option B — Rewrite the concepts natively in mjs

| ✅ Pros | ❌ Cons |
|---|---|
| Stays in our stack (mjs, **zero native deps**), preserves local-first ethos | Reimplementation + maintenance cost |
| Take only what fits — CCR-retrieve, log/json compressors, line-importance | Won't match headroom's depth (AST CodeCompressor, Kompress-base, 6 algos) |
| MIT-clean, full control, no upstream coupling | Risk of doing it worse (compression that drops the FATAL) → needs rigorous eval |
| Right-sized — we compress **our own** artifacts/tool-outputs, not a general proxy | NIH for the hard parts |
| Cheap deterministic compressors are ~100–200 LOC each | |

### ✅ Recommendation — Option C: Hybrid (native core + optional headroom accelerant)

- **Build natively** the cheap, high-leverage, deterministic pieces that fit our stack and
  ethos: log-template compaction, JSON minify/crush, **line-importance** (keep FATAL/ERROR/
  stack), and a **CCR-style retrieve escape hatch** for `memory-filter`.
- **Offer headroom as an opt-in** power-user accelerant (its MCP) for heavy compression
  (AST/model-based) — documented, **never a hard dependency**. Default great_cto stays lean.
- **Gate everything** through the 2.37.0 holdout eval — a compressor ships only if it does
  not drop answers on a held-out set. This is the discipline headroom's "same answers" lacks.

**Why hybrid:** great_cto's differentiation is *lean, local-first, verifiable*. A hard
Rust/MCP dependency erodes that for a capability we only need on our own artifacts. But the
deterministic compressors are cheap to own, and headroom-as-opt-in lets power users go further.

---

## 2. What we take (mapped)

| From headroom | great_cto target | Mechanism |
|---|---|---|
| **CCR — reversible + `retrieve`** | `memory-filter.mjs` is **lossy** (drops non-top-k) | Store dropped entries in `.great_cto/ccr/`; expose `/recall` (+ MCP retrieve) so an agent pulls a dropped item back by id → lossless-on-demand |
| **Deterministic type-aware compressors** | `generate-summary.mjs` is **LLM-only ($)** | Native `compress(text,{type})` ContentRouter: log-template, json-minify, diff-collapse → **$0** pre-compression before LLM |
| **`line_importance` + `keyword_detector`** | `lib/guards.mjs` just truncates | Severity/keyword-scored trimming: keep FATAL/ERROR/stack, crush boilerplate. Used by l3-support/qa-engineer |
| **`headroom learn` (failed-session mining)** | `continuous-learner` extracts lessons | Add a "mine failures → corrections" angle to continuous-learner |
| **CacheAligner (prefix stability)** | `claude-api` skill (caching) | Document prefix-stabilization for KV-cache hits |
| **Adversarial compression benchmarks** | holdout eval gate (2.37.0) | Add `EVAL-compression-fidelity` (compressed input must still surface the key fact) |

---

## 3. Phased implementation

**Phase 0 — Spike (0.5d)**
- Benchmark headroom on real great_cto artifacts (a QA log, a tool-output JSON, an ARCH doc):
  measure token reduction AND answer-fidelity via the holdout gate. Decide thresholds + whether
  the opt-in headroom path is worth documenting. Output a short findings note.

**Phase 1 — Native deterministic compressors (P0, 2–3d)**
- `scripts/lib/compress/` — `content-router.mjs` (detect type) + `log-template.mjs`,
  `json-minify.mjs`, `line-importance.mjs`. Pure functions, `$0`, no LLM. Unit tests + a fixture
  corpus. Export `compress(text, {type, budget})`.

**Phase 2 — CCR retrieve escape hatch (P0, 2–3d)**
- `scripts/lib/ccr.mjs` — store dropped/compressed originals under `.great_cto/ccr/<hash>.json`
  (sqlite optional later). Add `/recall <id>` command + an MCP `recall` tool. Wire `memory-filter`
  to register what it drops so nothing is unrecoverable.

**Phase 3 — Wire into hot paths + gate (P1, 2d)**
- Use `line-importance` + compressors in l3-support / qa-engineer log/test-output reading and in
  tool-output pre-compression. Add `EVAL-compression-fidelity` (tuning+holdout) — a compressor
  ships only if the holdout gate confirms the key fact survives.

**Phase 4 — Optional headroom integration (P2, 1d)**
- Document (not depend): how to add the `headroom-ai` MCP for heavy/AST/model compression as an
  opt-in. A `headroom: true` flag in PROJECT.md that, if set and installed, routes heavy blobs
  to it; otherwise native compressors only.

**Phase 5 — Failed-session mining (P2, 1–2d)**
- Extend `continuous-learner` to mine failed sessions → corrections appended to AGENTS.md/CLAUDE.md
  (the `headroom learn` angle).

---

## 4. Acceptance
- Every compressor passes `EVAL-compression-fidelity` on a held-out set (no dropped FATAL/answer).
- `memory-filter` drops are recoverable via `/recall` (lossless-on-demand).
- Default install gains **zero** native dependencies; headroom is strictly opt-in.
- Deterministic path compresses logs/JSON at **$0** (no LLM call) before any LLM summary.

## 5. Do NOT
- ❌ Make headroom (Rust/native/MCP) a hard dependency of the default plugin.
- ❌ Trust "60–95% / same answers" without the holdout gate.
- ❌ Vendor Apache-2.0 code without NOTICE; we borrow concepts, build native.
