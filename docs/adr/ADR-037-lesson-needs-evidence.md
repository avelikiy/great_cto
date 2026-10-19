# ADR-037: A lesson reaches every project only with measured evidence

**Date:** 2026-10-19
Status: Accepted — not implemented yet
Deciders: great_cto maintainers
Extends: [ADR-009](ADR-009-gates-follow-reversibility.md)

## Context

The continuous-learner writes lessons to the project's `.great_cto/lessons.md`
(`scripts/lib/lessons-write.mjs`). `scripts/lessons-merge.mjs:31` promotes a
lesson slug seen in **3 distinct projects** to `~/.great_cto/decisions.md`,
which `read-global-memory.mjs` injects into every session of every project.

So the bar for "changes how every agent behaves everywhere" is "an LLM wrote
the same slug three times". Recurrence is not evidence: the same learner, with
the same prompt, reproduces its own framing. The agent card still says
"≥3 occurrences" (`agents/continuous-learner.md:3`), the code counts projects —
neither measures whether the lesson helps.

ADR-009 already settled this for global patterns: `/crystallize approve` is
gated on an eval stamp (`scripts/lib/gp-approve-gate.mjs`,
`scripts/lib/gp-eval-trace.mjs`). Promotion to `decisions.md` crosses the same
project boundary and was left out.

## Options and decision

| Option | Benefit | Cost / risk | Decision |
|---|---|---|---|
| Keep "3 projects" | Free | Global memory grows on unmeasured claims; we already hit its size cap once | Rejected |
| Human approves each promotion | Simple | Approval without evidence is the same claim, signed | Rejected |
| Require an A/B eval stamp, reuse the GP gate | One rule for every global write; evidence already has a format | ~$0.4 per candidate; some lessons have no eval to run against | **Chosen** |

## Contract

- **Candidates, not promotions.** `lessons-merge` keeps the 3-project rule as
  the *candidate* threshold. A candidate is listed (`--dry-run` / board), not
  written to `decisions.md`.
- **Evidence = A/B on an existing eval.** The lesson declares
  `eval: EVAL-<name>.md`. The baseline arm runs the agent as is; the candidate
  arm runs it with the lesson text appended (`runner.mjs --prompt-file`). One
  sample per case per arm (k=1) — enough to catch harm, honest about noise.
  `gp-eval-trace.mjs computeDelta` decides improvement / noisy / regression and
  stamps `eval_delta`, `eval_confidence`, `eval_direction` into the lesson.
- **Same decision as GP approve.** `decideApproval` is reused unchanged:
  regression → never promoted, no override; no stamp → not promoted unless
  `--no-eval "<reason>"`, which is logged as `EVAL_BYPASS`; improvement or
  noisy → promoted, with the stamp copied into the decisions entry.
- **No eval to run against → stays local.** A lesson without `eval:` is still
  used in its own project (tripwire, `lesson-tripwire.mjs`) — that is cheap to
  undo. It just does not cross the project boundary.
- **The eval spends money only on command.** `lessons-merge --measure <slug>`
  prints the cost estimate (`eval-cost-estimate.mjs`) and runs; nothing runs
  from a hook or at session end.
- The agent card is corrected to describe the real rule.

## Delivery

1. `lessons-merge`: candidate vs promoted split; reuse `decideApproval`; tests
   with stamped improvement, regression, missing stamp, bypass.
2. `--measure <slug>`: build the candidate prompt file, run both arms, stamp.
   Tested with the runner in `--dry-run`, then one live run recorded in
   `results-history.jsonl`.
3. Not in scope: auto-measuring at session end, changing project-local lessons,
   rewriting existing `decisions.md` entries (they are listed as "unmeasured").

## Consequences

- `decisions.md` only grows with lessons shown not to hurt.
- Existing entries are flagged as unmeasured, not deleted.
- A lesson without a matching eval cannot go global — a reason to write evals,
  not to bypass them.
