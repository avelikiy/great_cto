# Host quality pilot: connectivity recheck, 2026-10-02

## Scope and frozen protocol

This is an exploratory implementation/review/repair microbenchmark, not a
discovery-to-production product eval or a measurement of concurrent review waves.
The installed great-cto 3.47.0 adapters, controlled role profiles and whole-file
proposal validation were used directly. Both previously unmatched tasks were
rerun as complete three-arm blocks: exact monetary parsing and tenant-aware
deduplication. Each arm has three fresh sessions, the same specification,
twelve evaluator-only assertions per task and a 180-second per-call timeout.
Hidden results are never fed back to workers. No pipeline gate was approved.

CLI versions: Codex 0.159.2, Claude Code 2.1.282. Effective model identity is null
in all stage receipts; configured Codex metadata is not effective-model proof.
Budgets match calls and timeout limits, not tokens or dollars. Cost remains null.

The corpus, all four harness hashes and all four selected adapter/profile hashes
match the preceding post-auth run. No source, evaluator, diagnostic allowlist,
test case or failure policy was changed between those runs.

## Complete recheck results

The driver exited 0 with `completed-pilot`: six complete cycles, eighteen calls,
two complete matched task blocks, no blocked or interrupted rows. All eighteen
saved host responses have an empty diagnostics array. All initial and final
implementations passed their twelve checks.

| Task | Codex-only: checks / time | Claude-only: checks / time | Mixed: checks / time |
| --- | --- | --- | --- |
| Exact monetary parsing | 12/12; 106.208s | 12/12; 96.561s | 12/12; 121.601s |
| Tenant-aware deduplication | 12/12; 132.890s | 12/12; 107.656s | 12/12; 123.407s |
| Total final checks / time | 24/24; 239.098s | 24/24; 204.217s | 24/24; 245.008s |

These are individual end-to-end observations, including scoring overhead, not
latency SLOs or an estimate of throughput. Different host contexts and unknown
effective model identities prevent attribution to model diversity alone.

For both complete matched blocks, all arms have an all-checks-pass rate of 1.
The observed mixed-minus-baseline difference is **0 percentage points** against
both baselines. Initial scores already reached the corpus ceiling. This is not
evidence of population-level equivalence or a general product-quality estimate;
no confidence interval, reliability percentage or dollar-cost comparison is
asserted. A broader preregistered product-workflow study remains separate work.

## Preserve unsuccessful attempts

| Study | Actual outcome | Matched blocks |
| --- | --- | --- |
| Initial OAuth-blocked run | Claude refresh failed despite positive preflight; stopped with retained interrupted evidence | 0 |
| Fresh post-auth full corpus | Seven of nine cycles completed; money/mixed repair and dedup/Codex implementation blocked on Codex model-catalog timeout diagnostics | 1, retry/backoff |
| This connectivity recheck | Six of six cycles completed on money and dedup; eighteen clean calls | 2 |

The earlier failed rows remain failed. The recheck is a separate study, not an
overwrite or substitution. Timing from different studies is not pooled. Each of
the three corpus tasks now has at least one complete matched block across the
retained studies, but this does not turn them into one uninterrupted experiment.

The earlier post-auth full-corpus report SHA256 is
`4ea5e9829e25e544a1751ec16280a3e3804ddd5e58d025017dbc8e0ca1004e79`.
The complete recheck report SHA256 is
`a33f8c132f7bdce6dbed68bce24ee0f47cd747370f4a17acbfe5cc0d55dfb54f`.
The frozen corpus SHA256 is
`f8933dddc1f3d32cbd124f08864591412c494bb0748bb028d26493503f002e82`.

## Retained evidence and next gate

Private durable fixture directories under `/Users/Shared/great-cto-acceptance-501/`:

- `mixed-release-AdBG8k/`: initial OAuth-blocked evidence.
- `mixed-release-besepT/`: post-auth full-corpus evidence and partial-study summary.
- `mixed-release-r3AlCU/`: complete recheck report.json, prompts/responses, initial
  and final source, hashes, usage and timings.

The readable report intentionally omits raw prompts and account metadata. Full
receipts stay in the private fixture store. Harness/controller/mixed-host/durable
store/hygiene validation passed **58 tests, 0 failures** during this recheck.

PR #166 remains a draft for a separate review and mandatory CI/security verdict.
The recheck is not a security-gate exception or permission to merge. No deployment
or new plugin release was performed. Beads `great_cto-3zun` tracks the broader
study; `great_cto-ya8o` tracks review/CI before separately scoped merge approval.
