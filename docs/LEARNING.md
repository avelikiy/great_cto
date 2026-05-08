# Continuous Learning

great_cto v1.2.0 added a **two-tier learning loop** that auto-extracts patterns from each session and re-uses them in future sessions.

## The pipeline

```
Session ends
   ↓
SessionEnd hook captures snapshot + registers project
   ↓
continuous-learner agent reads transcript + git + verdicts
   ↓
Extracts ≤3 lessons per session → .great_cto/lessons.md      (PROJECT-LOCAL)
   ↓
lessons-merge.mjs: pattern in ≥3 projects → ~/.great_cto/decisions.md  (CROSS-PROJECT)
   ↓
Next session
   ↓
architect, pm, senior-dev READ both files at session start
   ↓
Apply learned patterns by default; cite in commits
```

## Two-tier memory

| File | Scope | Promotion criteria | Read by |
|---|---|---|---|
| `.great_cto/lessons.md` | Project-local | Quality gates in continuous-learner | architect, pm, senior-dev |
| `~/.great_cto/decisions.md` | All projects on this machine | Pattern in ≥3 distinct projects | architect, pm, senior-dev |

## What gets captured

Five pattern shapes, each with strict quality gates:

| Shape | Source signal | Example |
|---|---|---|
| **A. Reviewer caught X** | Critical/High finding in agent-verdicts | "PCI reviewer caught webhook signature missing in 3 fintech projects → always check before review phase" |
| **B. Cost outlier** | Agent invocation 2x+ above its mean | "Architect costs 3x more on `fintech` projects with `team-size: solo` — pre-allocate $8 instead of $3" |
| **C. Repeated mistake** | Same fix in ≥2 commits | "Refactored `useEffect` cleanup pattern in 3 components — anti-pattern: missing cleanup; pattern: AbortController" |
| **D. Discovery missed** | Architect-assumption overridden mid-implementation | "Assumed US-only; was actually EU-required → ask geo question for archetype=fintech upfront" |
| **E. Tool/library decision** | ADR with measured outcome | "Picked Drizzle over Prisma for `mlops`/`data-engineering` — 40% bundle reduction, equal DX" |

The continuous-learner **rejects** anything not matching these shapes — silence > noise.

## Quality gates

A candidate lesson is **rejected** if any of these are true:

- Applies only to one specific file in one project (too narrow)
- Captures user preference, not a transferable pattern
- Restates obvious best practice
- No concrete evidence (sha, file:line, cost number)
- Contains PII, secrets, or business-confidential terms
- Pattern slug already in lessons.md (de-dupe)
- Subjective without measurable outcome

## Privacy

**Default-local, opt-in-global.** The learner runs on your machine; lessons.md and decisions.md never leave your disk.

What the learner MUST NOT capture (enforced via agent prompt):
- API keys, tokens, passwords, JWTs
- Email addresses, phone numbers, names
- Internal codenames, business-confidential terminology
- Customer/user IDs or `.env*` data
- Source code contents (only file:line references)

See **ADR-016** for full privacy rules.

## Configuration

### Opt-out

```bash
# Disable session-end capture entirely
export GREAT_CTO_DISABLE_SESSION_LEARNING=1
```

### Manual trigger

```
/learn                  # extract lessons from this session
/learn cost             # focus on cost-outlier patterns (shape B)
/learn security         # focus on reviewer-catch patterns (shape A)
/learn architecture     # focus on tool/library decisions (shape E)
```

### Inspect state

```bash
# What lessons does this project have?
cat .great_cto/lessons.md

# What patterns have been promoted globally?
cat ~/.great_cto/decisions.md

# Which projects are registered for cross-project aggregation?
ls ~/.great_cto/projects/

# Force re-aggregation
node scripts/lessons-merge.mjs

# Preview without writing
node scripts/lessons-merge.mjs --dry-run

# Re-promote even if already in decisions.md
node scripts/lessons-merge.mjs --force
```

### Reset

```bash
# Clear project-local lessons (will be re-learned)
rm .great_cto/lessons.md

# Clear all cross-project memory (drastic)
rm -rf ~/.great_cto/{decisions.md,projects/}

# Remove a specific project from cross-project aggregation
rm -rf ~/.great_cto/projects/<slug>/
node scripts/lessons-merge.mjs --force   # rebuild without it
```

## How agents use lessons

Three agents read lessons.md + decisions.md at session start:

### Architect

```
Before any architecture decision, consult prior lessons.
Filter decisions.md by current archetype.
Apply high-confidence cross-project patterns by default.
Cite lessons in ARCH doc when followed or overridden.
```

### PM

```
Before estimating, calibrate against cost-outlier lessons (shape B).
Apply lesson-aware deltas to the cost model.
Cite the lesson in the planning doc.
```

### Senior-dev

```
Before claiming a task, scan lessons for known anti-patterns.
If a lesson directly applies, mention in commit:
  "Implements <task>; applied pattern <slug> (lesson 2026-05-08)"
```

## Roadmap

| Version | Capability |
|---|---|
| **v1.2.0** | continuous-learner + lessons-merge + agent integration |
| **v1.3.0** | Telemetry: track which lessons agents cite vs ignore |
| **v1.4.0** | Auto-promotion: high-impact decisions → reusable skills (`~/.great_cto/global-skills/`) |

See **ADR-017** for skill-promotion criteria.

## Reference

- **ADR-015** — learning loop architecture (why two tiers, why threshold=3, why Haiku)
- **ADR-016** — privacy guardrails (what we never capture)
- **ADR-017** — skill candidate promotion criteria (what becomes a skill in v1.4.0)
- **`agents/continuous-learner.md`** — the agent itself
- **`scripts/lessons-merge.mjs`** — the cross-project promotion script
- **`commands/learn.md`** — manual trigger
