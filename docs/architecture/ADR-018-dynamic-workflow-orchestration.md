# ADR-018 — Dynamic-workflow orchestration for the coordinator

**Status:** Accepted (mapping validated against live runtime — Claude Code v2.1.156)
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

| WPL column | Script construct (**real API**, validated 2026-05-29) |
|---|---|
| `Class` (Research / Implementation / Verification) | `phase(title)` group + a matching `meta.phases[]` entry |
| `Owned files` | an author-written `assertDisjoint(zones)` JS check run before the implement stage; overlap → serialize. **Not** a runtime guarantee — the script enforces it. |
| `Depends on` | `await` ordering, or `pipeline(items, stageA, stageB)` for per-item chains without a barrier |
| `Agent` (subagent_type) | `agent(prompt, { agentType })` — note the option is **`agentType`**, not `type` |
| `Acceptance criterion` | a verify-stage `agent(..., { schema })` whose StructuredOutput must satisfy the criterion (3-state `acceptance`) |

Generated shape (**validated against the live runtime** — these are the real
function names, confirmed by running the audit workflow in the Validation
section below):

```javascript
export const meta = {                         // required, pure literal
  name: 'large-dispatch-<feature>',
  description: '<one line>',
  phases: [{ title: 'Research' }, { title: 'Implement' }, { title: 'Verify' }],
}
// great_cto invariants encoded as code, not trusted to the runtime:
//   - strict_file_ownership: assertDisjoint() before implement (author-written)
//   - three_state_completion: verify stage checks event+artifact+acceptance
//   - model-tier policy (ADR-002): cheap stages routed via the `model` opt

phase('Research')
const research = await parallel([
  () => agent(WPL[1].brief, { agentType: 'Explore', model: 'haiku', phase: 'Research' }),
  () => agent(WPL[2].brief, { agentType: 'Explore', model: 'haiku', phase: 'Research' }),
])

assertDisjoint([WPL[3].writeZone, WPL[4].writeZone])   // ownership gate (plain JS)

phase('Implement')
const impl = await parallel([
  () => agent(brief(WPL[3], research), { agentType: 'senior-dev', model: 'sonnet', phase: 'Implement' }),
  () => agent(brief(WPL[4], research), { agentType: 'senior-dev', model: 'sonnet', phase: 'Implement' }),
])

phase('Verify')                                // 3-state + adversarial cross-check
const verify = await parallel([
  () => agent(accept(WPL[5], impl), { agentType: 'qa-engineer',      model: 'haiku',  schema: VERDICT, phase: 'Verify' }),
  () => agent(accept(WPL[6], impl), { agentType: 'security-officer', model: 'sonnet', schema: VERDICT, phase: 'Verify' }),
])

return synthesize(research, impl, verify)      // only this returns to context
```

**API corrections vs the original draft** (now folded in above):
- The spawner is **`agent(prompt, opts)`**, not `spawn({...})`. Prompt is the
  first positional arg; `agentType`/`model`/`schema`/`label`/`phase` are opts.
- Parallelism uses **`parallel(thunks[])`** (barrier) or **`pipeline(items, …stages)`**
  (no barrier) — not raw `Promise.all`. Thunks are `() => agent(...)`, not bare promises.
- A **`meta`** export (pure literal) is mandatory and declares the phases.
- Structured results come from the **`schema`** opt (forces a StructuredOutput
  tool call); the validated object is returned directly — no parsing.

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

## Validation status — VALIDATED (2026-05-29)

The WPL→script mapping was validated by running a real dynamic workflow on
great_cto itself (Claude Code v2.1.156, Opus 4.8 session). The workflow audited
all 57 `agents/*.md` files for three frontmatter criteria across **6 parallel
haiku subagents** with structured output.

**Run evidence:** 6 agents · 633K subagent tokens · 64 tool calls · 16.1s
wall-clock · returned a validated `{count, violations[]}` object straight to
context. The runtime, per-stage `model: 'haiku'` routing, `parallel()` barrier,
`phase()` grouping, and `schema` StructuredOutput all worked as the mapping
predicted. Real API names are folded into the script example above.

### Two runtime gotchas worth pinning

1. **`args` arrives as a string.** Passing an array via the Workflow `args`
   field serialized it to a string; `files.slice()` then returned a string and
   `batch.map` threw `TypeError: batch.map is not a function` (run failed in
   19 ms, 0 agents). **Fix:** embed the work-list as a script literal, or
   `JSON.parse(args)` defensively. great_cto's generated scripts must **not**
   pass the WPL through `args` — inline it.
2. **`agent()` not `spawn()`**, **`agentType` not `type`**, thunks not promises.
   See the API-corrections list above.

### The validation also proved *why* the verify phase is mandatory

The single-pass haiku audit returned 6 findings. Ground-truth `grep` (acting as
the verify phase) showed only **2 were correct**:

| Workflow finding | Truth | Failure mode |
|---|---|---|
| devops advisor = sonnet-4-6 | ❌ false positive | intentional sonnet advisor; criterion conflated "≠ opus-4-8" with "drift" |
| qa-engineer advisor = sonnet-4-6 | ❌ false positive | same |
| l3-support description < 20 chars | ❌ false positive | haiku miscount (its own `detail` admitted confusion) |
| knowledge-extractor missing tools | ❌ false positive | has `allowed-tools`; criterion mis-read |
| **dpdpa-reviewer missing tools** | ✅ true | — |
| **us-privacy-reviewer missing tools** | ✅ true | — |
| gdpr-reviewer missing tools | ⚠️ **false negative** | genuinely missing; the batch agent skipped it |

**4 false positives + 1 false negative out of 6.** A cheap single-pass fan-out
over-flags and misses. This is direct empirical support for the ADR's core
design choice: the verify phase (adversarial cross-check / independent
ground-truth) is **not optional** — it is what converts a noisy fan-out into a
trustworthy result. great_cto's generated scripts MUST include it, and
criterion design must target the *exact* drift value (e.g. `claude-opus-4-7`),
not a negation (`≠ claude-opus-4-8`), to avoid flagging intentional choices.

**Real findings actioned:** `tools:` field added to `dpdpa-reviewer`,
`gdpr-reviewer`, `us-privacy-reviewer` (FM-004). Remaining lint noise
(`coordinator` uses `allowed-tools`; 3 privacy reviewers use a `description: |`
block scalar the linter mis-parses as FM-002) is a separate linter-parser
issue, tracked apart from this ADR.

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
- **Research-preview dependency** — the mapping and the real API names are now
  validated (see Validation status), but the feature is still in research
  preview, so the `agent()`/`parallel()`/`meta` surface may shift. Accepted
  **with that caveat**; re-verify the script example when the feature exits
  preview.
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
