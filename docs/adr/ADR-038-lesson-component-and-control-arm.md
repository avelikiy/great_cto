# ADR-038: A lesson names the part of the harness it changes, and is measured against a control

**Date:** 2026-10-20
Status: Accepted
Deciders: great_cto maintainers
Extends: [ADR-037](ADR-037-lesson-needs-evidence.md)

## Context

ADR-037 made a lesson reach every project only with an A/B eval stamp:
baseline agent vs the same agent with the lesson text appended. Two gaps remain.

1. **What a lesson changes is not recorded.** "Run the migration check before
   deploy" can be a prompt instruction, a hard constraint, a skill to load, or a
   tool to call. The stamp says the lesson helped; it does not say which part of
   the harness was changed, so a promoted lesson cannot be checked or rolled back
   by part.
2. **A two-arm A/B credits the wrong cause.** For a lesson that changes a skill,
   appending the lesson text measures the *hint* about the skill, not the skill.
   Published harness experiments (an agent tracer, 2026) found a hint without the
   tool made results worse while hint + tool improved them; with only "baseline vs
   both" the improvement is real but its cause is unknown, and shipping the hint
   alone would have shipped the regression.

## Decision

- **`component:`** in a lesson's frontmatter, one of `prompt` · `constraint` ·
  `skill` · `tool` · `memory`. The learner sets it. `lessons-write` keeps a known
  value, drops an unknown one with a note, and a merge never replaces an existing
  value (a stamp measured one component). The decisions entry carries it.
- **Arms follow the component.**

  | component | arms | promoted on |
  |---|---|---|
  | `prompt`, `constraint`, `memory` | baseline · lesson | lesson vs baseline (as ADR-037) |
  | `skill` | baseline · **hint only** · hint + skill text | full vs baseline, **and** the hint arm reported |
  | `tool` | — | not measurable by a prompt A/B; stays in its projects |

  A `skill` lesson names the skill it changes (`changes: skills/<name>/SKILL.md`).
  The third arm appends that file's text after the lesson.
- **The control decides the wording, not only the verdict.** For a `skill`
  lesson the stamp records both deltas (`eval_delta` full, `eval_delta_hint`).
  If the hint arm regresses, the decisions entry says so and keeps the skill —
  the hint alone must not be promoted as advice. A missing component on a lesson
  being measured is refused with the reason (the arms cannot be chosen).
- Cost is printed per arm before anything runs; `--yes` spends it, as before.

## Not in scope

Measuring `tool` lessons (needs the tool to exist in the actor's harness),
automatic component inference, changing ADR-037's promotion rule.

## Consequences

- Each promoted lesson says which part of the harness it changed and, for a
  skill, whether the hint alone helps or hurts.
- A skill lesson costs three arms (~$0.6) instead of two.
