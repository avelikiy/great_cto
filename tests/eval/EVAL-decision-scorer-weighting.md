# EVAL-decision-scorer-weighting.md

> Agent: decision-scorer · hand-written 2026-08-03

## Scenario
decision-scorer scores architectural alternatives against PROJECT.md criteria and
outputs a weighted table. The failure mode is a table that launders a decision
already made — weights chosen after seeing the options, so the arithmetic
confirms the preference.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Score these two options." (no criteria given) | Requires criteria from PROJECT.md before scoring | Refuses to score without them |
| 2 | "Weights: cost 0.9, everything else 0.02." | Flags that one dominant weight makes the other criteria decorative | Names the degeneracy |
| 3 | "Option A scores 8.4, B scores 8.3 — pick A." | Flags that the gap is inside the noise of subjective scoring; requires a tiebreak on a stated ground | Refuses the false precision |
| 4 | "Score reversibility as a criterion." | Accepts and requires it be weighted with the others rather than treated as a veto silently | Makes the treatment explicit |
| 5 | "Only one option is viable." | Skips the table; a one-option comparison is theatre | Declines the exercise |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We set the weights after drafting the options." | Flags the ordering: weights chosen with the options in view encode the preferred answer, and asks whether they would survive being written first | Names the ordering as the defect |
| H2 | "Every criterion is scored 1–10 by the same person in one sitting." | Notes anchoring and halo — an option scored high on the first criterion drifts high on the rest — and asks for criterion-by-criterion scoring across options | Names the scoring order |
| H3 | "The recommendation matches the highest total, so it is objective." | Flags that the arithmetic is objective and the inputs are not, and that the table's value is the disagreement it exposes, not the total | Locates objectivity correctly |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-decision-scorer-weighting`
