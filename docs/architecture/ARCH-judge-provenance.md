# ARCH — judge provenance on eval result rows

Reader: the senior-dev who will implement this, and the on-call engineer who reads
`eval-gate` output before promoting a prompt. The decision: put two fields on each
aggregate result row so a reader can tell which judge produced the rate, and make
`eval-gate` refuse to compare two rows scored by different judges.

## The problem, restated in one line

`runner.mjs` now scores an eval one of two ways — the rubric judge (one PASS/FAIL
call per case) or the graph judge (`dag-metric.mjs`, score computed from the path)
— and the aggregate row it appends to `results-history.jsonl` records the rate but
not which judge produced it. `results-history.jsonl` mixes both. The per-case
`caseResults[].judge` field added today ('rubric' or 'dag') carries the fact at the
case level, but the two consumers read the aggregate row, not the case array:
`eval-status.mjs` reads the newest row's `rate`/`threshold`; `eval-gate.mjs`
compares `baseline.rate` against `candidate.rate` by eval name. Neither looks
inside `caseResults`, so at the level they operate on, a rubric row and a graph row
are indistinguishable.

## 1. The record

Two fields on the aggregate row, reusing the vocabulary already on the case entries:

| Field | On which rows | Value | Why it earns its place |
|---|---|---|---|
| `judge` | every new row | `'rubric'` \| `'dag'` | The discriminator a reader switches on. One scalar is enough because one run scores an eval with one judge — the graph is selected by file existence, or the rubric is forced globally by `--judge rubric`; there is no per-case mix within a single eval run. |
| `dagHash` | graph rows only | 12 hex chars, absent on rubric rows | The graph's questions are the metric. Editing one question silently changes what the score means, and `judge: 'dag'` alone cannot see that. `dagHash` changes when the graph changes, so two graph runs can be compared only when they scored against the same graph. |

`dagHash` is a sha256 over the graph's **scoring structure** — `root`, each node's
`question` and `edges`, each leaf's `score` — with keys sorted so file key-order
does not affect the hash. It excludes `note` and each leaf's `reason`: those are
documentation, and hashing them would make `eval-gate` refuse a comparison between
two runs whose metric is in fact identical. This is the pattern `exceptions.mjs`
already uses (`canonicalString` hashes the immutable fields, not the mutable ones),
and the 12-char output matches `ccr.mjs`'s existing fingerprint convention.

The rubric judge needs no equivalent hash. Its prompt lives in `runner.mjs`
(`callJudge`), so the row's existing `commit` field (written to history) already
fingerprints it. Adding a second identifier for the rubric would duplicate the
commit SHA.

Sketch (`dag-metric.mjs`, ~12 lines, `node:crypto`, no new dependency):

```js
import { createHash } from 'node:crypto';
export function dagFingerprint(dag) {
  const sortKeys = (o) => Object.fromEntries(Object.entries(o || {}).sort(([a],[b]) => a < b ? -1 : 1));
  const scoring = {
    root: dag.root,
    nodes: sortKeys(Object.fromEntries(Object.entries(dag.nodes || {})
      .map(([id, n]) => [id, { question: n.question, edges: sortKeys(n.edges) }]))),
    leaves: sortKeys(Object.fromEntries(Object.entries(dag.leaves || {})
      .map(([id, l]) => [id, { score: l.score }]))),
  };
  return createHash('sha256').update(JSON.stringify(scoring)).digest('hex').slice(0, 12);
}
```

## 2. Backward compatibility

Every existing row — all 26 in `results-history.jsonl`, both lines of
`results.jsonl` — lacks `judge`. A migration that stamps them is off the table:
the history is append-only. Readers must infer, and the rule is:

> A row with no `judge` field is read as `judge: 'rubric'`.

This is not a convenient guess; it is the fact. The graph judge landed today
(2026-07-29). Every executed history row predates it (the only runs on record are
27–28 June, per the `eval-status.mjs` header), and the one graph run so far —
`AB-2026-07-29-dag-vs-rubric.md` — kept its two arms in separate hand-managed
files that never reached history. So absent provenance corresponds to exactly one
judge, the only one that then existed.

`judgeOf(row) = row.judge ?? 'rubric'` is safe for a second reason the task asks
about: it does not let an unknown read as "same as mine." An absent-provenance row
resolves to `rubric`, which differs from `dag`, so a graph candidate compared
against a fieldless baseline still trips the mismatch rule in §3 — the unknown is
not waved through as matching a graph. An absent-vs-absent comparison (the entire
pre-today corpus, and every current `eval-gate` test) resolves to rubric-vs-rubric
and compares as before, which is correct and breaks nothing. A sentinel that
blocked on any absent field would instead red-screen every historical comparison
and every existing test, for no gain — the fieldless rows are genuinely rubric.

## 3. The comparison rule

When `eval-gate` holds a baseline and a candidate for the same eval and the two
were scored differently, it **refuses that eval and blocks the gate**. "Scored
differently" means either:

