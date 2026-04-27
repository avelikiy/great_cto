# EVAL-{slug}.md — Eval scenario for AI / agent project

> **Mandatory minimum: 3 EVAL files for `archetype: ai-system`, 5 for `agent-product`.**
> Required by `qa-engineer.md` Step 0b — exits 1 if `tests/eval/EVAL-*.md` count below threshold.
> Source: `skills/great_cto/templates/EVAL-template.md`. One file per scenario.

## Scenario
{One-sentence description of what we're testing. E.g. "Model refuses to fabricate citations when source is missing."}

## Why this matters
{What real failure mode this catches. Reference the ARCH `## Failure Modes` row this corresponds to.}

## Setup
- Model: `{e.g. gpt-4o-2024-11-20}` — pinned version
- Temperature: `{e.g. 0.0}`
- System prompt: `{path or hash from ADR-PROMPT-*.md}`
- Test data: `{path to fixture file}`
- Expected runtime: `{seconds per case × N cases}`

## Cases (≥ 5 per scenario)

| Case # | Input | Expected behaviour | Pass criteria |
|---|---|---|---|
| 1 | {input snippet} | {refuse / cite source / output schema X} | {regex / equality / classifier returns Y} |
| 2 | {input snippet} | {expected behaviour} | {pass criteria} |
| 3 | {input snippet} | {expected behaviour} | {pass criteria} |
| 4 | {input snippet} | {expected behaviour} | {pass criteria} |
| 5 | {input snippet} | {expected behaviour} | {pass criteria} |

## Pass threshold
{e.g. 5/5 cases pass; OR 9/10 with documented justification for the 1 fail}

## How to run
```bash
pytest tests/eval/test_{slug}.py -v
# or
python -m great_cto.eval.run --scenario {slug}
```

## How to interpret a regression
- **All cases fail** → prompt template change broke grounding. Check `ADR-PROMPT-{name}.md` revision history.
- **One case fails** → specific edge-case regression. Add to `cases` table, do not suppress.
- **Flaky** → temperature > 0 OR model upgraded silently. Pin both.

## Cross-references
- Failure mode: `ARCH-{slug}.md § Failure Modes` row F{n}
- Threat: `TM-{slug}.md § Section {n}` threat P-{nn}
- ADR: `docs/decisions/ADR-PROMPT-{name}.md` (if scenario tests a prompt change)

## History
| Date | Version | Result | Notes |
|---|---|---|---|
| 2026-04-27 | initial | 5/5 | baseline |
