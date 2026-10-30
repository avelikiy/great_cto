# Eval runs behind the 3.75.0 test-discipline rules (2026-10-30)

The raw rows the runner wrote (`--out`), one file per run, for the claims in
`tests/eval/EVAL-senior-dev-scope-tdd.md` and `tests/eval/EVAL-code-reviewer-quality.md`
→ *Measurement history*. Review follow-up R1 (great_cto-dzoa): a rate cited in an EVAL
file points at a row here, not at a sentence.

- Actor `anthropic/claude-sonnet-5`, judge `anthropic/claude-opus-5`, via OpenRouter,
  rubric judge, one judge vote. Times are UTC.
- `*-new` ran the agent prompt at HEAD with the rules; `*-base` ran the pre-rule prompt
  (`--prompt-file`, the agent file before the rules).
- `zzscratch*` is a throwaway EVAL file holding only the cases named in the row and the
  real file's scenario text; the full split cost more than the step's budget.
- `SKIP` is a sample cut off at the actor's token cap before any answer — not a result.
- Each case's `answer` and the judge's `reason` are in the row.

| UTC | file | eval | case verdicts | cost |
|---|---|---|---|---|
| 11:31 | `sd-base.jsonl` | senior-dev-scope-tdd | 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 FAIL, 9 PASS, 10 PASS, 11 FAIL | $0.3446 |
| 11:33 | `cr-base.jsonl` | code-reviewer-quality | 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS, 9 FAIL, 10 PASS | $0.1626 |
| 13:11 | `s1-sd-new.jsonl` | senior-dev-zzscratch | 9 PASS, 10 PASS, 11 SKIP | $0.2621 |
| 13:14 | `s1-sd-base.jsonl` | senior-dev-zzscratch | 9 PASS, 10 PASS, 11 FAIL | $0.2641 |
| 13:15 | `s1-cr-base.jsonl` | code-reviewer-zzscratch | 10 PASS | $0.0443 |
| 13:15 | `s1-cr-new.jsonl` | code-reviewer-zzscratch | 10 PASS | $0.0464 |
| 13:19 | `s2-sd-new.jsonl` | senior-dev-zzscratch | 9 PASS, 10 FAIL, 11 PASS | $0.2344 |
| 13:23 | `s2-sd-base.jsonl` | senior-dev-zzscratch | 9 PASS, 10 FAIL, 11 FAIL | $0.2783 |
| 13:24 | `s2-cr-new.jsonl` | code-reviewer-zzscratch | 10 PASS | $0.0746 |
| 13:25 | `s2-cr-base.jsonl` | code-reviewer-zzscratch | 10 FAIL | $0.0904 |
| 13:27 | `s3-sd-new.jsonl` | senior-dev-zzscratch | 10 FAIL | $0.1339 |
| 13:36 | `s4-sd10-new.jsonl` | senior-dev-zzscratcha | 10 PASS | $0.208 |
| 13:38 | `s4-sd10-base.jsonl` | senior-dev-zzscratcha | 10 FAIL | $0.1491 |
| 13:39 | `s4-sd11-new.jsonl` | senior-dev-zzscratchb | 11 PASS | $0.0711 |
| 13:41 | `s4-cr10-new.jsonl` | code-reviewer-zzscratch | 10 SKIP | $0.0856 |
| 13:42 | `s5-cr10-new.jsonl` | code-reviewer-zzscratch | 10 FAIL | $0.0727 |
| 13:45 | `s6-cr10-new.jsonl` | code-reviewer-zzscratch | 10 SKIP | $0.1304 |
| 13:46 | `s7-cr10-new.jsonl` | code-reviewer-zzscratch | 10 PASS | $0.0856 |

## What is and is not on record

- `sd-base` is the "6/8 without the rules" of the senior-dev history: its eight cases are
  1–5 and the first drafts of 9–11. The "7/8 with the rules" run of the same split was
  not saved; it has no row here.
- senior-dev case 10 after the stub check became its own step: one PASS on record
  (`s4-sd10-new`) against FAIL on the pre-rule prompt (`s4-sd10-base`). The EVAL file's
  second PASS has no row here.
- code-reviewer case 10 with the rule: PASS, PASS, FAIL, PASS and two skips
  (`s1`, `s2`, `s5`, `s7`; `s4`, `s6`). The rerun at a raised cap, ≥3 samples per prompt,
  is still owed: on 2026-10-30 the provider account was out of credits.
