# ADR-015 — Learning loop architecture

**Status:** Accepted
**Date:** 2026-05-08
**Deciders:** great_cto core
**Related:** ADR-013 (hooks), ADR-016 (privacy), ADR-017 (skill promotion)

## Context

Every great_cto session produces signal — a reviewer caught a missed bug, a cost outlier exposed a bad estimate, the architect picked library X over Y for measurable reason Z. Without a system to capture and re-use this signal, every session starts from scratch.

ECC (Everything Claude Code) solves this with a "skill evolution" pipeline that mid-session extracts patterns and promotes them to reusable skills. We want similar leverage but tuned for our depth-not-breadth philosophy: project-archetype-routed agents need archetype-routed lessons.

## Decision

Implement a **two-tier memory system**:

```
┌─────────────────────────────────────────────────────────────┐
│  Project-local: .great_cto/lessons.md                       │
│  Written by: continuous-learner agent (subagent)            │
│  Read by:    architect, pm, senior-dev (at session start)  │
└─────────────────────────────────────────────────────────────┘
                          ↓ promotion (≥3 distinct projects)
┌─────────────────────────────────────────────────────────────┐
│  Global: ~/.great_cto/decisions.md                          │
│  Written by: scripts/lessons-merge.mjs                      │
│  Read by:    architect, pm, senior-dev (cross-project)     │
└─────────────────────────────────────────────────────────────┘
```

### Pipeline

```
Session ends
   ↓
SessionEnd hook (scripts/hooks/session-end.mjs)
   ├─ writes session snapshot to .great_cto/logs/session-*-end.md
   ├─ symlinks .great_cto/lessons.md → ~/.great_cto/projects/<slug>/lessons.md
   └─ spawns lessons-merge.mjs in background

User invokes /learn (manual) OR continuous-learner runs in next session
   ↓
continuous-learner agent (Haiku, ~$0.05 per run)
   ├─ reads transcript, git log, agent-writes.log, cost-history.log, verdicts/
   ├─ identifies candidate patterns (5 shapes: A=reviewer-catch, B=cost-outlier,
   │   C=repeated-mistake, D=discovery-miss, E=tool-decision)
   ├─ applies quality gates (precision over recall)
   ├─ writes ≤3 entries to .great_cto/lessons.md
   └─ exits with summary line

lessons-merge.mjs (independent, can run on cron or post-learner)
   ├─ scans ~/.great_cto/projects/*/lessons.md
   ├─ aggregates by pattern slug
   ├─ promotes any slug with ≥3 distinct projects → ~/.great_cto/decisions.md
   └─ tracks already-promoted slugs to avoid duplicates

Next session
   ↓
architect.md, senior-dev.md, pm.md
   ├─ read ~/.great_cto/decisions.md (filtered by archetype)
   ├─ read .great_cto/lessons.md (project-local)
   └─ apply applicable patterns by default; cite when followed or overridden
```

### Why two tiers, not one

- **Single global tier:** every project sees every other project's patterns. Noisy, hard to filter, privacy risk.
- **Single local tier:** patterns don't compound across projects. Solo dev with N projects has N siloed lesson sets.
- **Two tiers:** local captures fresh observations cheaply; global aggregates only patterns validated across ≥3 distinct projects. Local is project-specific; global is archetype-tagged for filtering.

### Why threshold = 3

- 1 occurrence = anecdote
- 2 = coincidence
- 3 = pattern (the standard "rule of three" for refactoring also applies to learning)

Promotion threshold tunable in `lessons-merge.mjs` (`PROMOTE_THRESHOLD` constant). 3 chosen as default after considering:
- 2: too aggressive, generates premature global rules from project-specific quirks
- 5: too conservative, lessons take 5+ projects of evidence before they help

### Why Haiku for the learner, not Opus

The continuous-learner doesn't need creative reasoning — it pattern-matches against a fixed taxonomy (5 shapes) with strict quality gates. Haiku at ~$0.001/Krunner is 75x cheaper than Opus. If we ever need richer extraction, switch to Sonnet (~$0.01/Krunner).

### Why subagent invocation, not inline in hook

Hooks have <8 second timeout and no model access. The learner needs ~30-60 seconds and model invocation. Solution: SessionEnd hook only registers the project + spawns merge in background. The learner itself runs:
- Auto-triggered at next session start (architect/pm/senior-dev consume `lessons.md` — if recent, learner already ran)
- Manually via `/learn` command (user-invocable)

This is a deliberate trade-off: we lose "true real-time learning" but gain reliability (hooks can't fail mid-stream and corrupt state).

## Consequences

### Positive

- **Compounds over time.** Each session adds at most 3 lessons. After 50 sessions, you have ~150 lessons; ~5-15 promoted to global decisions; agents grow smarter without code changes.
- **Archetype-routed.** Lessons tagged with archetype field; agents filter to their current project's archetype, irrelevant lessons stay invisible.
- **Cheap.** Haiku-only path; ~$0.05/session for the learner; lessons-merge.mjs is pure local I/O.
- **Privacy-respecting.** Two-tier model gives users explicit control over what becomes "global" knowledge.
- **Honest defaults.** Quality gates prefer silence over noise. A session that produces zero lessons is fine.

### Negative

- **Bootstrap delay.** First N projects produce only local lessons; global decisions take ≥3 projects to materialize.
- **Duplicate detection is by slug.** Two semantically-identical lessons with different slugs won't be deduped (e.g. "validate-stripe-webhook" vs "stripe-webhook-validation"). Mitigation: continuous-learner reads existing slugs before writing.
- **No automatic skill promotion yet.** Skill creation (lessons.md → reusable Claude Code skill) is manual. Phase 4 will automate.
- **Learner can be wrong.** It might promote a non-pattern. Mitigation: lessons.md is git-tracked; CTO can review and revert.

### Risks

- **`lessons.md` becomes a noise dump.** Mitigated by: (1) max 3 entries per session, (2) strict quality gates, (3) ADR-017 promotion criteria.
- **Privacy leak in shared global decisions.** Mitigated by: (1) ADR-016 privacy guardrails, (2) decisions.md is local-only by default, (3) explicit user opt-in to share.
- **Learner extracts user-specific preferences.** Mitigated by: quality gate "rejects user preferences, captures transferable patterns" baked into agent prompt.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Real-time skill evolution (ECC's approach) | Too expensive (model invocation per session); hooks can't reliably run model calls; race conditions |
| Single global lessons.md | No archetype filtering; privacy concerns; harder to dedupe |
| Database (SQLite) for lessons | Adds dependency; harder for users to read/edit; not git-trackable |
| Vector embedding similarity for de-dupe | Adds embedding API cost; overkill for current scale |
| Promote at threshold=2 | Too noisy; promotes coincidences |
| Promote at threshold=5 | Too slow; lessons rarely become useful |

## Migration / rollout

- **v1.2.0** — ships continuous-learner agent + lessons-merge.mjs + integration in architect/senior-dev/pm
- **v1.3.0** — telemetry on lesson quality (track which lessons agents actually cite vs ignore)
- **v1.4.0** — automatic skill promotion (lessons → reusable skill markdown files)

## References

- ADR-013 — Hook execution model (where SessionEnd fits)
- ADR-016 — Privacy guardrails (what learner must NOT capture)
- ADR-017 — Skill candidate promotion criteria (when lesson becomes skill)
- `agents/continuous-learner.md` — agent spec
- `scripts/lessons-merge.mjs` — promotion script
- `docs/LEARNING.md` — user-facing reference