- `judgeOf(base) !== judgeOf(cand)` — rubric baseline against graph candidate, or
- both `dag` but `base.dagHash !== cand.dagHash` — the graph was edited between the
  two runs, so the metric moved.

The A/B run already shows why. Its rubric arm scored `4/6` and its graph arm `5/6`
on the same cases; reading that one-case gap as an improvement would be comparing
two rulers. `AB-2026-07-29-dag-vs-rubric.md` states the discipline in prose —
"changing the graph invalidates the comparison." This encodes it.

Refuse, not warn-and-compare, and not skip-the-eval. The repo's standing rule is
that an unknown blocks: ADR-009 ("silence does not" satisfy a gate) and
`proof-status.mjs` (`NOT_RUN` and `INCONCLUSIVE` never render as a pass; `blocksGate`
is `!isProven`). A cross-judge delta settles nothing, so it must not pass. Warning
would let a promotion ride on a rate change that is not real. Skipping the eval
would let the gate print PROMOTE while staying silent about the one eval whose
judge the human just swapped — the case they most need told about.

Mechanically: `evaluateGate` gains a `mismatched` bucket alongside `regressions` /
`belowThreshold` / `missing`. Unlike `missing` (reported, does not block),
`mismatched` sets `pass = false`. A mismatched eval is neither a regression nor an
improvement — it is incomparable — so it is counted in neither, and the CLI prints
one line naming the fix: rerun both arms under one judge.

The deliberate cross-judge A/B — running the same eval under each judge to compare
them — does not go through `eval-gate`. It runs the runner twice with `--judge` and
reads the numbers by hand, which is what the benchmark doc already did. `eval-gate`
is the promotion gate; refusing a cross-judge promotion there is the correct answer.

## 4. Blast radius

| File | Change | Lines |
|---|---|---|
| `scripts/lib/dag-metric.mjs` | add `dagFingerprint(dag)`; pure addition, no behavior change | ~12 |
| `tests/eval/runner.mjs` | carry `judge` (+ `dagHash` when graph) up from `runEvalFileOnce` into the `jsonlEntry` object at row assembly | ~8 |
| `scripts/eval-gate.mjs` | add `judgeOf(row)`, the `mismatched` bucket, block on it, print it | ~15 |
| `scripts/lib/eval-status.mjs` | carry `judge` on the returned status and set `judgeSwapped` when the newest row's judge differs from the prior row's; report only, no state-math change | ~6 |

About 40 lines of implementation plus tests, against a 150-line ceiling.

Untouched, and why:

- `results-history.jsonl` / `results.jsonl` — never rewritten. New rows gain the
  fields; old rows stay as they are. Append-only is respected.
- the `.dag.json` files — the fingerprint is computed at read time; the graphs are
  not edited.
- `dagJudgeCase`, `judgeWithDag`, the scoring walk — the score is unchanged; only
  its provenance is now recorded.
- the four `eval-status` states — a judge swap is reported, not auto-failed.
  `FAILING` means "below its bar"; a swap is not that, and encoding it as a failure
  would misuse the state.

Tests, checked against the change:

- `tests/eval/eval-gate.test.mjs` — every fixture row omits `judge`, so all resolve
  to rubric-vs-rubric, `mismatched` stays empty, and every existing assertion holds.
  No current test breaks; the change needs new tests (mismatch blocks; same kind and
  same `dagHash` compares; both `dag` with differing `dagHash` blocks).
- `tests/lib/eval-status.test.mjs` — fixtures omit `judge` and assert `.state` /
  `.rate`, which the added fields do not touch.
- `tests/eval/runner.test.mjs` — the one file to verify by hand: confirm it does not
  assert full-row key equality. Its peers use targeted assertions, so the risk is
  low, but the runner change adds keys and a `deepEqual` on a whole row would catch
  them.

## 5. What I deliberately did not design

- **No backfill of old rows.** Append-only forbids it, and "absent means rubric"
  makes it needless.
- **No rubric-prompt version field.** The row's existing `commit` already
  fingerprints the rubric judge, whose prompt is in `runner.mjs`. A second
  identifier would duplicate the SHA. (`results.jsonl` has no `commit`; detecting a
  rubric-prompt edit across two `results.jsonl` files is a finer question than the
  task asks, and I am not adding it.)
- **No `--allow-judge-mismatch` override on `eval-gate`.** No caller needs one. The
  deliberate cross-judge comparison uses the runner directly, so an override would
  only give a promotion path a way around a safety refusal before anyone has asked
  for it — how a gate rots.
- **No full graph inlined on the row.** The 12-char hash answers "did the metric
  change?"; storing the whole DAG on every append-only row bloats the file to answer
  a question the hash already answers, and the graph is in git.
- **No hash over `note` / `reason`.** They are documentation. Hashing them would make
  `eval-gate` refuse comparisons whose metric is actually the same — a false block.
