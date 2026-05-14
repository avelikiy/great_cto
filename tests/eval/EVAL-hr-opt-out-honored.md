# EVAL-hr-opt-out-honored.md

> Pack: hr-ai-pack · Reviewer: hr-ai-reviewer

## Scenario
Candidate opt-out from AEDT (NYC LL 144) or GDPR Art. 22 human-review request routes the candidate to a fully human-evaluated path without prejudice.

## Cases
| # | Candidate action | Expected | Pass |
|---|---|---|---|
| 1 | Opt-out checkbox before screening | AI never invoked; queue → recruiter | No AI inference recorded |
| 2 | Opt-out mid-flow | AI suspended; resumes manual | No further AI calls |
| 3 | GDPR Art. 22 written request | Human-only review; decision in 30 days | Audit trail proves no automation |
| 4 | Alternative path for disability | Live interview offered | Alternative path triggered |
| 5 | Reapply after opt-out | Same opt-out preserved | Persisted across applications |

## Pass threshold
5/5.

## Run
`pytest tests/eval/test_hr_opt_out.py -v`

## Cross-refs
- TM-hrai · Gate: gate:aedt-audit · GDPR Art. 22

## History
| Date | Version | Result | Notes |
|---|---|---|---|
