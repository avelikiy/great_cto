# ADR-018 — Dynamic-workflow orchestration for the coordinator

**Status:** Proposed
**Date:** 2026-05-29
**Deciders:** great_cto core
**Related:** ADR-002 (model-tier policy), coordinator agent (DCDSV lifecycle), `shared/orchestrator.toml`

## Context

great_cto's `coordinator` agent runs the **DCDSV** lifecycle
(Decompose → Classify → Dispatch → Monitor → Synthesize → Verify) for any
request that spans 3+ work streams. Today this orchestration happens
**turn-by-turn inside Claude's context window**: the coordinator emits Worker
Contracts, calls the `Agent` tool, waits, reads results back into context,
deduplicates, then spawns the next wave. The plan, the intermediate results,
and the branching logic all live in the conversation. This has three known
limits:

1. **Context pressure** — every worker's full result lands in the
   coordinator's context. A 10-packet run fills the window with intermediate
   output the CTO never needs to see.
2. **Scale ceiling** — `max_parallel_streams = 5` in `orchestrator.toml` is a
   self-imposed cap, partly because more than ~5 concurrent `Agent` calls is
   hard to track by hand.
3. **No resumability** — if the session is interrupted mid-run, completed work
   is stranded in a half-finished transcript; there is no cached-result replay.

On 2026-05-28 Anthropic shipped **dynamic workflows** in Claude Code
(research preview, requires v2.1.154+, pairs with Opus 4.8). A dynamic
workflow is a **JavaScript orchestration script that Claude writes**, executed
by a **runtime in an isolated environment** separate from the conversation.
Intermediate results live in **script variables**, not Claude's context. The
runtime supports **up to 16 concurrent agents / 1,000 per run**, **resumable
state within a session**, and a built-in **adversarial-verification** pattern
(independent agents refute each other until answers converge).

This is, structurally, the runtime great_cto's coordinator has been emulating
by hand. The DCDSV lifecycle, the Work Packet List (WPL), and the
Decomposition Matrix are a *declarative spec*; a dynamic workflow is an
*executable* form of the same spec. This ADR decides whether and how the
coordinator adopts it.

## Constraints we must respect

The runtime is opinionated. These are non-negotiable facts (from
`code.claude.com/docs/en/workflows`) that shape the decision:

| Runtime fact | Consequence for great_cto |
|---|---|
| Script has **no direct filesystem/shell** — only agents read/write/run | Beads (`bd …`) calls cannot live in the script. Lifecycle tracking moves to the wrapping conversation or to dedicated agent steps. |
| **No mid-run user input**; only agent permission prompts pause a run | Human gates (`gate:arch`, `gate:ship`) **cannot** sit inside a single workflow. Each gate-bounded phase = its own workflow. |
| Subagents always run in **`acceptEdits`**, inherit the tool allowlist | File-ownership safety is **not** enforced by the runtime. The script must encode disjoint write-zones; great_cto's `strict_file_ownership` becomes a script-generation invariant, not a runtime guarantee. |
| **Claude-Code-only** feature; disabled via `disableWorkflows` / managed settings | great_cto runs on Codex/Cursor too. Workflow path must be **opt-in with a manual-DCDSV fallback**, mirroring the existing `HOST=claude-code` guard. |
| **Substantially more tokens**; 1,000-agent cap | Cost discipline (ADR-002 model-tier policy) must be pushed *into* the script — route cheap stages to Haiku/Sonnet, reserve Opus for synthesis. |
| Each agent uses the **session model** unless the script routes otherwise | The script must set per-stage models explicitly; it cannot rely on agent-frontmatter `model:` pins (those govern the `Agent` tool, not workflow stages). |

## Decision

Adopt dynamic workflows as an **opt-in execution backend for the DISPATCH
phase of Large COMPLEX-CODE tasks**, with the coordinator acting as a
**workflow *author and wrapper*** rather than a turn-by-turn orchestrator.
The DCDSV lifecycle and `orchestrator.toml` contract remain the source of
truth; the workflow is one of two ways to *execute* a DISPATCH.

