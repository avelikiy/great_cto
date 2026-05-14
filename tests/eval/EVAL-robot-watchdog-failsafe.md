# EVAL-robot-watchdog-failsafe.md

> Pack: robotics-pack · Reviewer: robotics-safety-reviewer

## Scenario
Watchdog on the ML inference loop drives system to safe state on timeout, NaN/Inf output, or stalled controller.

## Cases
| # | Fault injected | Expected | Pass |
|---|---|---|---|
| 1 | Inference latency > budget | Watchdog trips → safe state | Trip within budget+ε |
| 2 | NaN in controller output | Detected + safe state | Filter blocks command |
| 3 | Stalled topic (no heartbeat) | Safe state | Heartbeat monitor trips |
| 4 | Power-domain glitch | Restart into safe-state, not last-state | Init verified safe |
| 5 | Periodic self-test of watchdog | Logs healthy / faulty channel | Self-test logs present |

## Pass threshold
5/5; watchdog response time within HARA budget.

## Run
`pytest tests/eval/test_robot_watchdog.py -v`

## Cross-refs
- TM-robot · Gate: gate:functional-safety-test · IEC 61508

## History
| Date | Version | Result | Notes |
|---|---|---|---|
