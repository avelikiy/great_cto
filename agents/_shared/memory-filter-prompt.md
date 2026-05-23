# Memory filter — prompt contract

> Used by `scripts/memory-filter.mjs` (Phase 2 of token economy initiative).
> This file documents the prompt template so reviewers can audit it without reading the script.

## Purpose

Reduce start-up context injected into each agent by filtering `lessons.md` and
`decisions.md` to only the entries relevant to the current task. Target: ≥25%
token reduction per agent start.

## Prompt template

```
You are a context filter for an AI pipeline. Given a task title and a list of
memory entries (each with an ID and heading), return the IDs of the N most
relevant entries.

Task: {task_title}

Entries:
[0] {entry_0_heading}
[1] {entry_1_heading}
...

Rules:
- Return ONLY a JSON array of integer IDs, e.g. [2, 7, 0]
- Order by relevance (most relevant first)
- If nothing is relevant, return []
- No explanation, no markdown fences
```

## Model selection

| Provider | Model | Cost/call (≤2k tokens in) | Latency |
|---|---|---|---|
| Anthropic | claude-haiku-4-5 | ~$0.0000025 | ~200 ms |
| OpenRouter | moonshotai/kimi-k2 | ~$0.0000015 | ~400 ms |
| Heuristic | — | $0 | <5 ms |

Cost guard: input always capped at 8 000 chars (~2k tokens). Max output: 100 tokens.
Total cost per call well under $0.001 budget.

## Integration points

Agents that call this filter:

| Agent | Memory file | Was | Now |
|---|---|---|---|
| `architect` | `.great_cto/lessons.md` | `tail -100` | `node scripts/memory-filter.mjs "$TASK" .great_cto/lessons.md` |
| `architect` | `~/.great_cto/decisions.md` | `awk … \| head -60` | `node scripts/memory-filter.mjs "$TASK" ~/.great_cto/decisions.md` |
| `senior-dev` | `.great_cto/lessons.md` | `tail -50` | `node scripts/memory-filter.mjs "$TASK" .great_cto/lessons.md` |
| `senior-dev` | `~/.great_cto/decisions.md` | `grep … \| head -40` | `node scripts/memory-filter.mjs "$TASK" ~/.great_cto/decisions.md` |

## Fallback chain

1. **Anthropic Haiku** (if `ANTHROPIC_API_KEY` set) — best structured output
2. **OpenRouter** (if `OPENROUTER_API_KEY` set) — Kimi K2 by default
3. **Heuristic** — TF-IDF keyword scoring, no API needed, always available

## Safety: missed relevant entry

If the filter drops a lesson the agent needed, the agent prompt includes:

> You may read `.great_cto/lessons.md` directly if you suspect a relevant lesson
> is missing from the injected context. The filtered list is additive guidance,
> not a hard restriction.

This means the filter is best-effort, not a hard gate.

## Opt-out

Set `GREAT_CTO_DISABLE_MEMORY_FILTER=1` to inject full files (legacy behaviour).
Useful for debugging or when running in an environment without good LLM access.
