# Plan — agent quality: fix the ruler, then the agents

Status: R1–F1 and E1 done; M2 awaits approval · Epic: `great_cto-9znw` · Started 2026-09-16

## Why

A scoring pass over all 70 agents (behaviour from eval runs, contract, routing,
hygiene) put the fleet at a median of 80/100. It named three kinds of work: 8
agents with no measurement, reviewers far below their own bar, and rates that are
weeks old.

Reading the failed cases before touching any prompt changed the order.
`cli-reviewer` scored 0.12 because 7 of its 8 recorded answers were empty, and the
judge failed each one. The runner sends an empty answer to the judge like any
other. `ACTOR_MAX_TOKENS` was raised from 2500 to 6000 on 2026-09-12, which removed
the main cause of empty and cut answers, but nothing stopped an empty answer from
becoming a verdict.

> **Correction (2026-09-16, evening).** This section first said 41 of 123 failing
> cases had an empty answer, that twelve pack cases scored PASS on an empty
> answer, and that every voice-ai-reviewer answer on 2026-08-03 was empty. The
> count was wrong: it treated a case with **no recorded answer** as an empty one
> (rows before the answer field existed carry none), and it counted passing cases
> in a total described as failing. Measured properly, in the latest run of each
> eval before today: 123 failing cases — 105 with an answer, **7 with a recorded
> empty answer** (all cli-reviewer), 10 with no answer on record. The PASS and
> voice claims cannot be checked from the record and are withdrawn. The same
> wrong figures appear in the message of commit `ae5aa6af`, which is public
> and is not rewritten; this note is the correction.
>
> What stands: the re-measure on today's runner passes every agent it re-ran.
> What does not: attributing that jump mainly to empty answers. Most of it came
> from runner changes made between the August runs and today — the 2026-09-12
> token cap among them — and from the eval-text fixes below.

Rewriting a prompt against that record would tune agents to a measurement fault.
So the ruler comes first.

## Where it stands (2026-09-16, evening)

The finding that reorganised the day: **one agent prompt needed a change.** Every
other agent that read as failing was failing on the ruler.

| Cause | Agents | Fix |
|---|---|---|
| Empty answers judged as failures | cli-reviewer (7 of 8) | R1, runner |
| Evidence from another actor or file | architect, voice-ai-reviewer | R2, ladder |
| Dual threshold judged by its leading bar | code-reviewer (24/25 recorded as failed) | runner + eval-status |
| Case missing the input the agent's contract requires | code-reviewer, senior-dev, knowledge-extractor | case text, answers unchanged |
| Eval contradicting the prompt | product-owner | CTO decision: ask and stop |

One prompt candidate was measured (code-reviewer) and scored no better than the
shipped prompt; it was not shipped.

Re-measured on the fixed runner, unchanged prompts: ai-security-reviewer 7/8,
architect 23/25 and 20/25, auth-engineer 7/8, cli-reviewer 8/8, code-reviewer
24/25, decision-scorer 7/8, e2e-test-engineer 19/24, integrations-engineer 7/8,
mlops-reviewer 8/8, mobile-app-builder 14/14, msp-reviewer 8/8, pm 22/25,
project-auditor 21/25, regulated-reviewer 8/8, senior-dev 5/5×3 + 18/20,
subscription-billing-engineer 8/9. New sets: six agents 8/8, knowledge-extractor
5/5×3 on tuning.

Open:
- **product-owner** — done. On the aligned eval with a 16000-token actor cap it
  scored 23/30; one real miss repeated (T4: invents a wedge and returns PIVOT
  instead of DON'T BUILD, 2 runs of 3). The one prompt change of the day fixed it:
  tuning 30/30 over 3 samples, holdout 14/20 (shipped prompt 15/20). `bdee80c6`.
- **M2** — the fleet re-measure, not started; ~$40–70.
- New tuning sets written from each agent's contract pass by construction; the
  holdout rows are the signal, and each ran once.

Spend so far: about $32.

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
