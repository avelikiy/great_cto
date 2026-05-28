# Memory Index — great_cto

> Cross-session knowledge index. Agents read this at session start to avoid re-deriving solved problems.
> Cap: 200 lines. When full, compress entries older than 90 days into a single "archived" line per topic.
> Updated by: `/save` command and `continuous-learner` agent after each session.

---

## How agents use this file

**At session start** (every agent, before reading source files):
1. Read this file — takes ~500 tokens
2. Follow the links for relevant topics
3. Do NOT re-derive anything already documented here
4. Add new learnings at the END of a session (not mid-session)

**Reading order** (memory layers, later wins):
1. This file → `.great_cto/memory/MEMORY.md` (index)
2. `.great_cto/lessons.md` (project-specific lessons, timestamped)
3. `~/.great_cto/decisions.md` (global decisions, all projects)
4. `~/.great_cto/verdicts/` (past agent verdicts with rationale)
5. Source files (only after the above)

**Compress phases, not facts** — when updating, preserve:
- ✅ WHY a decision was made
- ✅ File:line references for important patterns
- ✅ Anti-patterns encountered + consequence
- ❌ Dead ends (compress to "tried X, failed because Y")
- ❌ Verbose stack traces (keep only the root cause + fix)

---

## Active topics

| Topic | Summary | Detail in |
|-------|---------|-----------|
| Pipeline | SDLC pipeline: architect→pm→senior-dev→qa+cso→devops. 2 gates: arch + ship | `skills/great_cto/SKILL.md` |
| Agent routing | Trigger → subagent_type table (30+ specialists) | `skills/great_cto/SKILL.md §CRITICAL` |
| Approval levels | auto / gates-only / strict / expert / step-by-step | `skills/great_cto/SKILL.md §Approval Level` |
| Coordinator | Multi-agent lifecycle: DECOMPOSE→CLASSIFY→DISPATCH→MONITOR→SYNTHESIZE→VERIFY | `agents/coordinator.md` |
| Memory system | This file. 200-line index → topic files | `skills/great_cto/memory-index.md` |

---

## Key decisions (project-level)

| Decision | Rationale | Date |
|----------|-----------|------|
| User guardrails global (`~/.great_cto/guardrails.yml`) | Applies org-wide patterns across all projects | 2026-05-28 |
| Malformed guardrails: warn not abort | Broken rules must not block CI | 2026-05-28 |
| Root cause taxonomy required at triage time | Enables pattern detection before postmortem | 2026-05-28 |
| Cross-AI config from single `ai_tools:` field | Prevents per-tool manual configuration drift | 2026-05-28 |
| SDD: one question at a time | Multi-question forms feel like interrogation; sequential conversation surfaces real intent | 2026-05-28 |

---

## Recurring patterns (project-specific lessons)

| Pattern | What we learned | Files |
|---------|----------------|-------|
| `homedir` import | Must import from `node:os`, NOT `node:path`. `node:path` has no `homedir` export. | `packages/cli/src/bootstrap.ts`, `rules-loader.ts` |
| OpenSRE parallel tools | Call ALL primary integration tools simultaneously per round, not sequentially | `agents/l3-support.md §Step 3` |
| Bootstrap template generation | Write global files (guardrails, memory) during `great-cto init`, not later | `packages/cli/src/bootstrap.ts` |

---

## Anti-patterns encountered

| Anti-pattern | Consequence | Correct approach |
|---|---|---|
| `homedir` from `node:path` | Build fails: `Module '"node:path"' has no exported member 'homedir'` | Import `homedir` from `node:os` |
| Delegating understanding in worker prompts | Workers hallucinate context | Include file:line + exact change in every brief |
| Sequential tool calls in l3-support | Slower MTTR, misses correlated signals | Call all primary tools in parallel per round |

---

## Compression log

*(entries here when topics are compressed — add date + reason)*

---

## Template for new projects

When initializing a new project, copy this template and clear the "Key decisions", "Recurring patterns", and "Anti-patterns" sections. Keep the "How agents use this file" section intact.

```bash
# During great-cto init (run by bootstrap.ts):
mkdir -p .great_cto/memory
cp ~/.claude/plugins/cache/local/great_cto/*/skills/great_cto/memory-index.md .great_cto/memory/MEMORY.md
# Update the project-specific sections
```
