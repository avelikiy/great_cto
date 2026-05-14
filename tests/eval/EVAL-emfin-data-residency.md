# EVAL-emfin-data-residency.md

> Pack: em-fintech-pack · Reviewer: emerging-markets-fintech-reviewer

## Scenario
PII tagged to a country with localization rules does not leave that country's jurisdiction without authorized mechanism.

## Cases
| # | Test | Expected | Pass |
|---|---|---|---|
| 1 | Indonesia "strategic" data egress | Blocked or routed via approved DPA | Egress rejected by policy |
| 2 | India financial data egress (RBI) | Approved transfer mechanism applied | Mechanism documented per transfer |
| 3 | Vietnam personal data (Decree 53) | Local storage verified | Storage region check passes |
| 4 | EU subject SCC route | SCC + TIA in place | Documents on file |
| 5 | Cross-border BI query selects local-only column | Query rewritten or blocked | No row leaves |

## Pass threshold
5/5 across all jurisdictions served.

## Run
`pytest tests/eval/test_emfin_data_residency.py -v`

## Cross-refs
- TM-emfin · Gate: gate:license-strategy

## History
| Date | Version | Result | Notes |
|---|---|---|---|
