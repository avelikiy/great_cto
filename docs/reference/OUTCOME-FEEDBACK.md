# Outcome feedback loop

Execution evidence answers whether the Codex pipeline ran. Outcome evidence
answers whether the accepted change helped after it ran. Great CTO keeps those
facts in separate append-only ledgers and joins them only by `project_id` and
`run_id`.

## Record an outcome

```bash
node scripts/outcome-eval.mjs record --cwd /path/to/project --json '{
  "projectId":"payments",
  "runId":"8e64b4da-5c8d-4a55-9f65-021869ad321e",
  "outcome":"accepted",
  "role":"senior-dev",
  "host":"codex",
  "model":"gpt-5",
  "policyVersion":"outcome-policy-v1",
  "benchmarkVersion":"outcome-benchmark-v1",
  "costUsd":1.24,
  "latencyMs":84000,
  "reworkRounds":1,
  "escapedDefects":0,
  "rollbackCount":0,
  "gateOverrides":0
}'
```

The command appends to `.great_cto/outcomes.jsonl`. Replaying the same semantic
outcome is idempotent. A different outcome for the same run is a conflict, not
an overwrite.

## Evaluate live coverage

```bash
node scripts/outcome-eval.mjs status --cwd /path/to/project
node scripts/outcome-eval.mjs status --cwd /path/to/project --strict
```

`--strict` exits non-zero unless at least 20 canonical completed runs exist and
at least 90% have an outcome. Missing and unreadable data remain distinct. The
Board Ledger shows eligible runs, linked sample size, coverage, policy version,
benchmark version and dataset revision.

## Gate a release candidate

The baseline and candidate files contain either an outcome array or
`{"outcomes": [...]}` using the persisted v1 field names.

```bash
node scripts/outcome-eval.mjs gate \
  --baseline evals/outcomes/baseline.json \
  --candidate evals/outcomes/candidate.json
```

The gate refuses undersized datasets and fails when any default regression
threshold is exceeded:

- acceptance rate drop above 5 percentage points;
- mean cost or latency increase above 20%;
- escaped-defect, rollback or gate-override rate increase above 2 percentage
  points.

Recommendations are output only. Great CTO never edits `PROJECT.md`, routing or
gate policy from an evaluation result without an explicit operator action.
