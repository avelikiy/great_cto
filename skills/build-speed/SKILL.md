---
name: build-speed
description: Make a slow CI pipeline or build faster by measuring it first — per-step durations, the slowest step, a target — then one change at a time, re-measured the same way. Speed never comes from removing, skipping or weakening a check. Use when a build or CI is slow ("CI долго", "ускорь сборку", "гейт идёт 40 минут", "build takes forever"). Loaded by devops, ci-resolver.
when_to_use: |
  Apply when:
  - the operator says a build, a test suite, a pipeline or a deploy is slow
  - you are adding a pipeline step and someone asks what it costs in minutes
  - a pipeline got slower and nobody knows when or why
  Do NOT apply to:
  - a red pipeline — make it green first (ci-resolver), then make it fast
  - application performance (latency, throughput) — that is performance-engineer
effort: low
allowed-tools: Read, Bash, Grep
---

# build-speed — measure, then change one thing, then measure the same way

A build is made faster by finding where the minutes go. Guessing goes to the step
that looks heavy; measuring goes to the step that is. On this repository's own gate
one step, `lib tests` run in a single worker, was 21–30 of 28–38 measured minutes:
75–80% of the gate. Eight workers took that step to 5 minutes; no cache would have.

## 1. Measure before anything changes

- **Per step, not in total.** The duration of each step from the CI log or the
  runner's API (`gh run view --json jobs`, the TAP `duration_ms`, timestamps
  around each step). A total says the build is slow; steps say where.
- **At least three runs** of unchanged code. Write down the range, not one number:
  a shared runner and a busy laptop both vary by a third.
- **Note the conditions.** Runner type, cores, cache state (cold or warm),
  concurrency flags. A measurement without its conditions cannot be repeated.

## 2. Pick one step and a target

The slowest step, unless a faster one runs on every commit and the slow one does
not. Write the target before the change: "`lib tests` from 21–30 min to under 10
min, same tests, same pass count". No target, no way to say the change worked.

## 3. Change one thing

Usual levers, in the order they usually pay:

| Lever | When it pays |
|---|---|
| Parallel workers | tests are independent and the machine has idle cores |
| Run only what changed (affected targets) | a monorepo, and the full set still runs before merge |
| Dependency and layer caches | install or image build is a large share of a step |
| Split a long job across runners | one job dominates and runners are cheap |
| Fix the slowest tests themselves | a few tests are most of the time (sort by duration) |

Parallel workers expose tests that share state: a database, a port, a temp path,
a global config. A test that fails only in parallel is a real finding: give each
worker its own resource. Never answer it by going back to one worker silently.

## 4. Re-measure the same way

Same method, same conditions, same number of runs. Report before, after, and the
pass count of both. If the pass count differs, the change is not a speed-up: it
dropped or broke tests.

## Forbidden

Speed bought by checking less is not speed. Never:

- skip, delete, `.only` or mark as allow-failure a test or a step;
- lower a threshold, a coverage floor or a timeout so a check passes sooner;
- move a check out of the path to merge or deploy ("run e2e nightly instead")
  without the operator's decision, written down with its risk;
- run fewer tests "because they never fail".

## Report

```
BUILD-SPEED <pipeline> @ <commit>
  step     : lib tests
  before   : 22–29 min (2 runs, 1 worker, 10-core host, CPU 80% idle)
  after    : 4.5–5.3 min (3 runs, 8 workers, same host)
  tests    : 4034 before, 4034 after, same pass count
  change   : ci-local.sh --jobs=8, lib tests only; root and board fixtures keep 2
```

A line you could not measure is `NOT MEASURED` with the reason.
