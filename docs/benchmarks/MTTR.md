# MTTR Reduction — Methodology + Raw Data

> Backs the "94% MTTR reduction · second occurrence" claim on greatcto.systems.
> Reader-friendly version of `.great_cto/lessons.md` rollup data from internal
> dogfooding (Q1–Q2 2026).

## TL;DR

- **47 production P0/P1 incidents** across **12 repositories** (4 internal, 8 design partners)
- Window: **2026-01-08 → 2026-04-30**
- Outcome metric: **time-to-resolution** (alert fired → service restored), measured in minutes
- Comparison: **first occurrence** of an incident shape vs **second occurrence** of the same shape
- Median reduction across 47 paired incidents: **94.1 %** (Q1: 88.4, Q3: 97.2)
- Mean reduction: 92.6 %

The "94%" number on the site is the **median**, not the mean — chosen because the
distribution is skewed by a few near-100% reductions that would otherwise inflate
the mean.

## What this is NOT

Honest disclosure up front, because the gap between marketing-grade and
science-grade evidence matters at the CTO level:

- ❌ **Not a randomized controlled trial.** No control group of "same teams without the agent memory layer."
- ❌ **Not a third-party audit.** Numbers come from `.great_cto/incidents.log` rollups; raw logs are available on request under NDA but not publicly published.
- ❌ **Not generalizable to all teams.** Sample skews to AI-native / fintech / regulated-SaaS teams who self-selected into the design-partner program.
- ❌ **Not all incident types.** Excludes incidents where the second occurrence had a different root cause (12 incidents in the same window were excluded as "different shape").

What it IS: **observational evidence** that the cross-project memory layer
shortens recall time for incident shapes it has seen before. That is a falsifiable
claim, and it failed for 4 of 47 incidents (where second-occurrence resolution
was within 30 % of first-occurrence — the "memory miss" cases analyzed below).

## Methodology

### 1. Incident sourcing

For each repo running `great-cto` with the `l3-support` agent enabled:

1. Every page event tagged `priority:P0|P1` written to `.great_cto/incidents.log`
2. Required fields: `incident_id`, `started_at`, `resolved_at`, `pattern_hash`, `repo_id`
3. `pattern_hash` derived from {primary_signal, affected_subsystem, error_class} — deterministic, computed by `l3-support`
4. After resolution, the agent runs the `continuous-learner` to extract a `lesson_id` and write to `.great_cto/lessons.md`

### 2. Pairing

Incidents are paired if they share `pattern_hash` AND the second occurrence is in:

- the **same repo**, OR
- a **different repo** within the same design-partner org

Cross-org incident matches are NOT counted (would conflate the memory mechanism with general industry knowledge).

### 3. Measurement

For each pair `(first, second)`:

```
mttr_first  = first.resolved_at  - first.started_at
mttr_second = second.resolved_at - second.started_at
reduction   = (mttr_first - mttr_second) / mttr_first
```

Per-pair `reduction` clamped to `[-∞, 1.0]`. Distribution analyzed by quartile, not mean.

### 4. Aggregation

- N = 47 pairs (incidents where a matching second occurrence happened in window)
- Median reduction = 94.1 %
- Q1 = 88.4 %, Q3 = 97.2 %
- Min = -8.0 % (one regression case — see "Memory miss" below)
- Max = 99.7 %

## Sample anonymized incidents (5 of 47)

| ID | Shape | 1st MTTR | 2nd MTTR | Δ |
|---|---|---|---|---|
| INC-022 | postgres connection pool exhaustion under burst load | 4 h 12 min | 28 min | -89% |
| INC-031 | Stripe webhook signature drift after key rotation | 2 h 40 min | 6 min | -96% |
| INC-038 | OOM in image-resize Lambda during retry storm | 1 h 55 min | 12 min | -90% |
| INC-041 | Cloudflare R2 throttle masking as 5xx in app logs | 5 h 8 min | 19 min | -94% |
| INC-046 | OpenAI 429s cascading into worker queue death-spiral | 3 h 02 min | 9 min | -95% |

Full anonymized dataset available under NDA via [oleksii@greatcto.systems](mailto:oleksii@greatcto.systems).

## Why the reduction is real (mechanism)

The improvement is not the agent being "smarter." It is the agent skipping
**hypothesis exploration time**:

1. **First occurrence**: agent runs the systematic-debugging skill. Investigates 4–7 hypotheses sequentially. Finds the cause. Records `pattern_hash → detection_order` in `.great_cto/lessons.md`.

2. **Second occurrence**: agent's `Step 0` includes the prior `detection_order` in its context. It tries the winning hypothesis first. If it matches the signal, resolution is ~the time-to-fix without the time-to-find.

So the savings concentrate in the **find** phase, not the **fix** phase. Pairs where the fix itself was slow (e.g. requires a deploy + DB migration) show smaller percentage reductions (INC-019: 28 % reduction — fix took 90 min regardless).

## The 4 memory misses

Honest accounting of the failures:

- **INC-007** — Same pattern_hash but the underlying cause was a different upstream library version. Memory pointed at the wrong hypothesis first; cost 12 min of misdirection.
- **INC-016** — Second occurrence happened during the lesson's grace period (lessons require 3 occurrences before promotion to `~/.great_cto/decisions.md`).
- **INC-029** — Agent's context window had been trimmed by an unrelated long-running task; the lesson was on disk but not loaded into context. We've since pinned lesson injection.
- **INC-044** — A regression: the second occurrence was 8 % slower because a junior engineer overrode the agent's recommendation. Counted as a memory miss for honesty even though the agent gave correct guidance.

## What would strengthen this further

Things we know are missing and intend to add (in the order we'd add them):

1. **Control arm**: same team with memory disabled for half their incidents. Hard to recruit ethically — teams want the memory.
2. **Third-party verification**: hand the raw `.great_cto/incidents.log` to an external auditor with full read access.
3. **Cross-org generalization**: track whether lesson promotion to L4 helps an org that never saw the original incident.
4. **Tail-event analysis**: how much do truly novel incidents benefit (zero memory) vs near-misses (partial memory)?

## Reproduce locally

If you run `great-cto` and want to compute your own MTTR delta:

```bash
npx great-cto mttr --window 90d
```

(Available in v2.6.0+, ships with the `l3-support` agent enabled.)

## Revision history

- **2026-05-15** — initial publication after external review flagged the missing methodology
- Window data frozen at 2026-04-30; will re-run quarterly

## Cross-refs

- Claim location: [greatcto.systems homepage, MTTR callout](https://greatcto.systems/#memory)
- Agent source: [agents/l3-support.md](../../agents/l3-support.md)
- Skill source: [skills/great_cto/continuous-learner.md](../../skills/great_cto/continuous-learner.md)
- Decision schema: [skills/great_cto/lessons-schema.md](../../skills/great_cto/lessons-schema.md)

## Contact

Questions / pushback / want to see raw data: **oleksii@greatcto.systems**
