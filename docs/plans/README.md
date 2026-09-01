# Plans — what was going to be done

Thirty-plus plans have accumulated here since May. Until now none of them
pointed at any other document and none was pointed at: eighteen of the
repository's seventy-six orphaned documents were plans, the single largest
cluster. A plan nobody can find from anywhere is a plan that gets written twice.

This index is the inbound link. It is deliberately not generated — there is no
naming convention to derive a relationship from (measured: three shared slugs
across a hundred and fifty-nine documents), and a script that guessed would
produce connections nobody meant. Each line below was read off the plan's own
heading.

**Status is as the document declares it**, not as this index judges it. Several
say "in progress" and have said so since May; that staleness is information, and
overwriting it with a guess would destroy the only evidence of it.

---

## Guards, CI and the linter

The plans behind the checks in `scripts/ci-local.sh`.

- [v2.5.8 — CI hardening + plugin cache hygiene](PLAN-v2.5.8-ci-hardening.md) — *declares: in progress · 2026-05-09*
- [v2.6.0 — Agent prompt linter](PLAN-v2.6.0-agent-prompt-linter.md) — *declares: in progress · 2026-05-09*.
  The linter ships as `scripts/agent-prompt-lint.mjs` and its PHASE rules were
  repaired on 2026-09-01 to follow the shared `agents/_shared/phase-task.md`
  block; it now runs blocking in `ci-local.sh`.
- [Lessons become rules, and exclusions get audited](PLAN-2026-08-12-lesson-rules.md) —
  the `lesson-rules` sweep, which holds at zero findings across the repository.
- [Test-pyramid expansion](PLAN-2026-05-14-test-pyramid-expansion.md) — three
  follow-ups from the full-25 coverage work.
- [A guard wired to a CI that cannot run is a guard nobody has](PLAN-2026-08-17-guards-that-do-not-run.md) —
  the plan `guard-parity.mjs` came from. See also
  [ADR-009](../adr/ADR-009-gates-follow-reversibility.md) on where a gate belongs.

## Receipts, coverage and provenance

Whether what was reviewed is what shipped, and whether a claim can be traced.

- [Prove that what was reviewed is what shipped](PLAN-2026-08-11-receipt-verification.md) — *declares: in implementation*
- [Receipts stop reporting and start gating](PLAN-2026-08-14-receipt-gate.md)
- [A requirement that nothing downstream cites](PLAN-2026-08-14-requirement-coverage.md)
- [Judge provenance on eval result rows](PLAN-judge-provenance.md)
- [A gate that stands down must still leave a record](PLAN-2026-08-17-gate-fail-closed.md)

## The shape of the pipeline

How many stages there are, who runs them, and where a human is asked.

- [Close 23 pipeline gaps](PLAN-2026-05-14-gap-closure.md)
- [Dev board as a launch control (approve gate → spawn agent)](PLAN-board-agent-launch.md) — *declares: in progress · 2026-06-09*
- [SIA → great_cto self-improvement loop](PLAN-sia-self-improvement-loop.md)
- [Fewer confirmations, and a loop that earns them away](PLAN-2026-08-08-self-improving-pipeline.md)

## Cost, context and the model

What a run spends, and what it can hold.

- [Context compression (headroom-inspired)](PLAN-headroom-context-compression.md)
- [Token economy initiative (2026 Q2)](PLAN-token-economy-2026-q2.md) — *declares: active*
- [Tune great_cto for Claude Opus 4.8 and the Fable/4.x family](PLAN-opus48-tuning.md)

## Reach — platforms, markets, borrowed ideas

- [NPM expansion + multi-platform support](PLAN-npm-multi-platform.md) — *declares: in progress*
- [US-market regulatory coverage](PLAN-us-market-coverage.md) — the plan behind
  the US reviewer set (`us-privacy-reviewer`, `us-ai-reviewer`, `hr-ai-reviewer`,
  `cmmc-reviewer`, `adtech-privacy-reviewer`).
- [NaCl-inspired governance](PLAN-nacl-governance.md)
- [Borrow from Santander AI Open Source](PLAN-borrow-santander.md)

---

## Reading a plan that has gone quiet

A plan whose status line has not moved in months is not automatically dead, and
this index will not mark it so. The question to ask of one is the same question
this repository asks of everything else: **is the thing it describes reachable?**
Three of the plans above describe machinery that was built, shipped, and then had
nothing calling it. Check that the code exists *and* that something runs it
before deciding a plan is finished.

Related: [the testing strategy](../testing/TEST-STRATEGY-end-to-end.md), which
names the three states a test can be in — gated, run but not gated, and written
but not run.
