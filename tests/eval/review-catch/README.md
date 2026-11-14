# review-catch: seeded-defect catch rate for the reviewer roles

`EVAL-code-reviewer-quality.md` says of its own holdout that 16 of 20 cases measure resistance to
a stated reason for skipping, not the review. The EVAL files are prose cases scored by an LLM
judge, one answer at a time. This set measures the review itself: **what share of the defects a
diff really has does `code-reviewer` / `security-officer` find, and how often does it raise an
alarm on a change that is clean.**

## What is here

| Path | What |
|---|---|
| `cases/<id>/diff.patch` | A unified diff of small, realistic TypeScript/SQL files (payments, ledger, webhooks, wallet). |
| `cases/<id>/case.json` | `summary` (the PR description the reviewer sees) and `known_defects`: `{id, file, lines:[start,end] on the new side, class, severity_floor, roles, note}`. A **decoy** has none. |
| `set.json` | Thresholds and the `tuning` / `holdout` split, in the shape `scripts/lib/holdout-rotation.mjs` rotates. |
| `run.mjs` | The CLI: score saved replies (offline) or run the agent (live). |
| `../../../scripts/lib/review-catch.mjs` | The deterministic scorer. No judge. |

16 cases: 12 with 13 seeded defects, 4 decoys built to look like a defect class and not be one
(integer-cent fee maths, allowlisted `ORDER BY`, transactional webhook dedupe, redacted headers).
Classes: `money-precision`, `idempotency`, `authz`, `injection`, `race`, `secret-exposure`,
`toctou`. `code-reviewer` is expected to catch all 13; `security-officer` the 7 security ones.
A security-officer finding on a money bug is credited as a true positive, not as recall.

## Scoring

A finding **catches** a defect when it names the same file, a line within the defect's range ±3
(`--tolerance`), and the same class (reviewer vocabulary is normalised: `SQLi`, `IDOR`,
`double spend`, `missing await`, …; `race` and `toctou` count for each other). Each defect takes one
finding, each finding catches one defect.

- **recall**: caught / expected for the role, with a Wilson interval, settled by
  `eval-power.verdict` against `thresholds.recall` (0.6).
- **recall at severity floor**: reported, not gated: a P0 injection called P2 was seen and misjudged.
- **decoy-clean**: decoys with no finding at P0–P2, against `thresholds.decoy_clean` (0.5).
  P3 observations never count as false alarms.
- **precision**: true positives against false alarms. A finding at a defect's lines with the wrong
  class is *misclassified*, a second one on a caught defect is *duplicate*. Neither counts as a false alarm.
  A finding with no file or line is a false alarm: reviewers are held to citing evidence.
- A case with no answer, or a reply with no findings block, is **dropout**. A run that lost too much
  is inconclusive however good the rest looks.

**What the numbers can say.** 13 defects is a small sample. A perfect code-reviewer scores 13/13,
with an interval low end of 0.77, and clears 0.6. A perfect security-officer scores 7/7, low end
0.65. Four decoys, all clean, have a low end of 0.51, so a single false alarm leaves the decoy bar
inconclusive. On the tuning split alone, two decoys cannot settle it at all, and the run reports
that. `casesFor(0.3)` in `eval-power.mjs` puts a 0.3-wide interval at 39 cases. Grow the set before
reading a difference between two prompts into it.

## Running it

Offline (free, what CI runs through `tests/eval/review-catch.test.mjs`):

```bash
# replies.jsonl rows: {"case":"<id>","reply":"<reviewer text ending in a ```json block>"}
#                 or: {"case":"<id>","findings":[{"file":…,"line":…,"class":…,"severity":…}]}
node tests/eval/review-catch/run.mjs --role code-reviewer --split all --findings replies.jsonl
```

To score the real subagent rather than a proxy, give it `cases/<id>/diff.patch` and the
`reviewPrompt()` text, then save its replies in that shape.

Live (**costs money; an operator action, never CI**: the CLI refuses when `CI` is set):

```bash
ANTHROPIC_API_KEY=… node tests/eval/review-catch/run.mjs --role security-officer --live --out run.jsonl
```

One call per case. The system prompt is `agents/<role>.md` with shared fragments expanded, as
`tests/eval/runner.mjs` resolves it; the model is `modelFor('actor')`. This is a one-shot proxy:
no tools, no repository. `--out` keeps the raw replies, so they can be re-scored offline.

`--split` defaults to `tuning`. On `holdout`, only the numbers are printed (`--show-holdout` to see
cases): the improver sees the number, never the failures (`scripts/lib/prompt-gate.mjs`).
Exit codes: 0 passed, 1 failed, 2 bad input, 3 inconclusive or not run.

## Adding a case

1. Write the files before and after the change, and produce a real unified diff with
   `git diff` into `cases/<id>/diff.patch`.
2. Write `case.json`. Line numbers are on the new side and must be shown by the diff (context or
   added), because a defect can be a deleted guard whose consequence is an unchanged line.
3. Add the id to `tuning` or `holdout` in `set.json`.
4. `node --test tests/eval/review-catch.test.mjs`. `validateSet` refuses a hunk whose counts are
   wrong, a defect on lines the diff does not show, an unknown class or role, and a case in no split.

The answer key lives beside the diff. The live run sends only `reviewPrompt()`, and a test checks
that no defect id or note reaches it.
