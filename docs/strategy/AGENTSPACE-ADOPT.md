# Adopting ideas from HKUDS/AgentSpace (ideas, not the stack)

> Status: active · Created 2026-06-28 · Source: analysis of github.com/HKUDS/AgentSpace

AgentSpace is a heavy team workspace (TS monorepo + Postgres + web/daemon). great_cto
is a lightweight Claude-Code plugin (markdown agents in git, zero-dep board). We take
**three ideas**, scoped to great_cto's design — not the stack.

## What we adopt

| # | AgentSpace idea | great_cto form | Effort |
|---|-----------------|----------------|--------|
| **#2** | Audit of grants/credentials (missing / revoked / orphaned / unavailable provider) | `scripts/lib/grant-audit.mjs` + a `/doctor` check: OpenRouter/Anthropic keys, npm auth, gh auth, provider↔key orphans | S |
| **#4** | Knowledge as owned + **versioned** + approval-queued | `bumpGpVersion()` in `shared/gp-schema.mjs` + crystallize bumps version + appends a Version-history block when a pattern is re-crystallized (instead of skip/duplicate) | S–M |
| **#1** | **AgentRouter** — agent identity stable across harnesses; normalize harness capabilities | `scripts/lib/harness-router.mjs` — detect the current harness (Claude Code / Codex / OpenCode) + a capability registry; first slice (detect + registry), full multi-harness execution deferred (ADR-006) | L |

## What we explicitly do NOT adopt

- The monorepo + PostgreSQL + web + daemon + sandbox — kills great_cto's lightweight edge.
- Agents in a DB — our markdown-in-git agents are a feature (portable, versioned, coverage-gate ratchet).
- Team features (channels, document permissions, Google Workspace delegation) — out of scope for solo/small-team.

## Sequence

1. **#2 grant-audit** (cheap, concrete) — extends `/doctor` (which already pings the OpenRouter key).
2. **#4 knowledge-versioning** (cheap) — extends the GP schema + crystallize the loop already has.
3. **#1 harness-router** (strategic, large) — ADR-006 + a first slice (detect + capability registry). Full cross-harness execution is a follow-up; the one genuinely new capability for us.
