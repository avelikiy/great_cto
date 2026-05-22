# PLAN — Token economy initiative (2026 Q2)

**Goal:** cut token consumption across the pipeline by 40-60% without changing user-visible behavior.

**Owner:** avelikiy
**Status:** active
**Start:** 2026-05-22
**Target ship:** v2.18 (rolling, one dyra per minor)

---

## Background

Audit identified 7 token-economy gaps. Ranked by ROI:

| # | Gap | Complexity | Expected savings |
|---|-----|------------|------------------|
| 2 | Artifact summaries between agents | low | 30-50% per pipeline |
| 4 | Task-aware memory filter | low | 20-40% per agent start |
| 3 | Session cache by hash | medium | 15-30% on multi-agent |
| 1 | Symbol-level code nav | high | 40-60% on code work |
| 5 | System prompt audit | medium | 10-20% constant |
| 7 | Structured HANDOFF | low | 15-25% post-compact |
| 6 | Stream cancel on hallucination | high | 5-15% (defects only) |

## Phase order

Shipping bottom-up by ROI/effort ratio. Each phase ships independently.

---

## Phase 1 — Artifact summaries (#2)

**Problem:** `ARCH-*.md`, `PLAN-*.md`, `QA-*.md`, `SEC-*.md` are 3-10k tokens each. Each downstream agent reads the full doc. In a typical pipeline, the ARCH gets re-read 4-5 times by different agents = 15-50k wasted tokens per feature.

**Fix:** every artifact-producing agent writes two files:
- `ARCH-feature.md` — full document (unchanged)
- `ARCH-feature.summary.md` — ≤ 250 tokens, structured

