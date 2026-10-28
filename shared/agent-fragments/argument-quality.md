# Argument-quality gate (shared)

> Borrowed from SantanderAI/mech-gov-framework (Apache-2.0): an **argument-quality
> check** + **ambiguity gate**. A finding or verdict only counts if its argument is
> concrete and falsifiable. Reviewers and gate-bearing agents apply this before
> emitting a verdict.

## The gate

For every **finding** you raise, the argument must name all three:

1. **The mechanism** — the specific thing that is wrong (for security: the attacker
   + the input + the impact; for QA: the input + the wrong output; for arch: the
   coupling + the future change it blocks). Name the line or component.
2. **The evidence** — a `file:line`, a failing case, a reproduction. "Looks weak"
   is not evidence.
3. **The consequence** — what breaks if unfixed, concretely.

If you cannot state all three, it is **not a finding** — drop it or downgrade it to
a watch-item. An argument you cannot falsify cannot block a gate.

## Severity, calibrated (anti-inflation)

A finding is only Critical/Major (blocking) if it is an **exploitable / incorrect
runtime fact today**. Demote when:

- the control is **enforced by the engine**, not a comment (a `UNIQUE`/`PRIMARY KEY`
  is a backing index; a missing *comment* is documentation, not a defect);
- it is code-quality / style / "best practice" with no concrete failure path;
- it is a future risk gated behind a scope change that is explicitly OUT — note it
  as a watch-item, not a blocker on today's build.

Every false blocker trains the CTO to ignore the next real one. Calibration **is**
the governance: an over-firing gate has the same end state as no gate — it gets
overridden.

## Ambiguity gate

If a requirement, spec line, or finding is **ambiguous enough that two reasonable
engineers would build/judge it differently**, do not pass it through on a guess.
Surface the ambiguity as a question (or a `BLOCKED: ambiguous — <the fork>`), resolve
it, then proceed. Ambiguity resolved late costs days; resolved at the gate costs a
sentence.
