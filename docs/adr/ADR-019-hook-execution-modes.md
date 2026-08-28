# ADR-019 — Hook execution modes & undocumented-feature adoption

**Status:** Accepted (partial — async + structured-deny shipped; effort/scoped-hooks/memory deferred with named constraints)
**Date:** 2026-05-29
**Deciders:** great_cto core
**Related:** ADR-013 (hook execution model), ADR-014 (secret detection), ADR-016 (learning privacy), CHANGELOG v2.31.0 (Opus 4.8 effort)

## Context

A teardown of the Claude Code npm package
([Habr / spring_aio, for CC v2.1.87](https://habr.com/ru/companies/spring_aio/articles/1041156/))
surfaced powerful hook/skill/agent features that were undocumented at the time.
We verified every claimed field against **our** installed build (CC v2.1.156)
two ways: string-literal presence in `bin/claude.exe`, and the now-published
schema at `code.claude.com/docs/en/hooks`. All claimed fields are real and
present in our version. great_cto is hook-heavy, so several map directly onto
our stack — but each carries a different risk profile.

## Verified schema (the part we rely on)

Hook-handler-level booleans (alongside `type`/`command`/`timeout`):

| Field | Meaning | Honored where |
|---|---|---|
| `async` | run in background, never blocks the turn | settings + plugin hooks |
| `asyncRewake` | background; wakes Claude on **exit 2** (stderr → system reminder). **Implies async.** | settings + plugin hooks |
| `once` | run once per session then self-remove | **skill frontmatter only** (ignored in settings/agent frontmatter) |

PreToolUse stdout decision:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse",
  "permissionDecision":"allow|deny|ask|defer",
  "permissionDecisionReason":"…","updatedInput":{"command":"…"}}}
```
PostToolUse uses top-level `decision:"block"` + `reason`.

## Decision

### Adopted now (shipped)

**1. `async: true` on all PostToolUse hooks.** `agent-writes` logger,
`format-check`, `summary-enforce`, and `tool-failure` are all confirmed
non-blocking (each only logs/formats, never emits a `decision` or exit 2).
Backgrounding them removes their latency from every Write/Edit with **zero
behavior change**. This is the single biggest perceived-speed win for a
hook-heavy plugin.

**2. Structured `permissionDecision="deny"` in `secret-scan`** with a rich
`permissionDecisionReason`, **while keeping `exit 2`** as a fail-safe. Both
signals say "deny", so they cannot disagree; older builds that ignore the JSON
still block via exit 2. No `updatedInput` auto-redaction — silently rewriting a
user's file content to strip a secret is unsafe and hides intent.

### Rejected (correctness)

**`asyncRewake` on PreToolUse preventive hooks (secret-scan / safety /
cost-guard).** `asyncRewake` implies `async`, so the tool would run **before**
the scan finishes — the secret gets written, then Claude is woken after the
fact. That converts *prevention* into *post-hoc detection*, defeating the hook's
purpose. Preventive PreToolUse hooks MUST stay synchronous. (This corrects the
original adoption pitch, which proposed asyncRewake for secret-scan.)

### Deferred — with named constraints (do not adopt blind)

**3. `effort` per skill/command/agent.** Verified constraints from
`claude.exe`: effort is **beta-gated** behind `effort-2025-11-24` and values are
**lowercase** `low|medium|high|xhigh|max`. The lone existing usage
(`regulated-reviewer: effort: HIGH`) is likely a no-op (wrong case, no beta
flag). Mass-adding `effort:` across ~80 files without the beta flag is
cargo-cult (no-op); with a wrong beta flag it can break agent loading. And the
behavior change can't be confirmed without runtime measurement. **Plan:** a
dedicated, measured rollout — add `beta: effort-2025-11-24` + lowercase values
to a small high-value set (architect, security-officer, ai-security-reviewer →
`high`/`max`; save, recall, inbox, digest → `low`), A/B the cost/quality delta,
then expand. Tracked separately.

**4. Scoped `hooks` in skill frontmatter.** Attractive (e.g. coordinator
activates `orchestrator-check` only while coordinating; `/save` activates a
brain-update hook). Lives in plugin.json + skill frontmatter (release-chat
conflict zone). Lower value than #1/#2; deferred to a focused change.

### Rejected — privacy

**`autoMemoryEnabled` / `autoDreamEnabled` (native self-improving memory).**
Direct conflict with great_cto's constraints: auto-extraction can capture
**private project names** into `~/.claude` memory, violating the CLAUDE.md
`<private-project>` rule and the zero-telemetry policy (ADR-016). We already run
continuous-learner + lessons-merge with deliberate privacy controls. Do **not**
enable native auto-memory without a project-name redaction filter in front of
it.

**Native `memory:` scopes (user/project/local)** — overlaps our brain.md 4-tier
system (shipped v2.30.1). `regulated-reviewer` already carries `memory:
project`. Tempting to replace the hand-rolled SubagentStart brain injection, but
that is a strategic swap onto an EXPERIMENTAL surface — a spike comparison, not
a wholesale switch. Deferred.

## Consequences

- **Positive:** PostToolUse latency removed from the hot path; secret-scan block
  now carries a structured, model-visible reason without losing the fail-safe.
- **Risk (async):** an async PostToolUse hook's output no longer gates the turn —
  acceptable because all four are pure side-effect loggers. If any future
  PostToolUse hook needs to block or inject `additionalContext`, it must NOT be
  marked async.
- **Risk (research-preview-ish):** these fields, though now documented, are
  young; re-verify on major CC upgrades.
- **Coordination:** plugin.json is the release-chat's zone (currently at
  v2.33.1). The async change was applied surgically while idle and pushed
  immediately; effort/scoped-hooks (also plugin.json/frontmatter) are deferred
  partly to avoid churn there.

## References

- https://habr.com/ru/companies/spring_aio/articles/1041156/ — source teardown
- https://code.claude.com/docs/en/hooks — now-official hook schema
- `scripts/hooks/secret-scan.mjs`, `.claude-plugin/plugin.json` — the shipped changes
