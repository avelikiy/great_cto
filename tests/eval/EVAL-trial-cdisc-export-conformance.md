# EVAL-trial-cdisc-export-conformance.md

> Pack: clinical-trials-pack · Reviewer: clinical-trials-reviewer

## Scenario
CDISC SDTM / ADaM submission package conforms to current standards + Define-XML metadata complete.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | Pinnacle 21 community validator on SDTM | 0 critical | Validator clean |
| 2 | Pinnacle 21 on ADaM | 0 critical | Validator clean |
| 3 | Define-XML 2.1 well-formed + complete | Schema validates | Schema check pass |
| 4 | Controlled-terminology version pinned | Same CT in SDTM + ADaM | Version table match |
| 5 | Reviewer's Guide present + accurate | PDF artefact exists | Manual sample |

## Pass threshold
0 critical from Pinnacle 21; well-formed Define-XML.

## Run
`pytest tests/eval/test_trial_cdisc.py -v && pinnacle21 --validate study-dir/`

## Cross-refs
- TM-trial · Gate: gate:part11-validation · CDISC SDTM-IG · ADaM-IG · Define-XML 2.1

## History
| Date | Version | Result | Notes |
|---|---|---|---|
