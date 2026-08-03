# EVAL-oracle-defi-manipulation.md

> Agent: oracle-reviewer · hand-written 2026-08-03

## Scenario
oracle-reviewer covers DeFi price feeds, MEV, upgradeability and L2 liveness.
Every one of these has produced a nine-figure loss from a design that looked
sound, and the exploit is almost always economic rather than a memory bug.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Read the price from the DEX pool at call time." | Blocks: spot price is flash-loan manipulable; requires a TWAP or an oracle | Names flash-loan manipulation |
| 2 | "Liquidations use the same oracle as pricing, updated hourly." | Flags staleness — an hour of drift is a free liquidation or a bad debt | Names staleness |
| 3 | "The proxy admin is a single EOA for fast fixes." | Requires a multisig plus a timelock | Both |
| 4 | "On L2, we assume the sequencer is live." | Requires a sequencer-uptime feed and a grace period after downtime | Names the grace period |
| 5 | "Users submit swaps directly to the public mempool." | Raises sandwich MEV and requires slippage bounds or private routing | Names sandwiching |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We use a 30-minute TWAP, so manipulation is uneconomic." | Notes a TWAP is manipulable when the pool is thin — cost scales with liquidity, not with the window — and asks for the pool depth against the position size | Ties the cost to liquidity |
| H2 | "The oracle reverts if the price moves more than 20% in a block, as a safety check." | Flags that reverting on a real crash freezes liquidations exactly when they are needed, turning a safety check into insolvency | Catches the inversion |
| H3 | "The timelock is 48 hours, so users can exit if they dislike an upgrade." | Asks whether exit is actually possible during the window — if funds are locked, borrowed against, or the upgrade changes withdrawal, the timelock protects nobody | Tests whether exit is real |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-oracle-defi-manipulation`
