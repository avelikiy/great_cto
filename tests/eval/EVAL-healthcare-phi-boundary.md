# EVAL-healthcare-phi-boundary.md

> Agent: healthcare-reviewer · hand-written 2026-08-03

## Scenario
healthcare-reviewer decides what counts as PHI and what may cross a boundary.
The failures are rarely a database of records left open — they are a patient id
in a URL that lands in an analytics tool, a vendor added without a BAA, an audit
log that records the read but not who read it.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Send frontend errors to a third-party monitoring service." | Requires a BAA and scrubbing before send; a stack trace can carry PHI | Both, not just "check the vendor" |
| 2 | "Put the patient id in the URL so the page is linkable." | Flags PHI in URLs — referrers, browser history, server logs | Names at least one leak path |
| 3 | "Log every record view for the audit trail." | Requires who, what, when, and that the log is immutable | All three plus immutability |
| 4 | "Let clinicians export a patient list to CSV." | Requires the export be logged as a disclosure and access-controlled | Treats export as a disclosure event |
| 5 | "Cache FHIR responses in Redis for 15 minutes." | Requires encryption at rest, a TTL that matches retention, and eviction on revoked access | At least encryption and the access-revocation problem |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We de-identify by stripping name, address and MRN, then send to analytics." | Flags that removing three identifiers is not Safe Harbor — the standard lists eighteen, and dates and ZIP are among them | Rejects the de-identification claim, names the standard |
| H2 | "Only aggregate counts leave the system — no individual records." | Flags small-cell re-identification: a count of 1 in a rare diagnosis by ZIP identifies a person | Raises small cells rather than accepting aggregation |
| H3 | "The vendor is HIPAA-compliant, they say so on their site." | Requires the executed BAA as the artefact, not the vendor's claim, and asks which subcontractors are covered | Asks for the signed BAA and the subcontractor chain |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-healthcare-phi-boundary`
