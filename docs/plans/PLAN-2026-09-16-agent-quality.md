# Plan — agent quality: fix the ruler, then the agents

Status: done · Epic: `great_cto-9znw` · Started 2026-09-16

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
- **M2** — ran 2026-09-16 on 60 evals not measured earlier the same day, one sample,
  $17.23 before the provider ran out of credits. 37 passed, 14 below threshold,
  9 not measured (credits: streaming, tax, us-privacy, web-store, four voice).
  Holdout passed its bar in almost every failing eval; tuning failed. Causes, from
  the answer text: pack evals whose tuning cases ask the actor to BE the API or the
  screening system (4 api, 2 hr) — now `> Actor: generic`, and the ladder no longer
  credits such files to the reviewer they name; diffs described in prose with no
  code (qa-engineer boilerplate, security-officer adversarial) and a session with
  no data (continuous-learner) — the cases now carry it, answers unchanged;
  compression-fidelity cannot be measured from text — marked so; coordinator 7/8
  and request-classifier left as they are. api-platform-reviewer lost its only
  evals to the opt-out and got a set of its own role. **None of these fixes is
  measured yet.**
- New tuning sets written from each agent's contract pass by construction; the
  holdout rows are the signal, and each ran once.

- **M3** — 2026-09-17, $7.61: the 9 evals M2 lost to credits and the eval-text
  fixes, one sample. Fixes held: qa-engineer-boilerplate 3/8 → 8/8,
  hr-resume-injection 3/9 → 9/9 (generic actor), security-officer-adversarial
  tuning 2/5 → 5/5, api-platform-reviewer's new set 8/8. product-owner on the
  shipped prompt (agent as actor, 16000-token cap): 24/30, T4 passed; case 3 was
  cut at the cap again. Ladder: 65 passing, 5 exercised-but-failing, 0 missing.
- **Open after M3** —
  - `security-officer-finding-gate` (graph judge): tuning 2/5 — Findings without an
    evidence pointer, and gates blocked on a TODO or a rename. The first failure
    in this plan that reads as the prompt, not the ruler. Needs an A/B.
  - `continuous-learner-extraction` 3/5 with the session data in the cases: the
    agent will not write a lesson from case text. Prompt or harness, not yet known.
  - Pack evals switched to `> Actor: generic` (api, hr, voice) now measure the base
    model playing the system, not a great_cto agent. They should either be
    rewritten for the reviewer's role or be left out of any fleet score.

- **Follow-ups closed 2026-09-17** —
  - `security-officer-finding-gate` was the ruler again, not the prompt: the agent
    found the right vector and could not cite a line, and refused to approve JWT
    checks it had not seen. Tuning cases now carry the code: tuning 0.80 over three
    samples (bar 4/5), holdout 17/20. Remaining H4, H6, H9 ask for file:line from
    prose holdout rows; left as they are.
  - `continuous-learner`: three cases still had no data and case 3 had no cause for
    the outlier, which the agent's own quality gate requires. With the data: tuning
    93% ± 12% over three samples (one miss in 15), holdout 2/3.
  - Pack evals with `> Actor: generic` are out of every agent-level reading: the
    ladder skips them and `gate-tier` already required `agent:<name>`. No rewrite
    needed. hr-ai-reviewer had no eval of its own role (its bias eval's tuning rows
    are test-suite metric assertions) and got one: 8/8.
- **Two spec questions, decided 2026-09-18 by the CTO** —
  - *A P1 Finding blocks `gate:ship`* unless a signed `/exception` covers it — the
    same rule code-reviewer already had. security-officer carried three
    contradicting lines (the hard rule named P0 only; the mode table and the
    post-impl flow said "Critical"); all three now say P0/P1. finding-gate tuning
    0.80 → 0.92 over three samples, holdout 17/20 → 18/20.
  - *A first sighting is recorded in lessons.md*; promotion is the strict gate.
    continuous-learner's quality list read "one occurrence" as low confidence, so no
    pattern could ever reach the threshold `lessons-merge.mjs` counts. Fixing it
    exposed a second mismatch: the prompt and eval case 1 said "≥3 occurrences"
    while the script counts ≥3 **distinct projects**; both now say projects.
    Tuning 0.93 → 1.00 over three samples, holdout 2/3 unchanged.

Spend so far: about $66 (M1–F1 ~$32, M2 $17.23, M3 $7.61, follow-ups and decisions ~$9).

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

## Re-measure on 3.33 (2026-09-23)

One sample, `--actor-tools --actor-max-tokens 16000`, ~$41 of OpenRouter credit until it
ran out. 32 of 87 evals in file order, then the twelve evals of agents whose prompts
changed in 3.30–3.33 by priority; six of those ran before the $6 floor stopped the run.
Evals not re-run keep their 16.09 result.

| | 16.09 (M2/M3) | 23.09 |
|---|---|---|
| Agents passing their own eval | 61 of 70 | **67 of 70** |
| Agents that ran and did not pass | 3 | 3 — coordinator, devops, product-owner |
| Agents with an eval never run | 6 | 0 |
| Evals passing | — | 68 of 87 (17 failing, 2 unscored) |

- Changed prompts held: security-officer finding-gate 21/25, qa-engineer
  boilerplate-rejection 7/7, mobile-app-builder 14/14, pm 19/24, l3-support 26/29.
- **senior-dev regressed, and the cause was this series.** 3.31's "do it without asking"
  ended with a sentence that cancelled the ask-first list above it. Tuning fell to 4/5 and
  the empty-TEST-SPEC holdout case (PASS on 16.09) failed. Fixed in fa6524c2; re-run:
  tuning 5/5, holdout 17/19, passing. The empty-TEST-SPEC case failed again in that one
  run — n=1 each way, noted, not settled.
- Still below bar: coordinator 7/8 (withheld the authorization phrase it was asked to
  emit), devops (one split: refused a hotfix ordering but missed prod-ahead-of-main
  divergence, flag enablement, replica lag), product-owner (not re-run; 16.09 result).
- Not re-run for want of credit: security-officer adversarial-prompt, qa-engineer
  severity-accuracy and gherkin-mutation, infra-provisioner, architect gate-compliance,
  product-owner brief, and the 49 evals after `enterprise-saas` in file order.
