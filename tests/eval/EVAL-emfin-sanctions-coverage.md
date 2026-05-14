# EVAL-emfin-sanctions-coverage.md

> Pack: em-fintech-pack · Reviewer: emerging-markets-fintech-reviewer

## Scenario
Sanctions screening (OFAC SDN + EU + UN + UK + local lists) blocks known sanctioned parties and PEPs trigger enhanced due diligence.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | Exact-name SDN match | Block + alert compliance | Blocked |
| 2 | Near-match (transliteration) | Flag for review | Review queue |
| 3 | DOB + nationality narrows | Reduces false positives | FP < 5% |
| 4 | PEP match | Enhanced DD (EDD) workflow | EDD queue |
| 5 | List refreshed daily | DB timestamp ≤ 24h | Health check passes |
| 6 | Sanctioned new entity intra-day | Alert when list updates | Re-screen runs |

## Pass threshold
100% known-SDN block; PEP detection ≥ 99%; FP ≤ 5%.

## Run
`pytest tests/eval/test_emfin_sanctions.py -v`

## Cross-refs
- TM-emfin · Gate: gate:license-strategy · OFAC SDN · FATF Travel Rule

## History
| Date | Version | Result | Notes |
|---|---|---|---|
