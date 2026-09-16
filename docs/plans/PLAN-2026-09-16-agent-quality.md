# Plan — agent quality: fix the ruler, then the agents

Status: in progress · Epic: `great_cto-9znw` · Started 2026-09-16

## Why

A scoring pass over all 70 agents (behaviour from eval runs, contract, routing,
hygiene) put the fleet at a median of 80/100. It named three kinds of work: 8
agents with no measurement, reviewers far below their own bar, and rates that are
weeks old.

Reading the failed cases before touching any prompt changed the order. Of the 123
failing cases in the latest run of each eval, **41 have an empty actor answer**.
`cli-reviewer` scored 0.12 because 7 of its 8 answers were empty; every
`voice-ai-reviewer` answer on 2026-08-03 was empty. The runner sends an empty
answer to the judge like any other, and the judge scores it — usually FAIL, and on
2026-08-01 PASS for twelve pack cases. `ACTOR_MAX_TOKENS` was raised on
2026-09-12, which removed the main cause, but the hole is still open: nothing
stops an empty answer from becoming a verdict.

Rewriting a prompt against that record would tune agents to a measurement fault.
So the ruler comes first.

## Items, in order

| # | Item | Beads | Spend |
|---|---|---|---|
| R1 | Runner: an empty or refused actor answer is dropout, never judged | `great_cto-9znw.1` | none |
| R2 | Coverage ladder: `passing` needs a run where the agent itself was the actor | `great_cto-9znw.2` | none |
| M1 | Re-measure the failing agents on the fixed runner | `great_cto-9znw.3` | ~$15 |
| F1 | Fix prompts that still fail on real answers | `great_cto-9znw.4` | ~$10 |
| E1 | EVAL sets for the 7 agents with no eval of their own role | `great_cto-9znw.5` | ~$6 |
| M2 | Full fleet re-measure, `--samples 3` | `great_cto-9znw.6` | ~$40–70, **needs approval** |

Spend is estimated from `results-history.jsonl`: median $0.16 per eval run.

### R1 — empty answers are not answers

Classify the actor's reply the way `classifyJudgeOutcome` already classifies the
judge's: refused, truncated with no text, or empty. Any of those is a `SKIP` with
`skip.kind` = `actor-empty` / `actor-refused` / `actor-truncated`, counted in
dropout and excluded from the rate. The judge is never called on it (which also
saves the judge call). A truncated answer that has text is still judged — cut
answers are a real property of a long agent, and the judge sees the cut.

### R2 — who was the actor

Pack evals (`> Pack: voice-pack · Reviewer: voice-ai-reviewer`) run with a
generic actor unless bound to the reviewer. Those runs currently make the
reviewer `passing`, while the only run with the reviewer as actor scored 0–0.33.
A run counts toward an agent's rung only when `actorSource` is `agent:<name>`.

Shipped, and it corrected two rungs at once: `architect` had read `passing`
through a filename match on `EVAL-ai-prompt-architect-versioning`, and
`voice-ai-reviewer` through generic pack runs. The ladder now reads 46 passing,
17 exercised-but-failing, 1 present, 6 missing.

### M1 — measure before fixing

Agents: ai-security-reviewer, auth-engineer, cli-reviewer, code-reviewer,
decision-scorer, e2e-test-engineer, integrations-engineer, mlops-reviewer,
msp-reviewer, pm, product-owner, project-auditor, regulated-reviewer,
senior-dev, subscription-billing-engineer, architect, mobile-app-builder.
All cases (no `--sample` subset — many August rates were 3-case subsets),
`--samples 3`.

### F1 — prompt fixes

Only for agents still below threshold on non-empty answers. Read the failing
answers, change the prompt, A/B on the tuning split with `--prompt-file`, and
confirm on holdout once — holdout is never used to iterate.

### E1 — the missing sets

Seven agents: app-scaffolder, connector-builder, geo-routing-engineer,
growth-engineer, knowledge-extractor, media-pipeline-engineer, and
voice-ai-reviewer — whose four pack evals ask the actor to BE the voice agent
(`> Actor: generic`), so nothing measures it as a reviewer.

Hand-written, 5 tuning + 3 holdout cases each, in the existing format, bound with
`> Agent:`. Cases come from each agent's own contract: what it must refuse, what
it must produce, the failure a reviewer of its output would catch.

### M2 — re-measure the fleet

After R1–E1, so the numbers reflect the fixed runner and prompts. Not started
without an explicit go on the spend.