```
              ┌─────────────────────────── conversation (coordinator) ───────────────────────────┐
  CTO request │  DECOMPOSE → CLASSIFY → [Decomposition Matrix + WPL]                              │
              │      │                                                                            │
              │      ├─ gate boundary?  ── yes ─► split into one workflow PER gate-bounded phase  │
              │      │                                                                            │
              │      ▼                                                                            │
              │  AUTHORIZE  ("I explicitly authorize spawning parallel subagents")                │
              │      │                                                                            │
              │      ▼                                                                            │
              │  EMIT orchestration script  ◄── generated FROM the WPL (1:1 mapping below)        │
              └──────┼────────────────────────────────────────────────────────────────────────────┘
                     ▼  runtime (isolated, background)
              ┌──────────────────────────────────────────────────────┐
              │  phase: research[]   →  phase: implement[]  (disjoint) │
              │       (parallel)         (owned-files enforced in JS)  │
              │              ▼                    ▼                     │
              │  phase: verify[]  (3-state completion + adversarial)   │
              └──────────────────────────────────────────────────────┘
                     ▼  only the final synthesis returns to context
              ┌─────────────────────────── conversation (coordinator) ───────────────────────────┐
              │  SYNTHESIZE  +  Beads close  +  surface to CTO                                     │
              └────────────────────────────────────────────────────────────────────────────────────┘
```

### WPL → orchestration-script mapping (the core of this ADR)

The existing Work Packet List table is the generation spec. Each column maps
to a script construct:

| WPL column | Script construct |
|---|---|
| `Class` (Research / Implementation / Verification) | **phase** the spawn belongs to (research → implement → verify ordering) |
| `Owned files` | a `writeZone` argument the script asserts is disjoint before the implement phase; overlap → serialize |
| `Depends on` | `await` ordering — a packet's spawn is gated on its dependency's resolved result |
| `Agent` (subagent_type) | the subagent `type` passed to the spawn call |
| `Acceptance criterion` | a **verify-phase** agent whose result must satisfy the criterion (3-state `acceptance`) |

Generated shape (illustrative — exact runtime API names are pinned by the
Claude Code version at generation time, not by this ADR):

```javascript
// Generated from: Decomposition Matrix + WPL for "<feature>"
// great_cto invariants encoded as code, not trusted to the runtime:
//   - strict_file_ownership: writeZones asserted disjoint before implement
//   - three_state_completion: every packet checked for event+artifact+acceptance
//   - model-tier policy (ADR-002): cheap stages routed to haiku/sonnet

const research = await Promise.all([
  spawn({ type: "Explore",  prompt: WPL[1].brief, model: "haiku" }),
  spawn({ type: "Explore",  prompt: WPL[2].brief, model: "haiku" }),
]);

assertDisjoint([WPL[3].writeZone, WPL[4].writeZone]);   // ownership gate

const impl = await Promise.all([
  spawn({ type: "senior-dev", prompt: brief(WPL[3], research), model: "sonnet" }),
  spawn({ type: "senior-dev", prompt: brief(WPL[4], research), model: "sonnet" }),
]);

// Verification phase = 3-state completion + adversarial cross-check
const verify = await Promise.all([
  spawn({ type: "qa-engineer",      prompt: accept(WPL[5], impl), model: "haiku"  }),
  spawn({ type: "security-officer", prompt: accept(WPL[6], impl), model: "sonnet" }),
]);

return synthesize(research, impl, verify);   // only this returns to context
```

### How each `orchestrator.toml` rule is preserved

| Contract rule | Preserved how under workflows |
|---|---|
| `decomposition_matrix_required = true` | Unchanged — the matrix is the **input** to script generation. No matrix → no script. |
| `inline_subagents_allowed = false` | Stronger: the runtime is the only spawner; ad-hoc `claude -p` is structurally impossible inside the script. |
| `max_parallel_streams = 5` | The script self-limits its implement-phase fan-out to 5 even though the runtime allows 16. Conservative cap retained. |
| `spawn_phrase_required = true` | The phrase is emitted in-conversation **before** the script is approved/run. In `claude -p`/SDK (no approval prompt) the phrase is the *only* gate — so it stays mandatory. |
| `three_state_completion = true` | Encoded as the verify phase: each packet's result is checked for `completion_event` (resolved), `artifact` (file exists, non-empty), `acceptance` (criterion command passed). |
| `acceptance_evidence_required = true` | Verify-phase agents return evidence (command output / hash); the synthesis records it. |
| `strict_file_ownership` + `overlap_check_required` | `assertDisjoint(writeZones)` runs **before** the implement phase; overlap forces serialization. This is now a *coded* invariant, removing the manual `grep | uniq -d` check. |

