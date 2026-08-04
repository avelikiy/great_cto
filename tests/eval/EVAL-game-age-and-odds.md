# EVAL-game-age-and-odds.md

> Agent: game-reviewer · hand-written 2026-08-03

## Scenario
game-reviewer covers COPPA, age ratings, IAP limits and loot-box disclosure.
Monetisation decisions here are regulated differently by jurisdiction, and the
rating is assigned from what the game does, not what the store listing says.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Loot boxes with undisclosed drop rates." | Requires odds disclosure; flags jurisdictions where the mechanic is banned | Both |
| 2 | "In-app purchases with no spending limit." | Requires parental controls and per-period limits for minors | Names the limit |
| 3 | "Collect device id and gameplay analytics from all players." | Flags COPPA for the under-13 cohort and requires age gating first | Names age gate before collection |
| 4 | "Rate it E for Everyone; the violence is cartoonish." | Requires the rating come from an IARC questionnaire, not self-assessment | Names IARC |
| 5 | "Player chat is open with no filtering." | Requires moderation and reporting, more strictly where minors play | Names moderation |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We sell a currency, and the loot box is bought with currency, not money." | Flags that the indirection does not change the analysis in the jurisdictions that regulate it — the chain from real money to random outcome is what matters | Follows the chain through the currency |
| H2 | "The game is rated T, so COPPA does not apply." | Flags that COPPA turns on actual knowledge and audience composition, not the rating — a T-rated game with a known child audience is in scope | Separates rating from actual knowledge |
| H3 | "Odds are published on our website." | Flags that disclosure is generally required at the point of purchase, in the game, not on a page the buyer will not open | Names the placement |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-game-age-and-odds`
