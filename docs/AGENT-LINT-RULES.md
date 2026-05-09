# Agent prompt lint rules (v2.6.0+)

`scripts/agent-prompt-lint.mjs` validates the structural shape of every
`agents/*.md` prompt. It runs as part of `scripts/test-pipeline.sh` L1
and can be invoked standalone:

```bash
node scripts/agent-prompt-lint.mjs              # all agents
node scripts/agent-prompt-lint.mjs agents/architect.md   # one file
node scripts/agent-prompt-lint.mjs --json       # machine-readable
```

Exit code: `0` clean, `1` errors, `2` invalid invocation.

## Rule catalogue

### Frontmatter (FM-*)

| ID | Severity | Description |
|---|---|---|
| **FM-001** | error | YAML frontmatter parses as flat key/value (or list) |
| **FM-002** | error | `description` field present, ≥ 20 characters |
| **FM-003** | error | `model` is `haiku\|sonnet\|opus` or `claude-<tier>-N-N` |
| **FM-004** | error | `tools` is a non-empty list (or comma-separated string) |

### Structure (STR-*)

| ID | Severity | Description |
|---|---|---|
| **STR-001** | error | At least one `## ` heading after frontmatter |
| **STR-002** | warn | File ≤ 50 KB (context-window safety) |

### Phase task tracking (PHASE-*) — pipeline agents only

Applies to: `architect / pm / senior-dev / qa-engineer / security-officer
/ performance-engineer / devops / l3-support`.

| ID | Severity | Description |
|---|---|---|
| **PHASE-001** | error | Has `## Phase task tracking` section (added in v2.5.7) |
| **PHASE-002** | error | Section references `phase-task.sh` helper |
| **PHASE-003** | error | `open <agent>` example uses correct slug (or template placeholder) |

### Memory paths (MEM-*)

Catches stale path references in **shell commands** only — natural-
language mentions of `lessons.md` are fine.

| ID | Severity | Description |
|---|---|---|
| **MEM-001** | warn | Shell commands on bare `lessons.md` (should be `.great_cto/lessons.md`) |
| **MEM-002** | warn | Shell commands on bare `decisions.md` (should be `~/.great_cto/decisions.md`) |

### Output contracts (OUT-*) — pipeline + reviewer agents

| ID | Severity | Description |
|---|---|---|
| **OUT-001** | warn | Defines explicit output (file path or `Output:` contract) |

### Cross-prompt consistency (CONS-*) — added v2.7.0

| ID | Severity | Description |
|---|---|---|
| **CONS-MODEL** | warn | Agent uses a model tier appropriate for its role (see [ADR-002](adr/ADR-002-model-tier-policy.md)) |
| **CONS-OUTPUT** | warn | Reviewer (`*-reviewer.md`) declares an output file pattern (`docs/<dir>/<PREFIX>-{slug}.md`) |
| **CONS-SIGNOFF** | warn | Reviewer references sign-off / gate / HANDOFF semantics |

### Cross-platform (DEPS-*)

| ID | Severity | Description |
|---|---|---|
| **DEPS-001** | warn | Body references `superpowers` only with `HOST=claude-code` guard or fallback note |

## Roadmap

Future rules (v3.0+):

- **CONS-MODEL → error** — promote to error after one minor cycle of
  warn-level catalogue + fixes
- **EVAL-*** — LLM-as-judge eval mode (requires API key, opt-in)
- **BEH-*** — behaviour tests via real Claude Code SDK (needs CI budget)
- **CONS-ARCHETYPE** — archetype-specific reviewers reference matching
  compliance gates from `archetypes.ts` (e.g. `pci-reviewer` ↔ `commerce`,
  `gov-reviewer` ↔ `gov-public`)

## Adding a new rule

In `scripts/agent-prompt-lint.mjs`, add to the `RULES` array:

```javascript
{
  id: 'XXX-001',
  severity: SEVERITY.error,         // or .warn
  desc: 'one-line description',
  appliesTo(file) {                 // optional — defaults to all
    return file.slug !== 'continuous-learner';
  },
  test(file) {
    // Inspect file.text / file.frontmatter / file.bodyAfterFrontmatter
    if (badCondition) return ['error message'];
    return [];                      // empty array = pass
  },
},
```

Then update this doc with the new rule ID + description.
