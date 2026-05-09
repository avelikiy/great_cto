# PLAN: v2.6.0 — Agent prompt linter

**Status:** in progress · **Date:** 2026-05-09 · **Estimated:** ~1.5h LLM-time

## Why

We have 60 pipeline tests for the **plumbing** (CLI, hooks, board API,
sync, cost math). We have **zero tests for agent prompt content** — the
34 markdown files in `agents/` that actually drive the SDLC pipeline.

A prompt regression today means:
- v2.5.7 added "Phase task tracking (mandatory)" section to 8 agent
  prompts. Easy for someone to delete or rewrite badly without noticing.
- Frontmatter schema (model / tools / maxTurns / timeout) drift silently.
- Required workflow steps (Step 0: Pattern Lookup, etc.) get lost in
  refactors.
- Compliance gates referenced by archetype-specific reviewer agents
  could vanish.

**No test catches any of this today.** The first regression a user sees
is "the agent didn't do X" — months after the bug landed.

This is the structural equivalent of the eval harness we shipped for
`Test/agent_runtime` v0.5.0. Same idea, different surface.

## What ships

A standalone Node script — `scripts/agent-prompt-lint.mjs` — that walks
`agents/*.md` and checks each against a rule set. CI integration via
`scripts/test-pipeline.sh` L1.

### Rule set v1 (catches today's drift)

| ID | Rule | Severity |
|---|---|---|
| `FM-001` | YAML frontmatter parses | error |
| `FM-002` | `description` field present, ≥ 20 chars | error |
| `FM-003` | `model` field is one of: haiku, sonnet, opus | error |
| `FM-004` | `tools` field is a list (not string), has ≥ 1 entry | error |
| `FM-005` | `maxTurns` is a positive integer | warn |
| `FM-006` | `timeout` is a positive integer (seconds) | warn |
| `STR-001` | At least one `## ` heading after frontmatter | error |
| `STR-002` | File size ≤ 50 KB (prevents context-window blowups) | warn |
| `PHASE-001` | Pipeline agents have "Phase task tracking" section | error |
| `PHASE-002` | Phase-task block references `phase-task.sh` helper | error |
| `PHASE-003` | Phase-task uses correct agent slug in `open <agent>` | error |
| `BD-001` | Mentions `bd create` for tasks (not silent failure) | warn |
| `MEM-001` | If references `lessons.md`, path is `.great_cto/lessons.md` | error |
| `MEM-002` | If references `decisions.md`, path is `~/.great_cto/decisions.md` | error |
| `OUT-001` | Defines an explicit output contract (file path or schema) | warn |
| `DEPS-001` | Mentions superpowers only with HOST=claude-code guard | warn |

### What's NOT in v2.6.0

- LLM-as-judge eval (requires API key + cost budget)
- Behavior tests (would need to run Claude Code in CI)
- Cross-prompt consistency (e.g. all reviewers use same gate-decision schema)
- Custom user rule plugins

These land in v2.7.0+ when we have real-LLM mode.

## Pipeline agents (subject to PHASE-001/002/003)

| Agent | Has phase-task section? |
|---|---|
| architect | ✓ (v2.5.7) |
| pm | ✓ (v2.5.7) |
| senior-dev | ✓ (v2.5.7) |
| qa-engineer | ✓ (v2.5.7) |
| security-officer | ✓ (v2.5.7) |
| performance-engineer | ✓ (v2.5.7) |
| devops | ✓ (v2.5.7) |
| l3-support | ✓ (v2.5.7) |
| code-reviewer | _from superpowers_ — skip PHASE rules |

The **22 reviewer agents** (pci-reviewer, regulated-reviewer, etc.) are
single-purpose and don't run in the main pipeline — exempt from
PHASE-001/002/003.

The **3 utility agents** (continuous-learner, ai-prompt-architect,
ai-eval-engineer) likewise exempt.

## Output format

```
$ great-cto lint-prompts

Linting 34 agent prompts in agents/...

  ✓ architect.md
  ✗ qa-engineer.md
      PHASE-002: phase-task block missing helper invocation (line 24)
  ⚠ pci-reviewer.md
      STR-002: file 51234 bytes exceeds 50KB warn threshold
  ✓ senior-dev.md
  ...

──────────────────────────────────────
  ✓ 31 ok · ⚠ 2 warnings · ✗ 1 errors

Failures (must fix):
  - agents/qa-engineer.md (PHASE-002)
```

Exit codes: 0 = clean, 1 = errors, 2 = invalid invocation.

## Integration points

1. **CLI:** `npx great-cto lint-prompts` — runs in any clone with
   `agents/*.md`. Opt-in for plugin-developers / CI.
2. **Pipeline:** `scripts/test-pipeline.sh` L1 adds 1 check that runs
   the linter on the active repo's agents.
3. **CI workflow:** existing `Plugin CI` already validates frontmatter;
   linter extends that to structural rules.

## Acceptance criteria

- [ ] `scripts/agent-prompt-lint.mjs` executable, parses all rules above
- [ ] All 34 current agent prompts pass v1 rule set (or get fixed)
- [ ] Pipeline test L1 includes `agent-prompt-lint clean` check
- [ ] CHANGELOG entry + version bump to v2.6.0
- [ ] Backwards-compat: existing 60 pipeline tests still pass
- [ ] Documented rule set in `docs/AGENT-LINT-RULES.md` (rule id → description)

## Effort estimate

- Plan: 10 min ✓
- Linter framework: 30 min
- Rule implementations: 30 min
- Audit + fix any drift in 34 prompts: 20 min
- Pipeline integration: 10 min
- Docs + ship: 15 min

**~1.5h LLM-time / ~1 week human-team equivalent.**
