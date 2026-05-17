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