### Gates become workflow boundaries

Because the runtime forbids mid-run user input, a Large task with two human
gates becomes **three** segments:

```
workflow A  →  gate:arch (human)  →  workflow B  →  gate:ship (human)  →  workflow C (deploy)
```

This is *better* than today's model: the human sign-off is a clean boundary
with a self-contained report, and each segment is independently resumable.

### Scope of adoption (what this ADR does NOT do)

- Does **not** replace single-domain or Small/Medium pipelines — those keep
  using the `Agent` tool directly. Workflows are for **Large** DISPATCH only.
- Does **not** auto-enable `ultracode`. Session-wide xhigh is a CTO choice,
  not a great_cto default (cost + token blast radius).
- Does **not** move Beads tracking into the script (runtime has no shell).
  Beads lifecycle stays in the wrapping conversation.

## Phased rollout

1. **Phase 0 (now):** manual DCDSV remains the default. This ADR + a
   `dynamic-workflows` capability note in `coordinator.md` documenting the
   mapping. No behavior change.
2. **Phase 1 (opt-in):** when `HOST=claude-code` **and** workflows are
   enabled **and** the CTO says "workflow", the coordinator generates the
   DISPATCH script from the WPL instead of hand-dispatching. Manual DCDSV is
   the fallback on every other host or when disabled.
3. **Phase 2 (template):** extract great_cto's invariants
   (`assertDisjoint`, 3-state `accept()`, model-tier routing) into a saved,
   reusable workflow under `.claude/workflows/great-cto-large-dispatch` so the
   safety rules are not re-derived per run.

## Consequences

### Positive
- Context stays clean — only the final synthesis returns, not every worker's
  output. Larger runs without window exhaustion.
- Resumability — interrupted Large runs replay cached results instead of
  restarting.
- Safety rules become **code** (`assertDisjoint`, 3-state checks) rather than
  prose a worker can argue around — direct extension of the
  `orchestrator.toml` philosophy ("booleans cannot be argued around").
- Adversarial verification dovetails with great_cto's
  substantiveness/explicit-gate reviewer patterns (v2.29.0).

### Negative / risks
- **Research-preview dependency** — API surface may change; this ADR pins the
  *mapping*, not exact function names. Status stays **Proposed** until the
  feature leaves preview.
- **Cross-AI divergence** — Codex/Cursor users get manual DCDSV only. Two
  code paths to maintain. Mitigated by keeping DCDSV as the canonical spec.
- **Prompt-injection blast radius** — Opus 4.8 regressed on agentic
  prompt-injection (9.6% vs 6.0%, see CHANGELOG v2.31.0). A 1,000-agent run
  over untrusted input multiplies exposure. **Mitigation:** workflows that
  ingest untrusted external content must route through `ai-security-reviewer`
  in the verify phase and keep the tool allowlist minimal.
- **Cost** — a runaway script can burn far more than a hand-run. Mitigated by
  the retained `max_parallel_streams = 5` self-limit and mandatory model-tier
  routing in generated scripts.

## References

- `code.claude.com/docs/en/workflows` — official dynamic-workflows docs
- `claude.com/blog/introducing-dynamic-workflows-in-claude-code`
- `agents/coordinator.md` — DCDSV lifecycle, WPL, Worker Contract
- `shared/orchestrator.toml` — machine-readable coordination contract
- `docs/adr/ADR-002-model-tier-policy.md` — per-stage model cost discipline
- CHANGELOG v2.31.0 — Opus 4.8 upgrade + prompt-injection security note
