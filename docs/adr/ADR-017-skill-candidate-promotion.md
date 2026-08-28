# ADR-017 — Skill candidate promotion criteria

**Status:** Accepted
**Date:** 2026-05-08
**Deciders:** great_cto core
**Related:** ADR-015 (learning loop), ADR-016 (privacy)

## Context

The learning loop (ADR-015) produces lessons in `.great_cto/lessons.md` (project-local) and promotes them to `~/.great_cto/decisions.md` (cross-project) at threshold 3.

The next step is **skill promotion**: when does a `decisions.md` entry become a reusable Claude Code skill (a `.md` file in a `skills/` directory that the agent fleet auto-loads)?

This ADR defines the criteria for that promotion. Implementation is **deferred to v1.4.0** — this ADR locks the criteria so the implementation can be designed against a stable spec.

## Decision

### Promotion criteria (all must be true)

A pattern in `~/.great_cto/decisions.md` becomes a **skill candidate** when:

1. **Occurrence:** observed in **≥5 distinct projects** (vs. 3 for promotion to decisions.md)
2. **Archetype breadth:** observed in **≥3 distinct archetypes** OR explicitly tagged as `archetype: any`
3. **Confidence:** all entries have `confidence: high` (no `medium` mixed in)
4. **Stability:** pattern hasn't been overridden by a newer entry in the last 30 days
5. **Skill-candidate field:** at least 80% of source lessons set `skill-candidate: <name>` (not `n/a`)
6. **Agent verdict:** ≥1 agent has cited the pattern in a verdict log (proves it was actually consulted, not just written)

### Skill output format

When promoted, a skill is generated as:

```
~/.great_cto/global-skills/<skill-slug>/SKILL.md
```

With frontmatter:

```yaml
---
name: <skill-slug>
description: <one-line summary>
applies-to-archetypes: [<list>]
source: ~/.great_cto/decisions.md (lesson promoted 2026-05-08)
confidence: high
provenance:
  occurrences: <N>
  projects: [<list>]
  first-seen: <date>
  last-validated: <date>
---
```

Body content: condensed pattern from `decisions.md`, formatted as actionable guidance (do X, not Y).

### Auto-loading by agents

Phase 4 implementation will:

- Add `~/.great_cto/global-skills/` to the agent skill-discovery path (currently scans `~/.claude/`, `~/.great_cto/anthropic-skills/`, `~/.great_cto/personal-skills/`)
- Filter loaded skills by the current project's archetype (read from PROJECT.md)
- Update `scripts/skill-discover.sh` to include the new path

### Manual override

A CTO can:

- **Force promote** a single decision: `node scripts/promote-skill.mjs <slug>` (Phase 4)
- **Demote** a skill back to decisions.md: `mv ~/.great_cto/global-skills/<slug> ~/.great_cto/skills-deprecated/`
- **Delete entirely:** `rm -rf ~/.great_cto/global-skills/<slug>`

### Versioning

Skills get a `version: <date>` field when promoted. If the underlying pattern in `decisions.md` is updated (new evidence, different decision), the next promotion cycle bumps the skill version. CTO is notified via:

```
[skill-promote] updated <slug> v2026-05-08 → v2026-08-15 (3 new occurrences, recommendation refined)
```

## Consequences

### Positive

- **Clear gradient** of confidence: anecdote → lesson (1 project) → decision (3 projects) → skill (5 projects, 3 archetypes)
- **Auditable provenance** — every skill traces back to specific lesson sources
- **Archetype-routing preserved** — skills inherit the archetype-tagging from their source lessons, so the agent fleet doesn't load irrelevant skills
- **CTO can intervene** at any stage (promote early, demote late, delete entirely)

### Negative

- **Slow.** A pattern needs ≥5 project-validations before becoming a skill. Real-world adoption: maybe 2-5 skills/quarter for an active solo CTO with diverse projects.
- **Cross-archetype patterns may stall.** A pattern useful in just `fintech` will never hit 3-archetype breadth. Mitigation: rule (2) has the `archetype: any` opt-out for genuinely-universal patterns (like "always validate webhook signatures").
- **Promotion algorithm is heuristic.** No machine learning, no embedding similarity. Misses near-duplicate patterns with different slugs.

### Risks

- **A bad skill auto-loads everywhere.** Mitigation: agent fleet treats skills as advisory (the verdict log captures whether the agent cited it), CTO can demote.
- **Skills become a maintenance burden.** Mitigation: skills are append-only artifacts; if the underlying pattern goes stale, the next CTO review can demote. We do NOT auto-deprecate (premature optimization).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Threshold = 10 projects | Too slow; very few solo devs have 10 projects of one archetype |
| Threshold = 3 (same as decisions) | Skills should be higher-confidence than decisions; one tier of validation isn't enough |
| Manual promotion only (no auto) | CTO bottleneck; defeats the "compounding learning" goal |
| Skill-as-MCP-server | Overkill; markdown is the right granularity for advisory patterns |
| Versioned skills with semver | Complexity; date-versioning suffices for advisory content |

## Implementation roadmap

- **v1.2.0** — this ADR is committed; criteria locked; no implementation yet
- **v1.3.0** — telemetry: track which agents cite which decisions (input to "agent verdict" criterion #6)
- **v1.4.0** — implement `scripts/promote-skill.mjs`; update agent skill-discovery to include `~/.great_cto/global-skills/`

## References

- ADR-015 — Learning loop architecture
- ADR-016 — Privacy guardrails
- `scripts/skill-discover.sh` — current skill discovery (pre-skill-promotion)
- `~/.great_cto/anthropic-skills/`, `~/.great_cto/personal-skills/` — existing skill sources
