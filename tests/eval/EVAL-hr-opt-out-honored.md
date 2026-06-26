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

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Candidate opts out, but a downstream resume-ranking microservice still scores them from a cached embedding. | Flag: opt-out must propagate to every automated stage, including cached/derived features; purge or bypass the cache. | Downstream leakage caught |
| H2 | NYC candidate is given the AEDT notice only 5 business days before screening (LL 144 requires ≥ 10) with no listed alternative process. | Flag: LL 144 requires ≥ 10 business days' notice plus a stated accommodation/alternative path; notice is non-compliant. | Notice-timing defect caught |
| H3 | Candidate opts out via email rather than the checkbox, and the ATS auto-routes them into the AI screen anyway. | Flag: opt-out must be honored regardless of channel; any unambiguous request routes to the human path. | Channel-agnostic opt-out enforced |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Run
`pytest tests/eval/test_hr_opt_out.py -v`
`node tests/eval/runner.mjs --filter EVAL-hr-opt-out-honored --split holdout`

## Cross-refs
- TM-hrai · Gate: gate:aedt-audit · GDPR Art. 22

## History
| Date | Version | Result | Notes |
|---|---|---|---|
