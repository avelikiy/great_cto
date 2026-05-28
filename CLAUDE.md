# CLAUDE.md — AI agent instructions for great_cto

This file is read automatically by Claude Code at session start.
Rules here apply to all agents working in this repository.

---

## Privacy — private project names

**Never mention specific private project names in any artifact that could reach
the public repository:**

- Commit messages
- PR titles / descriptions
- Code comments
- Documentation (docs/, README, CHANGELOG)
- Agent verdicts (verdicts/*.log)
- Any string literal in source code

Use the placeholder **`<private-project>`** instead.

Examples of private names (not exhaustive — when in doubt, use the placeholder):
any client/product repos that are not `great_cto` itself.

Rationale: `great_cto` is a public open-source tool. References to private
project names in its history constitute a privacy leak for the owner's clients.

The pre-push hook (`scripts/hooks/pre-push.sh`) enforces this automatically.

---

## Privacy — local paths

Never hardcode `/Users/<username>/...` paths in committed files.
Use `~/.great_cto/` notation or environment variable references.

---

## Privacy — telemetry

`great_cto` collects **zero telemetry**. Do not add any usage tracking,
install pings, or analytics calls. See `docs/PRIVACY.md` for policy.

---

## Code style

- TypeScript strict mode; no `any` without comment explaining why
- ESM modules only (`.mjs` / `"type":"module"`)
- Node.js ≥ 20 — use `node:` prefix for built-ins
- No external runtime dependencies in `packages/board/server.mjs` (zero-dep)
- Commit format: `<type>: <description>` (feat/fix/refactor/docs/test/chore/perf/ci)

---

## Agent routing

See `skills/great_cto/SKILL.md` for subagent routing table.
Auto-attach reviewers fire from `scripts/hooks/auto-attach-reviewers.mjs`.

---

## Request classifier

When the model receives a request, classify it first — the class determines which agents run and whether a gate is needed.

| Class | Signal words / patterns | Pipeline |
|-------|------------------------|---------|
| **QUESTION** | "what is", "how does", "explain", "why", "what's the difference" | Answer inline — no agents |
| **SURVEY** | "show me", "list", "what files", "status", "what's pending", "show report" | Read-only — Explore or Bash only |
| **SIMPLE CODE** | "fix", "typo", "rename", "minor", "patch", single file implied | Fast path: senior-dev → gate:ship |
| **COMPLEX CODE** | "implement", "build", "add feature", "refactor", "migrate" | Full pipeline: arch → pm → senior-dev → qa+cso → devops |
| **DESIGN** | "design", "architect", "plan", "RFC", "ADR", "how should we" | Architect agent → gate:arch → optional pm |
| **SLASH CMD** | Message starts with `/` | Route to matching command in `commands/` |
| **INCIDENT** | "broken", "down", "prod issue", "incident", "P0", "alert" | l3-support immediately, no pipeline |
| **COORDINATE** | "parallelize", "orchestrate", "3+ streams", complex dependency graph | coordinator agent |

**Auto-routing rule**: classify BEFORE choosing an agent. If the class is ambiguous between SIMPLE CODE and COMPLEX CODE, prefer COMPLEX CODE — the cost of under-engineering exceeds the cost of a gate pause.

---

## Triage Gate — depth inside each class

After classifying a request, apply the triage gate to select how much process to run. This prevents running the full pipeline on trivial changes.

### SIMPLE CODE — depth levels

```
Classify into one of three depths:

  Tiny    — single expression / typo / rename within one function.
            → Fix inline, no plan, no Beads task. 30 s turnaround.

  Small   — 1-file change, clear scope, no behavior risk.
            → senior-dev direct, no architect. Gate: gate:ship only.

  Medium  — 2-5 files, some behavior risk, needs validation.
            → senior-dev → qa-engineer. Gate: gate:ship.
```

Escalation check: if you discover ambiguity, cross-file risk, data model/API/permission impact while working → stop, reclassify as COMPLEX CODE.

### COMPLEX CODE — depth levels

```
Classify into one of three depths:

  Small   — well-understood scope, ≤5 files, low ambiguity.
            → architect (brief) → senior-dev → gate:ship.
            Skip pm decomposition if < 3 work streams.

  Medium  — cross-file, some design decisions needed.
            → architect → pm → senior-dev → qa+cso → gate:ship.

  Large   — significant ambiguity, migrations, cross-cutting concerns,
            rollout risk, backward compat constraints.
            → Full pipeline: arch → pm → senior-dev → qa+cso → devops.
            Two gates: gate:arch + gate:ship.

            ⚠️  Decomposition Matrix required before any implementation starts.
            Coordinator must produce this table (or block until it exists):

            | Stream | Write-zone (files/dirs) | Depends on | Why parallel-safe |
            |--------|------------------------|------------|-------------------|
            | <name> | <owned files>          | <stream #> | <no shared state> |

            If two streams share any file → force sequential, add dependency.
            Reference: shared/orchestrator.toml [parallelism] section.
```

**Default rule**: when depth is ambiguous, choose the deeper level — skipping a gate is recoverable, skipping architecture review on a Large change is not.
