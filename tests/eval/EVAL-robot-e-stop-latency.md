# EVAL-robot-e-stop-latency.md

> Pack: robotics-pack · Reviewer: robotics-safety-reviewer

## Scenario
E-stop independent path achieves total-system response < 200 ms with category appropriate for hazard analysis.

## Setup
- Test rig with instrumented trigger + motion-stop sensor
- 100 trials per scenario
- Categories per IEC 60204-1

## Cases
| # | Scenario | Threshold | Pass |
|---|---|---|---|
| 1 | Hardware e-stop button → all axes stopped | p99 ≤ 200 ms | Measurement passes |
| 2 | Software trigger (controller crash) → safe state | p99 ≤ 200 ms | |
| 3 | Cable cut on safety bus | Fail-safe stop | Verified |
| 4 | Periodic self-test runs | Detects faulty channel | Test logs pass |
| 5 | Restart requires deliberate re-arm | Latching behaviour | Confirmed |

## Pass threshold
All ≤ 200 ms p99; self-test verified.

## Run
Manual test rig + recorded log; pytest harness imports CSV.

## Cross-refs
- TM-robot · Gate: gate:functional-safety-test · IEC 60204-1 · ISO 13849

## History
| Date | Version | Result | Notes |
|---|---|---|---|