Pipeline contract: downstream agents read the `.summary.md` by default. They Read the full doc only when they explicitly need detail (and they're forbidden from re-reading once cached in their context).

**Summary format (strict):**
```markdown
# ARCH-<feature> · summary
- **Decision:** <one line>
- **Stack:** <one line>
- **Risks:** <≤3 bullets>
- **Open questions:** <≤3 bullets>
- **Full doc:** docs/architecture/ARCH-<feature>.md
```

**Deliverables:**
1. `scripts/generate-summary.mjs` — CLI that takes a `.md` artifact, asks Haiku for a structured summary, writes `.summary.md`.
2. Updated agent definitions (architect, pm, qa-engineer, security-officer) — emit `.summary.md` alongside primary artifact.
3. Updated consumer agents (senior-dev, code-reviewer, devops, etc.) — read `.summary.md` first, full doc only on need.
4. Hook `scripts/hooks/summary-enforce.mjs` — on artifact write, generate summary if missing (idempotent).

**Acceptance:**
- Every `ARCH-*.md`, `PLAN-*.md`, `QA-*.md`, `SEC-*.md` has a paired `.summary.md` within 30s of being written.
- Token-economy benchmark: rerun the `docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md` scenario and compare total LLM tokens consumed vs baseline. Target ≥ 30% reduction.

**Risk:** summary loses critical detail and downstream agent makes wrong decision. Mitigation: summary always links to full doc; agent system prompts say "if uncertain after reading summary, Read the full document."

---

## Phase 2 — Task-aware memory filter (#4)

**Problem:** When an agent starts, the pipeline injects `lessons.md`, `decisions.md`, `PROJECT.md` in full. `lessons.md` alone can have 50+ entries (~5k tokens). 95% are irrelevant to the current task.

**Fix:** pre-injection filter on Haiku. Input: task title + lessons.md. Output: 3-5 most relevant lesson IDs. Pipeline injects only those.

**Deliverables:**
1. `packages/cli/src/memory-filter.ts` — `filterRelevant(taskTitle, memoryFile, k=5)`. Returns top-k entries.
2. Haiku prompt template: `agents/_shared/memory-filter-prompt.md`.
3. Integration into `/start` and per-agent context injection.
4. Cost-guard: filter call must cost < $0.001 (caps input tokens).

**Acceptance:**
- Filter call latency < 800ms.
- Filter cost < $0.001 per call (with Haiku).
- On 5 representative tasks, filtered output preserves all lessons a human would mark as relevant (manual eval).
- Benchmark: ≥ 25% reduction in start-up context per agent.

**Risk:** filter drops a relevant lesson. Mitigation: agent prompt includes "you may query `~/.great_cto/lessons.md` directly if you suspect a relevant lesson is missing"; filtered list is additive guidance, not a hard restriction.

---

## Phase 3 — Session cache by hash (#3)

**Problem:** `PROJECT.md`, `ARCHITECTURE.md`, `ARCHETYPES.md` etc. are re-read by 5-7 agents per session. Same content, same hash, multiple full reads.

**Fix:** session-scoped read cache. First Read computes SHA-256, stores `{hash → content}` in `.great_cto/.session-cache/<hash>.cache`. Subsequent reads in the same session: agent gets a stub `[cached: PROJECT.md@a3f2 — content already in earlier message]` instead of full content.

**Deliverables:**
1. Hook `scripts/hooks/read-cache.mjs` — intercepts Read tool calls (via PreToolUse hook in `.claude/settings.local.json`).
2. Cache dir lifecycle: created at `/start`, cleared at session end.
3. Compatibility: if a file changes mid-session, hash mismatch → full re-read.

**Acceptance:**
- Cache hit rate ≥ 60% on canonical pipeline run.
- ≥ 15% token reduction on multi-agent runs.
- Zero stale reads (changed file = cache miss).

**Risk:** Claude's hook system may not support PreToolUse on Read. Fallback: inject cache stub via system prompt + memory layer (less effective).

---

## Phase 4 — System prompt audit (#5)

**Problem:** 57 agent definitions. No recent audit. Suspected bloat: motivational filler ("you are an expert with 20 years..."), redundant safety reminders, copy-pasted compliance boilerplate.

**Fix:** systematic audit. Each agent's frontmatter + prompt ≤ 1500 tokens. Anything larger moves to a knowledge file the agent reads on demand.

**Deliverables:**
1. `scripts/audit-agent-prompts.mjs` — measures tokens per agent, flags > 1500.
2. Per-agent refactor PR: trim, move knowledge to `agents/_shared/knowledge/<topic>.md`.
3. Eval: regression test on canonical scenarios — same outputs, fewer tokens.

**Acceptance:**
- All 57 agent prompts ≤ 1500 tokens.
- Eval suite shows no quality regression vs baseline.
- ≥ 10% constant token saving on every agent invocation.

**Risk:** trimming context breaks an agent in production. Mitigation: ship behind feature flag `GREAT_CTO_LEAN_PROMPTS=1`, A/B for one week.

---

## Phase 5 — Structured HANDOFF (#7)

**Problem:** Post-compact, agents re-read everything from scratch. `HANDOFF.md` exists but is freeform — no contract about what's already summarized.

**Fix:** rewrite HANDOFF generator to emit a structured doc with:
- `## Already-known files` — list with hash; agents are forbidden from re-reading these
- `## Open threads` — what was in flight at compact time
- `## Decisions made this session` — pointer to verdict log range

**Deliverables:**
1. Update `scripts/hooks/session-end.mjs` to emit structured HANDOFF.
2. Update agent prompts: read HANDOFF first on session resume, respect the "already-known" list.

**Acceptance:**
- Post-compact session reads ≥ 25% fewer tokens for the same task.
- HANDOFF parseable by downstream scripts.

---

## Phase 6 — Symbol-level code navigation (#1)

**Problem:** Agents reading whole files for one symbol. 2k-line file = 30k tokens for one function lookup.

**Fix:** new MCP server `code-nav`. Backed by tree-sitter. Exposes:
- `get_symbol(name, file?)` — returns the symbol's source range + signature only
- `get_callers(name)` — files + line ranges that call it
- `get_dependencies(name)` — what this symbol imports/uses
- `outline(file)` — top-level symbols only (no bodies)

**Deliverables:**
1. `packages/code-nav/` — new package, tree-sitter wrapper, MCP server.
2. Languages: TypeScript, JavaScript, Python, Rust (covers ~90% of fixtures).
3. Update agent prompts: "for code questions, prefer code-nav over Read."

**Acceptance:**
- `get_symbol` returns < 500 tokens for any single function.
- ≥ 40% token reduction on code-heavy agents (senior-dev, code-reviewer, qa-engineer) in canonical scenarios.

**Risk:** tree-sitter parse failures on edge cases. Mitigation: fallback to Read on parse error.

---

## Phase 7 — Stream cancel on hallucination (#6)

**Problem:** When an agent hallucinates (cites a non-existent file path, references unbound variable), we generate the full output anyway, then catch it post-hoc in review. Wasted tokens.

**Fix:** lightweight stream watcher. Tail the streaming response, run cheap regex/AST checks against the project. On hallucination marker → cancel + restart with corrective prompt.

**Deliverables:**
1. `packages/cli/src/stream-watcher.ts` — checks file paths, symbol references against project state during stream.
2. Cancel mechanism (depends on Claude SDK streaming support — investigate first).
3. Restart prompt template with the detected hallucination.

**Acceptance:**
- Detects ≥ 80% of file-path hallucinations during stream.
- Cancel + restart costs less than letting the bad output complete.

**Risk:** false-positive cancels. Mitigation: only cancel on high-confidence markers (file paths, symbol refs); ignore prose.

---

## Cross-cutting

**Benchmarking infrastructure** — before any phase ships, we need a baseline.

Deliverable: `scripts/benchmark-tokens.mjs`
- Replays the canonical E2E pipeline (Python CLI feature from `docs/qa/runs/2026-05-09/`)
- Records total input/output tokens per agent
- Writes `docs/benchmarks/tokens/YYYY-MM-DD-<phase>.json`
- Phase ships only if benchmark beats previous baseline by target margin.

**Telemetry** — none. Per `docs/PRIVACY.md`, zero telemetry. Benchmarks are local-only.

---

## Schedule (rough)

| Phase | Effort | Target |
|-------|--------|--------|
| Benchmarking infra | 0.5d | week 1 |
| Phase 1 (summaries) | 1d | week 1 |
| Phase 2 (memory filter) | 1d | week 2 |
| Phase 3 (session cache) | 2d | week 3 |
| Phase 4 (prompt audit) | 1.5d | week 4 |
| Phase 5 (HANDOFF) | 0.5d | week 4 |
| Phase 6 (code-nav) | 4d | week 5-6 |
| Phase 7 (stream cancel) | 3d | week 7-8 |

Total ≈ 13.5 dev-days. Each phase is independent and ships behind a feature flag.

---

## Starting now: Phase 1 implementation

See `docs/plans/PLAN-token-economy-phase-1.md` for the detailed Phase 1 task breakdown.
