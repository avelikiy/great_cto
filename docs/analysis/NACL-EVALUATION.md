# Evaluation: ITSalt/NaCl

**Source:** [ITSalt/NaCl](https://github.com/ITSalt/NaCl) — 57 SDLC skills for Claude Code
(BA → SA → TL), Neo4j graph as source of truth. A direct competitor to great_cto in the
Claude-Code-SDLC niche, with a different philosophy: heavy upstream analysis + graph DB,
vs great_cto's lean / local-first / eng-driven approach.

## Positioning

| | NaCl | great_cto |
|---|---|---|
| Source of truth | **Neo4j graph** (Cypher traceability) | plain markdown + **beads** (dolt, dependency graph) |
| Upstream rigor | heavy BA/SA analysis layer | light — architect onward |
| Hard deps | Docker + Neo4j | none (npx, no DB) |
| Strengths | graph traceability, **strict-mode governance**, analytical rigor | 61 reviewers + compliance archetypes, board, cost focus, self-improvement eval loop (2.37.0) |

## What to take (and what not)

| Idea | Take? | How |
|---|---|---|
| **Strict mode — evidence-BLOCKING gates** | 🔥 P0 | Gate refuses to pass on any task in `{UNVERIFIED, BLOCKED, FAILED, NOT_RUN}`; only override = signed exception |
| **Signed exceptions + emergency mode** | 🔥 P0 | Auditable `.great_cto/exceptions/` registry replaces ad-hoc `--admin` / `--no-verify` |
| **Per-UC impl-brief bundle** (files-to-modify / NOT-to-modify, api-contract, test-spec, acceptance) | 🟠 P1 | pm/architect emit a tight per-task handoff; cuts scope creep |
| **Gap-closure waves** (register + wave-plan + signed exception) | 🟠 P1 | Incremental gate remediation for existing projects on a version bump |
| **Requirement→UC→task→test traceability** | 🟡 P2 | Model as **beads relationships** (impact analysis via `bd query`) — **not Neo4j** |
| **GOAL_PROOF safety-rails for autonomous /goal** | 🟡 P2 | Refusal catalog + permissions denylist + crash/resume for `/loop`-style autonomy |

### Do NOT take
- ❌ **Neo4j as a hard dependency** (Docker, heavy) — contradicts local-first; do traceability on beads (same lesson as the headroom Rust dependency).
- ❌ Bilingual RU/EN split — great_cto is EN-first.
- ❌ The `analyst-tool` graph-canvas sub-product + Docmost/YouGile integrations.
- ⚠️ The heavy BA/SA analysis layer — great_cto is eng-driven; cherry-pick, don't bolt on full business analysis.

## Why these three (1, 2, 4) first

They close great_cto's **governance gap** without NaCl's heavy stack — and this very session
exposed it: every PR merged with `--admin` over a billing-locked CI, the pre-push hook was
bypassed with `--no-verify`, all **without an auditable trail**. Signed exceptions + strict
gates + gap-closure waves turn silent bypasses into a signed, expiring, reviewable record.
