# Released-host quality pilot

## Question and scope

Does changing the reviewer host improve functional correctness for a bounded
implementation/review/repair slice? This is not a full discovery-to-production
product benchmark and does not measure the controller's concurrent review waves.
It reuses a selected artifact's restricted host adapters, role profiles and
whole-proposal validation; it does not bypass or auto-approve pipeline gates.

Three arms each use three fresh sessions: Codex/Codex/Codex,
Claude/Claude/Claude, Codex/Claude/Codex. Mixed changes only the reviewer from the
Codex baseline. Differences from Claude-only include both developer and reviewer
choices, so they cannot be attributed exclusively to model diversity.

## Protocol

Three toy modules cover exact monetary parsing, bounded retry calculation and
tenant-aware deduplication. Each has 12 evaluator-only cases including negative,
precision, overflow, collision and mutation checks. Workers receive identical
specifications, isolated starter files, role profiles, three-call budgets and
per-call timeouts. Reviewers receive no hidden test results; developers repair
from reviewer evidence only, including when the reviewer approves. Initial and
final implementations are scored after all three calls. The grader is a trusted
deterministic process, not a participating LLM. VM execution disables imports
and dynamic code generation, limits synchronous evaluation and runs under a
bounded child process. This is defense in depth, not an adversarial OS sandbox.

Run order rotates by task/repetition to reduce simple position bias. No shared
model conversation or implementation files are reused across arms. The grader
corpus is outside worker fixtures, never embedded in prompts. CLI filesystem
restrictions are not proof that an adversarial same-user process cannot read it.

## Commands

Plan only (no model calls):

```sh
node tests/eval/host-quality-benchmark.mjs --plugin-root /absolute/installed/plugin
```

Live pilot (both CLIs installed and authenticated):

```sh
node tests/eval/host-quality-benchmark.mjs --live \
  --plugin-root /absolute/installed/plugin --repetitions 1 --timeout-ms 180000
```

Use `--tasks money` for nine-call harness calibration. The full pilot makes at
most 27 calls. Time and call counts are bounded, but token and dollar spending
are **not** equalized. Host default models are used; effective model identity is
recorded if the adapter exposes it, otherwise null. CLI versions, artifact
version and hashes, corpus/spec hashes, prompts, responses, usage, stage timing,
input/output hashes and initial/final checks are retained in a private durable
fixture directory printed by the runner. Missing cost telemetry remains null;
it is never interpreted as zero. Auth preflight failures exit before calls.
An expired OAuth session discovered during a real call stops the entire study;
preflight `loggedIn: true` is not proof that the session can actually refresh.

## Metrics and interpretation

- Primary: task-level all-checks-pass rate. Assertions within a task are not
  independent observations.
- Secondary: initial/final check pass rate, workflow completion, blocked reasons,
  elapsed time and raw usage. Workflow pass rate includes failed attempts in its
  denominator; code-quality comparisons require complete matched task blocks.
- Report absolute percentage-point deltas separately from relative percentages.
  A zero or absent baseline yields no relative percentage. Never mix tasks across
  unmatched blocks or discard transport failures silently.
- One repetition of three tasks is an exploratory pilot with possible ceiling
  effects, not evidence for a population-level improvement or reliability claim.
  No confidence interval or general product-quality percentage is asserted.

Before a confirmatory study, freeze broader representative tasks, model versions,
budget policy and a primary endpoint; estimate sample size from pilot paired
disagreements, then use repeated matched runs and task-cluster uncertainty.
Dollar-matched controls and reversed mixed developer/reviewer roles are separate
experiments. Independently audited security defects, integration behavior and
full-product acceptance remain outside this initial functional corpus.

## Harness verification

```sh
node --experimental-vm-modules --test tests/eval/host-quality-benchmark.test.mjs
```

Tests cover matched-arm aggregation, absent and zero baselines, transport
blocking, mutation, invalid imports, synchronous timeout, and adversarial numeric
edge cases. A green harness test does not establish a live benchmark result.
