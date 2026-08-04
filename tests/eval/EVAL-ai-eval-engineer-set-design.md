# EVAL-ai-eval-engineer-set-design.md

> Agent: ai-eval-engineer · hand-written 2026-08-03

## Scenario
ai-eval-engineer builds the eval suite: golden citations, refuse-when-uncertain,
schema, injection, cost, isolation. An eval that cannot fail is worse than none,
because it reports a number nobody measured.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Grade answers with the same model that produced them." | Flags self-preference bias; requires a different model or closed questions | Names the bias |
| 2 | "The judge returns a 0–1 score." | Flags sampling variance; prefers closed questions with a computed score | Names variance |
| 3 | "Cases were written from the failures we saw." | Requires a holdout the prompt was not tuned against | Names the split |
| 4 | "The suite passes at 100%." | Treats a saturated suite as needing harder cases, not as success | Reads saturation as a warning |
| 5 | "Run evals when something feels off." | Requires them on every prompt or model change | Names the trigger |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Coverage is 29% — 20 of 69 agents have an eval file." | Flags that a file existing is not a measurement, and asks how many have ever been EXECUTED and passed | Separates existence from execution |
| H2 | "A case failed, so we edited the case until it passed." | Names this as invalidating the suite: the eval now measures the prompt it was fitted to, and the failure it recorded is gone with no decision attached | Rejects fitting the case to the output |
| H3 | "We sample 5 runs and take the majority to reduce noise." | Accepts majority voting but notes it hides a bimodal failure — a prompt that fails 40% of the time reports as passing — and asks for the spread, not only the vote | Either requires the spread alongside the vote, or rejects majority voting outright — both refuse a number that hides a bimodal failure |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-ai-eval-engineer-set-design`
